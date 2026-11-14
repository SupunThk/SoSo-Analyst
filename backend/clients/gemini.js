const axios = require('axios');
const { filterToolDeclarations } = require('../tools/definitions');
const { buildSystemPrompt } = require('../prompt/system');
const { getPositiveInteger, sleep } = require('../utils/common');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL_FLASH = 'gemini-2.5-flash';
const GEMINI_MODEL_PRO = 'gemini-2.5-pro';

const GEMINI_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.GEMINI_REQUEST_TIMEOUT_MS, 60000);

const selectModel = (contentsLength = 0, toolCallCount = 0) => {
  if (toolCallCount >= 3) return GEMINI_MODEL_PRO;
  if (contentsLength > 10) return GEMINI_MODEL_PRO;
  return GEMINI_MODEL_FLASH;
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

const buildToolConfig = () => {
  return {
    functionCallingConfig: {
      mode: 'AUTO'
    }
  };
};

// Gemini 2.5 rejects requests that mix built-in tools (googleSearch) with
// function declarations, and rejects any tool use with JSON response mode.
// So: function tools when the router allowed some; otherwise Google Search
// grounding; and no tools at all for JSON / lightweight (classifier) calls.
const buildTools = (options = {}) => {
  if (options.lightweight || options.responseMimeType === 'application/json') {
    return null;
  }

  const declarations = filterToolDeclarations(options.allowedFunctionNames);
  const hasFunctions = declarations.some((group) => group.functionDeclarations?.length > 0);
  if (hasFunctions) {
    return { tools: declarations, usesFunctions: true };
  }

  return { tools: [{ googleSearch: {} }], usesFunctions: false };
};

const buildRequestBody = (contents, options = {}) => {
  const toolSetup = buildTools(options);

  const body = {
    contents,
    generationConfig: {
      temperature: options.lightweight ? 0 : 0.3,
      topP: 0.85,
      topK: 40,
      maxOutputTokens: options.lightweight ? 1024 : 8192,
      responseMimeType: options.responseMimeType || 'text/plain',
      thinkingConfig: {
        thinkingBudget: options.lightweight ? 0 : 4096
      }
    }
  };

  if (!options.lightweight) {
    body.systemInstruction = {
      parts: [{ text: buildSystemPrompt({ version: process.env.SYSTEM_PROMPT_VERSION }) }]
    };
  }

  if (toolSetup) {
    body.tools = toolSetup.tools;
    if (toolSetup.usesFunctions) {
      body.toolConfig = buildToolConfig();
    }
  }

  return body;
};

const postGeminiGenerateContent = async (contents, options = {}) => {
  const model = selectModel(contents.length, options.toolCallCount || 0);
  const requestBody = buildRequestBody(contents, options);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}/${model}:generateContent`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          timeout: GEMINI_REQUEST_TIMEOUT_MS
        }
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = status === 429 || status === 500 || status === 503;

      if (!isRetryable || attempt === 2) {
        throw error;
      }

      await sleep(1000 * (attempt + 1));
    }
  }
};

const streamGeminiGenerateContent = async (contents, onChunk, options = {}) => {
  const model = selectModel(contents.length, options.toolCallCount || 0);
  const requestBody = buildRequestBody(contents, options);

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
            const data = JSON.parse(dataStr);
            const parts = data.candidates?.[0]?.content?.parts || [];
            const textPart = parts.find(p => typeof p.text === 'string');
            if (textPart && onChunk) {
              onChunk(textPart.text);
            }
            if (!fullResponse) {
               fullResponse = JSON.parse(JSON.stringify(data));
            } else if (data.candidates && data.candidates[0].content) {
               // Merge text parts (simple concatenation for text, function calls usually come in one chunk)
               const existingParts = fullResponse.candidates[0].content.parts;
               if (textPart) {
                 const existingTextPart = existingParts.find(p => typeof p.text === 'string');
                 if (existingTextPart) {
                   existingTextPart.text += textPart.text;
                 } else {
                   existingParts.push(textPart);
                 }
               }
               const funcCallParts = parts.filter(p => p.functionCall);
               for (const funcCallPart of funcCallParts) {
                 if (!existingParts.find(p => p.functionCall?.name === funcCallPart.functionCall.name)) {
                   existingParts.push(funcCallPart);
                 }
               }
               // Keep finishReason if present
               if (data.candidates[0].finishReason) {
                 fullResponse.candidates[0].finishReason = data.candidates[0].finishReason;
               }
            }
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

module.exports = {
  buildRequestBody,
  formatGeminiErrorMessage,
  postGeminiGenerateContent,
  streamGeminiGenerateContent
};
