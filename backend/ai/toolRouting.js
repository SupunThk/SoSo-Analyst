const { postGeminiGenerateContent } = require('../clients/gemini');

const BUDGET_TIERS = {
  simple:    { max: 1 },
  standard:  { max: 2 },
  market:    { max: 3 },
  deep_dive: { max: 4 },
  portfolio: { max: 6 }
};

const ROUTING_RULES = [
  {
    intent: 'portfolio',
    pattern: /\b(analy[sz]e|check|review|audit|show|summari[sz]e)\s+my\s+(portfolio|wallet|holdings|bags)\b|\bmy\s+(portfolio|wallet|holdings|bags)\b/i,
    tools: ['get_wallet_holdings', 'get_asset_snapshot', 'get_asset_news_brief', 'get_token_economics'],
    budget: 'portfolio',
    followUp: 'If holdings are returned, inspect the top priced holdings and call asset snapshot/news/tokenomics tools for the major non-stablecoin exposures when possible.'
  },
  {
    intent: 'compare',
    pattern: /\b(compare|vs|versus)\b/i,
    tools: ['compare_assets'],
    budget: 'simple',
    followUp: 'Use a table and compare exact fields returned by the comparison result before writing an interpretation.'
  },
  {
    intent: 'etf_flow',
    pattern: /\b(etf|spot etf|ibit|fbtc|gbtc).*\b(flows?|inflows?|outflows?|aum|net assets)\b|\b(btc|eth|bitcoin|ethereum)\b.*\betf\b/i,
    tools: ['get_etf_flow_brief', 'get_asset_snapshot'],
    budget: 'standard',
    followUp: 'Tie ETF flow direction to the underlying asset snapshot only if both tools return successful data.'
  },
  {
    intent: 'market_intelligence',
    pattern: /\b(regime|rotation|rotating|opportunit|scanner|alert|watchlist)\b/i,
    tools: ['get_market_intelligence'],
    budget: 'simple',
    followUp: 'Lead with the computed regime, then cite rotation leaders/laggards, active alerts, and opportunity rows from the returned intelligence object.'
  },
  {
    intent: 'market_overview',
    pattern: /\b(market overview|what(?:'s| is) happening|hot(?:test)? (?:\w+ )*news|crypto news today|full market|market update|latest (?:crypto |market )?news|news stories)\b/i,
    tools: ['get_market_intelligence', 'get_hot_news_digest', 'get_macro_crypto_calendar'],
    budget: 'market',
    followUp: 'Separate market price, sector, news, and macro evidence; avoid a single broad sentiment paragraph.'
  },
  {
    intent: 'hot_news',
    pattern: /\b(hot(?:test)? (?:\w+ )*news|crypto news|latest news|news stories)\b/i,
    tools: ['get_hot_news_digest'],
    budget: 'simple',
    followUp: 'For hot-news requests, list the returned headline titles first in a ranked list. For each headline, add a short "why it matters" note grounded in the returned item. Do not answer with only keyword sentiment, importance scores, or a broad market summary.'
  },
  {
    intent: 'asset_news',
    pattern: /\b(news|headline)\b.+\b(btc|eth|bitcoin|ethereum|sol|solana|xrp|bnb)\b|\b(btc|eth|bitcoin|ethereum|sol|solana|xrp|bnb)\b.+\b(news|headline)\b/i,
    tools: ['get_asset_news_brief', 'get_asset_snapshot'],
    budget: 'standard',
    followUp: 'List the returned headlines first, then give one market readthrough grounded in those headlines and snapshot data.'
  },
  {
    intent: 'token_intelligence',
    pattern: /\b(why|what(?:'s| is))\b.+\b(moving|dumping|pumping|surging|crashing|up|down|mooning)\b|\b(moving|dumping|pumping|surging|crashing)\b/i,
    tools: ['get_token_intelligence'],
    budget: 'simple',
    followUp: 'Use the token intelligence whyMoving bullets, relative BTC/ETH/sector values, trend, SoDEX spread, and headlines. Do not answer from general market memory. Do NOT call get_asset_snapshot or get_asset_news_brief — this tool already includes that data.'
  },
  {
    intent: 'asset_deep_dive',
    pattern: /\b(deep dive|good buy|bullish|bearish|thesis)\b/i,
    tools: ['get_token_intelligence', 'get_asset_price_history', 'get_token_economics', 'get_trading_pairs'],
    budget: 'deep_dive',
    followUp: 'Use price, trend, news, supply, and liquidity facts separately; do not collapse them into generic sentiment.'
  },
  {
    intent: 'tokenomics',
    pattern: /\b(tokenomics|circulating supply|max supply|inflation rate|token distribution|supply ratio)\b/i,
    tools: ['get_token_economics'],
    budget: 'simple',
    followUp: 'Report circulating supply, total supply, max supply, supply ratio, and inflation status. Use supplyHistory if available.'
  },
  {
    intent: 'index_overview',
    pattern: /\b(sosovalue\s+)?ssi\b|\b(indices|index overview|index performance|index constituents)\b/i,
    tools: ['get_index_overview'],
    budget: 'standard',
    followUp: 'Report index names, recent performance, constituents where returned, and how the indices frame sector rotation. State when only index-level data is available.'
  },
  {
    intent: 'price_history',
    pattern: /\b(trend|history|perform(?:ed|ance)?|chart|candle|klines|last \d+ days|this month|this week)\b/i,
    tools: ['get_asset_price_history', 'get_asset_snapshot'],
    budget: 'standard',
    followUp: 'Lead with period change, volatility, high/low, and current snapshot values.'
  },
  {
    intent: 'macro',
    pattern: /\b(macro|fomc|cpi|fed|economic calendar|rates|inflation|jobs|unemployment|pce)\b/i,
    tools: ['get_macro_crypto_calendar', 'get_macro_event_history'],
    budget: 'standard',
    followUp: 'Use dates, event names, actual/forecast/previous values, and state clearly when history is unavailable.'
  },
  {
    intent: 'treasury',
    pattern: /\b(treasur|mstr|microstrategy|public compan|balance sheet)\b/i,
    tools: ['get_btc_treasury_brief', 'get_btc_purchase_history_brief'],
    budget: 'standard',
    followUp: 'Use company names, tickers, purchase dates, BTC amounts, and do not infer corporate intent beyond returned data.'
  },
  {
    intent: 'crypto_equities',
    pattern: /\b(crypto equities|crypto stocks|equities watchlist|stock watchlist)\b|\b(mstr|coin|mara|riot|clsk)\b.*\b(watchlist|update|stocks?|equities|price|performance)\b/i,
    tools: ['get_crypto_equities_watchlist'],
    budget: 'standard',
    followUp: 'Report crypto equity tickers in a watchlist table with price, 24h move, market cap/volume when available, and a crypto-market readthrough. Do not confuse stock tickers with crypto tokens.'
  },
  {
    intent: 'sector',
    pattern: /\b(sectors?|narratives?|defi|ai|layer ?2|l2|meme|gaming)\b/i,
    tools: ['get_market_intelligence', 'get_sector_spotlight', 'get_index_overview'],
    budget: 'market',
    followUp: 'Rank sectors using market-intelligence rotation plus sector spotlight rows. If direct sector spotlight rows are empty, use returned fallback rows or SSI index rows and label the scope clearly instead of stopping at "no data."'
  },
  {
    intent: 'top_movers',
    pattern: /\b(top|most|biggest|best|worst|highest|lowest|which)\b.*\b(gain(?:ers?|ed|ing|s)?|los(?:ers?|ing|t|ses)?|movers?|performers?|pump(?:ed|ing)?|dump(?:ed|ing)?|winners?|performing|rising|falling|trending)\b|\b(gain(?:ers?|ed|ing|s)?|los(?:ers?|ing|t|ses)?|movers?|pump(?:ed|ing)?|dump(?:ed|ing)?|winners?)\b.*\b(token|coin|crypto|asset|currency)\b/i,
    tools: ['get_sodex_analytics', 'get_sector_spotlight', 'get_market_intelligence'],
    budget: 'market',
    followUp: 'Identify specific top-gaining or top-losing tokens from SoDEX analytics data and sector rotation. Name exact tokens, their percentage changes, and prices. State the data source clearly (e.g. "On SoDEX exchange..." or "Among tracked major assets..."). If the user asked about gainers, lead with the biggest gainer and its stats.'
  },
  {
    intent: 'fundraising',
    pattern: /\b(fundraising|funding rounds?|vc|venture capital|investment rounds?|raised capital|raises funding)\b/i,
    tools: ['get_fundraising_overview'],
    budget: 'standard',
    followUp: 'Report fundraising rounds as concrete rows: project, amount, investors, category, date if available, and market readthrough. Do not turn it into broad sentiment.'
  },
  {
    intent: 'opportunity',
    pattern: /\b(what|which)\b.*\b(buy|invest|long|short|trade|pick)\b|\b(recommend|suggestion|opportunit(?:y|ies))\b/i,
    tools: ['get_market_intelligence', 'get_sector_spotlight', 'get_hot_news_digest'],
    budget: 'market',
    followUp: 'Use opportunity scanner results and sector rotation data to identify specific actionable areas. Never give generic "the market is neutral" — always point to specific sectors or assets that stand out relative to each other.'
  },
  {
    intent: 'sentiment',
    pattern: /\b(sentiment|fear|greed|mood|feeling|vibes?|optimist|pessimist)\b/i,
    tools: ['get_market_intelligence', 'get_hot_news_digest'],
    budget: 'standard',
    followUp: 'Translate regime data and news sentiment into a clear sentiment reading. Use specific breadth, dispersion, and sector rotation data to support the reading.'
  },
  {
    intent: 'sodex_analytics',
    pattern: /\b(sodex)\b.*\b(analytics?|volume|traders?|activity|gainers?|losers?|stats?|statistics)\b|\b(analytics?|volume|traders?|activity|gainers?|losers?|stats?|statistics)\b.*\b(sodex)\b/i,
    tools: ['get_sodex_analytics'],
    budget: 'simple',
    followUp: 'Report the top traded pairs, top gainers, top losers, tightest spreads, and total exchange volume. Name specific tokens and their percentage moves.'
  },
  {
    intent: 'sodex_orderbook',
    pattern: /\b(orderbook|order book|depth|spread|liquidity)\b.+\bsodex\b|\bsodex\b.+\b(orderbook|order book|depth|spread|liquidity)\b/i,
    tools: ['get_sodex_orderbook'],
    budget: 'simple',
    followUp: 'Report bid/ask levels and spread from the order book; do not discuss trade execution.'
  },
  {
    intent: 'sodex_markets',
    pattern: /\b(sodex)\b.+\b(markets|prices|tickers)\b|\b(markets|prices|tickers)\b.+\b(sodex)\b/i,
    tools: ['get_sodex_markets'],
    budget: 'simple',
    followUp: 'Report returned spot/perps market names and ticker values; do not discuss trade execution.'
  },
  {
    intent: 'asset_snapshot',
    pattern: /\b(price|quote|market cap|volume|doing)\b/i,
    tools: ['get_asset_snapshot'],
    budget: 'simple',
    followUp: 'Answer with exact price, change, market cap, and volume fields when available.'
  }
];

const DEFAULT_ROUTING = {
  intent: 'general_market',
  tools: ['get_market_intelligence', 'get_hot_news_digest'],
  budget: 'standard',
  followUp: 'IMPORTANT: If the user question is specific (about a token, a price, a gainer, etc.) but the market intelligence data does not directly answer it, state clearly what data is available and what is missing rather than giving a generic market summary. Ask the user to rephrase with a specific asset name if needed.'
};

const BUDGET_ORDER = ['simple', 'standard', 'market', 'deep_dive', 'portfolio'];
const MAX_MERGED_TOOLS = 8;
const STANDALONE_MARKET_OVERVIEW_PATTERN =
  /\b(full market overview|market overview report|market update report)\b/i;
const STANDALONE_HOT_NEWS_PATTERN =
  /\b(hot(?:test)? (?:\w+ )*news(?: stories)?|crypto news(?: today)?|latest (?:crypto )?news(?: stories)?|news stories)\b/i;
const NEWS_CONTEXT_PATTERN = /\b(regime|market overview|affect|impact|sentiment|macro|price|sectors?|rotation|why|because)\b/i;
const STANDALONE_INDEX_PATTERN =
  /\b(sosovalue\s+)?ssi\b|\b(indices|index overview|index performance|index constituents)\b/i;
const INDEX_CONTEXT_PATTERN = /\b(regime|market overview|opportunit|alert)\b/i;
const STANDALONE_CRYPTO_EQUITIES_PATTERN =
  /\b(crypto equities|crypto stocks|equities watchlist|stock watchlist)\b|\b(mstr|coin|mara|riot|clsk)\b.*\b(watchlist|update|stocks?|equities|price|performance)\b/i;
const STANDALONE_FUNDRAISING_PATTERN =
  /\b(fundraising|funding rounds?|vc|venture capital|investment rounds?|raised capital|raises funding)\b/i;

const toRoutingResult = (rule) => ({
  intent: rule.intent,
  tools: rule.tools,
  budget: rule.budget,
  followUp: rule.followUp
});

const findRule = (intent) => ROUTING_RULES.find((rule) => rule.intent === intent);

const isStandaloneHotNewsQuery = (text) =>
  STANDALONE_HOT_NEWS_PATTERN.test(text) && !NEWS_CONTEXT_PATTERN.test(text);

const isStandaloneIndexQuery = (text) =>
  STANDALONE_INDEX_PATTERN.test(text) && !INDEX_CONTEXT_PATTERN.test(text);

const REPORT_SHAPES = {
  portfolio: 'Portfolio report: holdings snapshot, top exposures, concentration/risk flags, chain coverage, and practical watchlist actions. Cite exact holdings and values when available.',
  compare: 'Comparison report: table first with price, 24h change, market cap, and volume for both assets; then relative strength, risks, and bottom-line takeaway.',
  etf_flow: 'ETF flow report: flow snapshot, top fund details, AUM/volume context, underlying BTC/ETH price context, and readthrough. Include exact flow fields returned by the tools.',
  market_intelligence: 'Market intelligence report: regime label, breadth/dispersion, rotation leaders and laggards, triggered alerts, opportunity rows, and strategic readthrough.',
  market_overview: 'Market overview report: executive summary, market evidence, sector/rotation evidence, news and macro readthrough, then strategic outlook.',
  hot_news: 'News report: start with a ranked Headline Tape using 3-5 returned headline titles. For each headline, add why it matters. Then add Market Readthrough and Watch Next. Do not lead with keyword sentiment scores.',
  asset_news: 'Asset news report: headline list first, then price context, asset-specific readthrough, risks, and what to watch next.',
  token_intelligence: 'Token intelligence report: why moving, live price/volume snapshot, BTC/ETH/sector relative performance, trend/liquidity context, returned headlines, and risks. Do not use generic market memory.',
  asset_deep_dive: 'Deep-dive report: thesis, price/trend evidence, news drivers, tokenomics/supply, liquidity/trading-pair context, risks, and verdict.',
  tokenomics: 'Tokenomics report: circulating/total/max supply, supply ratio, remaining supply or inflation status, historical supply if available, and investor readthrough.',
  index_overview: 'Index report: ranked SoSoValue indices, recent performance, constituent highlights where returned, sector mapping, and rotation takeaway.',
  price_history: 'Price history report: period return, latest price, high/low, volatility, trend label, current snapshot, and what would confirm or invalidate the trend.',
  macro: 'Macro report: upcoming calendar items with dates, actual/forecast/previous values where available, expected crypto impact, and watch-next levels/events.',
  treasury: 'Treasury report: company/ticker rows, BTC holdings or purchase history, dates and amounts, disclosed cost/price where available, and balance-sheet readthrough.',
  crypto_equities: 'Crypto equities report: watchlist table by ticker, price/24h move, market cap or volume if returned, link to BTC/crypto beta, and risk notes.',
  sector: 'Sector report: ranked sectors first, then leaders/laggards, key constituents or indices, evidence fields, risks, and rotation takeaway. If sector_spotlight is empty, use market-intelligence rotation, SSI index, or tracked-asset proxy rows and label the fallback scope.',
  top_movers: 'Movers report: ranked gainers/losers with exact percentage moves and prices, source scope, liquidity/volume context where available, and caution flags.',
  fundraising: 'Fundraising report: ranked recent rounds with project, amount, investors, category, date if returned, and market readthrough.',
  opportunity: 'Opportunity report: ranked opportunities, score/evidence rows, supporting sector/news context, risks, and next trigger to monitor. Do not give generic neutral commentary.',
  sentiment: 'Sentiment report: regime/mood summary, supporting breadth and news evidence, conflicting signals, risk level, and what would shift sentiment.',
  sodex_analytics: 'SoDEX analytics report: total volume/pairs, most traded pairs, top gainers, top losers, tightest spreads, and exchange-scope caveat.',
  sodex_orderbook: 'Order book report: bid/ask, spread, depth levels, liquidity interpretation, and execution caveat. Do not invent trade advice.',
  sodex_markets: 'SoDEX markets report: active spot/perps markets, ticker values, notable volume/move rows, and source scope.',
  asset_snapshot: 'Asset snapshot report: exact price, 24h change, market cap, 24h volume, rank if available, short context, and data caveat.'
};

const buildReportShapeContext = (intent) => {
  const intents = String(intent || '')
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean);
  const shapes = [...new Set(intents.map((item) => REPORT_SHAPES[item]).filter(Boolean))];

  if (!shapes.length) {
    return [
      'REPORT SHAPE:',
      'Use a compact analyst report format: direct answer first, concrete tool evidence second, interpretation third, and watch-next/risk note last.'
    ].join('\n');
  }

  return [
    'REPORT SHAPE:',
    ...shapes.map((shape, index) => `${index + 1}. ${shape}`),
    'Use section headers that match the requested analysis. Keep it concise, but include concrete returned rows, titles, or metrics before interpretation.'
  ].join('\n');
};

const highestBudget = (budgets) => {
  let best = 'simple';
  for (const b of budgets) {
    if (BUDGET_ORDER.indexOf(b) > BUDGET_ORDER.indexOf(best)) best = b;
  }
  return best;
};

const inferToolRouting = async (message = '') => {
  const text = String(message || '').trim();
  if (!text) {
    return {
      intent: 'unknown',
      tools: [],
      budget: 'simple',
      followUp: 'No routing hint available.'
    };
  }

  if (STANDALONE_MARKET_OVERVIEW_PATTERN.test(text)) {
    return toRoutingResult(findRule('market_overview'));
  }

  if (isStandaloneHotNewsQuery(text)) {
    return toRoutingResult(findRule('hot_news'));
  }

  if (isStandaloneIndexQuery(text)) {
    return toRoutingResult(findRule('index_overview'));
  }

  if (STANDALONE_CRYPTO_EQUITIES_PATTERN.test(text)) {
    return toRoutingResult(findRule('crypto_equities'));
  }

  if (STANDALONE_FUNDRAISING_PATTERN.test(text)) {
    return toRoutingResult(findRule('fundraising'));
  }

  let matchedIntents = [];

  try {
    const prompt = `Classify the following user query into one or more intents.
Available intents: ${ROUTING_RULES.map(r => r.intent).join(', ')}.
Output JSON in the exact format: { "intents": ["intent1", "intent2"] }. If none match, output [].
User Query: "${text}"`;

    const response = await postGeminiGenerateContent([{ role: 'user', parts: [{ text: prompt }] }], { responseMimeType: 'application/json' });
    const answer = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (answer) {
      const parsed = JSON.parse(answer);
      if (Array.isArray(parsed.intents)) {
        matchedIntents = parsed.intents;
      }
    }
  } catch (error) {
    console.warn('LLM intent classifier failed, falling back to regex:', error.message);
  }

  // Fallback to regex if LLM yielded nothing
  let matched = [];
  if (matchedIntents.length > 0) {
    matched = ROUTING_RULES.filter(rule => matchedIntents.includes(rule.intent));
  }

  if (matched.length === 0) {
    matched = ROUTING_RULES.filter((rule) => rule.pattern.test(text));
  }

  if (!matched.length) {
    return { ...DEFAULT_ROUTING };
  }

  // Single match — fast path (preserves existing behaviour for simple queries)
  if (matched.length === 1) {
    return toRoutingResult(matched[0]);
  }

  // Multi-intent: merge tool sets (deduplicated), pick highest budget, combine follow-ups
  const mergedTools = [...new Set(matched.flatMap((rule) => rule.tools))].slice(0, MAX_MERGED_TOOLS);
  const mergedBudget = highestBudget(matched.map((rule) => rule.budget));
  const intents = matched.map((rule) => rule.intent).join('+');
  const followUps = matched.map((rule) => rule.followUp).join(' ');

  return {
    intent: intents,
    tools: mergedTools,
    budget: mergedBudget,
    followUp: followUps
  };
};

const getToolAllowlist = async (userMessage) => {
  const routing = await inferToolRouting(userMessage);
  const budgetTier = BUDGET_TIERS[routing.budget] || BUDGET_TIERS.standard;

  return {
    allowedFunctionNames: routing.tools,
    budget: budgetTier,
    intent: routing.intent,
    routing
  };
};

const buildToolRoutingContext = async (userMessage, { preloadedTools = [] } = {}) => {
  const routing = await inferToolRouting(userMessage);
  const preloaded = new Set(preloadedTools);
  const toolsToCall = routing.tools.filter((tool) => !preloaded.has(tool));

  return {
    routing,
    content: {
      role: 'user',
      parts: [{
        text: [
          'DETERMINISTIC TOOL ROUTING HINT',
          `Detected intent: ${routing.intent}.`,
          `Recommended tools: ${routing.tools.join(', ') || 'none'}.`,
          `Tool budget: max ${(BUDGET_TIERS[routing.budget] || BUDGET_TIERS.standard).max} tool calls.`,
          preloaded.size ? `Already available tool results: ${Array.from(preloaded).join(', ')}.` : 'Already available tool results: none.',
          toolsToCall.length
            ? `Before final answer, call these tools if their required arguments can be inferred from the user query: ${toolsToCall.join(', ')}.`
            : 'Before final answer, use the already available tool result(s); do not re-call identical wallet tools.',
          routing.followUp,
          buildReportShapeContext(routing.intent),
          `ANSWER ALIGNMENT: The user's exact question is: "${userMessage}". Your response must directly and specifically answer this question. If tool data does not contain the specific answer, state clearly what data is available and its scope (e.g. "Among the major assets I track..." or "On SoDEX exchange...") rather than producing a generic market overview.`,
          'The final answer must be grounded in successful tool evidence. If a recommended tool cannot be called or fails, say that explicitly and narrow the conclusion.'
        ].join('\n')
      }]
    }
  };
};

module.exports = {
  BUDGET_TIERS,
  ROUTING_RULES,
  buildToolRoutingContext,
  getToolAllowlist,
  inferToolRouting
};
