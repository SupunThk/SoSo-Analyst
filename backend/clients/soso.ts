import axios from 'axios';
import { asArray, normalizeLookupValue } from '../normalizers/toolResult.ts';
import { getPositiveInteger, sleep } from '../utils/common.ts';

// SoSoValue Open API v1: https://sosovalue-1.gitbook.io/sosovalue-api-doc
// Auth is the x-soso-api-key header. Documented limits: 20 requests/minute and
// 100k/month per key, so responses are cached and 429s fall back to stale data.
const CURRENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const SOSO_ROOT_BASE = 'https://openapi.sosovalue.com';
const SOSO_OPENAPI_BASE = `${SOSO_ROOT_BASE}/openapi/v1`;
// Market Data API: equities, ETFs and perpetual futures. Same key and success
// envelope ({ code: 0 }) as v1, so sosoGet's caching and 429 handling apply.
const SOSO_V3_BASE = `${SOSO_ROOT_BASE}/openapi/v3`;

const SOSO_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.SOSO_REQUEST_TIMEOUT_MS, 15000);
const SOSO_RATE_LIMIT_RETRIES = getPositiveInteger(process.env.SOSO_RATE_LIMIT_RETRIES, 2);
const SOSO_RATE_LIMIT_RETRY_DELAY_MS = getPositiveInteger(process.env.SOSO_RATE_LIMIT_RETRY_DELAY_MS, 800);
// A rate-limit wait longer than this fails fast instead of stalling a chat reply.
const SOSO_MAX_RETRY_WAIT_MS = getPositiveInteger(process.env.SOSO_MAX_RETRY_WAIT_MS, 5000);
const SOSO_STALE_CACHE_TTL_MS = getPositiveInteger(process.env.SOSO_STALE_CACHE_TTL_MS, 10 * 60 * 1000);
const STALE_CACHE_MAX_KEYS = getPositiveInteger(process.env.SOSO_STALE_CACHE_MAX_KEYS, 500);

let currencyCatalogCache = {
  expiresAt: 0,
  records: []
};

const assertSosoSuccess = (payload) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'code') && Number(payload.code) !== 0) {
    throw Object.assign(new Error(payload.message || payload.msg || `SoSoValue API returned code ${payload.code}`), {
      sosoCode: payload.code,
      details: payload.details,
      traceId: payload.traceId
    });
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

  const response = await sosoGet('/currencies');
  const records = asArray(response.data).map(normalizeCurrencyRecord);
  currencyCatalogCache = {
    records,
    expiresAt: Date.now() + CURRENCY_CACHE_TTL_MS
  };
  return records;
};

import NodeCache from 'node-cache';
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

// 429 bodies carry details.retry_after (seconds); headers carry Retry-After or
// X-RateLimit-Reset (epoch ms).
const getRetryDelayMs = (error, attempt) => {
  const headers = error.response?.headers || {};
  const retryAfter = Number(error.response?.data?.details?.retry_after ?? headers['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  const resetAt = Number(headers['x-ratelimit-reset']);
  if (Number.isFinite(resetAt) && resetAt > Date.now()) {
    return resetAt - Date.now();
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
  if (staleApiCache.size >= STALE_CACHE_MAX_KEYS && !staleApiCache.has(cacheKey)) {
    const oldestKey = staleApiCache.keys().next().value;
    if (oldestKey) staleApiCache.delete(oldestKey);
  }
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

        const delayMs = isRateLimitError(error) ? getRetryDelayMs(error, attempt) : 0;
        if (!isRateLimitError(error) || attempt === SOSO_RATE_LIMIT_RETRIES || delayMs > SOSO_MAX_RETRY_WAIT_MS) {
          throw error;
        }

        await sleep(delayMs);
      }
    }

    throw new Error('SoSoValue request failed.');
  })().finally(() => {
    inflightApiRequests.delete(cacheKey);
  });

  inflightApiRequests.set(cacheKey, promise);
  return promise;
};

const sosoGet = async (path, params: Record<string, any> = {}, baseUrl = SOSO_OPENAPI_BASE) => {
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

export {
  SOSO_OPENAPI_BASE,
  SOSO_V3_BASE,
  SOSO_ROOT_BASE,
  clearSosoCaches,
  formatEtfCountryCode,
  getCurrencyCatalog,
  normalizeEtfAssetSymbol,
  parseSosoJsonPreservingLargeIds,
  resolveCurrencyId,
  resolveCurrencyMatches,
  sosoGet
};
