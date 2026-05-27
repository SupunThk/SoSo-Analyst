const express = require('express');
const {
  SOSO_API_BASE: API_V1_URL,
  SOSO_OPENAPI_BASE: OPENAPI_V1_URL,
  SOSO_OPENAPI_V2_BASE: OPENAPI_V2_URL,
  sosoGet,
  sosoPost
} = require('../clients/soso');
const { getPositiveInteger, sleep } = require('../utils/common');

const router = express.Router();

const SAFE_PARAM = /^[a-zA-Z0-9_\-]{1,80}$/;
const INDEX_OVERVIEW_SNAPSHOT_LIMIT = getPositiveInteger(process.env.SOSO_INDEX_OVERVIEW_SNAPSHOT_LIMIT, 8);
const INDEX_OVERVIEW_MAX_SNAPSHOT_LIMIT = getPositiveInteger(process.env.SOSO_INDEX_OVERVIEW_MAX_SNAPSHOT_LIMIT, 16);
const INDEX_OVERVIEW_DELAY_MS = getPositiveInteger(process.env.SOSO_INDEX_OVERVIEW_DELAY_MS, 250);

const INDEX_LABELS = {
  ssiSocialFi: 'SocialFi',
  ssiRWA: 'RWA',
  ssiDeFi: 'DeFi',
  ssiAI: 'AI',
  ssiMeme: 'Meme',
  ssiDePIN: 'DePIN',
  ssiNFT: 'NFT',
  ssiMAG7: 'MAG7',
  ssiCeFi: 'CeFi',
  ssiLayer1: 'Layer 1',
  ssiGameFi: 'GameFi',
  ssiPayFi: 'PayFi',
  ssiLayer2: 'Layer 2'
};

const validateRouteParams = (req, res, next) => {
  for (const [key, value] of Object.entries(req.params)) {
    if (!SAFE_PARAM.test(value)) {
      return res.status(400).json({
        error: true,
        message: `Invalid route parameter "${key}".`,
        requestId: req.id
      });
    }
  }
  next();
};

router.use(validateRouteParams);

const getPublicUpstreamError = (error) => {
  if (error.code === 'ECONNABORTED') {
    return {
      status: 504,
      message: 'SoSoValue request timed out.'
    };
  }

  if (error.response?.status === 429) {
    return {
      status: 429,
      message: 'SoSoValue rate limit reached.'
    };
  }

  return {
    status: 502,
    message: 'SoSoValue data source request failed.'
  };
};

const sendPublicUpstreamError = (error, req, res, path, baseUrl) => {
  const publicError = getPublicUpstreamError(error);
  console.error(JSON.stringify({
    requestId: req.id,
    source: 'SoSoValue',
    upstreamStatus: error.response?.status,
    sosoCode: error.sosoCode,
    code: error.code,
    message: error.message,
    path,
    baseUrl
  }));

  res.status(publicError.status).json({
    error: true,
    message: publicError.message,
    requestId: req.id
  });
};

const getPayloadData = (payload) => (
  payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
);

const extractList = (payload) => {
  const data = getPayloadData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.indices)) return data.indices;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getBoundedSnapshotLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return INDEX_OVERVIEW_SNAPSHOT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 0), INDEX_OVERVIEW_MAX_SNAPSHOT_LIMIT);
};

const normalizeIndexCatalogItem = (item) => {
  if (typeof item === 'string') {
    return {
      ticker: item,
      name: INDEX_LABELS[item] || item.replace(/^ssi/i, '').trim() || item
    };
  }

  if (!item || typeof item !== 'object') return null;

  const ticker = String(item.ticker || item.symbol || item.id || item.name || '').trim();
  if (!ticker) return null;

  return {
    ticker,
    name: item.fullName || item.displayName || item.name || INDEX_LABELS[ticker] || ticker
  };
};

const mergeIndexSnapshot = (summary, payload) => {
  const data = getPayloadData(payload) || {};
  return {
    ...summary,
    price: toNumber(data.price ?? data.value ?? data.close),
    change_pct_24h: toNumber(data.change_pct_24h ?? data.changePct24h ?? data.changePercent24h),
    changePct24h: toNumber(data.change_pct_24h ?? data.changePct24h ?? data.changePercent24h),
    roi_7d: toNumber(data.roi_7d ?? data.roi7d ?? data.changePercent7d),
    roi_1m: toNumber(data.roi_1m ?? data.roi1m ?? data.changePercent30d),
    roi_3m: toNumber(data.roi_3m ?? data.roi3m ?? data.changePercent90d),
    roi_1y: toNumber(data.roi_1y ?? data.roi1y ?? data.changePercent1y),
    ytd: toNumber(data.ytd ?? data.roiYtd ?? data.changePercentYtd),
    market_cap: toNumber(data.market_cap ?? data.marketCap ?? data.totalMarketCap),
    volume_24h: toNumber(data.volume_24h ?? data.volume24h ?? data.tradingVolume)
  };
};

const sosoRequest = async (path, req, res, baseUrl = OPENAPI_V1_URL) => {
  try {
    // Only allow specific query parameters to be passed to the external API
    const allowedParams = ['pageNum', 'pageSize', 'ticker', 'symbol', 'country_code', 'days', 'interval', 'limit', 'chart_name', 'event', 'query', 'currencyId', 'categoryList', 'type'];
    const filteredQuery = {};
    
    for (const key of allowedParams) {
      if (req.query[key] !== undefined) {
        filteredQuery[key] = req.query[key];
      }
    }

    const data = await sosoGet(path, filteredQuery, baseUrl);
    res.json(data);
  } catch (error) {
    sendPublicUpstreamError(error, req, res, path, baseUrl);
  }
};

const sosoPostRequest = async (path, req, res, baseUrl = OPENAPI_V1_URL) => {
  try {
    const allowedBodyParams = ['type'];
    const filteredBody = {};

    for (const key of allowedBodyParams) {
      if (req.body?.[key] !== undefined) {
        filteredBody[key] = req.body[key];
      }
    }

    const data = await sosoPost(path, filteredBody, baseUrl);
    res.json(data);
  } catch (error) {
    sendPublicUpstreamError(error, req, res, path, baseUrl);
  }
};

const sosoIndicesOverview = async (req, res) => {
  const snapshotLimit = getBoundedSnapshotLimit(req.query.snapshotLimit);

  try {
    const catalogPayload = await sosoGet('/indices', {}, OPENAPI_V1_URL);
    const summaries = extractList(catalogPayload)
      .map(normalizeIndexCatalogItem)
      .filter(Boolean);
    const warnings = [];

    for (const [index, summary] of summaries.slice(0, snapshotLimit).entries()) {
      if (index > 0 && INDEX_OVERVIEW_DELAY_MS > 0) {
        await sleep(INDEX_OVERVIEW_DELAY_MS);
      }

      try {
        const snapshotPayload = await sosoGet(`/indices/${summary.ticker}/market-snapshot`, {}, OPENAPI_V1_URL);
        summaries[index] = mergeIndexSnapshot(summary, snapshotPayload);
      } catch (error) {
        warnings.push(`${summary.ticker} snapshot unavailable.`);
      }
    }

    res.json({
      data: summaries,
      snapshotCount: Math.min(snapshotLimit, summaries.length),
      warnings
    });
  } catch (error) {
    sendPublicUpstreamError(error, req, res, '/indices/overview', OPENAPI_V1_URL);
  }
};

// Official documented endpoints
router.post('/coins/list', (req, res) => sosoPostRequest('/data/default/coin/list', req, res));
router.post('/data/default/coin/list', (req, res) => sosoPostRequest('/data/default/coin/list', req, res));
router.post('/etfs/historical-inflow-chart', (req, res) => sosoPostRequest('/etf/historicalInflowChart', req, res, OPENAPI_V2_URL));
router.post('/etfs/current-data-metrics', (req, res) => sosoPostRequest('/etf/currentEtfDataMetrics', req, res, OPENAPI_V2_URL));

// Currencies
router.get('/currencies', (req, res) => sosoRequest('/currencies', req, res));
router.get('/currencies/sector-spotlight', (req, res) => sosoRequest('/currencies/sector-spotlight', req, res));
router.get('/currencies/:id', (req, res) => sosoRequest(`/currencies/${req.params.id}`, req, res));
router.get('/currencies/:id/market-snapshot', (req, res) => sosoRequest(`/currencies/${req.params.id}/market-snapshot`, req, res));
router.get('/currencies/:id/klines', (req, res) => sosoRequest(`/currencies/${req.params.id}/klines`, req, res));
router.get('/currencies/:id/supply', (req, res) => sosoRequest(`/currencies/${req.params.id}/supply`, req, res));
router.get('/currencies/:id/pairs', (req, res) => sosoRequest(`/currencies/${req.params.id}/pairs`, req, res));

// ETFs
router.get('/etfs/summary-history', (req, res) => sosoRequest('/etfs/summary-history', req, res));
router.get('/etfs', (req, res) => sosoRequest('/etfs', req, res));
router.get('/etfs/:ticker/market-snapshot', (req, res) => sosoRequest(`/etfs/${req.params.ticker}/market-snapshot`, req, res));
router.get('/etfs/:ticker/history', (req, res) => sosoRequest(`/etfs/${req.params.ticker}/history`, req, res));

// Indices
router.get('/indices/overview', sosoIndicesOverview);
router.get('/indices', (req, res) => sosoRequest('/indices', req, res));
router.get('/indices/:ticker/constituents', (req, res) => sosoRequest(`/indices/${req.params.ticker}/constituents`, req, res));
router.get('/indices/:ticker/market-snapshot', (req, res) => sosoRequest(`/indices/${req.params.ticker}/market-snapshot`, req, res));
router.get('/indices/:ticker/klines', (req, res) => sosoRequest(`/indices/${req.params.ticker}/klines`, req, res));

// Crypto Stocks
router.get('/crypto-stocks', (req, res) => sosoRequest('/crypto-stocks', req, res));
router.get('/crypto-stocks/sector', (req, res) => sosoRequest('/crypto-stocks/sector', req, res));
router.get('/crypto-stocks/:ticker/market-snapshot', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/market-snapshot`, req, res));
router.get('/crypto-stocks/:ticker/market-cap', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/market-cap`, req, res));
router.get('/crypto-stocks/:ticker/klines', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/klines`, req, res));

// BTC Treasuries
router.get('/btc-treasuries', (req, res) => sosoRequest('/btc-treasuries', req, res));
router.get('/btc-treasuries/:ticker/purchase-history', (req, res) => sosoRequest(`/btc-treasuries/${req.params.ticker}/purchase-history`, req, res));

// News
router.get('/news', (req, res) => sosoRequest('/news', req, res));
router.get('/news/hot', (req, res) => sosoRequest('/news/hot', req, res));
router.get('/news/featured', (req, res) => sosoRequest('/news/featured', req, res, API_V1_URL));
router.get('/news/featured/currency', (req, res) => sosoRequest('/news/featured/currency', req, res, API_V1_URL));
router.get('/news/search', (req, res) => sosoRequest('/news/search', req, res));

// Fundraising
router.get('/fundraising/projects', (req, res) => sosoRequest('/fundraising/projects', req, res));
router.get('/fundraising/projects/:id', (req, res) => sosoRequest(`/fundraising/projects/${req.params.id}`, req, res));

// Macro
router.get('/macro/events', (req, res) => sosoRequest('/macro/events', req, res));
router.get('/macro/events/:event/history', (req, res) => sosoRequest(`/macro/events/${req.params.event}/history`, req, res));

// Analyses
router.get('/analyses', (req, res) => sosoRequest('/analyses', req, res));
router.get('/analyses/:chart_name', (req, res) => sosoRequest(`/analyses/${req.params.chart_name}`, req, res));

module.exports = router;
