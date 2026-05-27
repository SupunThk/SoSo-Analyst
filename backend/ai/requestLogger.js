const LOG_PREFIX = '[agent-request]';

const truncateMessage = (message, maxLength = 200) => {
  const text = String(message || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

const logAgentRequest = ({
  userMessage = '',
  intent = 'unknown',
  allowedTools = [],
  actualToolCalls = [],
  toolResults = [],
  latencyMs = 0,
  budgetUsed = 0,
  budgetMax = 0,
  dedupeHits = 0,
  zeroToolSuccess = false
} = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    query: truncateMessage(userMessage),
    intent,
    allowedTools,
    actualToolsCalled: [...new Set(actualToolCalls)],
    toolCount: actualToolCalls.length,
    toolErrors: toolResults
      .filter((tc) => tc.status === 'error')
      .map((tc) => tc.name),
    latencyMs,
    budgetUsed,
    budgetMax,
    dedupeHits,
    zeroToolSuccess
  };

  try {
    console.log(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to serialize log entry:`, err.message);
  }
};

module.exports = { logAgentRequest };
