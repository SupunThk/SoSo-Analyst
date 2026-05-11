import React from 'react';
import { Message } from '@/lib/types';
import ToolCallBadge from './ToolCallBadge';

interface MessageBubbleProps {
  message: Message;
  isThinking?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isThinking }) => {
  const isUser = message.role === 'user';
  const timestampLabel = message.timestamp.toISOString().slice(11, 19) + ' UTC';

  return (
    <div className={`group flex flex-col mb-8 ${isUser ? 'items-end' : 'items-start animate-in fade-in slide-in-from-bottom-2 duration-300'}`}>
      <div className={`flex items-center gap-2 mb-1.5 px-1 font-mono text-[10px] uppercase tracking-wider ${isUser ? 'flex-row-reverse text-text-secondary' : 'text-accent-green font-bold'}`}>
        <span>{isUser ? 'User Request' : 'Analyst Response'}</span>
        <span className="text-[9px] opacity-40">•</span>
        <span className="opacity-60">{timestampLabel}</span>
      </div>

      <div className={`relative max-w-[90%] md:max-w-[80%] ${isUser ? 'bg-[#121212] border-r-2 border-r-text-secondary' : 'bg-surface/40 border-l-2 border-l-accent-green'}`}>
        <div className="absolute inset-0 bg-white/[0.02] pointer-events-none" />
        
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {message.toolCalls.map((tool, idx) => (
              <ToolCallBadge key={idx} tool={tool} />
            ))}
          </div>
        )}
        
        <div className="p-4 md:p-5">
          {isThinking ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-accent-amber rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-accent-amber rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-accent-amber rounded-full animate-bounce" />
              </div>
              <span className="text-xs font-mono text-accent-amber uppercase tracking-widest animate-pulse">
                Querying Distributed Nodes...
              </span>
            </div>
          ) : (
            <div className="text-[13px] md:text-sm font-sans leading-relaxed text-text-primary whitespace-pre-wrap selection:bg-accent-green selection:text-black">
              {message.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
