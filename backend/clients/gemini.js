const axios = require('axios');
const { filterToolDeclarations } = require('../tools/definitions');
const { buildSystemPrompt } = require('../prompt/system');
const { getPositiveInteger, sleep } = require('../utils/common');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Models are configurable so a switch (or rollback) is an env change, not a deploy.
const getModels = () => ({
  flash: process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash',
  pro: process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro',
  light: process.env.GEMINI_MODEL_LIGHT || process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash'
});

const GEMINI_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.GEMINI_REQUEST_TIMEOUT_MS, 60000);

const isGemini3 = (model) => /^gemini-3/.test(model);
const isSearchEnabled = () => process.env.GEMINI_GOOGLE_SEARCH !== 'off';

const selectModel = (contentsLength = 0, toolCallCount = 0, options = {}) => {
  const models = getModels();
  if (options.model) return options.model;
  if (options.lightweight) return models.light;
  if (toolCallCount >= 3) return models.pro;
  if (contentsLength > 10) return models.pro;
  return models.flash;
};

const formatGeminiErrorMessage = (error) => {
  const status = error.response?.status;

  if (error.code === 'ECONNABORTED') {
    return 'Analysis engine timed out. Please ask a narrower question or try again.';
  }

  if (status === 429) {
    return 'Analysis engine rate limit reached. Please wait a moment and try again.';
  }

  if (status >= 500) {
    return 'Analysis engine is temporarily unavailable. Please try again shortly.';
  }

  if (status >= 400) {
    return 'Analysis engine rejected the request. Please rephrase and try again.';
  }

  return 'Analysis engine request failed. Please try again.';
};

// Tool setup:
// - JSON / lightweight (classifier) calls: no tools (Gemini rejects tool use in JSON mode).
// - Otherwise the router's data tools. Web search is the search_web data tool, which
//   runs its own search-only request (searchWithGoogle), so built-in tools are never
//   mixed with function calling (rejected by 2.5; preview-only and erratic on 3).
// - No data tools at all: Google Search grounding directly.
const buildTools = (options = {}) => {
  if (options.lightweight || options.responseMimeType === 'application/json') {
    return null;
  }

  const declarations = filterToolDeclarations(options.allowedFunctionNames);
  const hasFunctions = declarations.some((group) => group.functionDeclarations?.length > 0);
  if (!hasFunctions) {
    return isSearchEnabled() ? { tools: [{ googleSearch: {} }] } : null;
  }

  // finalAnswer: tools stay declared (the history references them) but calling is off.
  return {
    tools: declarations,
    toolConfig: { functionCallingConfig: { mode: options.finalAnswer ? 'NONE' : 'AUTO' } }
  };
};

const buildGenerationConfig = (options, model) => {
  const config = {
    maxOutputTokens: options.lightweight ? 1024 : 8192,
    responseMimeType: options.responseMimeType || 'text/plain'
  };

  if (isGemini3(model)) {
    // Google recommends Gemini 3's default temperature; lowering it can cause looping.
    config.thinkingConfig = { thinkingLevel: options.lightweight ? 'low' : 'high' };
  } else {
    Object.assign(config, { temperature: options.lightweight ? 0 : 0.3, topP: 0.85, topK: 40 });
    config.thinkingConfig = { thinkingBudget: options.lightweight ? 0 : 4096 };
  }

  return config;
};

const buildRequestBody = (contents, options = {}, model = selectModel(contents.length, options.toolCallCount || 0, options)) => {
  const body = { contents, generationConfig: buildGenerationConfig(options, model) };

  if (!options.lightweight) {
    body.systemInstruction = {
      parts: [{ text: buildSystemPrompt({ version: process.env.SYSTEM_PROMPT_VERSION }) }]
    };
  }

  const toolSetup = buildTools(options);
  if (toolSetup) {
    body.tools = toolSetup.tools;
    if (toolSetup.toolConfig) body.toolConfig = toolSetup.toolConfig;
  }

  return body;
};

// Folds one SSE chunk into the accumulated response. Consecutive text is joined;
// every other part (function calls, Gemini 3 server-side toolCall/toolResponse,
// thought signatures) is kept as-is, because Gemini 3 requires them echoed back.
const isPlainText = (part) => typeof part?.text === 'string' && !part.thought && !part.functionCall;

const mergeStreamChunk = (fullResponse, data, onChunk) => {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  for (const part of parts) {
    if (isPlainText(part) && part.text && onChunk) onChunk(part.text);
  }

  if (!fullResponse) {
    const clone = JSON.parse(JSON.stringify(data));
    const cloneCandidate = clone.candidates?.[0];
    if (cloneCandidate?.content?.parts) {
      cloneCandidate.content.parts = [];
      mergeParts(cloneCandidate.content.parts, parts);
    }
    return clone;
  }

  const target = fullResponse.candidates?.[0];
  if (candidate && target) {
    if (!target.content) target.content = { role: 'model', parts: [] };
    if (!target.content.parts) target.content.parts = [];
    mergeParts(target.content.parts, parts);
    if (candidate.finishReason) target.finishReason = candidate.finishReason;
    if (candidate.groundingMetadata) target.groundingMetadata = candidate.groundingMetadata;
  }
  if (data.usageMetadata) fullResponse.usageMetadata = data.usageMetadata;
  return fullResponse;
};

const mergeParts = (existingParts, parts) => {
  for (const part of parts) {
    const last = existingParts.at(-1);
    if (isPlainText(part) && isPlainText(last) && !last.thoughtSignature) {
      last.text += part.text;
      if (part.thoughtSignature) last.thoughtSignature = part.thoughtSignature;
    } else {
      existingParts.push(JSON.parse(JSON.stringify(part)));
    }
  }
};

const postGeminiGenerateContent = async (contents, options = {}) => {
  const model = selectModel(contents.length, options.toolCallCount || 0, options);
  const requestBody = buildRequestBody(contents, options, model);
  const maxAttempts = options.maxAttempts || 3;
  const timeout = options.timeoutMs || GEMINI_REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}/${model}:generateContent`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          timeout
        }
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = status === 429 || status === 500 || status === 503;

      if (!isRetryable || attempt === maxAttempts - 1) {
        throw error;
      }

      await sleep(1000 * (attempt + 1));
    }
  }
};

const streamGeminiGenerateContent = async (contents, onChunk, options = {}) => {
  const model = selectModel(contents.length, options.toolCallCount || 0, options);
  const requestBody = buildRequestBody(contents, options, model);

  const response = await axios.post(
    `${GEMINI_API_URL}/${model}:streamGenerateContent?alt=sse`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
      responseType: 'stream'
    }
  );

  return new Promise((resolve, reject) => {
    let fullResponse = null;
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]' || !dataStr) continue;
          try {
            fullResponse = mergeStreamChunk(fullResponse, JSON.parse(dataStr), onChunk);
          } catch(e) {
             console.error('SSE JSON parse error:', e.message, 'Raw string:', dataStr);
          }
        }
      }
    });

    response.data.on('end', () => resolve(fullResponse));
    response.data.on('error', (err) => reject(err));
  });
};

const SEARCH_TIMEOUT_MS = 20000;

// One search-only request; returns a dated summary plus the web sources Gemini used.
const searchWithGoogle = async (query) => {
  if (!isSearchEnabled()) {
    throw Object.assign(new Error('Web search is disabled.'), { code: 'search_disabled' });
  }
  const model = process.env.GEMINI_MODEL_SEARCH || 'gemini-2.5-flash';
  const today = new Date().toISOString().slice(0, 10);
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `Today is ${today}. Search the web and summarise the most relevant recent findings for this crypto-market question in at most 8 short bullet points, each with its date and outlet. Only state what the sources say.

Question: ${query}` }]
    }],
    tools: [{ googleSearch: {} }],
    generationConfig: { ...buildGenerationConfig({ lightweight: true }, model), maxOutputTokens: 2048 }
  };

  const response = await axios.post(`${GEMINI_API_URL}/${model}:generateContent`, body, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    timeout: SEARCH_TIMEOUT_MS
  });

  const candidate = response.data?.candidates?.[0];
  const summary = (candidate?.content?.parts || [])
    .filter((part) => typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
  const metadata = candidate?.groundingMetadata || {};
  const seen = new Set();
  const sources = (metadata.groundingChunks || [])
    .map((chunk) => ({ title: chunk.web?.title || null, url: chunk.web?.uri || null }))
    .filter((source) => source.url && !seen.has(source.url) && seen.add(source.url))
    .slice(0, 8);

  return { query, summary, sources, searchQueries: metadata.webSearchQueries || [], retrievedAt: new Date().toISOString() };
};

module.exports = {
  searchWithGoogle,
  buildRequestBody,
  mergeStreamChunk,
  selectModel,
  formatGeminiErrorMessage,
  postGeminiGenerateContent,
  streamGeminiGenerateContent
};
