// The Gemini tool-calling loop: routes the query, lets Gemini call allowed tools
// (deduplicated, budgeted), feeds results back and returns the grounded answer.
// Transport-agnostic: callers pass hooks for streaming progress.
import { postGeminiGenerateContent, streamGeminiGenerateContent } from '../clients/gemini.ts';
import type { GeminiRequestOptions } from '../clients/gemini.ts';
import { executeTool } from '../tools/executors/index.ts';
import { buildSynthesisContext, truncate } from '../normalizers/toolResult.ts';
import { compressToolPayloadForGemini } from './compress.ts';
import { applyGroundingGuard } from './grounding.ts';
import { logAgentRequest } from './requestLogger.ts';

const MAX_GEMINI_ITERATIONS = 8;

/** A tool call as reported to the client and stored with the chat. */
export interface ToolRecord {
  name: string;
  status?: string;
  [key: string]: any;
}

/** Progress callbacks; the SSE handler streams them, the JSON handler ignores them. */
export interface AgentLoopHooks {
  onToolStart?: (event: { name: string; args: Record<string, any>; iteration: number }) => void;
  onToolDone?: (record: ToolRecord) => void;
  onStatus?: (status: { phase: string; message: string; [key: string]: any }) => void;
  /** Streams answer text as Gemini produces it. */
  onChunk?: (text: string) => void;
}

export interface AgentLoopOptions extends AgentLoopHooks {
  /** Passed to executeTool (e.g. the verified wallet address). */
  toolContext?: Record<string, any>;
  /** Tool results already fetched before the loop (e.g. preloaded holdings). */
  initialToolResults?: Array<{ name: string; resultData: any }>;
  userMessage?: string;
  allowedFunctionNames?: string[];
  budget?: { max: number };
  /** Returns true once the client has disconnected. */
  shouldAbort?: () => boolean;
  requestId?: string;
  intent?: string;
}

const toGeminiToolResponse = (resultData) =>
  compressToolPayloadForGemini(resultData?.payload ?? resultData);

const getCandidateParts = (response) => response?.candidates?.[0]?.content?.parts || [];

// Only calls to tools the router allowed are executed; anything else (an undeclared
// name, or a built-in like google_search surfacing as a call) is ignored.

const getFunctionCalls = (response, allowed = null) => getCandidateParts(response)
  .filter((part) => part.functionCall && (!allowed || allowed.has(part.functionCall.name)));

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

const runAgentLoop = async (contents: any[], options: AgentLoopOptions = {}) => {
  const {
    onToolStart,
    onToolDone,
    onStatus,
    toolContext = {},
    initialToolResults = [],
    userMessage = '',
    allowedFunctionNames = [],
    budget = { max: 4 },
    shouldAbort = () => false
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
    toolCallDedup.set(cacheKey, { resultData, compressed: toGeminiToolResponse(resultData) });
  }

  if (toolAnalyses.length) {
    const synthesisContext = buildSynthesisContext(toolAnalyses);
    analysisSynthesis = synthesisContext.synthesis;
    const insertAt = Math.max(contents.length - 1, 0);
    contents.splice(insertAt, 0, synthesisContext.content);
    lastSynthesizedAnalysisCount = toolAnalyses.length;
  }

  const callGemini = async (currentContents: any[], extraOptions: GeminiRequestOptions = {}) => {
    if (shouldAbort()) {
      throw Object.assign(new Error('Client disconnected'), { status: 499 });
    }
    const callOptions = {
      toolCallCount: toolCallsMade.length,
      allowedFunctionNames,
      ...extraOptions
    };
    if (options.onChunk) {
      return streamGeminiGenerateContent(currentContents, options.onChunk, callOptions);
    }

    return postGeminiGenerateContent(currentContents, callOptions);
  };

  const currentContents = [...contents];
  let previousResponse = await callGemini(currentContents);
  const allowedTools = new Set(allowedFunctionNames);
  let toolCallsToExecute = getFunctionCalls(previousResponse, allowedTools);

  for (let iteration = 1; iteration <= MAX_GEMINI_ITERATIONS && toolCallsToExecute.length > 0; iteration++) {
    if (shouldAbort()) {
      throw Object.assign(new Error('Client disconnected'), { status: 499 });
    }

    // Enforce tool-call budget: cap total invocations
    const budgetRemaining = budget.max - totalToolInvocations;
    if (budgetRemaining <= 0) {
      break;
    }

    // Trim tool calls to budget
    if (toolCallsToExecute.length > budgetRemaining) {
      toolCallsToExecute = toolCallsToExecute.slice(0, budgetRemaining);
    }

    // Echo the model turn with only the calls we will answer: every functionCall
    // sent back needs a matching functionResponse.
    const executing = new Set(toolCallsToExecute);
    const modelParts = getCandidateParts(previousResponse)
      .filter((part) => !part.functionCall || executing.has(part));
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
      // Entries may be in-flight promises: calls in this batch run in parallel, so the
      // cache is filled synchronously with the pending execution to catch same-batch duplicates.
      const cachedResult = toolCallDedup.get(cacheKey);
      if (cachedResult) {
        dedupeHits++;
        const settled = await cachedResult;
        return {
          call,
          executeResult: settled.resultData,
          compressed: settled.compressed,
          cached: true
        };
      }

      const pending = (async () => {
        onToolStart?.({ name, args, iteration });

        let resultData;
        try {
          resultData = await executeTool(name, args, toolContext);
        } catch (err) {
          resultData = {
            error: true,
            status: 'error',
            code: err.code || 'execution_failed',
            message: err.message,
            preview: `Tool failed: ${err.message}`
          };
        }

        return { resultData, compressed: toGeminiToolResponse(resultData) };
      })();

      toolCallDedup.set(cacheKey, pending);
      const settled = await pending;

      return {
        call,
        executeResult: settled.resultData,
        compressed: settled.compressed,
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
    toolCallsToExecute = getFunctionCalls(previousResponse, allowedTools);

    const hasTextAnswer = getCandidateParts(previousResponse).some((part) =>
      typeof part.text === 'string' && part.text.trim().length > 50
    );
    if (hasTextAnswer && toolCallsToExecute.length > 0 && totalToolInvocations >= budget.max) {
      break;
    }
  }

  // The loop can stop (tool budget or iteration cap) while the model still wants
  // more tools, leaving no text. Ask once more with function calling off so it
  // answers from the data already gathered.
  const hasTextAnswer = getCandidateParts(previousResponse)
    .some((part) => typeof part.text === 'string' && !part.thought && part.text.trim());
  if (!hasTextAnswer && toolCallsMade.length > 0 && !shouldAbort()) {
    onStatus?.({ phase: 'generating', message: 'Writing the answer from gathered data...' });
    previousResponse = await callGemini(currentContents, { finalAnswer: true });
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
    requestId: options.requestId,
    userMessage,
    intent: options.intent || 'unknown',
    allowedTools: allowedFunctionNames,
    actualToolCalls: toolCallsMade.map((tc) => tc.name),
    toolResults: toolCallsMade,
    latencyMs: Date.now() - requestStartedAt,
    budgetUsed: totalToolInvocations,
    budgetMax: budget.max,
    dedupeHits,
    allToolsFailed: toolCallsMade.length > 0 && toolCallsMade.every((tc) => tc.status === 'error')
  });

  return result;
};

export { makeToolRecord, runAgentLoop };
