import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  sendMessageStream: vi.fn(),
  createChat: vi.fn(),
  fetchChatSession: vi.fn(),
  fetchChats: vi.fn(),
  deleteChat: vi.fn(),
  submitMessageFeedback: vi.fn(),
  isRateLimitError: vi.fn(() => false),
  isUnauthorizedError: vi.fn(() => false),
}));

vi.mock('@/lib/api', () => apiMocks);

import { useTerminalStore } from '@/store/useTerminalStore';
import { SIGN_IN_REQUIRED_MESSAGE } from '@/store/slices/streamSlice';
import type { AuthSession } from '@/lib/types';

const session: AuthSession = { success: true, walletAddress: '0xabc', token: 'tok', expiresAt: '2999-01-01T00:00:00.000Z' };

describe('stream slice submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.getState().clearChat();
  });

  it('asks signed-out users to sign in and never calls the backend', async () => {
    await useTerminalStore.getState().handleSubmit('show market regime', null, null, null, vi.fn(), vi.fn());

    const messages = useTerminalStore.getState().messages;
    expect(messages.at(-1)?.content).toBe(SIGN_IN_REQUIRED_MESSAGE);
    expect(apiMocks.sendMessageStream).not.toHaveBeenCalled();
    expect(apiMocks.createChat).not.toHaveBeenCalled();
  });

  it('streams the answer for signed-in users', async () => {
    apiMocks.createChat.mockResolvedValue({ _id: 'chat-1' });
    apiMocks.fetchChatSession.mockResolvedValue({ messages: [] });
    apiMocks.sendMessageStream.mockImplementation(async (_m, _h, callbacks) => {
      callbacks.onChunk('Bull');
      callbacks.onDone({ answer: 'Bull market confirmed.', toolCalls: [] });
    });

    await useTerminalStore.getState().handleSubmit('show market regime', '0xabc', session, null, vi.fn(), vi.fn());

    expect(apiMocks.sendMessageStream).toHaveBeenCalledOnce();
    expect(apiMocks.sendMessageStream.mock.calls[0][4]).toBe('chat-1');
    expect(useTerminalStore.getState().messages.at(-1)?.content).toBe('Bull market confirmed.');
  });

  it('turns an expired-session error into the sign-in prompt', async () => {
    apiMocks.createChat.mockResolvedValue({ _id: 'chat-1' });
    apiMocks.sendMessageStream.mockImplementation(async (_m, _h, callbacks) => {
      callbacks.onError('Valid wallet session is required.');
    });

    await useTerminalStore.getState().handleSubmit('show market regime', '0xabc', session, null, vi.fn(), vi.fn());

    expect(useTerminalStore.getState().messages.at(-1)?.content).toBe(SIGN_IN_REQUIRED_MESSAGE);
  });
});
