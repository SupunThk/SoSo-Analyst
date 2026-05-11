'use client';

import React, { useState } from 'react';
import { ToolCall, ToolInputValue } from '@/lib/types';

interface ToolCallBadgeProps {
  tool: ToolCall;
}

const TOOL_COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  get_asset_snapshot: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📊' },
  get_asset_price_history: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📈' },
  compare_assets: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '⚖️' },
  get_currency_market_snapshot: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📊' },
  get_currency_klines: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📈' },
  get_asset_news_brief: { dot: 'bg-accent-amber', border: 'border-accent-amber/30', bg: 'bg-accent-amber/5', label: '📰' },
  get_hot_news_digest: { dot: 'bg-accent-amber', border: 'border-accent-amber/30', bg: 'bg-accent-amber/5', label: '📰' },
  search_news: { dot: 'bg-accent-amber', border: 'border-accent-amber/30', bg: 'bg-accent-amber/5', label: '📰' },
  get_etf_flow_brief: { dot: 'bg-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/5', label: '💹' },
  get_macro_crypto_calendar: { dot: 'bg-purple-400', border: 'border-purple-400/30', bg: 'bg-purple-400/5', label: '🏛️' },
  get_crypto_equities_watchlist: { dot: 'bg-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/5', label: '💼' },
  get_btc_treasury_brief: { dot: 'bg-orange-400', border: 'border-orange-400/30', bg: 'bg-orange-400/5', label: '🏦' },
  get_btc_purchase_history_brief: { dot: 'bg-orange-400', border: 'border-orange-400/30', bg: 'bg-orange-400/5', label: '🏦' },
  get_sector_spotlight: { dot: 'bg-pink-400', border: 'border-pink-400/30', bg: 'bg-pink-400/5', label: '🔥' },
  get_fundraising_overview: { dot: 'bg-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/5', label: '💰' },
};

const DEFAULT_COLORS = { dot: 'bg-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/5', label: '⚡' };

const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const colors = TOOL_COLORS[tool.name] || DEFAULT_COLORS;

  const formatInput = (input: Record<string, ToolInputValue>) => {
    return Object.entries(input)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  };

  const isSuccess = tool.status === 'success';

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 border ${colors.border} ${colors.bg} rounded px-2.5 py-1.5 select-none transition-all hover:brightness-125 cursor-pointer`}
      >
        <span className="text-[10px]">{colors.label}</span>
        <div className={`relative w-1.5 h-1.5 rounded-full ${isSuccess ? colors.dot : 'bg-accent-red'} ${isSuccess ? `shadow-[0_0_4px_currentColor]` : 'animate-pulse'}`} />
        <span className="font-mono text-[9px] text-text-primary uppercase font-bold tracking-tight">
          {tool.name.replace(/_/g, ' ')}
        </span>
        {Object.keys(tool.input).length > 0 && (
          <span className="font-mono text-[9px] text-text-secondary truncate max-w-[120px]">
            ({formatInput(tool.input)})
          </span>
        )}
        <span className={`font-mono text-[9px] ml-1 ${isSuccess ? 'text-accent-green' : 'text-accent-red'}`}>
          {isSuccess ? '✓' : '✗'}
        </span>
        <svg
          className={`w-2.5 h-2.5 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className={`mt-1 border ${colors.border} ${colors.bg} rounded px-3 py-2 font-mono text-[10px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto`}>
          <span className="text-text-primary font-bold">RESULT: </span>
          {tool.result}
        </div>
      )}
    </div>
  );
};

export default ToolCallBadge;
