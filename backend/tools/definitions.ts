const allDeclarations = [
  {
    name: 'search_web',
    description: 'Search the public web (Google) for recent crypto news, regulation and policy, lawsuits, hacks, exchange incidents, or events the market data tools do not cover. Returns a short dated summary with source links. Prefer the SoSoValue/SoDEX tools for prices, flows and metrics.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'A focused web search query, e.g. "SEC crypto ETF decision this week".' }
      },
      required: ['query']
    }
  },
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
    description: 'Get daily price history (OHLCV candles) for a crypto asset, covering up to the last ~90 days. Use this for trend analysis, chart-based questions, or when the user asks about price movement over time (e.g. "How has BTC performed this month?", "Show me ETH price trend").',
    parameters: {
      type: 'OBJECT',
      properties: {
        asset: { type: 'STRING', description: 'Asset name or symbol.' },
        limit: { type: 'NUMBER', description: 'Number of daily candles to return, default 30, max 90.' }
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
    name: 'search_crypto_news',
    description: 'Search SoSoValue crypto news by keyword - a project, person, exchange, protocol or topic (e.g. "Saylor", "Binance", "stablecoin bill", "hack"). Use for news about a specific subject that is not a single listed coin. For one coin use get_asset_news_brief; for broad headlines use get_hot_news_digest.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: 'Search keyword or short phrase.' },
        limit: { type: 'NUMBER', description: 'Number of articles, default 5, max 10.' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'get_etf_flow_brief',
    description: 'Get a spot crypto ETF flow report - daily net flow trend, total net assets, cumulative inflow, and the largest funds (e.g. IBIT, FBTC, GBTC) with their latest flows and premium/discount. Use for ETF-related questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assetSymbol: { type: 'STRING', description: 'Underlying asset: BTC, ETH, SOL, XRP, LTC, HBAR, DOGE, LINK, AVAX or DOT. Most questions are BTC or ETH.' },
        countryCode: { type: 'STRING', description: 'US (default) or HK.' },
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
    description: 'Get the Bitcoin purchase history for a specific public company - dates, BTC acquired, cost, and holdings after each buy, newest first. Use for "When did MicroStrategy buy BTC?" type questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Stock ticker, e.g. MSTR, MARA, RIOT.' },
        limit: { type: 'NUMBER', description: 'Number of purchases, default 20, max 100.' }
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
    description: 'Get a crypto project fundraising history - rounds, amounts, dates, valuation, lead and other investors, and team. Pass the project (a token like "Solana" or a project name). Without a project it returns recent fundraising headlines. Use for VC/funding/investor questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        project: { type: 'STRING', description: 'Project or token name, e.g. "EigenLayer", "Solana", "Monad". Omit for recent fundraising headlines.' },
        limit: { type: 'NUMBER', description: 'Headlines to return when no project is given, default 8, max 10.' }
      }
    }
  },
  {
    name: 'get_token_economics',
    description: 'Get token economics / tokenomics for a crypto asset - circulating, total and max supply, FDV, token allocation by holder, unlocked vs locked amounts, upcoming token unlocks, and recent supply history. Use when the user asks about tokenomics, supply, inflation, unlocks, vesting, or token distribution.',
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
    description: 'Get the top trading pairs for a crypto asset across exchanges - exchange, pair, price, 24h volume, and order-book depth (USD needed to move the price up or down). Use when the user asks where an asset trades or about its liquidity.',
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
        ticker: { type: 'STRING', description: 'Optional index ticker: ssimag7, ssiDeFi, ssiAI, ssiMeme, ssiLayer1, ssiLayer2, ssiRWA, ssiDePIN, ssiGameFi, ssiSocialFi, ssiNFT, ssiCeFi, ssiPayFi. Returns 24h/7d/1m/3m/1y/YTD returns and constituent weights. If omitted, returns the index list.' }
      }
    }
  },
  {
    name: 'get_analysis_chart',
    description: 'Get a SoSoValue on-chain / derivatives / sentiment time series, newest first, with the change over the period. Charts: fgi_indicator (Crypto Fear & Greed), futures_open_interest, funding_rate, binance_btcusdt_futures_long_short_ratio_1d, bitcoin_futures_volume_open_interest, stablecoin_total_market_cap, total_crypto_market_cap, altcoin_market_cap_volume, total_crypto_spot_btc_eth_etf_fund_flow_1d, usd_inflows_into_cryptocurrency_markets, btc_hashrate, btc_mining_difficulty, btc_miner_revenue, btc_active_addresses, btc_new_addresses, btc_transactions, ahr_999_indicator, eth_staking_ratio, eth_staking_amount, tvl_of_different_type_of_chain. Use for fear & greed, open interest, funding, long/short, stablecoin supply, hashrate, on-chain activity or staking questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chart: { type: 'STRING', description: 'Chart name from the list, e.g. fgi_indicator, funding_rate, futures_open_interest.' },
        limit: { type: 'NUMBER', description: 'Number of most recent data points, default 14, max 90.' }
      },
      required: ['chart']
    }
  },
  {
    name: 'get_macro_event_history',
    description: 'Get the release history of a US macroeconomic indicator - actual vs forecast vs previous, newest first, with the surprise vs forecast. Use when the user asks about historical macro data or trends for a specific economic indicator.',
    parameters: {
      type: 'OBJECT',
      properties: {
        event: { type: 'STRING', description: 'Indicator name as SoSoValue lists it: "CPI (YoY)", "CPI (MoM)", "Core CPI (YoY)", "PPI (MoM)", "Core PCE Price Index (YoY)", "Nonfarm Payrolls", "Initial Jobless Claims", "GDP (QoQ)", "Retail Sales (MoM)", "S&P Global US Manufacturing PMI", "S&P Global Services PMI". Short forms like cpi, pce, nfp, gdp also work.' },
        limit: { type: 'NUMBER', description: 'Number of releases, default 10, max 24.' }
      },
      required: ['event']
    }
  },
  {
    name: 'get_fed_rate_outlook',
    description: 'Get market-implied FOMC target-rate probabilities for the next Fed meetings (the most likely rate range and its probability per meeting) plus the latest US money-market rates (SOFR, TGCR, BGCR, ON RRP). Use for Fed rate cut/hike odds, FOMC expectations, or interest-rate questions.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_crypto_market_overview',
    description: 'Get the headline crypto market numbers right now: total crypto market cap and its 24h change, total 24h volume, ETH gas (gwei) and BTC fees (sat/vB). Use for "how big is the crypto market", total market cap, or gas/fee questions.',
    parameters: {
      type: 'OBJECT',
      properties: {}
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
  },
  {
    name: 'get_sodex_analytics',
    description: 'Get live SoDEX trading analytics — most traded pairs by volume, top gainers, top losers, tightest spreads, and total exchange volume across spot and perps markets. Use when the user asks about SoDEX trading activity, most traded tokens, volume leaders, or exchange-wide statistics.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  }
];

// Full tools array (legacy format for backward compat)
const tools = [{ functionDeclarations: allDeclarations }];

// Filter tool declarations to only include the specified tools.
// This is used by gemini.js for hard allowlisting per intent.
const filterToolDeclarations = (allowedNames) => {
  if (!allowedNames || !allowedNames.length) {
    return [{ functionDeclarations: [] }];
  }
  const allowed = new Set(allowedNames);
  const filtered = allDeclarations.filter((d) => allowed.has(d.name));
  return [{ functionDeclarations: filtered }];
};

export { allDeclarations, filterToolDeclarations, tools };
