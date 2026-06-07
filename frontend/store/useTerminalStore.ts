import { create } from 'zustand';
import { 
  Message, 
  ChatSessionSummary, 
  ToolCall,
  AuthSession,
  MessageFeedbackRating,
  PersistedChatMessage,
  ConversationHistoryMessage
} from '@/lib/types';
import {
  sendMessageStream,
  createChat,
  fetchChatSession,
  submitMessageFeedback,
  fetchChats,
  deleteChat,
  isRateLimitError,
  isUnauthorizedError
} from '@/lib/api';

export const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "**SYSTEM INITIALIZED** — SoSo Analyst v3.0 online.\n\nConnected to real-time crypto markets, ETF flows, macro events, treasury data, tokenomics, SoDEX market data, SoSo SSI indices, and deterministic market intelligence.\n\n---\n\n**22 data tools active** — including token intelligence, sector spotlight, macro calendar, ETF flow tracking, crypto equities, wallet analysis, and SoDEX order books.\n\n> ⚠️ **RESTRICTED SYSTEM**: This terminal is strictly calibrated for crypto market analysis. General knowledge queries will be rejected. See [SYSTEM MANUAL] for capabilities.\n\nType a query or select a command below to begin analysis.\n\nAvailable commands:\n- `/help` — Open system manual\n- `/clear` — Reset terminal session\n- `↑` / `↓` — Navigate command history",
  timestamp: new Date(),
};

const buildSessionMessages = (chatId: string, persistedMessages: PersistedChatMessage[] = []): Message[] => [
  WELCOME_MESSAGE,
  ...persistedMessages.map((m: PersistedChatMessage, i: number) => ({
    id: `db-${chatId}-${i}`,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls || [],
    feedback: m.feedback || null,
    persistedIndex: i,
    timestamp: new Date(m.timestamp)
  })),
];

interface TerminalState {
  chats: ChatSessionSummary[];
  activeChatId: string | null;
  isChatsLoading: boolean;
  setChats: (chats: ChatSessionSummary[]) => void;
  setActiveChatId: (id: string | null) => void;
  setIsChatsLoading: (isLoading: boolean) => void;
  loadChats: (walletAddress: string, token: string, onUnauthorized?: () => void) => Promise<void>;
  handleDeleteChat: (chatId: string, authSession: AuthSession | null, onDeletedActive?: () => void) => Promise<void>;

  input: string;
  commandHistory: string[];
  historyIndex: number;
  setInput: (input: string) => void;
  addCommand: (cmd: string) => void;
  setHistoryIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  messages: Message[];
  isThinking: boolean;
  statusText: string;
  liveToolCalls: ToolCall[];
  connectionStatus: 'idle' | 'waiting' | 'ready';
  persistedMessageCount: number;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsThinking: (isThinking: boolean) => void;
  setStatusText: (statusText: string) => void;
  setLiveToolCalls: (calls: ToolCall[] | ((prev: ToolCall[]) => ToolCall[])) => void;
  setConnectionStatus: (status: 'idle' | 'waiting' | 'ready') => void;
  clearChat: () => void;

  handleMessageFeedback: (messageId: string, rating: MessageFeedbackRating, activeChatId: string | null, authSession: AuthSession | null) => Promise<void>;
  loadSession: (chatId: string, token: string, onSetActiveChat: (id: string | null) => void) => Promise<void>;
  handleSubmit: (
    text: string,
    walletAddress: string | null,
    authSession: AuthSession | null,
    activeChatId: string | null,
    onChatCreated: (chatId: string) => void,
    onRefreshChats: () => void
  ) => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
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
      set(state => ({ chats: state.chats.filter(c => c._id !== chatId) }));
      if (get().activeChatId === chatId) {
        onDeletedActive?.();
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  },

  input: '',
  commandHistory: [],
  historyIndex: -1,
  setInput: (input) => set({ input }),
  addCommand: (cmd) => set((state) => ({
    commandHistory: [cmd, ...state.commandHistory].slice(0, 50),
    historyIndex: -1,
  })),
  setHistoryIndex: (historyIndex) => set({ historyIndex }),
  
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { commandHistory, historyIndex, setHistoryIndex, setInput } = get();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  },

  messages: [WELCOME_MESSAGE],
  isThinking: false,
  statusText: '',
  liveToolCalls: [],
  connectionStatus: 'idle',
  persistedMessageCount: 0,
  
  setMessages: (updater) => set((state) => ({ 
    messages: typeof updater === 'function' ? updater(state.messages) : updater 
  })),
  setIsThinking: (isThinking) => set({ isThinking }),
  setStatusText: (statusText) => set({ statusText }),
  setLiveToolCalls: (updater) => set((state) => ({ 
    liveToolCalls: typeof updater === 'function' ? updater(state.liveToolCalls) : updater 
  })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  clearChat: () => set({
    activeChatId: null,
    messages: [WELCOME_MESSAGE],
    isThinking: false,
    statusText: '',
    liveToolCalls: [],
    connectionStatus: 'idle',
    persistedMessageCount: 0,
    input: '',
    historyIndex: -1
  }),

  handleMessageFeedback: async (messageId, rating, activeChatId, authSession) => {
    if (!activeChatId || !authSession) return;
    const { messages, setMessages } = get();
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.role !== 'assistant' || target.persistedIndex === undefined) return;
    
    try {
      const result = await submitMessageFeedback(activeChatId, target.persistedIndex, rating, authSession.token);
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, feedback: result.feedback } : m));
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  },

  loadSession: async (chatId, token, onSetActiveChat) => {
    try {
      const session = await fetchChatSession(chatId, token);
      onSetActiveChat(chatId);
      set({ persistedMessageCount: session.messages?.length || 0 });
      if (session.messages && session.messages.length > 0) {
        get().setMessages(buildSessionMessages(chatId, session.messages));
      } else {
        get().setMessages([WELCOME_MESSAGE]);
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      get().setMessages([
        WELCOME_MESSAGE,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `**⚠ ERROR:** Failed to load chat session. The chat may be unavailable or there is a network issue.\n\nDetails: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        }
      ]);
      onSetActiveChat(null);
    }
  },

  handleSubmit: async (text, walletAddress, authSession, activeChatId, onChatCreated, onRefreshChats) => {
    const state = get();
    if (!text.trim() || state.isThinking) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const nextMessages = [...state.messages, userMsg];
    const requestMessages = nextMessages.filter((m, idx) => !(idx === 0 && m.id === 'welcome')).slice(-30);

    state.setMessages(nextMessages);
    state.setIsThinking(true);
    state.setStatusText('Analyzing your query...');
    state.setLiveToolCalls([]);

    const timer = setTimeout(() => state.setConnectionStatus('waiting'), 12000);

    const history: ConversationHistoryMessage[] = state.messages
      .filter((m, idx) => !(idx === 0 && m.role === 'assistant'))
      .slice(-30)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    let currentChatId = activeChatId;
    const previousPersistedCount = state.persistedMessageCount;
    
    if (walletAddress && authSession && !currentChatId) {
      try {
        const newChat = await createChat(walletAddress, authSession.token, text.substring(0, 30) + '...');
        currentChatId = newChat._id;
        onChatCreated(currentChatId);
        onRefreshChats();
      } catch (err) {
        console.error("Failed to create chat record", err);
        get().setMessages(prev => [...prev, {
          id: `warn-${Date.now()}`,
          role: 'assistant',
          content: '**Note:** Chat history could not be saved. Analysis will continue, but this session will not be persisted.',
          timestamp: new Date(),
        }]);
      }
    }

    let streamCompleted = false;
    const assistantMsgId = `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let hasAddedMsg = false;

    await sendMessageStream(requestMessages, history, {
      onChunk: (text) => {
        if (!hasAddedMsg) {
          hasAddedMsg = true;
          get().setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          }]);
        } else {
          get().setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: m.content + text } : m));
        }
      },
      onStatus: (phase, message) => get().setStatusText(message),
      onToolStart: (name) => get().setStatusText(`Querying ${name.replace(/_/g, ' ')}...`),
      onToolDone: (tool) => get().setLiveToolCalls(prev => [...prev, tool]),
      onDone: (response) => {
        streamCompleted = true;
        if (hasAddedMsg) {
          get().setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: response.answer, toolCalls: response.toolCalls } : m));
        } else {
          get().setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: response.answer,
            toolCalls: response.toolCalls,
            timestamp: new Date(),
          }]);
        }
        get().setIsThinking(false);
        get().setStatusText('');
        get().setLiveToolCalls([]);
        clearTimeout(timer);
        get().setConnectionStatus('ready');
      },
      onError: (errorMessage) => {
        streamCompleted = false;

        // Detect rate-limit errors and show a friendly loading message instead
        const isRateLimit = /rate limit|too many requests|\b429\b/i.test(errorMessage);
        const displayMessage = isRateLimit
          ? 'The system is processing a high volume of requests. Please wait a moment and try again.'
          : errorMessage;

        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: isRateLimit
            ? `**⏳ PLEASE WAIT** — ${displayMessage}`
            : `**⚠ ERROR:** ${displayMessage}\n\nConnection to analysis engine failed. Retry your query or type \`/clear\` to reset.`,
          timestamp: new Date(),
        };
        get().setMessages(prev => {
          const withoutPartial = hasAddedMsg ? prev.filter(m => m.id !== assistantMsgId) : prev;
          return [...withoutPartial, errorMsg];
        });
        get().setIsThinking(false);
        get().setStatusText('');
        get().setLiveToolCalls([]);
        clearTimeout(timer);
        get().setConnectionStatus('ready');
      },
    }, walletAddress, currentChatId, authSession?.token);

    if (streamCompleted && currentChatId && authSession) {
      // Only refresh from server if this is a persisted chat that needs sync verification.
      // This avoids a redundant fetchChatSession call when the stream onDone already gave us the answer.
      try {
        const session = await fetchChatSession(currentChatId, authSession.token);
        const savedCount = session.messages?.length || 0;
        if (savedCount >= previousPersistedCount + 2) {
          set({ persistedMessageCount: savedCount });
          get().setMessages(buildSessionMessages(currentChatId, session.messages || []));
          if (walletAddress) onRefreshChats();
        }
      } catch (err) {
        // Silently ignore refresh failures — the user already has the answer from the stream
        if (isRateLimitError(err)) {
          // Don't waste rate limit quota on non-essential refresh
          console.debug('Skipped post-stream session refresh due to rate limit');
        } else {
          console.error('Failed to refresh saved session:', err);
        }
      }
    }
  }
}));
