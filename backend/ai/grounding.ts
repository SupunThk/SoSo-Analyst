const DATA_INTENT_PATTERN = /\b(price|news|etf|flow|portfolio|wallet|holdings|compare|vs|tokenomics|supply|macro|cpi|fomc|treasury|sector|funding|index|chart|trend|market cap|volume)\b/i;

const DEFAULT_EMPTY_ANSWERS = new Set([
  'No response generated. Please try again.',
  'Response blocked by safety filters. Please rephrase your query.',
  'Response was truncated due to length limits. Please ask a more specific question.'
]);

const SPECIFIC_QUESTION_PATTERN = /\b(which|what|who|most|top|best|worst|biggest|highest|lowest|how much|what price|name)\b/i;
const HOT_NEWS_STORY_PATTERN = /\b(hot(?:test)? (?:\w+ )*news(?: stories)?|crypto news(?: today)?|latest (?:crypto )?news(?: stories)?|news stories)\b/i;
const ACTIONABLE_LANGUAGE_PATTERN = /\b(buy|sell|long|short|entry|exit|position|accumulate|fade|bid|offer)\b/i;
const RISK_CAVEAT_PATTERN = /\b(risk|caution|invalidat|disclaimer|not financial advice|verify|caveat|warning)\b/i;
const BOLD_DATA_PATTERN = /\*\*[^*]*(?:\$[\d,]+\.?\d*|[+-]?\d+\.?\d*%|#\d+)[^*]*\*\*/;

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
  const numberedItems = String(answer || '').match(/(?:^|\n)\s*\d+[)\.]\s+/g) || [];
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

// Check if the answer contains bold data citations (prices, percentages, rankings)
const hasCitationDensity = (answer) => {
  if (String(answer || '').length < 300) return true; // Short answers get a pass
  return BOLD_DATA_PATTERN.test(answer);
};

// Build a partial failure note listing which data sources failed
const buildPartialFailureNote = (toolCalls) => {
  const failedTools = toolCalls.filter((tool) => tool.status === 'error');
  const successfulTools = toolCalls.filter((tool) => tool.status === 'success');
  if (!failedTools.length || !successfulTools.length) return null;

  const TOOL_SOURCE_MAP = {
    get_market_intelligence: 'Market Intelligence',
    get_token_intelligence: 'Token Intelligence',
    get_asset_snapshot: 'Asset Snapshot',
    get_asset_price_history: 'Price History',
    get_asset_news_brief: 'Asset News',
    get_hot_news_digest: 'Hot News',
    get_etf_flow_brief: 'ETF Flows',
    get_macro_crypto_calendar: 'Macro Calendar',
    get_macro_event_history: 'Macro History',
    get_sector_spotlight: 'Sector Spotlight',
    get_token_economics: 'Tokenomics',
    get_trading_pairs: 'Trading Pairs',
    get_index_overview: 'Index Overview',
    get_wallet_holdings: 'Wallet Holdings',
    get_sodex_markets: 'SoDEX Markets',
    get_sodex_orderbook: 'SoDEX Order Book',
    get_sodex_analytics: 'SoDEX Analytics',
    get_crypto_equities_watchlist: 'Crypto Equities',
    get_btc_treasury_brief: 'BTC Treasury',
    get_btc_purchase_history_brief: 'BTC Purchase History',
    get_fundraising_overview: 'Fundraising',
    search_crypto_news: 'News Search',
    get_analysis_chart: 'Analysis Chart',
    get_fed_rate_outlook: 'Fed Rate Outlook',
    get_crypto_market_overview: 'Crypto Market Overview',
    compare_assets: 'Asset Comparison'
  };

  const failedNames = failedTools
    .map((tool) => TOOL_SOURCE_MAP[tool.name] || tool.name.replace(/^get_/, '').replace(/_/g, ' '))
    .join(', ');

  return `\n\n---\n*Note: ${failedNames} data was unavailable. Analysis is based on ${successfulTools.length} of ${toolCalls.length} data sources.*`;
};

// Check if the answer has actionable language without appropriate risk caveats
const needsRiskDisclaimer = (answer) => {
  return ACTIONABLE_LANGUAGE_PATTERN.test(answer) && !RISK_CAVEAT_PATTERN.test(answer);
};

const RISK_DISCLAIMER = '\n\n---\n*⚠️ This is analysis, not financial advice. Always verify data independently and manage risk before acting.*';

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

  // Build the final answer with optional post-processing notes
  let finalAnswer = trimmedAnswer;

  // Partial tool failure transparency
  const partialNote = buildPartialFailureNote(toolCalls);
  if (partialNote) {
    finalAnswer += partialNote;
  }

  // Citation density check: flag answers that lack bold data points
  if (!hasCitationDensity(finalAnswer) && successfulTools.length > 0) {
    finalAnswer += '\n\n---\n*Note: This response may lack specific data citations. Ask a follow-up for exact numbers, prices, or percentages.*';
  }

  // Risk-aware grounding: append disclaimer if answer has actionable language without caveats
  if (needsRiskDisclaimer(finalAnswer)) {
    finalAnswer += RISK_DISCLAIMER;
  }

  return finalAnswer;
};

export { applyGroundingGuard, needsLiveData, DATA_INTENT_PATTERN };
