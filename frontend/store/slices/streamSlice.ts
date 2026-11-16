import type { TerminalGet, TerminalSet } from './types';
import { Message, ToolCall, AuthSession, ConversationHistoryMessage, PersistedChatMessage } from '@/lib/types';
import { sendMessageStream, createChat, fetchChatSession, isRateLimitError } from '@/lib/api';

export const SIGN_IN_REQUIRED_MESSAGE =
  '**🔒 SIGN IN REQUIRED** — Connect your wallet and sign the login message to run analysis. Signing proves wallet ownership only; it never authorizes a transaction.';

export interface StreamSlice {
  messages: Message[];
  isThinking: boolean;
  statusText: string;
  liveToolCalls: ToolCall[];
  connectionStatus: 'idle' | 'waiting' | 'ready';
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsThinking: (isThinking: boolean) => void;
  setStatusText: (statusText: string) => void;
  setLiveToolCalls: (calls: ToolCall[] | ((prev: ToolCall[]) => ToolCall[])) => void;
  setConnectionStatus: (status: 'idle' | 'waiting' | 'ready') => void;
  streamController: AbortController | null;
  clearChatStream: (welcomeMessage: Message) => void;
  _handleSubmit: (
    text: string,
    walletAddress: string | null,
    authSession: AuthSession | null,
    activeChatId: string | null,
    onChatCreated: (chatId: string | null) => void,
    onRefreshChats: () => void,
    persistedMessageCount: number,
    setPersistedMessageCount: (count: number) => void,
    welcomeMessage: Message
  ) => Promise<void>;
}

export const createStreamSlice = (set: TerminalSet, get: TerminalGet): StreamSlice => ({
  messages: [],
  isThinking: false,
  statusText: '',
  liveToolCalls: [],
  connectionStatus: 'idle',
  streamController: null,
  
  setMessages: (updater) => set((state) => ({ 
    messages: typeof updater === 'function' ? updater(state.messages) : updater 
  })),
  setIsThinking: (isThinking) => set({ isThinking }),
  setStatusText: (statusText) => set({ statusText }),
  setLiveToolCalls: (updater) => set((state) => ({ 
    liveToolCalls: typeof updater === 'function' ? updater(state.liveToolCalls) : updater 
  })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  
  clearChatStream: (welcomeMessage) => {
    const { streamController } = get();
    if (streamController) {
      streamController.abort();
    }
    set({
      activeChatId: null,
      messages: [welcomeMessage],
      isThinking: false,
      statusText: '',
      liveToolCalls: [],
      connectionStatus: 'idle',
      streamController: null,
      persistedMessageCount: 0,
      input: '',
      historyIndex: -1
    });
  },

  _handleSubmit: async (text, walletAddress, authSession, activeChatId, onChatCreated, onRefreshChats, persistedMessageCount, setPersistedMessageCount, welcomeMessage) => {
    const state = get();
    if (!text.trim() || state.isThinking) return;

    // Chat runs paid model calls, so the backend requires a signed-in wallet session.
    if (!walletAddress || !authSession) {
      state.setMessages([...state.messages, {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      }, {
        id: `auth-${Date.now()}`,
        role: 'assistant',
        content: SIGN_IN_REQUIRED_MESSAGE,
        timestamp: new Date(),
      }]);
      return;
    }

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
    
    if (state.streamController) {
      state.streamController.abort();
    }
    const controller = new AbortController();
    set({ streamController: controller });

    const timer = setTimeout(() => get().setConnectionStatus('waiting'), 12000);

    const history: ConversationHistoryMessage[] = state.messages
      .filter((m: Message, idx: number) => !(idx === 0 && m.role === 'assistant'))
      .slice(-30)
      .map((m: Message) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    let currentChatId = activeChatId;
    const previousPersistedCount = persistedMessageCount;
    
    if (walletAddress && authSession && !currentChatId) {
      try {
        const titleText = text.length > 30 ? text.substring(0, 30) + '...' : text;
        const newChat = await createChat(walletAddress, authSession.token, titleText);
        currentChatId = newChat._id;
        onChatCreated(currentChatId);
        onRefreshChats();
      } catch (err) {
        console.error("Failed to create chat record", err);
        get().setMessages((prev: Message[]) => [...prev, {
          id: `warn-${Date.now()}`,
          role: 'assistant',
          content: '**⚠ ERROR:** Failed to initialize a new chat session. The backend may be unavailable.',
          timestamp: new Date(),
        }]);
        get().setIsThinking(false);
        get().setStatusText('');
        clearTimeout(timer);
        return;
      }
    }

    let streamCompleted = false;
    const assistantMsgId = `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let hasAddedMsg = false;

    await sendMessageStream(requestMessages, history, {
      onChunk: (text) => {
        if (!hasAddedMsg) {
          hasAddedMsg = true;
          get().setMessages((prev: Message[]) => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          }]);
        } else {
          get().setMessages((prev: Message[]) => prev.map((m: Message) => m.id === assistantMsgId ? { ...m, content: m.content + text } : m));
        }
      },
      onStatus: (phase, message) => get().setStatusText(message),
      onToolStart: (name) => get().setStatusText(`Querying ${name.replace(/_/g, ' ')}...`),
      onToolDone: (tool) => get().setLiveToolCalls((prev: ToolCall[]) => [...prev, tool]),
      onDone: (response) => {
        streamCompleted = true;
        if (hasAddedMsg) {
          get().setMessages((prev: Message[]) => prev.map((m: Message) => m.id === assistantMsgId ? { ...m, content: response.answer, toolCalls: response.toolCalls, analysisSynthesis: response.analysisSynthesis, tradeIdea: response.tradeIdea ?? null } : m));
        } else {
          get().setMessages((prev: Message[]) => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: response.answer,
            toolCalls: response.toolCalls,
            analysisSynthesis: response.analysisSynthesis,
            tradeIdea: response.tradeIdea ?? null,
            timestamp: new Date(),
          }]);
        }
        get().setIsThinking(false);
        get().setStatusText('');
        get().setLiveToolCalls([]);
        clearTimeout(timer);
        get().setConnectionStatus('ready');
        set({ streamController: null });
      },
      onError: (errorMessage) => {
        streamCompleted = false;

        const needsSignIn = /wallet session is required/i.test(errorMessage);
        const isRateLimit = /rate limit|too many requests|\b429\b/i.test(errorMessage);
        const displayMessage = isRateLimit
          ? 'The system is processing a high volume of requests. Please wait a moment and try again.'
          : errorMessage;

        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: needsSignIn
            ? SIGN_IN_REQUIRED_MESSAGE
            : isRateLimit
            ? `**⏳ PLEASE WAIT** — ${displayMessage}`
            : `**⚠ ERROR:** ${displayMessage}\n\nConnection to analysis engine failed. Retry your query or type \`/clear\` to reset.`,
          timestamp: new Date(),
        };
        get().setMessages((prev: Message[]) => {
          const withoutPartial = hasAddedMsg ? prev.filter(m => m.id !== assistantMsgId) : prev;
          return [...withoutPartial, errorMsg];
        });
        get().setIsThinking(false);
        get().setStatusText('');
        get().setLiveToolCalls([]);
        clearTimeout(timer);
        get().setConnectionStatus('ready');
        set({ streamController: null });
      },
    }, walletAddress, currentChatId, authSession?.token, controller.signal);

    if (streamCompleted && currentChatId && authSession) {
      try {
        const session = await fetchChatSession(currentChatId, authSession.token);
        const savedCount = session.messages?.length || 0;
        if (savedCount >= previousPersistedCount + 2) {
          setPersistedMessageCount(savedCount);
          
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
          
          get().setMessages(buildSessionMessages(currentChatId, session.messages || []));
          if (walletAddress) onRefreshChats();
        }
      } catch (err) {
        if (isRateLimitError(err)) {
          console.debug('Skipped post-stream session refresh due to rate limit');
        } else {
          console.error('Failed to refresh saved session:', err);
        }
      }
    }
  }
});
