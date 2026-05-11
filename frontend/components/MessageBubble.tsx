'use client';

import React from 'react';
import { Message } from '@/lib/types';
import ToolCallBadge from './ToolCallBadge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  message: Message;
  isThinking?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isThinking }) => {
  const isUser = message.role === 'user';

  const formatTime = (date: Date) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toISOString().slice(11, 19) + ' UTC';
    } catch {
      return '';
    }
  };

  return (
    <div className={`group flex flex-col mb-6 ${isUser ? 'items-end' : 'items-start'} msg-enter`}>
      {/* Label row */}
      <div className={`flex items-center gap-2 mb-1 px-1 font-mono text-[9px] uppercase tracking-[0.15em] ${isUser ? 'flex-row-reverse text-text-secondary' : 'text-accent-green font-bold'}`}>
        <span>{isUser ? '> USER' : '◈ ANALYST'}</span>
        <span className="opacity-30">│</span>
        <span className="opacity-50 tabular-nums">{formatTime(message.timestamp)}</span>
      </div>

      {/* Message body */}
      <div
        className={`relative max-w-[92%] md:max-w-[82%] rounded-sm ${
          isUser
            ? 'bg-[#0A0F0A] border border-border border-r-2 border-r-text-secondary/40'
            : 'bg-[#060A06] border border-border border-l-2 border-l-accent-green/60 pulse-border-green'
        }`}
      >
        {/* Tool calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-3 pb-0 border-b border-border/50 mb-0">
            <span className="w-full text-[8px] font-mono text-text-secondary uppercase tracking-widest mb-1">
              ▸ DATA SOURCES QUERIED
            </span>
            {message.toolCalls.map((tool, idx) => (
              <ToolCallBadge key={idx} tool={tool} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-4 md:p-5">
          {isThinking ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-1 h-4 bg-accent-green/70 animate-pulse [animation-delay:-0.4s]" />
                <div className="w-1 h-4 bg-accent-green/50 animate-pulse [animation-delay:-0.2s]" />
                <div className="w-1 h-4 bg-accent-green/30 animate-pulse" />
              </div>
              <span className="text-[11px] font-mono text-accent-green uppercase tracking-[0.2em] animate-pulse">
                Querying data feeds...
              </span>
            </div>
          ) : isUser ? (
            <div className="text-[13px] md:text-sm font-mono leading-relaxed text-text-primary whitespace-pre-wrap">
              {message.content}
            </div>
          ) : (
            <div className="terminal-markdown text-[13px] md:text-sm font-sans leading-relaxed text-text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
