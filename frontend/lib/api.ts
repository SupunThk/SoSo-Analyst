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

const readJson = async <T>(res: Response): Promise<T> => {
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const fallback = res.status === 429
      ? 'Rate limit reached. Please wait a moment while cached data is used.'
      : `Server error (${res.status})`;
    throw new Error(getErrorMessage(data, fallback));
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
  fetcher: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt <= maxAgeMs) {
    return cache.data;
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = fetcher()
    .then((data) => {
      cache.data = data;
      cache.fetchedAt = Date.now();
      return data;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && cache.data && isRateLimitMessage(error.message)) {
        return cache.data;
      }
      throw error;
    })
    .finally(() => {
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
  authToken?: string | null
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

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
    if (error instanceof DOMException && error.name === 'AbortError') {
      callbacks.onError?.('Request timed out. The analysis engine took too long to respond.');
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
export async function fetchTickerData(): Promise<TickerAsset[]> {
  try {
    const res = await fetch(apiUrl('/api/agent/ticker'));
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function fetchMarketIntelligence(): Promise<MarketIntelligence> {
  return readCachedRequest(
    marketIntelligenceCache,
    MARKET_INTELLIGENCE_CLIENT_CACHE_MS,
    async () => {
      const res = await fetch(apiUrl('/api/market/intelligence'));
      return readJson<MarketIntelligence>(res);
    }
  );
}

export async function fetchTokenIntelligence(asset: string): Promise<TokenIntelligence> {
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
    async () => {
      const res = await fetch(apiUrl(`/api/market/token/${encodeURIComponent(asset)}`));
      return readJson<TokenIntelligence>(res);
    }
  );
}

// Auth and Chat History API
export async function requestWalletNonce(walletAddress: string): Promise<AuthNonceResponse> {
  const res = await fetch(apiUrl('/api/chats/auth/nonce'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress })
  });
  return readJson<AuthNonceResponse>(res);
}

export async function verifyWalletSignature(walletAddress: string, signature: string): Promise<AuthSession> {
  const res = await fetch(apiUrl('/api/chats/auth/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, signature })
  });
  return readJson<AuthSession>(res);
}

export async function fetchChats(walletAddress: string, authToken: string): Promise<ChatSessionSummary[]> {
  const res = await fetch(apiUrl(`/api/chats/${walletAddress}`), {
    headers: authHeaders(authToken)
  });
  const data = await readJson<unknown>(res);

  if (!Array.isArray(data)) {
    throw new Error('Chat list response was not an array.');
  }

  return data as ChatSessionSummary[];
}

export async function createChat(walletAddress: string, authToken: string, title?: string): Promise<ChatSession> {
  const res = await fetch(apiUrl('/api/chats'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
    body: JSON.stringify({ walletAddress, title })
  });
  return readJson<ChatSession>(res);
}

export async function fetchChatSession(chatId: string, authToken: string): Promise<ChatSession> {
  const res = await fetch(apiUrl(`/api/chats/session/${chatId}`), {
    headers: authHeaders(authToken)
  });
  return readJson<ChatSession>(res);
}

export async function deleteChat(chatId: string, authToken: string): Promise<{ success: boolean; _id: string }> {
  const res = await fetch(apiUrl(`/api/chats/${chatId}`), {
    method: 'DELETE',
    headers: authHeaders(authToken)
  });
  return readJson<{ success: boolean; _id: string }>(res);
}

export async function submitMessageFeedback(
  chatId: string,
  messageIndex: number,
  rating: 'up' | 'down',
  authToken: string
): Promise<{ success: boolean; messageIndex: number; feedback: { rating: 'up' | 'down'; at: string } }> {
  const res = await fetch(apiUrl(`/api/chats/${chatId}/feedback`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
    body: JSON.stringify({ messageIndex, rating })
  });
  return readJson(res);
}

export async function fetchSodexProfile(walletAddress: string, authToken?: string | null): Promise<SodexProfile> {
  const res = await fetch(apiUrl(`/api/sodex/profile/${walletAddress}`), {
    headers: authHeaders(authToken)
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

const hotNewsCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };
const etfSummaryCache: CachedRequest<SosoEtfSummary> = { data: null, fetchedAt: 0, inFlight: null };
const macroEventsCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };

export async function fetchSosoHotNews(): Promise<unknown> {
  return readCachedRequest(hotNewsCache, SOSO_CLIENT_CACHE_MS, async () => {
    const res = await fetch(apiUrl('/api/soso/news/hot'));
    return readJson<unknown>(res);
  });
}

export async function fetchSosoETFSummary(): Promise<SosoEtfSummary> {
  return readCachedRequest(etfSummaryCache, SOSO_CLIENT_CACHE_MS, async () => {
    const res = await fetch(apiUrl('/api/soso/etfs/current-data-metrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'btc' })
    });
    const btcRaw = await readJson<unknown>(res).catch(() => null);
    
    let ethRaw: unknown = null;
    try {
      const ethRes = await fetch(apiUrl('/api/soso/etfs/current-data-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'eth' })
      });
      ethRaw = await readJson<unknown>(ethRes);
    } catch {
      // ETH endpoint may not be supported by SoSoValue yet
    }

    const extractField = (payload: unknown, ...keys: string[]) => {
      if (!isRecord(payload)) return null;
      const nested = isRecord(payload.data) ? payload.data : null;

      for (const key of keys) {
        const nestedValue = nested?.[key];
        const directValue = payload[key];
        const parsed = toFiniteNumber(nestedValue ?? directValue);
        if (parsed !== null) return parsed;
      }

      return null;
    };

    return {
      btcDailyNetInflow: extractField(btcRaw, 'totalNetInflow', 'dailyNetInflow', 'netInflow', 'todayNetInflow'),
      btcTotalNetAssets: extractField(btcRaw, 'totalNetAssets', 'netAssets', 'aum', 'totalAum'),
      btcTotalVolume: extractField(btcRaw, 'totalVolume', 'volume', 'tradingVolume'),
      ethDailyNetInflow: extractField(ethRaw, 'totalNetInflow', 'dailyNetInflow', 'netInflow', 'todayNetInflow'),
      ethTotalNetAssets: extractField(ethRaw, 'totalNetAssets', 'netAssets', 'aum', 'totalAum'),
      ethTotalVolume: extractField(ethRaw, 'totalVolume', 'volume', 'tradingVolume'),
      // Pass through raw data for debugging
      _btcRaw: btcRaw,
      _ethRaw: ethRaw,
    };
  });
}

export async function fetchSosoMacroEvents(): Promise<unknown> {
  return readCachedRequest(macroEventsCache, SOSO_CLIENT_CACHE_MS, async () => {
    const res = await fetch(apiUrl('/api/soso/macro/events'));
    return readJson<unknown>(res);
  });
}

const indicesCache: CachedRequest<unknown> = { data: null, fetchedAt: 0, inFlight: null };
const indicesOverviewCache = new Map<number, CachedRequest<unknown>>();

export async function fetchSosoIndices(): Promise<unknown> {
  return readCachedRequest(indicesCache, SOSO_CLIENT_CACHE_MS, async () => {
    const res = await fetch(apiUrl('/api/soso/indices'));
    return readJson<unknown>(res);
  });
}

export async function fetchSosoIndicesOverview(snapshotLimit = 8): Promise<unknown> {
  const safeLimit = Number.isFinite(snapshotLimit) ? Math.max(0, Math.floor(snapshotLimit)) : 8;
  const cache = indicesOverviewCache.get(safeLimit) || {
    data: null,
    fetchedAt: 0,
    inFlight: null,
  };
  indicesOverviewCache.set(safeLimit, cache);

  return readCachedRequest(cache, SOSO_CLIENT_CACHE_MS, async () => {
    const params = new URLSearchParams({ snapshotLimit: String(safeLimit) });
    const res = await fetch(apiUrl(`/api/soso/indices/overview?${params}`));
    return readJson<unknown>(res);
  });
}

// ── Concurrency Queue & Rate Limiter for Heavy Batch Requests ──
const MAX_CONCURRENT_INDEX_REQUESTS = 1;
const DELAY_BETWEEN_REQUESTS_MS = 750;

let activeIndexRequests = 0;
const indexRequestQueue: (() => void)[] = [];

async function queuedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (activeIndexRequests >= MAX_CONCURRENT_INDEX_REQUESTS) {
    await new Promise<void>((resolve) => indexRequestQueue.push(resolve));
  }
  
  activeIndexRequests++;
  try {
    return await fetch(input, init);
  } finally {
    setTimeout(() => {
      activeIndexRequests--;
      if (indexRequestQueue.length > 0) {
        const next = indexRequestQueue.shift();
        if (next) next();
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

export async function fetchSosoIndexSnapshot(ticker: string): Promise<unknown> {
  const cache = getCacheEntry(indexSnapshotCache, ticker);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async () => {
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/market-snapshot`));
    return readJson<unknown>(res);
  });
}

export async function fetchSosoIndexConstituents(ticker: string): Promise<unknown> {
  const cache = getCacheEntry(indexConstituentsCache, ticker);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async () => {
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/constituents`));
    return readJson<unknown>(res);
  });
}

export async function fetchSosoIndexKlines(ticker: string, interval: string = '1d'): Promise<unknown> {
  const cacheKey = `${ticker}-${interval}`;
  const cache = getCacheEntry(indexKlinesCache, cacheKey);
  return readCachedRequest(cache, INDEX_DETAIL_CLIENT_CACHE_MS, async () => {
    const params = new URLSearchParams();
    if (interval) params.set('interval', interval);
    const qs = params.toString();
    const res = await queuedFetch(apiUrl(`/api/soso/indices/${ticker}/klines${qs ? `?${qs}` : ''}`));
    return readJson<unknown>(res);
  });
}
