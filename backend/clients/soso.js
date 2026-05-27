const axios = require('axios');
const { asArray, normalizeLookupValue } = require('../normalizers/toolResult');
const { getPositiveInteger, sleep } = require('../utils/common');

const CURRENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const SOSO_ROOT_BASE = 'https://openapi.sosovalue.com';
const SOSO_OPENAPI_BASE = `${SOSO_ROOT_BASE}/openapi/v1`;
const SOSO_OPENAPI_V2_BASE = `${SOSO_ROOT_BASE}/openapi/v2`;
const SOSO_API_BASE = 'https://openapi.sosovalue.com/api/v1';


const SOSO_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.SOSO_REQUEST_TIMEOUT_MS, 15000);
const SOSO_RATE_LIMIT_RETRIES = getPositiveInteger(process.env.SOSO_RATE_LIMIT_RETRIES, 2);
const SOSO_RATE_LIMIT_RETRY_DELAY_MS = getPositiveInteger(process.env.SOSO_RATE_LIMIT_RETRY_DELAY_MS, 800);
const SOSO_STALE_CACHE_TTL_MS = getPositiveInteger(process.env.SOSO_STALE_CACHE_TTL_MS, 10 * 60 * 1000);

let currencyCatalogCache = {
  expiresAt: 0,
  records: []
};

const assertSosoSuccess = (payload) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'code') && Number(payload.code) !== 0) {
    const error = new Error(payload.msg || payload.message || `SoSoValue API returned code ${payload.code}`);
    error.sosoCode = payload.code;
    error.traceId = payload.traceId;
    throw error;
  }

  return payload;
};

const parseSosoJsonPreservingLargeIds = (data) => {
  if (typeof data !== 'string') {
    return data;
  }

  const safeJson = data.replace(
    /"(currencyId|currency_id|id)"\s*:\s*(\d{16,})/g,
    '"$1":"$2"'
  );

  try {
    return JSON.parse(safeJson);
  } catch {
    return data;
  }
};

const normalizeCurrencyRecord = (record) => {
  const id = record.currency_id ?? record.currencyId ?? record.id;
  const fullName = record.fullName || record.name || record.currencyFullName;
  const symbol = record.symbol || record.currencyName || record.name;

  return {
    ...record,
    currency_id: id,
    currencyId: id,
    id,
    name: fullName || symbol || id,
    fullName: fullName || symbol || id,
    symbol: symbol ? String(symbol).toUpperCase() : undefined
  };
};

const getCurrencyCatalog = async () => {
  if (currencyCatalogCache.expiresAt > Date.now() && currencyCatalogCache.records.length > 0) {
    return currencyCatalogCache.records;
  }

  let response;
  try {
    response = await sosoPost('/data/default/coin/list', {}, SOSO_OPENAPI_BASE);
  } catch {
    response = await sosoGet('/currencies');
  }

  const records = asArray(response.data).map(normalizeCurrencyRecord);
  currencyCatalogCache = {
    records,
    expiresAt: Date.now() + CURRENCY_CACHE_TTL_MS
  };
  return records;
};

const NodeCache = require('node-cache');
const apiCache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 500 });
const staleApiCache = new Map();
const inflightApiRequests = new Map();

const isRateLimitError = (error) => error.response?.status === 429;

const stableStringify = (value) => {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  ).join(',')}}`;
};

const getRetryDelayMs = (error, attempt) => {
  const retryAfter = Number(error.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return SOSO_RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1);
};

const getStaleCachedPayload = (cacheKey) => {
  const stale = staleApiCache.get(cacheKey);
  if (stale && stale.expiresAt > Date.now()) {
    return stale.data;
  }

  if (stale) {
    staleApiCache.delete(cacheKey);
  }
  return null;
};

const setCachedPayload = (cacheKey, data) => {
  apiCache.set(cacheKey, data);
  staleApiCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + SOSO_STALE_CACHE_TTL_MS
  });
};

const cachedSosoRequest = async (cacheKey, requestFn) => {
  const cached = apiCache.get(cacheKey);
  if (cached !== undefined) return assertSosoSuccess(cached);

  const inflight = inflightApiRequests.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    for (let attempt = 0; attempt <= SOSO_RATE_LIMIT_RETRIES; attempt++) {
      try {
        const response = await requestFn();
        const data = assertSosoSuccess(response.data);
        setCachedPayload(cacheKey, data);
        return data;
      } catch (error) {
        if (isRateLimitError(error)) {
          const stale = getStaleCachedPayload(cacheKey);
          if (stale) {
            return assertSosoSuccess(stale);
          }
        }

        if (!isRateLimitError(error) || attempt === SOSO_RATE_LIMIT_RETRIES) {
          throw error;
        }

        await sleep(getRetryDelayMs(error, attempt));
      }
    }

    throw new Error('SoSoValue request failed.');
  })().finally(() => {
    inflightApiRequests.delete(cacheKey);
  });

  inflightApiRequests.set(cacheKey, promise);
  return promise;
};

const sosoGet = async (path, params = {}, baseUrl = SOSO_OPENAPI_BASE) => {
  const cacheKey = `GET:${baseUrl}${path}:${stableStringify(params)}`;

  return cachedSosoRequest(cacheKey, () => axios.get(`${baseUrl}${path}`, {
    headers: {
      'x-soso-api-key': process.env.SOSO_API_KEY
    },
    params,
    timeout: SOSO_REQUEST_TIMEOUT_MS,
    transformResponse: [parseSosoJsonPreservingLargeIds]
  }));
};

const sosoPost = async (path, body = {}, baseUrl = SOSO_OPENAPI_BASE) => {
  const cacheKey = `POST:${baseUrl}${path}:${stableStringify(body)}`;

  return cachedSosoRequest(cacheKey, () => axios.post(`${baseUrl}${path}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-soso-api-key': process.env.SOSO_API_KEY
    },
    timeout: SOSO_REQUEST_TIMEOUT_MS,
    transformResponse: [parseSosoJsonPreservingLargeIds]
  }));
};

const clearSosoCaches = () => {
  apiCache.flushAll();
  staleApiCache.clear();
  inflightApiRequests.clear();
};

const resolveCurrencyMatches = async (query) => {
  const normalizedQuery = normalizeLookupValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const catalog = await getCurrencyCatalog();
  const scored = catalog.map((record) => {
    const normalizedName = normalizeLookupValue(record.name);
    const normalizedFullName = normalizeLookupValue(record.fullName);
    const normalizedSymbol = normalizeLookupValue(record.symbol);
    let score = 0;

    if (normalizedSymbol === normalizedQuery) score += 100;
    if (normalizedName === normalizedQuery) score += 95;
    if (normalizedFullName === normalizedQuery) score += 95;
    if (normalizedName.startsWith(normalizedQuery)) score += 60;
    if (normalizedFullName.startsWith(normalizedQuery)) score += 60;
    if (normalizedSymbol.startsWith(normalizedQuery)) score += 55;
    if (normalizedName.includes(normalizedQuery)) score += 35;
    if (normalizedFullName.includes(normalizedQuery)) score += 35;
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

module.exports = {
  SOSO_API_BASE,
  SOSO_OPENAPI_BASE,
  SOSO_OPENAPI_V2_BASE,
  SOSO_ROOT_BASE,
  clearSosoCaches,
  formatEtfCountryCode,
  getCurrencyCatalog,
  normalizeEtfAssetSymbol,
  parseSosoJsonPreservingLargeIds,
  resolveCurrencyId,
  resolveCurrencyMatches,
  sosoGet,
  sosoPost
};
