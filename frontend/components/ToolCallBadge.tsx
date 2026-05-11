import React from 'react';
import { ToolCall, ToolInputValue } from '@/lib/types';

interface ToolCallBadgeProps {
  tool: ToolCall;
}

const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ tool }) => {
  const formatInput = (input: Record<string, ToolInputValue>) => {
    return Object.entries(input)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  };

  return (
    <div className="flex items-center gap-2 border border-border bg-black/40 rounded-sm px-2 py-1 select-none transition-colors hover:border-accent-green/40">
      <div className={`w-1.5 h-1.5 rounded-full ${tool.status === 'success' ? 'bg-accent-green shadow-[0_0_4px_#00FF9D]' : 'bg-accent-amber animate-pulse'}`} />
      <span className="font-mono text-[9px] text-text-primary uppercase font-bold tracking-tight">
        {tool.name.replace(/_/g, ' ')}
      </span>
      {Object.keys(tool.input).length > 0 && (
        <span className="font-mono text-[9px] text-text-secondary truncate max-w-[150px]">
          {formatInput(tool.input)}
        </span>
      )}
    </div>
  );
};

export default ToolCallBadge;
