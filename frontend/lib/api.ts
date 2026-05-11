import { Message, ChatResponse, ConversationHistoryMessage } from './types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function sendMessage(
  messages: Message[],
  conversationHistory: ConversationHistoryMessage[]
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`${BACKEND}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, conversationHistory }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `Server error (${res.status})`);
    }

    return res.json();
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. The analysis engine took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
