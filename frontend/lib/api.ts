import { Message, ChatResponse, ConversationHistoryMessage } from './types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function sendMessage(
  messages: Message[],
  conversationHistory: ConversationHistoryMessage[]
): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, conversationHistory })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Agent error');
  }
  
  return res.json();
}
