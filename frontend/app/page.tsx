'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/Header';
import SuggestedQuestions from '@/components/SuggestedQuestions';
import MessageBubble from '@/components/MessageBubble';
import { Message, ConversationHistoryMessage } from '@/lib/types';
import { sendMessage } from '@/lib/api';

const WELCOME_TIMESTAMP = new Date('2026-01-01T00:00:00.000Z');

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "SYSTEM INITIALIZED. I am SoSo Analyst. Accessing real-time crypto markets, ETF flows, and macroeconomic data.\n\nType a command or select a quick query below to begin analysis.",
      timestamp: WELCOME_TIMESTAMP
    }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'waiting' | 'ready'>('idle');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const text = overrideText || input;
    if (!text.trim() || isThinking) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const timer = setTimeout(() => {
      setConnectionStatus('waiting');
    }, 4000);

    try {
      const history: ConversationHistoryMessage[] = messages
        .filter((m, idx) => !(idx === 0 && m.role === 'assistant'))
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

      const res = await sendMessage([...messages, userMsg], history);
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        toolCalls: res.toolCalls,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `CRITICAL ERROR: ${errorMessage}. Connection to analysis engine failed.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      clearTimeout(timer);
      setIsThinking(false);
      setConnectionStatus('ready');
    }
  };

  return (
    <main className="flex flex-col h-screen max-h-screen bg-background text-text-primary overflow-hidden font-sans">
      <Header />
      
      {/* Analysis Feed */}
      <div className="flex-1 overflow-y-auto pt-8 pb-40 px-6">
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
            <div className="flex items-center justify-center gap-2 text-[10px] text-accent-amber font-mono mt-8 p-3 border border-accent-amber/20 bg-accent-amber/5 rounded animate-pulse">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>NETWORK LATENCY DETECTED. RE-ESTABLISHING SECURE HANDSHAKE...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Control Console */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-12 pb-8 px-6 z-10">
        <div className="max-w-4xl mx-auto">
          <SuggestedQuestions onSelect={(q) => handleSubmit(undefined, q)} />
          
          <form 
            onSubmit={handleSubmit}
            className="group relative flex items-center bg-[#0D0D0D] border border-border rounded-sm focus-within:border-accent-green transition-all shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          >
            <div className="pl-4 flex items-center">
              <span className="text-accent-green font-mono text-sm select-none tracking-widest">&gt;</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ENTER COMMAND OR QUERY..."
              className="flex-1 bg-transparent px-3 py-4 text-[13px] font-mono focus:outline-none placeholder:text-text-secondary placeholder:text-[11px] placeholder:tracking-[0.1em] text-white"
            />
            <button
              type="submit"
              disabled={isThinking || !input.trim()}
              className="mr-2 px-3 py-2 text-accent-green hover:bg-accent-green hover:text-black disabled:text-text-secondary disabled:hover:bg-transparent transition-all font-mono text-[10px] font-bold tracking-tighter"
            >
              [ EXECUTE ]
            </button>
            
            {/* Scanline effect for input */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_2px,3px_100%] opacity-20" />
          </form>
          
          <div className="flex justify-between items-center mt-3 px-1">
            <span className="text-[9px] text-text-secondary font-mono tracking-widest uppercase">
              Terminal System Status: <span className="text-accent-green italic">Optimal</span>
            </span>
            <span className="text-[9px] text-text-secondary font-mono uppercase">
              Shift + Enter for multi-line block
            </span>
          </div>
        </div>
      </div>
      
      {/* Global Terminal Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02)_0%,transparent_100%)] mix-blend-overlay" />
    </main>
  );
}
