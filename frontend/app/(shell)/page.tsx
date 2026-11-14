'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/components/ui/Icon';
import { AnimatePresence, motion } from 'motion/react';
import SuggestedQuestions from '@/components/SuggestedQuestions';
import MessageBubble from '@/components/MessageBubble';
import HeroState from '@/components/HeroState';

import { useAuth } from '@/hooks/useAuth';
import { useTerminalStore, WELCOME_MESSAGE } from '@/store/useTerminalStore';


export default function Home() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { walletAddress, authSession, handleWalletConnect, handleLogout } = useAuth();
  
  const {
    activeChatId, setActiveChatId, loadChats,
    input, setInput, addCommand, handleKeyDown,
    messages, setMessages, isThinking, statusText, liveToolCalls, connectionStatus,
    handleMessageFeedback, handleSubmit
  } = useTerminalStore();

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    useTerminalStore.setState({ persistedMessageCount: 0 });
    setMessages([WELCOME_MESSAGE]);
  }, [setActiveChatId, setMessages]);

  const handleClear = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  // The store starts with no messages until a chat is reset or loaded, so
  // "empty" means no real messages rather than "exactly the welcome message".
  const visibleMessages = messages.filter((message) => message.id !== 'welcome');
  const isEmptyState = visibleMessages.length === 0 && !isThinking;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, liveToolCalls]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const openManual = () => window.dispatchEvent(new CustomEvent('soso:open-manual'));

  const onWalletConnect = (conn: import('@/lib/types').WalletConnection) => handleWalletConnect(conn);

  const onFeedback = (messageId: string, rating: import('@/lib/types').MessageFeedbackRating) => {
    handleMessageFeedback(messageId, rating, activeChatId, authSession);
  };

  const onSubmit = (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const text = overrideText || input;
    if (!text.trim() || isThinking) return;

    if (text.trim().toLowerCase() === '/clear') {
      setInput('');
      handleClear();
      return;
    }

    if (text.trim().toLowerCase() === '/help') {
      setInput('');
      openManual();
      return;
    }

    addCommand(text);
    setInput('');
    
    handleSubmit(
      text, 
      walletAddress, 
      authSession, 
      activeChatId, 
      setActiveChatId, 
      () => { if (walletAddress && authSession) loadChats(walletAddress, authSession.token, handleLogout); }
    );
  };

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isThinking ? statusText || 'Analyzing your query' : ''}
      </div>

      {/* ═══════ EMPTY STATE: HERO SECTION ═══════ */}
        <AnimatePresence mode="wait">
        {isEmptyState ? (
          <motion.div
            key="hero"
            className="flex min-h-0 flex-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <HeroState 
              onRunQuery={(q) => onSubmit(undefined, q)} 
              onOpenManual={openManual} 
              onConnectWallet={onWalletConnect}
              walletAddress={walletAddress} 
            />
          </motion.div>
        ) : (
          /* ═══════ CONVERSATION VIEW ═══════ */
          <motion.div
            key="conversation"
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth pt-6 pb-8 px-4 md:px-6 relative z-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <div className="max-w-4xl mx-auto">
              {visibleMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  canRate={
                    Boolean(activeChatId && authSession) &&
                    m.role === 'assistant' &&
                    m.id !== 'welcome' &&
                    m.persistedIndex !== undefined
                  }
                  onFeedback={(rating) => onFeedback(m.id, rating)}
                />
              ))}
              {isThinking && (
                <MessageBubble
                  message={{
                    id: 'thinking',
                    role: 'assistant',
                    content: '',
                    toolCalls: liveToolCalls,
                    timestamp: new Date(),
                  }}
                  isThinking={true}
                  statusText={statusText}
                />
              )}

              {connectionStatus === 'waiting' && isThinking && (
                <div className="flex items-center justify-center gap-2.5 text-[10px] text-accent-amber font-mono mt-6 p-3.5 border border-accent-amber/25 bg-gradient-to-r from-accent-amber/[0.06] via-accent-amber/[0.04] to-accent-amber/[0.06] rounded-md shadow-[inset_0_1px_0_rgba(255,184,0,0.12)] animate-pulse">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>NETWORK LATENCY DETECTED — RE-ESTABLISHING SECURE HANDSHAKE...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Composer */}
        <div className="relative z-10 shrink-0 border-t border-border/60 bg-background/90 px-3 pt-3 pb-3 backdrop-blur-md sm:px-6 md:pt-4 md:pb-4">
          <div className="mx-auto max-w-4xl">
            {!isEmptyState && (
              <SuggestedQuestions onSelect={(q) => onSubmit(undefined, q)} />
            )}

            <form
              onSubmit={onSubmit}
              aria-label="Analysis command"
              className="group relative flex items-center gap-2 rounded-xl border border-border-bright/70 bg-surface p-1.5 pl-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-200 focus-within:border-accent-green/60 focus-within:shadow-[0_0_0_3px_rgba(0,255,157,0.08),0_8px_32px_rgba(0,0,0,0.45)] md:pl-4"
            >
              <span className="select-none font-mono text-sm font-bold text-accent-green" aria-hidden>
                &gt;
              </span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about markets, tokens or ETF flows…"
                aria-label="Command or query"
                aria-busy={isThinking}
                className="min-w-0 flex-1 bg-transparent py-2.5 font-sans text-[15px] text-white caret-accent-green placeholder:text-text-secondary/80 focus:outline-none md:py-3"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="send"
              />
              <Tooltip title={isThinking ? 'Analysis in progress' : 'Run analysis (Enter)'} className="shrink-0">
                <button
                  type="submit"
                  disabled={isThinking || !input.trim()}
                  aria-label={isThinking ? 'Analysis in progress' : 'Run analysis'}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-green px-3 font-sans text-sm font-semibold text-[#03140c] transition-[background-color,box-shadow,opacity] hover:shadow-[0_0_20px_rgba(0,255,157,0.3)] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-text-secondary disabled:shadow-none sm:px-4"
                >
                  <span className="hidden sm:inline">{isThinking ? 'Working' : 'Analyze'}</span>
                  <Icon name="arrowRight" size={16} strokeWidth={2.25} />
                </button>
              </Tooltip>
            </form>

            <div className="mt-2 flex items-center justify-between gap-3 px-1 font-mono text-[11px] text-text-secondary">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" aria-hidden />
                <span className="truncate">
                  {isThinking ? statusText || 'Analyzing…' : (
                    <>Live data<span className="hidden sm:inline"> · answers cite SoSoValue sources</span></>
                  )}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={openManual}
                  className="rounded px-1.5 py-1 transition-colors hover:bg-white/[0.05] hover:text-accent-green"
                >
                  /help
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded px-1.5 py-1 transition-colors hover:bg-white/[0.05] hover:text-accent-amber"
                >
                  /clear
                </button>
                <span className="hidden px-1.5 md:inline">↑↓ history</span>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}
