const express = require('express');
const axios = require('axios');
const router = express.Router();

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_GEMINI_ITERATIONS = 6;
const CURRENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const SOSO_OPENAPI_BASE = 'https://openapi.sosovalue.com/openapi/v1';
const SOSO_API_BASE = 'https://openapi.sosovalue.com/api/v1';

let currencyCatalogCache = {
  expiresAt: 0,
  records: []
};

const TOOL_ENDPOINTS = {
  get_btc_treasuries: {
    buildUrl: () => '/btc-treasuries'
  },
  get_btc_purchase_history: {
    buildUrl: (args) => `/btc-treasuries/${args.ticker}/purchase-history`
  },
  get_etf_list: {
    buildUrl: () => '/etfs'
  },
  get_etf_summary_history: {
    buildUrl: () => '/etfs/summary-history',
    defaultParams: { days: 30 }
  },
  get_etf_snapshot: {
    buildUrl: (args) => `/etfs/${args.ticker}/market-snapshot`
  },
  get_macro_events: {
    buildUrl: () => '/macro/events'
  },
  get_hot_news: {
    buildUrl: () => '/news/hot'
  },
  get_featured_news: {
    buildUrl: () => '/news/featured'
  },
  search_news: {
    buildUrl: () => '/news/search'
  },
  get_currency_market_snapshot: {
    buildUrl: (args) => `/currencies/${args.currencyId}/market-snapshot`
  },
  get_currency_klines: {
    buildUrl: (args) => `/currencies/${args.currencyId}/klines`,
    defaultParams: { interval: '1d', limit: 30 }
  },
  get_crypto_stocks: {
    buildUrl: () => '/crypto-stocks'
  },
  get_crypto_stock_snapshot: {
    buildUrl: (args) => `/crypto-stocks/${args.ticker}/market-snapshot`
  },
  get_sector_spotlight: {
    buildUrl: () => '/currencies/sector-spotlight'
  },
  get_fundraising_projects: {
    buildUrl: () => '/fundraising/projects'
  }
};

const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_asset_snapshot',
        description: 'Get the current live market snapshot for a SINGLE crypto asset — price, 24h change, market cap, volume. Use this when the user asks about one specific coin (e.g. "What is the BTC price?", "How is Solana doing?"). Do NOT use compare_assets for single-asset questions.',
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
        description: 'Get a US spot ETF flow report for BTC or ETH — includes daily net flow trend and top-performing ETF funds (e.g. IBIT, FBTC, GBTC). Use for ETF-related questions.',
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
        description: 'Get upcoming macroeconomic events that could impact crypto markets — FOMC meetings, CPI data, jobs reports, etc. Use for macro/economic calendar questions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            daysAhead: { type: 'NUMBER', description: 'How many days ahead to look, default 7, max 21.' }
          }
        }
      },
      {
        name: 'get_crypto_equities_watchlist',
        description: 'Get live market data for crypto-related public stocks — MSTR, COIN, MARA, RIOT, CLSK, etc. Use for crypto stock questions, NOT for crypto coins.',
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
        description: 'List public companies that hold Bitcoin on their balance sheet — treasury holdings overview. Use for "which companies hold BTC?" type questions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: { type: 'NUMBER', description: 'Number of companies, default 10, max 20.' }
          }
        }
      },
      {
        name: 'get_btc_purchase_history_brief',
        description: 'Get the Bitcoin purchase history for a specific public company — shows dates, amounts, and prices of BTC acquisitions. Use for "When did MicroStrategy buy BTC?" type questions.',
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
        description: 'Get a spotlight on trending crypto sectors and categories — DeFi, AI, Layer 2, Meme coins, etc. Shows which sectors are hot and which are not. Use for sector/category analysis questions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: { type: 'NUMBER', description: 'Number of sectors to return, default 10.' }
          }
        }
      },
      {
        name: 'get_fundraising_overview',
        description: 'Get recent crypto project fundraising and VC investment rounds — shows which projects raised money, how much, and from whom. Use for VC/funding/investment questions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: { type: 'NUMBER', description: 'Number of projects to return, default 10, max 20.' }
          }
        }
      }
    ]
  }
];


const truncate = (value, maxLength = 4000) =>
  value.length > maxLength ? `${value.substring(0, maxLength)}... (truncated)` : value;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);
const normalizeLookupValue = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const DEFAULT_WATCHLIST_TICKERS = ['MSTR', 'COIN', 'MARA', 'RIOT', 'CLSK'];

const sanitizeForGemini = (value, depth = 0) => {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= 1) {
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }

    return '[object]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => sanitizeForGemini(item, depth + 1));
  }

  const entries = Object.entries(value).slice(0, 8);
  return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeForGemini(item, depth + 1)]));
};

const pickScalarFields = (value, limit = 8) => {
  if (!isPlainObject(value)) {
    return {};
  }

  const pickedEntries = Object.entries(value)
    .filter(([, item]) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
    .slice(0, limit);

  return Object.fromEntries(pickedEntries);
};

const buildArrayItemLabel = (item) => {
  if (!isPlainObject(item)) {
    return String(item);
  }

  return item.title || item.name || item.ticker || item.symbol || item.question || item.currency || item.slug || 'item';
};

const summarizeToolData = (toolName, args, data) => {
  const arrayData = asArray(data);

  switch (toolName) {
    case 'compare_assets': {
      return `Compared ${data?.assetA?.name || 'asset A'} and ${data?.assetB?.name || 'asset B'} using live market snapshots.`;
    }
    case 'get_asset_snapshot': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const symbol = data?.asset?.symbol || '';
      return `Returned live market snapshot for ${name} (${symbol}).`;
    }
    case 'get_asset_price_history': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const count = data?.count || 0;
      return `Returned ${count} ${data?.interval || '1d'} candles for ${name}.`;
    }
    case 'get_sector_spotlight': {
      const count = data?.count || asArray(data?.sectors).length;
      const topSectors = asArray(data?.sectors).slice(0, 3).map((s) => s.name).join(', ');
      return `Returned ${count} sector spotlights. Top sectors: ${topSectors}`;
    }
    case 'get_fundraising_overview': {
      const count = data?.count || asArray(data?.projects).length;
      const topProjects = asArray(data?.projects).slice(0, 3).map((p) => p.name).join(', ');
      return `Returned ${count} fundraising projects. Recent: ${topProjects}`;
    }
    case 'get_asset_news_brief': {
      const items = asArray(data?.items);
      if (!items.length) {
        return `No featured news items returned for ${data?.asset?.name || args?.asset || 'the requested asset'}.`;
      }

      return `Returned ${items.length} featured news items for ${data?.asset?.name || args?.asset}. Top titles: ${items.slice(0, 3).map((item) => item.title).join(' | ')}`;
    }
    case 'get_hot_news_digest': {
      const items = asArray(data?.items);
      if (!items.length) {
        return 'No hot news items returned.';
      }

      return `Returned ${items.length} hot news items. Top titles: ${items.slice(0, 3).map((item) => item.title).join(' | ')}`;
    }
    case 'get_etf_flow_brief': {
      const snapshots = asArray(data?.topEtfs);
      return `Built a ${data?.assetSymbol || ''} ETF flow brief with ${asArray(data?.history).length} history points and ${snapshots.length} top ETF snapshots.`;
    }
    case 'get_macro_crypto_calendar': {
      const items = asArray(data?.events);
      return `Returned ${items.length} macro calendar days relevant to crypto.`;
    }
    case 'get_crypto_equities_watchlist': {
      const items = asArray(data?.stocks);
      return `Returned a crypto equities watchlist with ${items.length} stock snapshots.`;
    }
    case 'get_btc_treasury_brief': {
      const items = asArray(data?.companies);
      return `Returned a BTC treasury brief with ${items.length} companies.`;
    }
    case 'get_btc_purchase_history_brief': {
      const items = asArray(data?.purchases);
      return `Returned ${items.length} BTC purchase history records for ${data?.companyTicker || args?.ticker}.`;
    }
    case 'find_currency': {
      if (!arrayData.length) {
        return 'No matching currency records were found.';
      }

      const labels = arrayData
        .slice(0, 5)
        .map((item) => `${item.name} (${item.symbol}) => ${item.currency_id}`)
        .join(' | ');
      return `Resolved ${arrayData.length} matching currency records. Top matches: ${labels}`;
    }
    case 'get_hot_news':
    case 'get_featured_news':
    case 'search_news': {
      if (!arrayData.length) {
        return 'No news items returned.';
      }

      const headlines = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} news items. Top headlines: ${headlines}`;
    }
    case 'get_btc_treasuries':
    case 'get_crypto_stocks':
    case 'get_fundraising_projects':
    case 'get_etf_list': {
      if (!arrayData.length) {
        return 'No records returned.';
      }

      const labels = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} records. Top entries: ${labels}`;
    }
    case 'get_currency_klines':
    case 'get_etf_summary_history':
    case 'get_btc_purchase_history': {
      if (!arrayData.length) {
        return 'No historical records returned.';
      }

      return `Returned ${arrayData.length} historical records. Latest preview: ${JSON.stringify(sanitizeForGemini(arrayData[arrayData.length - 1], 1))}`;
    }
    case 'get_macro_events': {
      if (!arrayData.length) {
        return 'No macro events returned for the requested range.';
      }

      const labels = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} macro events. Closest items: ${labels}`;
    }
    default: {
      if (isPlainObject(data)) {
        const fields = pickScalarFields(data);
        const preview = Object.keys(fields).length ? JSON.stringify(fields) : JSON.stringify(sanitizeForGemini(data, 1));
        return `Returned snapshot data for ${toolName}${Object.keys(args || {}).length ? ` with args ${JSON.stringify(args)}` : ''}. Preview: ${preview}`;
      }

      if (arrayData.length) {
        return `Returned ${arrayData.length} items for ${toolName}.`;
      }

      return `Returned data for ${toolName}.`;
    }
  }
};

const getCurrencyCatalog = async () => {
  if (currencyCatalogCache.expiresAt > Date.now() && currencyCatalogCache.records.length > 0) {
    return currencyCatalogCache.records;
  }

  const response = await sosoGet('/currencies');
  const records = asArray(response.data);
  currencyCatalogCache = {
    records,
    expiresAt: Date.now() + CURRENCY_CACHE_TTL_MS
  };
  return records;
};

const sosoGet = async (path, params = {}, baseUrl = SOSO_OPENAPI_BASE) => {
  const response = await axios.get(`${baseUrl}${path}`, {
    headers: {
      'x-soso-api-key': process.env.SOSO_API_KEY
    },
    params,
    timeout: 15000
  });

  return response.data;
};

const resolveCurrencyMatches = async (query) => {
  const normalizedQuery = normalizeLookupValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const catalog = await getCurrencyCatalog();
  const scored = catalog.map((record) => {
    const normalizedName = normalizeLookupValue(record.name);
    const normalizedSymbol = normalizeLookupValue(record.symbol);
    let score = 0;

    if (normalizedSymbol === normalizedQuery) score += 100;
    if (normalizedName === normalizedQuery) score += 95;
    if (normalizedName.startsWith(normalizedQuery)) score += 60;
    if (normalizedSymbol.startsWith(normalizedQuery)) score += 55;
    if (normalizedName.includes(normalizedQuery)) score += 35;
    if (normalizedSymbol.includes(normalizedQuery)) score += 30;

    return { record, score };
  }).filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));
  return scored.slice(0, 5).map((item) => item.record);
};

const resolveCurrencyId = async (query) => {
  const matches = await resolveCurrencyMatches(query);

  if (!matches.length) {
    throw new Error(`No SoSoValue currency match found for "${query}".`);
  }

  return matches[0];
};

const normalizeEtfAssetSymbol = (value) => {
  const normalized = normalizeLookupValue(value).toUpperCase();
  if (normalized === 'BITCOIN' || normalized === 'BTC') return 'BTC';
  if (normalized === 'ETHEREUM' || normalized === 'ETH') return 'ETH';
  return normalized || 'BTC';
};

const formatEtfCountryCode = (value) => (String(value || 'US').trim().toUpperCase() || 'US');
const formatGeminiErrorMessage = (error) => {
  const status = error.response?.status;
  const apiMessage = error.response?.data?.error?.message || error.message;

  if (status === 429) {
    return `Gemini rate limit reached. ${apiMessage}`;
  }

  return apiMessage;
};

const mapNewsItems = (items, limit = 5) =>
  asArray(items).slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title || item.multilanguageContent?.find((entry) => entry.language === 'en')?.title || null,
    content: item.content || item.multilanguageContent?.find((entry) => entry.language === 'en')?.content || null,
    sourceLink: item.source_link || item.sourceLink,
    releaseTime: item.release_time || item.releaseTime,
    category: item.category,
    author: item.author,
    tags: asArray(item.tags).slice(0, 5)
  }));

const mapCryptoStockSnapshot = (ticker, snapshot) => ({
  ticker,
  price: snapshot?.price,
  change_pct_24h: snapshot?.change_pct_24h,
  marketcap: snapshot?.marketcap,
  turnover_24h: snapshot?.turnover_24h,
  marketcap_rank: snapshot?.marketcap_rank
});

const customToolExecutors = {
  async compare_assets(args = {}) {
    const [assetARecord, assetBRecord] = await Promise.all([
      resolveCurrencyId(args.assetA),
      resolveCurrencyId(args.assetB)
    ]);

    const [assetAResponse, assetBResponse] = await Promise.all([
      sosoGet(`/currencies/${assetARecord.currency_id}/market-snapshot`),
      sosoGet(`/currencies/${assetBRecord.currency_id}/market-snapshot`)
    ]);

    return {
      assetA: {
        id: assetARecord.currency_id,
        name: assetARecord.name,
        symbol: assetARecord.symbol,
        snapshot: sanitizeForGemini(assetAResponse.data)
      },
      assetB: {
        id: assetBRecord.currency_id,
        name: assetBRecord.name,
        symbol: assetBRecord.symbol,
        snapshot: sanitizeForGemini(assetBResponse.data)
      }
    };
  },
  async get_asset_news_brief(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news/featured/currency', {
      currencyId: assetRecord.currency_id,
      pageNum: 1,
      pageSize: limit
    }, SOSO_API_BASE);

    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      total: response.data?.total,
      items: mapNewsItems(response.data?.list, limit)
    };
  },
  async get_hot_news_digest(args = {}) {
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news/hot');
    return {
      total: response.data?.total,
      items: mapNewsItems(response.data?.list, limit)
    };
  },
  async get_etf_flow_brief(args = {}) {
    const assetSymbol = normalizeEtfAssetSymbol(args.assetSymbol);
    const countryCode = formatEtfCountryCode(args.countryCode);
    const days = Math.min(Math.max(Number(args.days) || 5, 1), 30);

    const [listResponse, historyResponse] = await Promise.all([
      sosoGet('/etfs', { symbol: assetSymbol, country_code: countryCode }),
      sosoGet('/etfs/summary-history', { symbol: assetSymbol, country_code: countryCode, days })
    ]);

    const etfs = asArray(listResponse.data);
    const topTickers = etfs.slice(0, 3).map((item) => item.ticker);
    const snapshotResponses = await Promise.all(topTickers.map((ticker) =>
      sosoGet(`/etfs/${ticker}/market-snapshot`, { symbol: assetSymbol })
    ));

    return {
      assetSymbol,
      countryCode,
      etfCount: etfs.length,
      tickers: etfs.slice(0, 10).map((item) => item.ticker),
      history: asArray(historyResponse.data).slice(0, days).map((item) => sanitizeForGemini(item)),
      topEtfs: snapshotResponses.map((item) => sanitizeForGemini(item.data))
    };
  },
  async get_macro_crypto_calendar(args = {}) {
    const daysAhead = Math.min(Math.max(Number(args.daysAhead) || 7, 1), 21);
    const response = await sosoGet('/macro/events');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);

    const events = asArray(response.data).filter((item) => {
      const date = new Date(item.date);
      return date >= today && date <= end;
    });

    return {
      from: today.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      events: sanitizeForGemini(events)
    };
  },
  async get_crypto_equities_watchlist(args = {}) {
    const requestedTickers = asArray(args.tickers).map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    const tickers = (requestedTickers.length ? requestedTickers : DEFAULT_WATCHLIST_TICKERS).slice(0, 8);
    const [listResponse, ...snapshotResponses] = await Promise.all([
      sosoGet('/crypto-stocks'),
      ...tickers.map((ticker) => sosoGet(`/crypto-stocks/${ticker}/market-snapshot`))
    ]);

    const catalog = asArray(listResponse.data);
    const stocks = tickers.map((ticker, index) => {
      const meta = catalog.find((item) => item.ticker === ticker) || {};
      return {
        ticker,
        name: meta.name,
        exchange: meta.exchange,
        sector: meta.sector,
        snapshot: sanitizeForGemini(snapshotResponses[index]?.data)
      };
    });

    return { stocks };
  },
  async get_btc_treasury_brief(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet('/btc-treasuries');
    return {
      companies: asArray(response.data).slice(0, limit).map((item) => ({
        ticker: item.ticker,
        name: item.name,
        list_location: item.list_location
      }))
    };
  },
  async get_btc_purchase_history_brief(args = {}) {
    const ticker = String(args.ticker || '').trim().toUpperCase();
    const response = await sosoGet(`/btc-treasuries/${ticker}/purchase-history`);
    return {
      companyTicker: ticker,
      purchases: asArray(response.data).slice(0, 20).map((item) => sanitizeForGemini(item))
    };
  },
  async get_asset_snapshot(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/market-snapshot`);
    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      snapshot: sanitizeForGemini(response.data, 0)
    };
  },
  async get_asset_price_history(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const interval = ['1h', '4h', '1d', '1w'].includes(args.interval) ? args.interval : '1d';
    const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 90);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/klines`, { interval, limit });
    const klines = asArray(response.data);
    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      interval,
      count: klines.length,
      klines: klines.slice(-limit).map((k) => ({
        date: k.date || k.time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume
      }))
    };
  },
  async get_sector_spotlight(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
    const response = await sosoGet('/currencies/sector-spotlight');
    const sectors = asArray(response.data).slice(0, limit);
    return {
      count: sectors.length,
      sectors: sectors.map((s) => ({
        name: s.name || s.sector,
        change_pct_24h: s.change_pct_24h || s.changePct24h,
        market_cap: s.market_cap || s.marketCap,
        volume_24h: s.volume_24h || s.volume24h,
        top_currencies: asArray(s.top_currencies || s.topCurrencies).slice(0, 3).map((c) => c.name || c.symbol || c)
      }))
    };
  },
  async get_fundraising_overview(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet('/fundraising/projects');
    const projects = asArray(response.data).slice(0, limit);
    return {
      count: projects.length,
      projects: projects.map((p) => ({
        name: p.name || p.project_name,
        amount: p.amount || p.raise_amount,
        round: p.round || p.funding_round,
        date: p.date || p.announce_date,
        investors: asArray(p.investors || p.lead_investors).slice(0, 3).map((i) => i.name || i)
      }))
    };
  }
};

const normalizeToolResult = (toolName, args, apiPayload, requestMeta) => {
  const code = apiPayload?.code;
  const message = apiPayload?.message;
  const data = Object.prototype.hasOwnProperty.call(apiPayload || {}, 'data') ? apiPayload.data : apiPayload;

  return {
    source: 'SoSoValue',
    tool: toolName,
    args: args || {},
    apiCode: code,
    summary: summarizeToolData(toolName, args, data),
    dataPreview: sanitizeForGemini(data),
    totalItems: Array.isArray(data) ? data.length : undefined
  };
};

const SYSTEM_PROMPT = `You are SoSo Analyst, an elite crypto market research terminal with access to live SoSoValue data feeds.

RESPONSE FORMAT:
- Use markdown formatting: **bold** for key metrics, tables for comparisons
- Use bullet points for multi-item data
- Start responses with a one-line **TLDR** in bold when answering analytical questions
- Include specific numbers and percentages when available from tool data
- End with a brief **OUTLOOK** section when analyzing market data or trends
- Keep responses concise and data-driven — no filler

RULES:
- ONLY report data returned by your tools. Never hallucinate numbers or make up data
- If a tool call fails, acknowledge it and work with the data you have
- Use the summary and dataPreview fields from tool responses as your factual basis
- When comparing assets, use a markdown table for side-by-side comparison
- For news, summarize the key headlines and their market implications
- For ETF data, highlight net flows and leading/lagging funds

Today's date: {DATE}.`;

const postGeminiGenerateContent = async (contents) => {
  const requestBody = {
    contents,
    tools,
    systemInstruction: {
      parts: [
          {
            text: SYSTEM_PROMPT.replace('{DATE}', new Date().toISOString().split('T')[0])
          }
        ]
      }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          timeout: 60000
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

const executeTool = async (name, args) => {
  if (customToolExecutors[name]) {
    try {
      const payloadData = await customToolExecutors[name](args);
      const payload = normalizeToolResult(name, args, { data: payloadData }, { endpoint: `custom:${name}`, params: args || {} });
      return {
        payload,
        preview: payload.summary,
        status: 'success'
      };
    } catch (error) {
      return {
        payload: {
          error: true,
          source: 'SoSoValue',
          tool: name,
          args: args || {},
          message: error.response?.data?.message || error.message
        },
        preview: `Tool error: ${error.response?.data?.message || error.message}`,
        status: 'error'
      };
    }
  }

  const config = TOOL_ENDPOINTS[name];
  const resolvedArgs = args ? { ...args } : {};
  const params = {
    ...(config?.defaultParams || {}),
    ...resolvedArgs
  };

  if (name === 'find_currency') {
    try {
      const matches = await resolveCurrencyMatches(resolvedArgs.query);
      const payload = normalizeToolResult(name, args, { data: matches }, { endpoint: '/currencies', params: { query: resolvedArgs.query } });
      return {
        payload,
        preview: payload.summary,
        status: matches.length ? 'success' : 'error'
      };
    } catch (error) {
      return {
        payload: {
          error: true,
          source: 'SoSoValue',
          tool: name,
          args: args || {},
          message: error.message
        },
        preview: `Tool error: ${error.message}`,
        status: 'error'
      };
    }
  }

  if (!config) {
    return {
      payload: { error: true, message: 'Tool not found', tool: name },
      preview: 'Tool not found',
      status: 'error'
    };
  }

  try {
    const requestParams = { ...params };

    if (name === 'get_etf_list') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || resolvedArgs.etfType);
      requestParams.country_code = formatEtfCountryCode(resolvedArgs.countryCode);
    }

    if (name === 'get_etf_summary_history') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || resolvedArgs.etfType);
      requestParams.country_code = formatEtfCountryCode(resolvedArgs.countryCode);
      delete requestParams.etfType;
    }

    if (name === 'get_etf_snapshot') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || (String(resolvedArgs.ticker || '').startsWith('ETH') ? 'ETH' : 'BTC'));
    }

    if (name === 'get_currency_market_snapshot' || name === 'get_currency_klines') {
      const currencyRecord = await resolveCurrencyId(resolvedArgs.currencyId);
      resolvedArgs.currencyId = currencyRecord.currency_id;
      requestParams.resolvedSymbol = currencyRecord.symbol;
      requestParams.resolvedName = currencyRecord.name;
    }

    const endpoint = config.buildUrl(resolvedArgs);
    const res = await sosoGet(endpoint, requestParams);
    const payload = normalizeToolResult(name, resolvedArgs, res, { endpoint, params: requestParams });

    return {
      payload,
      preview: payload.summary,
      status: 'success'
    };
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    return {
      payload: {
        error: true,
        source: 'SoSoValue',
        tool: name,
        args: args || {},
        message
      },
      preview: `Tool error: ${message}`,
      status: 'error'
    };
  }
};

router.post('/chat', async (req, res) => {
  const { messages, conversationHistory } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content;

  if (!userMessage || !Array.isArray(messages)) {
    return res.status(400).json({ error: true, message: 'Invalid chat request payload.' });
  }

  try {
    const contents = [
      ...(conversationHistory || []),
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ];

    let response = await postGeminiGenerateContent(contents);
    let toolCallsMade = [];

    let iterations = 0;
    while (response.candidates?.[0]?.content?.parts?.some((p) => p.functionCall) && iterations < MAX_GEMINI_ITERATIONS) {
      iterations++;
      const modelContent = response.candidates[0].content;
      const calls = modelContent.parts.filter((p) => p.functionCall);

      contents.push(modelContent);

      // Execute all tool calls in parallel for better performance
      const results = await Promise.all(
        calls.map((call) => {
          const { name, args } = call.functionCall;
          return executeTool(name, args).then((resultData) => ({
            call,
            resultData
          }));
        })
      );

      for (const { call, resultData } of results) {
        const { name, args } = call.functionCall;
        const callId = call.functionCall.id || `call_${name}_${iterations}_${Date.now()}`;
        toolCallsMade.push({
          name,
          input: args || {},
          result: truncate(resultData.preview, 200),
          status: resultData.status
        });
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              id: callId,
              name,
              response: resultData.payload
            }
          }]
        });
      }

      response = await postGeminiGenerateContent(contents);
    }

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    let answer = candidate?.content?.parts
      ?.filter((part) => typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim() || '';

    if (!answer) {
      if (finishReason === 'SAFETY') {
        answer = 'Response blocked by safety filters. Please rephrase your query.';
      } else if (finishReason === 'MAX_TOKENS') {
        answer = 'Response was truncated due to length limits. Please ask a more specific question.';
      } else {
        answer = 'No response generated. Please try again.';
      }
    }

    res.json({
      answer,
      toolCalls: toolCallsMade
    });
  } catch (error) {
    const status = error.response?.status || 'unknown';
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`Agent Error [${status}]: ${errMsg}`);
    const message = formatGeminiErrorMessage(error);
    res.status(500).json({ error: true, message });
  }
});

module.exports = router;
