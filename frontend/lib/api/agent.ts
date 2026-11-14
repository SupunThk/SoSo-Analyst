// Analyst chat (streaming and one-shot), ticker, market and token intelligence.
import type {
  Message,
  ChatResponse,
  ConversationHistoryMessage,
  ToolCall,
  TickerAsset,
  MarketIntelligence,
  TokenIntelligence,
} from '../types';
import { apiUrl, getErrorMessage, readJson, MARKET_INTELLIGENCE_CLIENT_CACHE_MS, TOKEN_INTELLIGENCE_CLIENT_CACHE_MS, marketIntelligenceCache, tokenIntelligenceCache, readCachedRequest, authHeaders, formatNetworkError, UnauthorizedError, isAbortError } from './core';

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
      if (res.status === 401) {
        throw new UnauthorizedError(getErrorMessage(errorData, 'Valid wallet session is required.'));
      }
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
