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
    pattern: /\b(etf|spot etf|ibit|fbtc|gbtc).*\b(flow|inflow|outflow|aum|net assets)\b|\b(btc|eth|bitcoin|ethereum)\b.*\betf\b/i,
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
    pattern: /\b(market overview|what(?:'s| is) happening|hot news|crypto news today|full market|market update)\b/i,
    tools: ['get_market_intelligence', 'get_hot_news_digest', 'get_macro_crypto_calendar'],
    budget: 'market',
    followUp: 'Separate market price, sector, news, and macro evidence; avoid a single broad sentiment paragraph.'
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
    pattern: /\b(why|what(?:'s| is))\b.+\b(moving|dumping|pumping|surging|crashing|up|down|mooning)\b|\b(why|moving|dumping|pumping|outlook)\b/i,
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
    intent: 'sector',
    pattern: /\b(sectors?|narratives?|defi|ai|layer ?2|l2|meme|gaming)\b/i,
    tools: ['get_sector_spotlight', 'get_index_overview'],
    budget: 'standard',
    followUp: 'Rank sectors using returned changes/constituents and name the data source for each signal.'
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
  followUp: 'If the query is market-related but underspecified, ask for one clarifying asset only when a sensible default cannot be inferred.'
};

const inferToolRouting = (message = '') => {
  const text = String(message || '').trim();
  if (!text) {
    return {
      intent: 'unknown',
      tools: [],
      budget: 'simple',
      followUp: 'No routing hint available.'
    };
  }

  for (const rule of ROUTING_RULES) {
    if (rule.pattern.test(text)) {
      return {
        intent: rule.intent,
        tools: rule.tools,
        budget: rule.budget,
        followUp: rule.followUp
      };
    }
  }

  return { ...DEFAULT_ROUTING };
};

const getToolAllowlist = (userMessage) => {
  const routing = inferToolRouting(userMessage);
  const budgetTier = BUDGET_TIERS[routing.budget] || BUDGET_TIERS.standard;

  return {
    allowedFunctionNames: routing.tools,
    budget: budgetTier,
    intent: routing.intent,
    routing
  };
};

const buildToolRoutingContext = (userMessage, { preloadedTools = [] } = {}) => {
  const routing = inferToolRouting(userMessage);
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
