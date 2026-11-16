// HTTP handlers for /api/agent: chat (JSON), chat (SSE stream) and the ticker.
// The Gemini tool loop is ai/agentLoop.js; request parsing and context building
// are handlers/chatContext.js.
import Chat from '../models/Chat.ts';
import { hashWallet } from '../utils/auth.ts';
import { formatGeminiErrorMessage } from '../clients/gemini.ts';
import { getToolAllowlist } from '../ai/toolRouting.ts';
import { runAgentLoop } from '../ai/agentLoop.ts';
import { attachTradeIdea } from '../analysis/tradeIdea.ts';
import {
  sanitizeConversationHistory,
  chatRequestSchema,
  streamRequestSchema,
  getVerifiedWalletContext,
  buildContents,
  preloadPortfolioHoldings,
  parseChatPayload
} from './chatContext.ts';
import { handleTicker } from './tickerHandler.ts';

const handleChat = async (req, res) => {
  const payload = parseChatPayload(chatRequestSchema, req, res, (message) => {
    res.status(400).json({ error: true, message });
  });
  if (!payload) return;

  try {
    const walletContext = await getVerifiedWalletContext(req, payload.walletAddress);
    const toolAllowlist = await getToolAllowlist(payload.userMessage);

    const preload = await preloadPortfolioHoldings(payload, walletContext);
    const contents = await buildContents(
      sanitizeConversationHistory(payload.conversationHistory),
      payload.userMessage,
      walletContext.verifiedWalletAddress,
      preload.extraContext,
      { 
        preloadedTools: preload.initialToolResults.map((item) => item.name),
        routing: toolAllowlist.routing
      }
    );
    const loopResult = await runAgentLoop(contents, {
      toolContext: { walletAddress: walletContext.verifiedWalletAddress },
      initialToolResults: preload.initialToolResults,
      userMessage: payload.userMessage,
      allowedFunctionNames: toolAllowlist.allowedFunctionNames,
      budget: toolAllowlist.budget,
      intent: toolAllowlist.intent,
      requestId: req.id
    });
    const result = await attachTradeIdea(loopResult);
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

  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
    }
  });

  const send = (event, data) => {
    // SSE errors still return HTTP 200; flag them so guest quotas skip them.
    if (event === 'error') res.locals.requestFailed = true;
    if (clientDisconnected || res.writableEnded) return;
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

  try {
    const walletContext = await getVerifiedWalletContext(req, payload.walletAddress);
    const toolAllowlist = await getToolAllowlist(payload.userMessage);

    send('status', { phase: 'thinking', message: 'Analyzing your query...' });

    const preload = await preloadPortfolioHoldings(payload, walletContext, {
      onToolStart: ({ name, args, iteration }) => send('tool_start', { name, args, iteration }),
      onToolDone: (toolRecord) => send('tool_done', toolRecord)
    });
    const contents = await buildContents(
      sanitizeConversationHistory(payload.conversationHistory),
      payload.userMessage,
      walletContext.verifiedWalletAddress,
      preload.extraContext,
      { 
        preloadedTools: preload.initialToolResults.map((item) => item.name),
        routing: toolAllowlist.routing
      }
    );
    const loopResult = await runAgentLoop(contents, {
      toolContext: { walletAddress: walletContext.verifiedWalletAddress },
      initialToolResults: preload.initialToolResults,
      userMessage: payload.userMessage,
      allowedFunctionNames: toolAllowlist.allowedFunctionNames,
      budget: toolAllowlist.budget,
      intent: toolAllowlist.intent,
      requestId: req.id,
      onChunk: (text) => send('chunk', { text }),
      onToolStart: ({ name, args, iteration }) => send('tool_start', { name, args, iteration }),
      onToolDone: (toolRecord) => send('tool_done', toolRecord),
      onStatus: (status) => send('status', status),
      shouldAbort: () => clientDisconnected || res.writableEnded
    });

    if (clientDisconnected || res.writableEnded) {
      return;
    }

    const result = await attachTradeIdea(loopResult);
    send('status', { phase: 'generating', message: 'Synthesizing analysis...' });
    send('done', result);

    await saveStreamedChat(req, payload, walletContext, result);
    res.end();
  } catch (error) {
    if (error.status === 499) {
      return;
    }
    const errMsg = error.status ? error.message : formatGeminiErrorMessage(error);
    const status = error.status || error.response?.status || 'unknown';
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`Stream Error [${status}]: ${detail}`);
    send('error', { message: errMsg });
    res.end();
  }
};

const saveStreamedChat = async (req, payload, walletContext, result) => {
  // Only the session-verified wallet may append to its own chats.
  const normalizedWalletAddress = walletContext.verifiedWalletAddress;
  if (req.guest || !normalizedWalletAddress || !payload.chatId) {
    return;
  }

  try {
    const walletHash = hashWallet(normalizedWalletAddress);
    const updatedChat = await Chat.findOneAndUpdate(
      {
        _id: payload.chatId,
        walletAddress: walletHash
      },
      {
        $push: {
          messages: {
            $each: [
              { role: 'user', content: payload.userMessage, timestamp: new Date() },
              {
                role: 'assistant',
                content: result.answer,
                toolCalls: result.toolCalls,
                analysisSynthesis: result.analysisSynthesis ?? null,
                tradeIdea: result.tradeIdea ?? null,
                timestamp: new Date()
              }
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

export { handleChat, handleChatStream, handleTicker };
