const { z } = require('zod');
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const { findSessionForRequest, getWalletAddress, hashWallet } = require('../utils/auth');
const { postGeminiGenerateContent, streamGeminiGenerateContent, formatGeminiErrorMessage } = require('../clients/gemini');
const { getCurrencyCatalog, sosoGet } = require('../clients/soso');
const { executeTool, resolveToolArgs } = require('../tools/executors');
const { buildSynthesisContext, normalizeLookupValue, truncate } = require('../normalizers/toolResult');
const { compressToolPayloadForGemini } = require('../ai/compress');
const { applyGroundingGuard } = require('../ai/grounding');
const { buildToolRoutingContext, getToolAllowlist } = require('../ai/toolRouting');
const { logAgentRequest } = require('../ai/requestLogger');
const { sleep } = require('../utils/common');

const MAX_GEMINI_ITERATIONS = 8;
const TICKER_ASSETS = ['bitcoin', 'ethereum', 'solana', 'xrp', 'bnb'];
const PORTFOLIO_INTENT_PATTERN = /\b(analy[sz]e|check|review|audit|show|summari[sz]e)\s+my\s+(portfolio|wallet|holdings|bags)\b|\bmy\s+(portfolio|wallet|holdings|bags)\b/i;

let tickerCache = { expiresAt: 0, data: [] };
let tickerInflight = null;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(200000)
}).passthrough();

const conversationHistorySchema = z.array(z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({
    text: z.string().max(200000)
  }).passthrough()).max(20)
}).passthrough()).max(30);

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  conversationHistory: conversationHistorySchema.optional(),
  walletAddress: z.string().optional().nullable()
});

const streamRequestSchema = chatRequestSchema.extend({
  chatId: z.string().optional().nullable()
});

const validatePayload = (schema, value) => {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data };
  }

  return {
    error: parsed.error.issues.map((issue) => issue.message).join(', ')
  };
};

const getCandidateParts = (response) => response?.candidates?.[0]?.content?.parts || [];

const getFunctionCalls = (response) => getCandidateParts(response).filter((part) => part.functionCall);

const extractAnswer = (response) => {
  const candidate = response?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const answer = candidate?.content?.parts
    ?.filter((part) => typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim() || '';

  if (answer) {
    return answer;
  }

  if (finishReason === 'SAFETY') {
    return 'Response blocked by safety filters. Please rephrase your query.';
  }

  if (finishReason === 'MAX_TOKENS') {
    return 'Response was truncated due to length limits. Please ask a more specific question.';
  }

  return 'No response generated. Please try again.';
};

const buildWalletContextContent = (walletAddress) => ({
  role: 'user',
  parts: [{
    text: [
      'CONNECTED_WALLET_CONTEXT',
      `Verified connected EVM wallet: ${walletAddress}.`,
      'If the user asks about my wallet, my portfolio, my holdings, or similar first-person portfolio language, call get_wallet_holdings with this exact address.'
    ].join('\n')
  }]
});

const isPortfolioIntent = (message) => PORTFOLIO_INTENT_PATTERN.test(String(message || ''));

const buildPreloadedToolContent = (name, resultData) => ({
  role: 'user',
  parts: [{
    text: [
      `PRELOADED_TOOL_RESULT: ${name}`,
      'The backend already executed this tool for the verified connected wallet. Use this as factual tool output and do not call the same wallet holdings tool again unless additional chain coverage is explicitly needed.',
      JSON.stringify(resultData.payload)
    ].join('\n')
  }]
});

const getVerifiedWalletContext = async (req, walletAddress) => {
  const normalizedWalletAddress = getWalletAddress(walletAddress);
  if (!normalizedWalletAddress || !req.get('authorization') || mongoose.connection.readyState !== 1) {
    return {
      normalizedWalletAddress,
      session: null,
      verifiedWalletAddress: null
    };
  }

  try {
    const session = await findSessionForRequest(req);
    if (!session || session.walletHash !== hashWallet(normalizedWalletAddress)) {
      return {
        normalizedWalletAddress,
        session: null,
        verifiedWalletAddress: null
      };
    }

    return {
      normalizedWalletAddress,
      session,
      verifiedWalletAddress: normalizedWalletAddress
    };
  } catch (error) {
    console.warn('Wallet context verification failed:', error.message);
    return {
      normalizedWalletAddress,
      session: null,
      verifiedWalletAddress: null
    };
  }
};

const trimConversationHistory = (history, maxTurns = 8) => {
  if (!Array.isArray(history) || history.length <= maxTurns * 2) {
    return history;
  }

  const first = history.slice(0, 2);
  const recent = history.slice(-(maxTurns * 2));

  return [
    ...first,
    {
      role: 'user',
      parts: [{ text: `[${history.length - first.length - recent.length} earlier messages omitted for context efficiency]` }]
    },
    ...recent
  ];
};

const buildContents = (conversationHistory, userMessage, walletAddress, extraContext = [], routingOptions = {}) => {
  const trimmedHistory = trimConversationHistory(conversationHistory);
  const routingContext = buildToolRoutingContext(userMessage, routingOptions);
  return [
    ...(trimmedHistory || []),
    ...(walletAddress ? [buildWalletContextContent(walletAddress)] : []),
    routingContext.content,
    ...extraContext,
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];
};

const makeToolRecord = (name, resultData) => ({
  name,
  input: resultData.args || {},
  result: truncate(resultData.preview, 200),
  status: resultData.status
});

// Tool-call deduplication key: name + sorted args
const makeToolCacheKey = (name, args) => {
  const sorted = Object.keys(args || {}).sort().reduce((obj, key) => {
    obj[key] = args[key];
    return obj;
  }, {});
  return `${name}:${JSON.stringify(sorted)}`;
};

const fetchTickerSnapshot = async (asset) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await sosoGet(`/currencies/${asset.currency_id}/market-snapshot`);
      const price = Number(response.data?.price);
      const change = Number(response.data?.change_pct_24h ?? response.data?.changePct24h);
      return {
        symbol: asset.symbol,
        name: asset.name,
        price: Number.isFinite(price) ? price : null,
        change_pct_24h: Number.isFinite(change) ? change : null
      };
    } catch (error) {
      if (attempt === 1) {
        console.warn(`Ticker snapshot failed for ${asset.symbol || asset.name}: ${error.message}`);
        break;
      }
      await sleep(300);
    }
  }

  return {
    symbol: asset.symbol,
    name: asset.name,
    price: null,
    change_pct_24h: null
  };
};

const preloadPortfolioHoldings = async (payload, walletContext, hooks = {}) => {
  if (!isPortfolioIntent(payload.userMessage)) {
    return {
      extraContext: [],
      initialToolResults: []
    };
  }

  if (!walletContext.verifiedWalletAddress) {
    const error = new Error('Connect and verify an EVM wallet before running portfolio analysis.');
    error.status = 400;
    throw error;
  }

  const name = 'get_wallet_holdings';
  const args = { address: walletContext.verifiedWalletAddress };
  hooks.onToolStart?.({ name, args, iteration: 0 });
  const resultData = await executeTool(name, args, { walletAddress: walletContext.verifiedWalletAddress });
  hooks.onToolDone?.(makeToolRecord(name, resultData));

  return {
    extraContext: [buildPreloadedToolContent(name, resultData)],
    initialToolResults: [{ name, resultData }]
  };
};

const runAgentLoop = async (contents, options = {}) => {
  const {
    onToolStart,
    onToolDone,
    onStatus,
    toolContext = {},
    initialToolResults = [],
    userMessage = '',
    allowedFunctionNames = [],
    budget = { max: 4 }
  } = options;

  const requestStartedAt = Date.now();
  const toolCallsMade = initialToolResults.map(({ name, resultData }) => makeToolRecord(name, resultData));
  const toolAnalyses = initialToolResults
    .map(({ resultData }) => resultData.payload?.analysis)
    .filter(Boolean);
  let analysisSynthesis = null;
  let lastSynthesizedAnalysisCount = 0;
  let totalToolInvocations = initialToolResults.length;
  let dedupeHits = 0;

  // Dedup cache: tool name + args -> result
  const toolCallDedup = new Map();
  for (const { name, resultData } of initialToolResults) {
    const cacheKey = makeToolCacheKey(name, resultData.args);
    toolCallDedup.set(cacheKey, { resultData, compressed: compressToolPayloadForGemini(resultData) });
  }

  if (toolAnalyses.length) {
    const synthesisContext = buildSynthesisContext(toolAnalyses);
    analysisSynthesis = synthesisContext.synthesis;
    const insertAt = Math.max(contents.length - 1, 0);
    contents.splice(insertAt, 0, synthesisContext.content);
    lastSynthesizedAnalysisCount = toolAnalyses.length;
  }

  const callGemini = async (currentContents) => {
    const callOptions = {
      toolCallCount: toolCallsMade.length,
      allowedFunctionNames
    };
    if (options.onChunk) {
      return streamGeminiGenerateContent(currentContents, options.onChunk, callOptions);
    }

    return postGeminiGenerateContent(currentContents, callOptions);
  };

  const currentContents = [...contents];
  let previousResponse = await callGemini(currentContents);
  let toolCallsToExecute = getFunctionCalls(previousResponse);

  for (let iteration = 1; iteration <= MAX_GEMINI_ITERATIONS && toolCallsToExecute.length > 0; iteration++) {
    // Enforce tool-call budget: cap total invocations
    const budgetRemaining = budget.max - totalToolInvocations;
    if (budgetRemaining <= 0) {
      break;
    }

    // Trim tool calls to budget
    if (toolCallsToExecute.length > budgetRemaining) {
      toolCallsToExecute = toolCallsToExecute.slice(0, budgetRemaining);
    }

    const modelParts = getCandidateParts(previousResponse);
    if (modelParts.length) {
      currentContents.push({
        role: 'model',
        parts: modelParts
      });
    }

    onStatus?.({
      phase: 'tools',
      message: `Running ${toolCallsToExecute.length} data ${toolCallsToExecute.length === 1 ? 'tool' : 'tools'}...`
    });

    const results = await Promise.all(toolCallsToExecute.map(async (call) => {
      const { name, args = {} } = call.functionCall;

      // Dedup check: have we already called this exact tool + args?
      const cacheKey = makeToolCacheKey(name, args);
      const cachedResult = toolCallDedup.get(cacheKey);
      if (cachedResult) {
        dedupeHits++;
        return {
          call,
          executeResult: cachedResult.resultData,
          compressed: cachedResult.compressed,
          cached: true
        };
      }

      onToolStart?.({ name, args, iteration });

      let executeResult;
      try {
        executeResult = await executeTool(name, args, toolContext);
      } catch (err) {
        executeResult = { error: true, code: err.code || 'execution_failed', message: err.message };
      }

      const compressed = compressToolPayloadForGemini(executeResult);

      // Cache for dedup
      toolCallDedup.set(cacheKey, { resultData: executeResult, compressed });

      return {
        call,
        executeResult,
        compressed,
        cached: false
      };
    }));

    for (const { call, executeResult, compressed, cached } of results) {
      const { name, args = {} } = call.functionCall;
      const callId = call.functionCall.id || `call_${name}_${iteration}_${Date.now()}`;

      if (!cached) {
        const toolRecord = makeToolRecord(name, { args, ...executeResult });
        toolCallsMade.push(toolRecord);
        onToolDone?.(toolRecord);
        totalToolInvocations++;

        if (executeResult.payload?.analysis) {
          toolAnalyses.push(executeResult.payload.analysis);
        }
      }

      currentContents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            id: callId,
            name,
            response: compressed
          }
        }]
      });
    }

    if (toolAnalyses.length > lastSynthesizedAnalysisCount) {
      const synthesisContext = buildSynthesisContext(toolAnalyses);
      analysisSynthesis = synthesisContext.synthesis;
      currentContents.push(synthesisContext.content);
      lastSynthesizedAnalysisCount = toolAnalyses.length;
    }

    onStatus?.({ phase: 'reasoning', message: `Processing results (step ${iteration})...` });
    previousResponse = await callGemini(currentContents);
    toolCallsToExecute = getFunctionCalls(previousResponse);

    const hasTextAnswer = getCandidateParts(previousResponse).some((part) =>
      typeof part.text === 'string' && part.text.trim().length > 50
    );
    if (hasTextAnswer && toolCallsToExecute.length > 0 && toolCallsMade.length >= 3) {
      break;
    }
  }

  const result = {
    answer: applyGroundingGuard({
      answer: extractAnswer(previousResponse),
      toolCalls: toolCallsMade,
      userMessage
    }),
    toolCalls: toolCallsMade,
    analysisSynthesis
  };

  // Observability logging
  logAgentRequest({
    userMessage,
    intent: options.intent || 'unknown',
    allowedTools: allowedFunctionNames,
    actualToolCalls: toolCallsMade.map((tc) => tc.name),
    toolResults: toolCallsMade,
    latencyMs: Date.now() - requestStartedAt,
    budgetUsed: totalToolInvocations,
    budgetMax: budget.max,
    dedupeHits,
    zeroToolSuccess: toolCallsMade.length > 0 && toolCallsMade.every((tc) => tc.status === 'error')
  });

  return result;
};

const parseChatPayload = (schema, req, res, sendError) => {
  const { data, error } = validatePayload(schema, req.body);
  if (error) {
    sendError(error);
    return null;
  }

  const userMessage = data.messages?.[data.messages.length - 1]?.content;
  if (!userMessage || !Array.isArray(data.messages)) {
    sendError('Invalid chat request payload.');
    return null;
  }

  return { ...data, userMessage };
};

const handleChat = async (req, res) => {
  const payload = parseChatPayload(chatRequestSchema, req, res, (message) => {
    res.status(400).json({ error: true, message });
  });
  if (!payload) return;

  const walletContext = await getVerifiedWalletContext(req, payload.walletAddress);
  const toolAllowlist = getToolAllowlist(payload.userMessage);

  try {
    const preload = await preloadPortfolioHoldings(payload, walletContext);
    const contents = buildContents(
      payload.conversationHistory,
      payload.userMessage,
      walletContext.verifiedWalletAddress,
      preload.extraContext,
      { preloadedTools: preload.initialToolResults.map((item) => item.name) }
    );
    const result = await runAgentLoop(contents, {
      toolContext: { walletAddress: walletContext.verifiedWalletAddress },
      initialToolResults: preload.initialToolResults,
      userMessage: payload.userMessage,
      allowedFunctionNames: toolAllowlist.allowedFunctionNames,
      budget: toolAllowlist.budget,
      intent: toolAllowlist.intent
    });
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: true, message: error.message });
    }
    const status = error.response?.status || 'unknown';
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`Agent Error [${status}]: ${errMsg}`);
    res.status(500).json({ error: true, message: formatGeminiErrorMessage(error) });
  }
};

const handleChatStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeatInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 15000);

  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    clearInterval(heartbeatInterval);
    return originalEnd(...args);
  };

  const payload = parseChatPayload(streamRequestSchema, req, res, (message) => {
    send('error', { message });
    res.end();
  });
  if (!payload) return;

  const walletContext = await getVerifiedWalletContext(req, payload.walletAddress);
  const toolAllowlist = getToolAllowlist(payload.userMessage);

  try {
    send('status', { phase: 'thinking', message: 'Analyzing your query...' });

    const preload = await preloadPortfolioHoldings(payload, walletContext, {
      onToolStart: ({ name, args, iteration }) => send('tool_start', { name, args, iteration }),
      onToolDone: (toolRecord) => send('tool_done', toolRecord)
    });
    const contents = buildContents(
      payload.conversationHistory,
      payload.userMessage,
      walletContext.verifiedWalletAddress,
      preload.extraContext,
      { preloadedTools: preload.initialToolResults.map((item) => item.name) }
    );
    const result = await runAgentLoop(contents, {
      toolContext: { walletAddress: walletContext.verifiedWalletAddress },
      initialToolResults: preload.initialToolResults,
      userMessage: payload.userMessage,
      allowedFunctionNames: toolAllowlist.allowedFunctionNames,
      budget: toolAllowlist.budget,
      intent: toolAllowlist.intent,
      onChunk: (text) => send('chunk', { text }),
      onToolStart: ({ name, args, iteration }) => send('tool_start', { name, args, iteration }),
      onToolDone: (toolRecord) => send('tool_done', toolRecord),
      onStatus: (status) => send('status', status)
    });

    send('status', { phase: 'generating', message: 'Synthesizing analysis...' });
    send('done', result);

    await saveStreamedChat(req, payload, walletContext, result);
    res.end();
  } catch (error) {
    const errMsg = error.status ? error.message : formatGeminiErrorMessage(error);
    const status = error.status || error.response?.status || 'unknown';
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`Stream Error [${status}]: ${detail}`);
    send('error', { message: errMsg });
    res.end();
  }
};

const saveStreamedChat = async (req, payload, walletContext, result) => {
  const normalizedWalletAddress = walletContext.normalizedWalletAddress;
  if (!normalizedWalletAddress || !payload.chatId) {
    return;
  }

  try {
    const session = walletContext.session || await findSessionForRequest(req);
    if (!session || session.walletHash !== hashWallet(normalizedWalletAddress)) {
      console.warn(`Skipped saving chat ${payload.chatId}: missing or mismatched wallet session.`);
      return;
    }

    const updatedChat = await Chat.findOneAndUpdate(
      {
        _id: payload.chatId,
        walletAddress: session.walletHash
      },
      {
        $push: {
          messages: {
            $each: [
              { role: 'user', content: payload.userMessage, timestamp: new Date() },
              { role: 'assistant', content: result.answer, toolCalls: result.toolCalls, timestamp: new Date() }
            ]
          }
        }
      },
      { new: true }
    );

    if (!updatedChat) {
      console.warn(`Skipped saving chat ${payload.chatId}: wallet does not own this session.`);
    }
  } catch (dbErr) {
    if (dbErr.name === 'CastError') {
      console.warn(`Skipped saving chat ${payload.chatId}: invalid chat ID.`);
    } else {
      console.error('Failed to save messages to DB:', dbErr);
    }
  }
};

const handleTicker = async (req, res) => {
  try {
    if (tickerCache.expiresAt > Date.now() && tickerCache.data.length > 0) {
      return res.json({ data: tickerCache.data });
    }

    if (!tickerInflight) {
      tickerInflight = (async () => {
        const catalog = await getCurrencyCatalog();
        const tickerAssets = TICKER_ASSETS.map((name) => {
          const normalized = normalizeLookupValue(name);
          return catalog.find((record) =>
            normalizeLookupValue(record.name) === normalized ||
            normalizeLookupValue(record.symbol) === normalized
          );
        }).filter(Boolean);

        const snapshots = [];
        for (const asset of tickerAssets) {
          snapshots.push(await fetchTickerSnapshot(asset));
          await sleep(150);
        }

        tickerCache = { data: snapshots, expiresAt: Date.now() + 60000 };
        return snapshots;
      })().finally(() => { tickerInflight = null; });
    }

    const snapshots = await tickerInflight;
    res.json({ data: snapshots });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = {
  handleChat,
  handleChatStream,
  handleTicker
};
