import type { TerminalGet, TerminalSet } from './types';
import { Message, ChatSessionSummary, AuthSession, PersistedChatMessage } from '@/lib/types';
import { fetchChats, deleteChat, isUnauthorizedError, fetchChatSession } from '@/lib/api';

export interface ChatSessionSlice {
  chats: ChatSessionSummary[];
  activeChatId: string | null;
  isChatsLoading: boolean;
  setChats: (chats: ChatSessionSummary[]) => void;
  setActiveChatId: (id: string | null) => void;
  setIsChatsLoading: (isLoading: boolean) => void;
  loadChats: (walletAddress: string, token: string, onUnauthorized?: () => void) => Promise<void>;
  handleDeleteChat: (chatId: string, authSession: AuthSession | null, onDeletedActive?: () => void) => Promise<void>;
  persistedMessageCount: number;
  setPersistedMessageCount: (count: number) => void;
  _loadSession: (chatId: string, token: string, onSetActiveChat: (id: string | null) => void, setMessages: (m: Message[]) => void, welcomeMessage: Message) => Promise<void>;
}

export const createChatSessionSlice = (set: TerminalSet, get: TerminalGet): ChatSessionSlice => ({
  chats: [],
  activeChatId: null,
  isChatsLoading: false,
  setChats: (chats) => set({ chats }),
  setActiveChatId: (activeChatId) => set({ activeChatId }),
  setIsChatsLoading: (isChatsLoading) => set({ isChatsLoading }),
  
  loadChats: async (address, token, onUnauthorized) => {
    set({ isChatsLoading: true });
    try {
      const chatList = await fetchChats(address, token);
      set({ chats: chatList, isChatsLoading: false });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        set({ chats: [], isChatsLoading: false, activeChatId: null });
        onUnauthorized?.();
        return;
      }
      console.error("Failed to load chats:", err);
      set({ chats: [], isChatsLoading: false });
    }
  },

  handleDeleteChat: async (chatId, authSession, onDeletedActive) => {
    if (!authSession) return;
    try {
      await deleteChat(chatId, authSession.token);
      set((state) => ({ chats: state.chats.filter((c) => c._id !== chatId) }));
      if (get().activeChatId === chatId) {
        onDeletedActive?.();
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  },

  persistedMessageCount: 0,
  setPersistedMessageCount: (persistedMessageCount) => set({ persistedMessageCount }),
  
  _loadSession: async (chatId, token, onSetActiveChat, setMessages, welcomeMessage) => {
    try {
      const session = await fetchChatSession(chatId, token);
      onSetActiveChat(chatId);
      set({ persistedMessageCount: session.messages?.length || 0 });
      if (session.messages && session.messages.length > 0) {
        const buildSessionMessages = (cid: string, persistedMessages: PersistedChatMessage[] = []): Message[] => [
          welcomeMessage,
          ...persistedMessages.map((m: PersistedChatMessage, i: number) => ({
            id: `db-${cid}-${i}`,
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls || [],
            analysisSynthesis: m.analysisSynthesis || null,
            tradeIdea: m.tradeIdea || null,
            feedback: m.feedback || null,
            persistedIndex: i,
            timestamp: new Date(m.timestamp)
          })),
        ];
        setMessages(buildSessionMessages(chatId, session.messages));
      } else {
        setMessages([welcomeMessage]);
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      setMessages([
        welcomeMessage,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `**⚠ ERROR:** Failed to load chat session. The chat may be unavailable or there is a network issue.\n\nDetails: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        }
      ]);
      onSetActiveChat(null);
    }
  }
});
