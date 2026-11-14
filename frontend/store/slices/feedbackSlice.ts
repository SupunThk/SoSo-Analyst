import { Message, MessageFeedbackRating, AuthSession } from '@/lib/types';
import { submitMessageFeedback } from '@/lib/api';

export interface FeedbackSlice {
  _handleMessageFeedback: (messageId: string, rating: MessageFeedbackRating, activeChatId: string | null, authSession: AuthSession | null, messages: Message[], setMessages: (m: Message[] | ((prev: Message[]) => Message[])) => void) => Promise<void>;
}

export const createFeedbackSlice = (): FeedbackSlice => ({
  _handleMessageFeedback: async (messageId, rating, activeChatId, authSession, messages, setMessages) => {
    if (!activeChatId || !authSession) return;
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.role !== 'assistant' || target.persistedIndex === undefined) return;
    
    try {
      const result = await submitMessageFeedback(activeChatId, target.persistedIndex, rating, authSession.token);
      setMessages((prev: Message[]) => prev.map((m) => m.id === messageId ? { ...m, feedback: result.feedback } : m));
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  }
});
