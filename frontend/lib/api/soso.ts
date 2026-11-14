// SoSoValue market data: news, ETFs, macro events and indices.
import { apiUrl, readJson, readCachedRequest, isAbortError, type CachedRequest } from './core';

const SOSO_CLIENT_CACHE_MS = 5 * 60_000;
const INDEX_DETAIL_CLIENT_CACHE_MS = 10 * 60_000;

type UnknownRecord = Record<string, unknown>;

export interface SosoEtfSummary {
  btcDailyNetInflow: number | null;
  btcTotalNetAssets: number | null;
  btcTotalVolume: number | null;
  ethDailyNetInflow: number | null;
  ethTotalNetAssets: number | null;
  ethTotalVolume: number | null;
  _btcRaw: unknown;
  _ethRaw: unknown;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const unwrapMetricValue = (value: unknown): unknown =>
  isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value')
    ? value.value
    : value;

const hotNewsCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };
const etfSummaryCache: CachedRequest<SosoEtfSummary> = { data: null, fetchedAt: 0, inFlight: null };
const macroEventsCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };

export async function fetchSosoHotNews(signal?: AbortSignal): Promise<unknown> {
  return readCachedRequest(hotNewsCache, SOSO_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const res = await fetch(apiUrl('/api/soso/news/hot'), { signal: s });
    return readJson<unknown>(res);
  }, signal);
}

export async function fetchSosoETFSummary(signal?: AbortSignal): Promise<SosoEtfSummary> {
  return readCachedRequest(etfSummaryCache, SOSO_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    let btcRaw: unknown = null;
    try {
      const btcRes = await fetch(apiUrl('/api/soso/etfs/current-data-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'us-btc-spot' }),
        signal: s
      });
      btcRaw = await readJson<unknown>(btcRes);
    } catch (err) {
      if (isAbortError(err)) throw err;
      console.error("Failed to fetch BTC ETF data:", err);
    }
    
    let ethRaw: unknown = null;
    try {
      const ethRes = await fetch(apiUrl('/api/soso/etfs/current-data-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'us-eth-spot' }),
        signal: s
      });
      ethRaw = await readJson<unknown>(ethRes);
    } catch (err) {
      if (isAbortError(err)) throw err;
      // ETH endpoint may not be supported by SoSoValue yet
    }

    const extractField = (payload: unknown, ...keys: string[]) => {
      if (!isRecord(payload)) return null;
      const nested = isRecord(payload.data) ? payload.data : null;

      for (const key of keys) {
        const nestedValue = nested?.[key];
        const directValue = payload[key];
        const parsed = toFiniteNumber(unwrapMetricValue(nestedValue ?? directValue));
        if (parsed !== null) return parsed;
      }

      return null;
    };

    return {
      btcDailyNetInflow: extractField(btcRaw, 'totalNetInflow', 'dailyNetInflow', 'netInflow', 'todayNetInflow'),
      btcTotalNetAssets: extractField(btcRaw, 'totalNetAssets', 'netAssets', 'aum', 'totalAum'),
      btcTotalVolume: extractField(btcRaw, 'dailyTotalValueTraded', 'totalValueTraded', 'totalVolume', 'volume', 'tradingVolume'),
      ethDailyNetInflow: extractField(ethRaw, 'totalNetInflow', 'dailyNetInflow', 'netInflow', 'todayNetInflow'),
      ethTotalNetAssets: extractField(ethRaw, 'totalNetAssets', 'netAssets', 'aum', 'totalAum'),
      ethTotalVolume: extractField(ethRaw, 'dailyTotalValueTraded', 'totalValueTraded', 'totalVolume', 'volume', 'tradingVolume'),
      // Pass through raw data for debugging
      _btcRaw: btcRaw,
      _ethRaw: ethRaw,
    };
  }, signal);
}

export async function fetchSosoMacroEvents(signal?: AbortSignal): Promise<unknown> {
  return readCachedRequest(macroEventsCache, SOSO_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const res = await fetch(apiUrl('/api/soso/macro/events'), { signal: s });
    return readJson<unknown>(res);
  }, signal);
}

const indicesCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };
const indicesOverviewCache = new Map<number, CachedRequest<unknown>>();

export async function fetchSosoIndices(signal?: AbortSignal): Promise<unknown> {
  return readCachedRequest(indicesCache, SOSO_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const res = await fetch(apiUrl('/api/soso/indices'), { signal: s });
    return readJson<unknown>(res);
  }, signal);
}

export async function fetchSosoIndicesOverview(snapshotLimit = 8, signal?: AbortSignal): Promise<unknown> {
  const safeLimit = Number.isFinite(snapshotLimit) ? Math.max(0, Math.floor(snapshotLimit)) : 8;
  const cache = indicesOverviewCache.get(safeLimit) || {
    data: null,
    fetchedAt: 0,
    inFlight: null,
  };
  indicesOverviewCache.set(safeLimit, cache);

  return readCachedRequest(cache, SOSO_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const params = new URLSearchParams({ snapshotLimit: String(safeLimit) });
    const res = await fetch(apiUrl(`/api/soso/indices/overview?${params}`), { signal: s });
    return readJson<unknown>(res);
  }, signal);
}

// ── Concurrency Queue & Rate Limiter for Heavy Batch Requests ──
const MAX_CONCURRENT_INDEX_REQUESTS = 1;
const DELAY_BETWEEN_REQUESTS_MS = 750;

let activeIndexRequests = 0;
interface QueueEntry { resolve: () => void; signal?: AbortSignal; reject: (err: Error) => void; }
const indexRequestQueue: QueueEntry[] = [];

async function queuedFetch(input: RequestInfo | URL, init?: RequestInit, signal?: AbortSignal): Promise<Response> {
  // If already aborted, bail immediately
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (activeIndexRequests >= MAX_CONCURRENT_INDEX_REQUESTS) {
    await new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, signal, reject };
      indexRequestQueue.push(entry);
      // If signal aborts while waiting in queue, remove from queue and reject
      signal?.addEventListener('abort', () => {
        const idx = indexRequestQueue.indexOf(entry);
        if (idx >= 0) indexRequestQueue.splice(idx, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
  
  activeIndexRequests++;
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    setTimeout(() => {
      activeIndexRequests--;
      // Drain queue entries whose signals have already been aborted
      while (indexRequestQueue.length > 0) {
        const next = indexRequestQueue[0];
        if (next.signal?.aborted) {
          indexRequestQueue.shift();
          next.reject(new DOMException('Aborted', 'AbortError'));
          continue;
        }
        indexRequestQueue.shift();
        next.resolve();
        break;
      }
    }, DELAY_BETWEEN_REQUESTS_MS);
  }
}

// ── Index Data Caches ──
const indexSnapshotCache = new Map<string, CachedRequest<unknown>>();
const indexConstituentsCache = new Map<string, CachedRequest<unknown>>();
const indexKlinesCache = new Map<string, CachedRequest<unknown>>();

const getCacheEntry = (map: Map<string, CachedRequest<unknown>>, key: string) => {
  if (!map.has(key)) map.set(key, { data: null, fetchedAt: 0, inFlight: null });
  return map.get(key)!;
};

export async function fetchSosoIndexSnapshot(ticker: string, signal?: AbortSignal): Promise<unknown> {
  const cache = getCacheEntry(indexSnapshotCache, ticker);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/market-snapshot`), undefined, s);
    return readJson<unknown>(res);
  }, signal);
}

export async function fetchSosoIndexConstituents(ticker: string, signal?: AbortSignal): Promise<unknown> {
  const cache = getCacheEntry(indexConstituentsCache, ticker);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/constituents`), undefined, s);
    return readJson<unknown>(res);
  }, signal);
}

export async function fetchSosoIndexKlines(ticker: string, interval: string = '1d', signal?: AbortSignal): Promise<unknown> {
  const cacheKey = `${ticker}-${interval}`;
  const cache = getCacheEntry(indexKlinesCache, cacheKey);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async (s?: AbortSignal) => {
    const params = new URLSearchParams();
    if (interval) params.set('interval', interval);
    const qs = params.toString();
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/klines${qs ? `?${qs}` : ''}`), undefined, s);
    return readJson<unknown>(res);
  }, signal);
}

