// Wallet sign-in, saved chats, message feedback and SoDEX profile.
import type {
  ChatSession,
  ChatSessionSummary,
  AuthNonceResponse,
  AuthSession,
  SodexProfile,
} from '../types';
import { apiUrl, readJson, authHeaders, formatNetworkError } from './core';

// Auth and Chat History API
export async function requestWalletNonce(walletAddress: string, signal?: AbortSignal): Promise<AuthNonceResponse> {
  try {
    const uri = typeof window !== 'undefined' ? window.location.origin : undefined;
    const res = await fetch(apiUrl('/api/chats/auth/nonce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, uri }),
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
