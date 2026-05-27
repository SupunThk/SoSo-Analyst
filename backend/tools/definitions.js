const allDeclarations = [
  {
    name: 'get_market_intelligence',
    description: 'Get the complete deterministic market intelligence layer: market regime, SoSo SSI/index rotation, sector heatmap, opportunity scanner, SoDEX liquidity context, and active alert triggers. Use for market overview, regime, rotation, opportunities, scanner, or alert questions.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_token_intelligence',
    description: 'Get a deterministic "why is this moving" intelligence report for one crypto token, including live snapshot, BTC/ETH/sector relative performance, 30-session trend, SoDEX liquidity context, and recent token headlines. This is a SELF-CONTAINED tool — do NOT also call get_asset_snapshot or get_asset_news_brief when this tool is used.',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol, e.g. BTC, ETH, SOL, XRP, BNB.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'get_asset_snapshot',
    description: 'Get the current live market snapshot for a SINGLE crypto asset - price, 24h change, market cap, volume. Use this when the user asks about one specific coin (e.g. "What is the BTC price?", "How is Solana doing?"). Do NOT use compare_assets for single-asset questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol, e.g. bitcoin, btc, ethereum, eth, solana, sol.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'get_asset_price_history',
    description: 'Get historical price data (candlestick/kline data) for a crypto asset over a period. Use this for trend analysis, chart-based questions, or when the user asks about price movement over time (e.g. "How has BTC performed this month?", "Show me ETH price trend").',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol.' },
        interval: { type: 'STRING', description: 'Candle interval: 1h, 4h, 1d, 1w. Default 1d.' },
        limit: { type: 'NUMBER', description: 'Number of candles to return, default 30, max 90.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'compare_assets',
    description: 'Compare TWO crypto assets side-by-side using live market data. ONLY use when the user explicitly compares two assets (e.g. "BTC vs ETH", "Compare Solana and Avalanche"). For single-asset queries, use get_asset_snapshot instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assetA: { type: 'STRING', description: 'First asset name or symbol.' },
        assetB: { type: 'STRING', description: 'Second asset name or symbol.' }
      },
      required: ['assetA', 'assetB']
    }
  },
  {
    name: 'get_asset_news_brief',
    description: 'Get recent news headlines for a SPECIFIC crypto asset. Use when the user asks about news for a particular coin (e.g. "Bitcoin news", "What is happening with ETH?").',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol.' },
        limit: { type: 'NUMBER', description: 'Number of news items, default 5, max 10.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'get_hot_news_digest',
    description: 'Get the hottest GENERAL crypto news headlines right now. Use for broad market news, not asset-specific news. For asset-specific news use get_asset_news_brief instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Number of headlines, default 5, max 10.' }
      }
    }
  },
  {
    name: 'get_etf_flow_brief',
    description: 'Get a US spot ETF flow report for BTC or ETH - includes daily net flow trend and top-performing ETF funds (e.g. IBIT, FBTC, GBTC). Use for ETF-related questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assetSymbol: { type: 'STRING', description: 'BTC or ETH only.' },
        countryCode: { type: 'STRING', description: 'Country code, default US.' },
        days: { type: 'NUMBER', description: 'Number of recent flow data points, default 5, max 30.' }
      },
      required: ['assetSymbol']
    }
  },
  {
    name: 'get_macro_crypto_calendar',
    description: 'Get upcoming macroeconomic events that could impact crypto markets - FOMC meetings, CPI data, jobs reports, etc. Use for macro/economic calendar questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        daysAhead: { type: 'NUMBER', description: 'How many days ahead to look, default 7, max 21.' }
      }
    }
  },
  {
    name: 'get_crypto_equities_watchlist',
    description: 'Get live market data for crypto-related public stocks - MSTR, COIN, MARA, RIOT, CLSK, etc. Use for crypto stock questions, NOT for crypto coins.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tickers: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Stock ticker symbols. Defaults to [MSTR, COIN, MARA, RIOT, CLSK].'
        }
      }
    }
  },
  {
    name: 'get_btc_treasury_brief',
    description: 'List public companies that hold Bitcoin on their balance sheet - treasury holdings overview. Use for "which companies hold BTC?" type questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Number of companies, default 10, max 20.' }
      }
    }
  },
  {
    name: 'get_btc_purchase_history_brief',
    description: 'Get the Bitcoin purchase history for a specific public company - shows dates, amounts, and prices of BTC acquisitions. Use for "When did MicroStrategy buy BTC?" type questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Stock ticker, e.g. MSTR, MARA, RIOT.' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'get_sector_spotlight',
    description: 'Get a spotlight on trending crypto sectors and categories - DeFi, AI, Layer 2, Meme coins, etc. Shows which sectors are hot and which are not. Use for sector/category analysis questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Number of sectors to return, default 10.' }
      }
    }
  },
  {
    name: 'get_fundraising_overview',
    description: 'Get recent crypto project fundraising and VC investment rounds - shows which projects raised money, how much, and from whom. Use for VC/funding/investment questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Number of projects to return, default 10, max 20.' }
      }
    }
  },
  {
    name: 'get_token_economics',
    description: 'Get token economics / tokenomics for a crypto asset - circulating supply, total supply, max supply, and historical supply data. Use when the user asks about tokenomics, supply, inflation, or token distribution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol, e.g. bitcoin, ethereum, solana.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'get_trading_pairs',
    description: 'Get trading pairs and exchange listings for a crypto asset - shows which exchanges list the asset and with what quote currencies. Use when the user asks about where to buy/trade an asset or its liquidity.',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol.' },
        limit: { type: 'NUMBER', description: 'Number of pairs to return, default 10, max 20.' }
      },
      required: ['asset']
    }
  },
  {
    name: 'get_index_overview',
    description: 'Get SoSoValue crypto index data - shows curated market indices (like SoSo DeFi Index, AI Index, Layer-1 Index) with their constituents and performance. Use for index/sector benchmarking questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Optional specific index ticker. If omitted, returns the full index list.' }
      }
    }
  },
  // PARKED: get_analysis_charts — no routing rule, no eval coverage, no UI use case.
  // Executor code preserved in custom.js. Uncomment after collecting observability data.
  {
    name: 'get_macro_event_history',
    description: 'Get historical data for a specific macroeconomic indicator - CPI readings over time, Fed Funds Rate changes, unemployment data, etc. Use when the user asks about historical macro data or trends for specific economic indicators.',
    parameters: {
      type: 'OBJECT',
      properties: {
        event: { type: 'STRING', description: 'The macro event identifier, e.g. cpi, fed-funds-rate, unemployment, pmi, gdp.' },
        limit: { type: 'NUMBER', description: 'Number of historical data points, default 10, max 24.' }
      },
      required: ['event']
    }
  },
  {
    name: 'get_wallet_holdings',
    description: 'Get the on-chain token holdings and balances for a specific EVM wallet address. Use when the user asks to "analyze my portfolio", "check my bags", or asks about their own holdings. If the user refers to "my wallet" or "my portfolio" and a wallet is connected, the backend can automatically inject the verified connected EVM address even if address is omitted.',
    parameters: {
      type: 'OBJECT',
      properties: {
        address: { type: 'STRING', description: 'Optional EVM wallet address (0x...). Omit only when the backend has a verified connected wallet context.' }
      }
    }
  },
  {
    name: 'get_sodex_markets',
    description: 'Get active spot and perpetual markets and their current tickers on the SoDEX decentralized exchange. Use when the user asks about SoDEX markets or prices on SoDEX.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_sodex_orderbook',
    description: 'Get the current bid/ask spread and order book depth for a specific market on SoDEX. Use when the user asks about order books, liquidity, or spread on Sodex.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'The trading pair symbol, e.g. vBTC_vUSDC for spot or BTC-USD for perps.' },
        market: { type: 'STRING', description: 'Optional market type: spot or perps. If omitted, symbols with "-" are treated as perps and others as spot.' },
        limit: { type: 'NUMBER', description: 'Number of order book levels to fetch, default 50.' }
      },
      required: ['symbol']
    }
  }
];

// Full tools array (legacy format for backward compat)
const tools = [{ functionDeclarations: allDeclarations }];

// Filter tool declarations to only include the specified tools.
// This is used by gemini.js for hard allowlisting per intent.
const filterToolDeclarations = (allowedNames) => {
  if (!allowedNames || !allowedNames.length) return tools;
  const allowed = new Set(allowedNames);
  const filtered = allDeclarations.filter((d) => allowed.has(d.name));
  if (!filtered.length) return tools;
  return [{ functionDeclarations: filtered }];
};

module.exports = { allDeclarations, filterToolDeclarations, tools };
