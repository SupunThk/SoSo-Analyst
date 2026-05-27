const { sanitizeForGemini } = require('../normalizers/toolResult');

const getMaxChars = () => {
  const parsed = Number(process.env.GEMINI_TOOL_PAYLOAD_MAX_CHARS);
  return Number.isFinite(parsed) && parsed > 500 ? parsed : 24000;
};

const shrinkPreview = (preview) => {
  if (!preview || typeof preview !== 'object') {
    return preview;
  }

  const shrunk = { ...preview };
  if (Array.isArray(shrunk.tokens)) {
    shrunk.tokens = shrunk.tokens.slice(0, 10);
  }
  if (Array.isArray(shrunk.chainSummaries)) {
    shrunk.chainSummaries = shrunk.chainSummaries.slice(0, 8).map((chain) => ({
      chain: chain.chain,
      status: chain.status,
      totalValueUsd: chain.totalValueUsd,
      errors: Array.isArray(chain.errors) ? chain.errors.slice(0, 2) : []
    }));
  }

  return sanitizeForGemini(shrunk, 0);
};

const compressToolPayloadForGemini = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload.error) {
    return {
      error: true,
      source: payload.source,
      tool: payload.tool,
      message: payload.message
    };
  }

  const compact = {
    source: payload.source,
    tool: payload.tool,
    args: payload.args,
    summary: payload.summary,
    evidenceFacts: Array.isArray(payload.evidenceFacts) ? payload.evidenceFacts.slice(0, 16) : undefined,
    analysis: payload.analysis,
    apiCode: payload.apiCode,
    totalItems: payload.totalItems,
    dataPreview: shrinkPreview(payload.dataPreview)
  };

  const maxChars = getMaxChars();
  let serialized = JSON.stringify(compact);
  if (serialized.length <= maxChars) {
    return compact;
  }

  const smaller = { ...compact };
  delete smaller.dataPreview;
  serialized = JSON.stringify(smaller);
  if (serialized.length <= maxChars) {
    return smaller;
  }

  return {
    source: compact.source,
    tool: compact.tool,
    summary: compact.summary,
    analysis: compact.analysis,
    note: 'Full tool payload omitted for context limits. Use summary and analysis fields only.'
  };
};

module.exports = {
  compressToolPayloadForGemini,
  getMaxChars
};
