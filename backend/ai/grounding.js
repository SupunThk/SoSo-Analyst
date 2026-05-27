const DATA_INTENT_PATTERN = /\b(price|news|etf|flow|portfolio|wallet|holdings|compare|vs|tokenomics|supply|macro|cpi|fomc|treasury|sector|funding|index|chart|trend|market cap|volume)\b/i;

const DEFAULT_EMPTY_ANSWERS = new Set([
  'No response generated. Please try again.',
  'Response blocked by safety filters. Please rephrase your query.',
  'Response was truncated due to length limits. Please ask a more specific question.'
]);

const needsLiveData = (userMessage) => DATA_INTENT_PATTERN.test(String(userMessage || ''));

const applyGroundingGuard = ({ answer, toolCalls = [], userMessage = '' }) => {
  const trimmedAnswer = String(answer || '').trim();
  const successfulTools = toolCalls.filter((tool) => tool.status === 'success');
  const failedTools = toolCalls.filter((tool) => tool.status === 'error');
  const allToolsFailed = toolCalls.length > 0 && successfulTools.length === 0;
  const noToolsCalled = toolCalls.length === 0;
  const emptyAnswer = !trimmedAnswer || DEFAULT_EMPTY_ANSWERS.has(trimmedAnswer);
  const requiresData = needsLiveData(userMessage);

  if (allToolsFailed) {
    const failedNames = [...new Set(failedTools.map((tool) => tool.name))].join(', ');
    return [
      '**DATA UNAVAILABLE** — All requested data tools failed for this query.',
      failedNames ? `Failed tools: ${failedNames}.` : '',
      'Please retry with a narrower question (single asset, shorter time range, or one data category).',
      failedTools[0]?.result ? `Latest error: ${failedTools[0].result}` : ''
    ].filter(Boolean).join('\n\n');
  }

  if (requiresData && noToolsCalled && emptyAnswer) {
    return [
      '**INSUFFICIENT LIVE DATA** — I could not fetch market data for this question.',
      'Try rephrasing with a specific asset or metric (for example: "BTC 24h price and news" or "US BTC ETF flows this week").'
    ].join('\n\n');
  }

  if (requiresData && noToolsCalled && !emptyAnswer && !trimmedAnswer.includes('TOOL')) {
    return `${trimmedAnswer}\n\n---\n*Note: This answer was generated without a successful live data tool call. Treat numbers as unverified unless you see data sources listed above.*`;
  }

  return trimmedAnswer;
};

module.exports = {
  applyGroundingGuard,
  needsLiveData,
  DATA_INTENT_PATTERN
};
