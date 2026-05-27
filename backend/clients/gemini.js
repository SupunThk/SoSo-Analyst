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

const buildRequestBody = (contents, options = {}) => ({
  contents,
  tools: filterToolDeclarations(options.allowedFunctionNames),
  systemInstruction: {
    parts: [
      {
        text: buildSystemPrompt({ version: process.env.SYSTEM_PROMPT_VERSION })
      }
    ]
  },
  generationConfig: {
    temperature: 0.3,
    topP: 0.85,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
    thinkingConfig: {
      thinkingBudget: 4096
    }
  },
  toolConfig: buildToolConfig()
});

const postGeminiGenerateContent = async (contents, options = {}) => {
  const model = selectModel(contents.length, options.toolCallCount || 0);
  const requestBody = buildRequestBody(contents, options);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json'
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
    `${GEMINI_API_URL}/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json'
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
          if (dataStr === '[DONE]') continue;
          try {
            const data = JSON.parse(dataStr);
            const parts = data.candidates?.[0]?.content?.parts || [];
            const textPart = parts.find(p => p.text);
            if (textPart && onChunk) {
              onChunk(textPart.text);
            }
            if (!fullResponse) {
               fullResponse = JSON.parse(JSON.stringify(data));
            } else if (data.candidates && data.candidates[0].content) {
               // Merge text parts (simple concatenation for text, function calls usually come in one chunk)
               const existingParts = fullResponse.candidates[0].content.parts;
               if (textPart) {
                 const existingTextPart = existingParts.find(p => p.text !== undefined);
                 if (existingTextPart) {
                   existingTextPart.text += textPart.text;
                 } else {
                   existingParts.push(textPart);
                 }
               }
               const funcCallPart = parts.find(p => p.functionCall);
               if (funcCallPart && !existingParts.find(p => p.functionCall?.name === funcCallPart.functionCall.name)) {
                 existingParts.push(funcCallPart);
               }
               // Keep finishReason if present
               if (data.candidates[0].finishReason) {
                 fullResponse.candidates[0].finishReason = data.candidates[0].finishReason;
               }
            }
          } catch(e) {}
        }
      }
    });

    response.data.on('end', () => resolve(fullResponse));
    response.data.on('error', (err) => reject(err));
  });
};

module.exports = {
  formatGeminiErrorMessage,
  postGeminiGenerateContent,
  streamGeminiGenerateContent
};
