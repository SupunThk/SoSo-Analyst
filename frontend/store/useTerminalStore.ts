import { create } from 'zustand';
import { Message, AuthSession, MessageFeedbackRating } from '@/lib/types';
import { createChatSessionSlice, ChatSessionSlice } from './slices/chatSessionSlice';
import { createStreamSlice, StreamSlice } from './slices/streamSlice';
import { createCommandHistorySlice, CommandHistorySlice } from './slices/commandHistorySlice';
import { createFeedbackSlice, FeedbackSlice } from './slices/feedbackSlice';

export const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "**SYSTEM INITIALIZED** — SoSo Analyst v3.0 online.\n\nConnected to real-time crypto markets, ETF flows, macro events, treasury data, tokenomics, SoDEX market data, SoSo SSI indices, and deterministic market intelligence.\n\n---\n\n**22 data tools active** — including token intelligence, sector spotlight, macro calendar, ETF flow tracking, crypto equities, wallet analysis, and SoDEX order books.\n\n> ⚠️ **RESTRICTED SYSTEM**: This terminal is strictly calibrated for crypto market analysis. General knowledge queries will be rejected. See [SYSTEM MANUAL] for capabilities.\n\nType a query or select a command below to begin analysis.\n\nAvailable commands:\n- `/help` — Open system manual\n- `/clear` — Reset terminal session\n- `↑` / `↓` — Navigate command history",
  timestamp: new Date(),
};

export interface TerminalState extends ChatSessionSlice, StreamSlice, CommandHistorySlice, FeedbackSlice {
  clearChat: () => void;
  loadSession: (chatId: string, token: string, onSetActiveChat: (id: string | null) => void) => Promise<void>;
  handleMessageFeedback: (messageId: string, rating: MessageFeedbackRating, activeChatId: string | null, authSession: AuthSession | null) => Promise<void>;
  handleSubmit: (
    text: string,
    walletAddress: string | null,
    authSession: AuthSession | null,
    activeChatId: string | null,
    onChatCreated: (chatId: string | null) => void,
    onRefreshChats: () => void
  ) => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  ...createChatSessionSlice(set, get),
  ...createStreamSlice(set, get),
  ...createCommandHistorySlice(set, get),
  ...createFeedbackSlice(),
  
  clearChat: () => get().clearChatStream(WELCOME_MESSAGE),
  
  loadSession: (chatId, token, onSetActiveChat) => 
    get()._loadSession(chatId, token, onSetActiveChat, get().setMessages, WELCOME_MESSAGE),
    
  handleMessageFeedback: (messageId, rating, activeChatId, authSession) =>
    get()._handleMessageFeedback(messageId, rating, activeChatId, authSession, get().messages, get().setMessages),
    
  handleSubmit: (text, walletAddress, authSession, activeChatId, onChatCreated, onRefreshChats) =>
    get()._handleSubmit(text, walletAddress, authSession, activeChatId, onChatCreated, onRefreshChats, get().persistedMessageCount, get().setPersistedMessageCount, WELCOME_MESSAGE)
}));
