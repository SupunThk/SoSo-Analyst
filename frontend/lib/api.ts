import {
  Message,
  ChatResponse,
  ConversationHistoryMessage,
  ToolCall,
  TickerAsset,
  ChatSession,
  ChatSessionSummary,
  AuthNonceResponse,
  AuthSession,
  SodexProfile,
  MarketIntelligence,
  TokenIntelligence,
} from './types';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

const apiUrl = (path: string) => {
  if (!BACKEND_URL) {
    throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured.');
  }

  return `${BACKEND_URL}${path}`;
};

const getErrorMessage = (data: unknown, fallback: string) => {
  if (data && typeof data === 'object') {
    const maybeError = data as { message?: unknown; error?: unknown };
    if (typeof maybeError.message === 'string') return maybeError.message;
    if (typeof maybeError.error === 'string') return maybeError.error;
  }

  return fallback;
};

// ── Rate Limit Error with retry-after support ──
export class RateLimitError extends Error {
  public retryAfterMs: number;
  constructor(retryAfterMs: number, data?: unknown) {
    const msg = getErrorMessage(data, 'Rate limit reached.');
    super(msg);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export const isRateLimitError = (error: unknown): error is RateLimitError =>
  error instanceof RateLimitError;

export class UnauthorizedError extends Error {
  constructor(message = 'Valid wallet session is required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export const isUnauthorizedError = (error: unknown): error is UnauthorizedError =>
  error instanceof UnauthorizedError;

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const parseRetryAfter = (res: Response): number => {
  // draft-8 standard headers
  const resetStr = res.headers.get('ratelimit-reset') || res.headers.get('RateLimit-Reset');
  const retryStr = res.headers.get('retry-after') || res.headers.get('Retry-After');
  if (resetStr) {
    const secs = Number(resetStr);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  if (retryStr) {
    const secs = Number(retryStr);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  return 5000; // Default 5s wait
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

const readJson = async <T>(res: Response): Promise<T> => {
  const data = await res.json().catch(() => null);

  if (res.status === 429) {
    throw new RateLimitError(parseRetryAfter(res), data);
  }

  if (res.status === 401) {
    throw new UnauthorizedError(getErrorMessage(data, 'Valid wallet session is required.'));
  }

  if (!res.ok) {
    throw new Error(getErrorMessage(data, `Server error (${res.status})`));
  }

  return data as T;
};

interface CachedRequest<T> {
  data: T | null;
  fetchedAt: number;
  inFlight: Promise<T> | null;
}

const MARKET_INTELLIGENCE_CLIENT_CACHE_MS = 90_000;
const TOKEN_INTELLIGENCE_CLIENT_CACHE_MS = 60_000;

const marketIntelligenceCache: CachedRequest<MarketIntelligence> = {
  data: null,
  fetchedAt: 0,
  inFlight: null,
};

const tokenIntelligenceCache = new Map<string, CachedRequest<TokenIntelligence>>();

const isRateLimitMessage = (message: string) =>
  /rate limit|too many requests|\b429\b/i.test(message);

const readCachedRequest = async <T>(
  cache: CachedRequest<T>,
  maxAgeMs: number,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt <= maxAgeMs) {
    return cache.data;
  }

  // Do not share in-flight requests that are bound to a component AbortSignal.
  // In React dev/StrictMode, an aborted first mount can otherwise poison the
  // global cache and make the next mount receive the same aborted promise.
  const canShareInFlight = !signal;

  if (canShareInFlight && cache.inFlight) {
    return cache.inFlight;
  }

  const request = fetcher(signal)
    .then((data) => {
      cache.data = data;
      cache.fetchedAt = Date.now();
      return data;
    })
    .catch(async (error: unknown) => {
      // Abort errors always propagate immediately
      if (isAbortError(error)) throw error;

      // Rate limit: return stale data if available, otherwise wait and retry once
      if (isRateLimitError(error)) {
        if (cache.data) return cache.data;
        // No stale data — wait for reset then retry once
        try {
          await sleep(error.retryAfterMs, signal);
          const retryData = await fetcher(signal);
          cache.data = retryData;
          cache.fetchedAt = Date.now();
          return retryData;
        } catch (retryErr) {
          if (isAbortError(retryErr)) throw retryErr;
          // Still rate limited or other error on retry — throw as RateLimitError
          throw error;
        }
      }

      // Other errors: return stale data if it's a rate-limit-like message
      if (error instanceof Error && cache.data && isRateLimitMessage(error.message)) {
        return cache.data;
      }
      throw error;
    });

  if (!canShareInFlight) {
    return request;
  }

  cache.inFlight = request.finally(() => {
    cache.inFlight = null;
  });

  return cache.inFlight;
};

const authHeaders = (authToken?: string | null): HeadersInit =>
  authToken ? { Authorization: `Bearer ${authToken}` } : {};

const formatNetworkError = (error: Error) => {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return `Analysis backend is unreachable at ${BACKEND_URL}. Start the backend, then retry.`;
  }

  return error.message;
};

export interface StreamCallbacks {
  onChunk?: (text: string) => void;
  onStatus?: (phase: string, message: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolDone?: (tool: ToolCall) => void;
  onDone?: (response: ChatResponse) => void;
  onError?: (message: string) => void;
}

export async function sendMessageStream(
  messages: Message[],
  conversationHistory: ConversationHistoryMessage[],
  callbacks: StreamCallbacks,
  walletAddress?: string | null,
  chatId?: string | null,
  authToken?: string | null,
  externalSignal?: AbortSignal
): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120000);

  // Link external signal so callers can cancel from outside
  if (externalSignal) {
    if (externalSignal.aborted) { controller.abort(); }
    else { externalSignal.addEventListener('abort', () => controller.abort(), { once: true }); }
  }

  try {
    const res = await fetch(apiUrl('/api/agent/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
      body: JSON.stringify({ messages, conversationHistory, walletAddress, chatId }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(getErrorMessage(errorData, `Server error (${res.status})`));
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response stream available.');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let terminalEventReceived = false;

    const processLine = (line: string) => {
      const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line;

      if (normalizedLine.startsWith('event: ')) {
        currentEvent = normalizedLine.slice(7).trim();
        return;
      }

      if (normalizedLine.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(normalizedLine.slice(6));
          switch (currentEvent) {
            case 'chunk':
              callbacks.onChunk?.(data.text);
              break;
            case 'status':
              callbacks.onStatus?.(data.phase, data.message);
              break;
            case 'tool_start':
              callbacks.onToolStart?.(data.name, data.args);
              break;
            case 'tool_done':
              callbacks.onToolDone?.(data as ToolCall);
              break;
            case 'done':
              terminalEventReceived = true;
              callbacks.onDone?.(data as ChatResponse);
              break;
            case 'error':
              terminalEventReceived = true;
              callbacks.onError?.(data.message);
              break;
          }
        } catch {
          // skip malformed JSON
        }
        currentEvent = '';
        return;
      }

      if (normalizedLine === '') {
        currentEvent = '';
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer) {
      for (const line of buffer.split('\n')) {
        processLine(line);
      }
    }

    if (!terminalEventReceived) {
      callbacks.onError?.('Connection closed before the analysis completed.');
    }
  } catch (error: unknown) {
    if (isAbortError(error)) {
      if (externalSignal?.aborted && !timedOut) {
        return;
      }
      callbacks.onError?.(
        timedOut
          ? 'Request timed out. The analysis engine took too long to respond.'
          : 'Request was cancelled before the analysis completed.'
      );
    } else if (error instanceof Error) {
      callbacks.onError?.(formatNetworkError(error));
    } else {
      callbacks.onError?.('Unknown error occurred.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Legacy non-streaming endpoint (fallback)
export async function sendMessage(
  messages: Message[],
  conversationHistory: ConversationHistoryMessage[]
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(apiUrl('/api/agent/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, conversationHistory }),
      signal: controller.signal
    });

    return await readJson<ChatResponse>(res);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. The analysis engine took too long to respond.');
    }
    if (error instanceof Error) {
      throw new Error(formatNetworkError(error));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Live ticker data
export async function fetchTickerData(signal?: AbortSignal): Promise<TickerAsset[]> {
  try {
    const res = await fetch(apiUrl('/api/agent/ticker'), { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (err) {
    if (isAbortError(err)) throw err;
    return [];
  }
}

export async function fetchMarketIntelligence(signal?: AbortSignal): Promise<MarketIntelligence> {
  return readCachedRequest(
    marketIntelligenceCache,
    MARKET_INTELLIGENCE_CLIENT_CACHE_MS,
    async (s?: AbortSignal) => {
      const res = await fetch(apiUrl('/api/market/intelligence'), { signal: s });
      return readJson<MarketIntelligence>(res);
    },
    signal
  );
}

export async function fetchTokenIntelligence(asset: string, signal?: AbortSignal): Promise<TokenIntelligence> {
  const key = asset.trim().toUpperCase();
  const cache = tokenIntelligenceCache.get(key) || {
    data: null,
    fetchedAt: 0,
    inFlight: null,
  };
  tokenIntelligenceCache.set(key, cache);

  return readCachedRequest(
    cache,
    TOKEN_INTELLIGENCE_CLIENT_CACHE_MS,
    async (s?: AbortSignal) => {
      const res = await fetch(apiUrl(`/api/market/token/${encodeURIComponent(asset)}`), { signal: s });
      return readJson<TokenIntelligence>(res);
    },
    signal
  );
}

// Auth and Chat History API
export async function requestWalletNonce(walletAddress: string, signal?: AbortSignal): Promise<AuthNonceResponse> {
  try {
    const res = await fetch(apiUrl('/api/chats/auth/nonce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
      signal
    });
    return readJson<AuthNonceResponse>(res);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(formatNetworkError(error));
    }
    throw error;
  }
}

export async function verifyWalletSignature(walletAddress: string, signature: string, signal?: AbortSignal): Promise<AuthSession> {
  try {
    const res = await fetch(apiUrl('/api/chats/auth/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature }),
      signal
    });
    return readJson<AuthSession>(res);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(formatNetworkError(error));
    }
    throw error;
  }
}

export async function fetchChats(walletAddress: string, authToken: string, signal?: AbortSignal): Promise<ChatSessionSummary[]> {
  const res = await fetch(apiUrl(`/api/chats/${walletAddress}`), {
    headers: authHeaders(authToken),
    signal
  });
  const data = await readJson<unknown>(res);

  if (!Array.isArray(data)) {
    throw new Error('Chat list response was not an array.');
  }

  return data as ChatSessionSummary[];
}

export async function createChat(walletAddress: string, authToken: string, title?: string, signal?: AbortSignal): Promise<ChatSession> {
  const res = await fetch(apiUrl('/api/chats'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
    body: JSON.stringify({ walletAddress, title }),
    signal
  });
  return readJson<ChatSession>(res);
}

export async function fetchChatSession(chatId: string, authToken: string, signal?: AbortSignal): Promise<ChatSession> {
  const res = await fetch(apiUrl(`/api/chats/session/${chatId}`), {
    headers: authHeaders(authToken),
    signal
  });
  return readJson<ChatSession>(res);
}

export async function deleteChat(chatId: string, authToken: string, signal?: AbortSignal): Promise<{ success: boolean; _id: string }> {
  const res = await fetch(apiUrl(`/api/chats/${chatId}`), {
    method: 'DELETE',
    headers: authHeaders(authToken),
    signal
  });
  return readJson<{ success: boolean; _id: string }>(res);
}

export async function submitMessageFeedback(
  chatId: string,
  messageIndex: number,
  rating: 'up' | 'down',
  authToken: string,
  signal?: AbortSignal
): Promise<{ success: boolean; messageIndex: number; feedback: { rating: 'up' | 'down'; at: string } }> {
  const res = await fetch(apiUrl(`/api/chats/${chatId}/feedback`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
    body: JSON.stringify({ messageIndex, rating }),
    signal
  });
  return readJson(res);
}

export async function fetchSodexProfile(walletAddress: string, authToken?: string | null, signal?: AbortSignal): Promise<SodexProfile> {
  const res = await fetch(apiUrl(`/api/sodex/profile/${walletAddress}`), {
    headers: authHeaders(authToken),
    signal
  });
  return readJson<SodexProfile>(res);
}

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
    const res = await fetch(apiUrl('/api/soso/etfs/current-data-metrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'us-btc-spot' }),
      signal: s
    });
    const btcRaw = await readJson<unknown>(res).catch(() => null);
    
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
