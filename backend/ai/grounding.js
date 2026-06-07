const DATA_INTENT_PATTERN = /\b(price|news|etf|flow|portfolio|wallet|holdings|compare|vs|tokenomics|supply|macro|cpi|fomc|treasury|sector|funding|index|chart|trend|market cap|volume)\b/i;

const DEFAULT_EMPTY_ANSWERS = new Set([
  'No response generated. Please try again.',
  'Response blocked by safety filters. Please rephrase your query.',
  'Response was truncated due to length limits. Please ask a more specific question.'
]);

const SPECIFIC_QUESTION_PATTERN = /\b(which|what|who|most|top|best|worst|biggest|highest|lowest|how much|what price|name)\b/i;
const HOT_NEWS_STORY_PATTERN = /\b(hot(?:test)? (?:\w+ )*news(?: stories)?|crypto news(?: today)?|latest (?:crypto )?news(?: stories)?|news stories)\b/i;

const VAGUE_ANSWER_PHRASES = [
  'no clear directional bias',
  'mixed-to-neutral',
  'no dominant sector outperforming',
  'lack of high-conviction opportunities',
  'the market is exhibiting',
  'balanced sentiment across the market',
  'neutral market regime',
  'a cautious approach is warranted',
  'period of consolidation',
  'range-bound trading may persist',
  'absence of clear opportunities'
];

const needsLiveData = (userMessage) => DATA_INTENT_PATTERN.test(String(userMessage || ''));

const extractTopNewsTitles = (toolResult = '') => {
  const match = String(toolResult || '').match(/Top titles:\s*(.+)$/i);
  if (!match) return [];

  return match[1]
    .split('|')
    .map((title) => title.trim())
    .filter((title) => !/\.\.\.\s*\(truncated\)$/i.test(title))
    .filter(Boolean)
    .slice(0, 5);
};

const includesAnyTitle = (answer, titles) => {
  const normalizedAnswer = String(answer || '').toLowerCase();
  return titles.some((title) => {
    const probe = title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
    return probe.length >= 12 && normalizedAnswer.includes(probe);
  });
};

const buildHotNewsFallback = (titles) => [
  '**Hot News Headlines**',
  ...titles.map((title, index) => `${index + 1}. **${title}**`),
  '',
  '**Why It Matters**',
  'The news feed returned concrete headlines, so the answer should lead with those stories instead of only summarizing keyword sentiment. Use the ranked headlines above as the primary evidence.'
].join('\n');

const hasHotNewsReportShape = (answer) => {
  const normalized = String(answer || '').toLowerCase();
  const numberedItems = String(answer || '').match(/(?:^|\n)\s*\d+[\).]\s+/g) || [];
  const storyMarkers = [
    'headline',
    'why it matters',
    'market readthrough',
    'watch next',
    'what to watch',
    'story',
    'stories'
  ];
  const markerCount = storyMarkers.reduce(
    (count, marker) => count + (normalized.includes(marker) ? 1 : 0),
    0
  );

  return numberedItems.length >= 2 || markerCount >= 2;
};

const isLowSubstanceHotNewsAnswer = (answer) => {
  const normalized = String(answer || '').toLowerCase();
  const sentimentOnlyMarkers = [
    'keyword scan',
    'bullish cues',
    'bearish cues',
    'importance score',
    'positive news flow',
    'constructive news cycle',
    'predominantly bullish sentiment'
  ];
  const markerCount = sentimentOnlyMarkers.reduce(
    (count, marker) => count + (normalized.includes(marker) ? 1 : 0),
    0
  );

  return markerCount >= 1 && !hasHotNewsReportShape(answer);
};

const isVagueAnswer = (answer) => {
  const lowerAnswer = String(answer || '').toLowerCase();
  const matchCount = VAGUE_ANSWER_PHRASES.reduce(
    (count, phrase) => count + (lowerAnswer.includes(phrase.toLowerCase()) ? 1 : 0),
    0
  );
  return matchCount >= 2;
};

const applyGroundingGuard = ({ answer, toolCalls = [], userMessage = '' }) => {
  const trimmedAnswer = String(answer || '').trim();
  const successfulTools = toolCalls.filter((tool) => tool.status === 'success');
  const failedTools = toolCalls.filter((tool) => tool.status === 'error');
  const allToolsFailed = toolCalls.length > 0 && successfulTools.length === 0;
  const noToolsCalled = toolCalls.length === 0;
  const emptyAnswer = !trimmedAnswer || DEFAULT_EMPTY_ANSWERS.has(trimmedAnswer);
  const requiresData = needsLiveData(userMessage);

  if (allToolsFailed) {
    return [
      '**DATA UNAVAILABLE** — The underlying data feeds are currently unresponsive.',
      'Please retry with a narrower question (single asset, shorter time range, or one data category).',
      failedTools[0]?.result ? `Latest error reported: ${failedTools[0].result}` : ''
    ].filter(Boolean).join('\n\n');
  }

  if (requiresData && noToolsCalled && emptyAnswer) {
    return [
      '**INSUFFICIENT LIVE DATA** — I could not fetch real-time market evidence for this query.',
      'Try rephrasing with a specific asset or metric (for example: "BTC 24h price and news" or "US BTC ETF flows this week").'
    ].join('\n\n');
  }

  if (requiresData && noToolsCalled && !emptyAnswer) {
    return `${trimmedAnswer}\n\n---\n*Note: This analysis was generated without a direct real-time data fetch. Please verify critical numbers before acting.*`;
  }

  const hotNewsTool = successfulTools.find((tool) => tool.name === 'get_hot_news_digest');
  if (HOT_NEWS_STORY_PATTERN.test(String(userMessage || '')) && hotNewsTool) {
    const titles = extractTopNewsTitles(hotNewsTool.result);
    if (titles.length && !includesAnyTitle(trimmedAnswer, titles) && isLowSubstanceHotNewsAnswer(trimmedAnswer)) {
      return buildHotNewsFallback(titles);
    }
  }

  // Detect vague answers to specific questions
  if (SPECIFIC_QUESTION_PATTERN.test(String(userMessage || '')) && isVagueAnswer(trimmedAnswer)) {
    return `${trimmedAnswer}\n\n---\n*Note: The available data may not directly answer your specific question. Try asking about a specific asset (e.g., "Which of BTC, ETH, SOL gained the most today?") or ask for "SoDEX top gainers" for exchange-specific data.*`;
  }

  return trimmedAnswer;
};

module.exports = {
  applyGroundingGuard,
  needsLiveData,
  DATA_INTENT_PATTERN
};
