// Shared HTTP plumbing: backend URL, errors, JSON reading, retry and client caches.
import type {
  MarketIntelligence,
  TokenIntelligence,
} from '../types';

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

export const apiUrl = (path: string) => {
  if (!BACKEND_URL) {
    throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured.');
  }

  return `${BACKEND_URL}${path}`;
};

export const getErrorMessage = (data: unknown, fallback: string) => {
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

export const parseRetryAfter = (res: Response): number => {
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

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

export const readJson = async <T>(res: Response): Promise<T> => {
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

export interface CachedRequest<T> {
  data: T | null;
  fetchedAt: number;
  inFlight: Promise<T> | null;
}

export const MARKET_INTELLIGENCE_CLIENT_CACHE_MS = 90_000;
export const TOKEN_INTELLIGENCE_CLIENT_CACHE_MS = 60_000;

export const marketIntelligenceCache: CachedRequest<MarketIntelligence> = {
  data: null,
  fetchedAt: 0,
  inFlight: null,
};

export const tokenIntelligenceCache = new Map<string, CachedRequest<TokenIntelligence>>();

export const isRateLimitMessage = (message: string) =>
  /rate limit|too many requests|\b429\b/i.test(message);

export const readCachedRequest = async <T>(
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

export const authHeaders = (authToken?: string | null): HeadersInit =>
  authToken ? { Authorization: `Bearer ${authToken}` } : {};

export const formatNetworkError = (error: Error) => {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return `Analysis backend is unreachable at ${BACKEND_URL}. Start the backend, then retry.`;
  }

  return error.message;
};
