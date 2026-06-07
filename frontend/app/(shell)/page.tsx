'use client';

import { useRef, useEffect, useCallback } from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { AnimatePresence, motion } from 'framer-motion';
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

  const isEmptyState = messages.length === 1 && messages[0].id === 'welcome' && !isThinking;
  const visibleMessages = messages.filter((message) => message.id !== 'welcome');

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

        {/* Control Console */}
        <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-4 md:pt-6 pb-4 md:pb-6 px-4 md:px-6 z-10 border-t border-border/40 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
          <div className="max-w-4xl mx-auto">
            {!isEmptyState && (
              <SuggestedQuestions onSelect={(q) => onSubmit(undefined, q)} />
            )}

            <form
              onSubmit={onSubmit}
              aria-label="Analysis command"
              className="group relative flex items-center bg-[#060A06] border border-border/90 rounded-md focus-within:border-accent-green/55 focus-within:shadow-[0_0_0_1px_rgba(0,255,157,0.12),0_10px_40px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] duration-300 shadow-[0_4px_28px_rgba(0,0,0,0.45)] border-glow-green"
            >
              <div className="pl-3 md:pl-4 flex items-center">
                <span className="text-accent-green font-mono text-sm select-none tracking-widest text-glow-green font-bold">
                  &gt;
                </span>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="ENTER COMMAND OR QUERY..."
                aria-label="Command or query"
                aria-busy={isThinking}
                className="min-w-0 flex-1 bg-transparent px-3 py-3.5 md:py-4 text-[12px] md:text-[13px] font-mono focus:outline-none placeholder:text-text-secondary placeholder:text-[10px] md:placeholder:text-[11px] placeholder:tracking-[0.1em] text-white caret-accent-green"
                autoComplete="off"
                spellCheck={false}
              />
              <Tooltip title={isThinking ? 'Analysis in progress' : 'Execute query'} arrow>
              <span className="mr-2 md:mr-3 shrink-0">
              <Button
                type="submit"
                disabled={isThinking || !input.trim()}
                aria-label={isThinking ? 'Analysis in progress' : 'Execute query'}
                variant="outlined"
                color="primary"
                size="small"
                sx={{
                  minWidth: { xs: 42, sm: 88 },
                  height: 31,
                  fontSize: 10,
                  bgcolor: 'rgba(0,255,157,0.04)',
                  borderColor: 'rgba(0,255,157,0.35)',
                  boxShadow: '0 0 0 rgba(0,255,157,0)',
                  '&:hover': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    borderColor: 'primary.main',
                    boxShadow: '0 0 24px rgba(0,255,157,0.2)',
                  },
                }}
              >
                <span className="hidden sm:inline">EXECUTE</span>
                <span className="sm:hidden">GO</span>
              </Button>
              </span>
              </Tooltip>

              {/* Subtle scanline on input */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,255,157,0.012)_50%,transparent_50%)] bg-[length:100%_4px] opacity-40 rounded-md" />
            </form>

            <div className="flex justify-between items-center mt-2 md:mt-2.5 px-1">
              <span className="text-[8px] text-text-secondary font-mono tracking-[0.15em] uppercase">
                Session Active <span className="text-accent-green">●</span>
              </span>
              <div className="flex items-center gap-3 md:gap-4">
                <button
                  type="button"
                  onClick={openManual}
                  className="text-[8px] text-text-secondary font-mono tracking-widest uppercase rounded-sm px-1.5 py-1 hover:text-accent-green hover:bg-white/[0.04] transition-colors"
                >
                  [/HELP]
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[8px] text-text-secondary font-mono tracking-widest uppercase rounded-sm px-1.5 py-1 hover:text-accent-amber hover:bg-white/[0.04] transition-colors"
                >
                  [/CLEAR]
                </button>
                <span className="text-[8px] text-text-secondary font-mono tracking-widest uppercase hidden md:block">
                  ↑↓ HISTORY
                </span>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}
