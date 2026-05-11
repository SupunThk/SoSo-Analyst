'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import SuggestedQuestions from '@/components/SuggestedQuestions';
import MessageBubble from '@/components/MessageBubble';
import TerminalBoot from '@/components/TerminalBoot';
import { Message, ConversationHistoryMessage } from '@/lib/types';
import { sendMessage } from '@/lib/api';

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "**SYSTEM INITIALIZED** — SoSo Analyst v2.0 online.\n\nConnected to real-time crypto markets, ETF flows, macro events, and treasury data via SoSoValue API.\n\n---\n\nType a query or select a command below to begin analysis.\n\nAvailable commands:\n- `/clear` — Reset terminal session\n- `↑` / `↓` — Navigate command history",
  timestamp: new Date(),
};

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'waiting' | 'ready'>('idle');

  // Command history
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Focus input after boot
  useEffect(() => {
    if (!booting) {
      inputRef.current?.focus();
    }
  }, [booting]);

  const handleBootComplete = useCallback(() => {
    setBooting(false);
  }, []);

  const handleClear = () => {
    setMessages([
      {
        id: `clear-${Date.now()}`,
        role: 'assistant',
        content: '**TERMINAL CLEARED** — Session reset. All previous context purged.\n\nReady for new queries.',
        timestamp: new Date(),
      },
    ]);
  };

  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const text = overrideText || input;
    if (!text.trim() || isThinking) return;

    // Handle /clear command
    if (text.trim().toLowerCase() === '/clear') {
      setInput('');
      handleClear();
      return;
    }

    // Add to command history
    setCommandHistory(prev => [text, ...prev].slice(0, 50));
    setHistoryIndex(-1);

    const userMsg: Message = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const timer = setTimeout(() => {
      setConnectionStatus('waiting');
    }, 6000);

    try {
      const history: ConversationHistoryMessage[] = messages
        .filter((m, idx) => !(idx === 0 && m.role === 'assistant'))
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));

      const res = await sendMessage([...messages, userMsg], history);

      const assistantMsg: Message = {
        id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: res.answer,
        toolCalls: res.toolCalls,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `**⚠ ERROR:** ${errorMessage}\n\nConnection to analysis engine failed. Retry your query or type \`/clear\` to reset.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      clearTimeout(timer);
      setIsThinking(false);
      setConnectionStatus('ready');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  };

  if (booting) {
    return <TerminalBoot onComplete={handleBootComplete} />;
  }

  return (
    <main className="flex flex-col h-screen max-h-screen bg-background text-text-primary overflow-hidden font-sans matrix-grid">
      <Header />

      {/* Analysis Feed */}
      <div className="flex-1 overflow-y-auto pt-6 pb-44 px-6">
        <div className="max-w-4xl mx-auto">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isThinking && (
            <MessageBubble
              message={{ id: 'thinking', role: 'assistant', content: '', timestamp: new Date() }}
              isThinking={true}
            />
          )}

          {connectionStatus === 'waiting' && isThinking && (
            <div className="flex items-center justify-center gap-2 text-[10px] text-accent-amber font-mono mt-6 p-3 border border-accent-amber/20 bg-accent-amber/5 rounded-sm animate-pulse">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>NETWORK LATENCY DETECTED — RE-ESTABLISHING SECURE HANDSHAKE...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Control Console */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/98 to-transparent pt-10 pb-6 px-6 z-10">
        <div className="max-w-4xl mx-auto">
          <SuggestedQuestions onSelect={(q) => handleSubmit(undefined, q)} />

          <form
            onSubmit={handleSubmit}
            className="group relative flex items-center bg-[#060A06] border border-border rounded-sm focus-within:border-accent-green/60 transition-all shadow-[0_4px_30px_rgba(0,0,0,0.6)] border-glow-green"
          >
            <div className="pl-4 flex items-center">
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
                setHistoryIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="ENTER COMMAND OR QUERY..."
              className="flex-1 bg-transparent px-3 py-4 text-[13px] font-mono focus:outline-none placeholder:text-text-secondary placeholder:text-[11px] placeholder:tracking-[0.1em] text-white caret-accent-green"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={isThinking || !input.trim()}
              className="mr-3 px-4 py-1.5 text-accent-green border border-accent-green/30 hover:bg-accent-green hover:text-black disabled:text-text-secondary disabled:border-border disabled:hover:bg-transparent transition-all font-mono text-[10px] font-bold tracking-tight rounded-sm"
            >
              EXECUTE
            </button>

            {/* Subtle scanline on input */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,255,157,0.01)_50%,transparent_50%)] bg-[length:100%_4px] opacity-30 rounded-sm" />
          </form>

          <div className="flex justify-between items-center mt-2.5 px-1">
            <span className="text-[8px] text-text-secondary font-mono tracking-[0.15em] uppercase">
              Session Active <span className="text-accent-green">●</span>
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={handleClear}
                className="text-[8px] text-text-secondary font-mono tracking-widest uppercase hover:text-accent-amber transition-colors"
              >
                [/CLEAR]
              </button>
              <span className="text-[8px] text-text-secondary font-mono tracking-widest uppercase">
                ↑↓ HISTORY
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CRT Overlays */}
      <div className="crt-overlay" />
      <div className="crt-vignette" />
    </main>
  );
}
