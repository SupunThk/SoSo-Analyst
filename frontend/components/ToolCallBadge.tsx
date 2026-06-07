'use client';

import React, { useState } from 'react';
import { ToolCall, ToolInputValue } from '@/lib/types';

interface ToolCallBadgeProps {
  tool?: ToolCall | null;
}

const TOOL_COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  get_market_intelligence: { dot: 'bg-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/5', label: '🧭' },
  get_token_intelligence: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '🔎' },
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
  get_token_economics: { dot: 'bg-violet-400', border: 'border-violet-400/30', bg: 'bg-violet-400/5', label: '🪙' },
  get_trading_pairs: { dot: 'bg-sky-400', border: 'border-sky-400/30', bg: 'bg-sky-400/5', label: '🔄' },
  get_index_overview: { dot: 'bg-indigo-400', border: 'border-indigo-400/30', bg: 'bg-indigo-400/5', label: '📋' },
  get_analysis_charts: { dot: 'bg-teal-400', border: 'border-teal-400/30', bg: 'bg-teal-400/5', label: '📉' },
  get_macro_event_history: { dot: 'bg-purple-400', border: 'border-purple-400/30', bg: 'bg-purple-400/5', label: '📅' },
  get_sodex_markets: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📘' },
  get_sodex_orderbook: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📖' },
  get_sodex_analytics: { dot: 'bg-accent-cyan', border: 'border-accent-cyan/30', bg: 'bg-accent-cyan/5', label: '📊' },
};

const DEFAULT_COLORS = { dot: 'bg-accent-green', border: 'border-accent-green/30', bg: 'bg-accent-green/5', label: '⚡' };

const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const toolName = tool?.name || 'unknown_tool';
  const rawInput = tool?.input;
  const toolInput =
    rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? rawInput
      : {};
  const colors = TOOL_COLORS[toolName] || DEFAULT_COLORS;

  const formatInput = (input: Record<string, ToolInputValue>) => {
    return Object.entries(input)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  };

  const isSuccess = tool?.status === 'success';
  const hasInput = Object.keys(toolInput).length > 0;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 border ${colors.border} ${colors.bg} rounded-md px-2.5 py-1.5 select-none transition-[filter,border-color,box-shadow] duration-200 hover:brightness-110 hover:shadow-[0_2px_12px_rgba(0,0,0,0.35)] cursor-pointer`}
      >
        <span className="text-[10px]">{colors.label}</span>
        <div className={`relative w-1.5 h-1.5 rounded-full ${isSuccess ? colors.dot : 'bg-accent-red'} ${isSuccess ? `shadow-[0_0_4px_currentColor]` : 'animate-pulse'}`} />
        <span className="font-mono text-[9px] text-text-primary uppercase font-bold tracking-tight">
          {toolName.replace(/_/g, ' ')}
        </span>
        {hasInput && (
          <span className="font-mono text-[9px] text-text-secondary truncate max-w-[120px]">
            ({formatInput(toolInput)})
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
        <div className={`mt-1 border ${colors.border} ${colors.bg} rounded-md px-3 py-2 font-mono text-[10px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto custom-scrollbar shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
          <span className="text-text-primary font-bold">RESULT: </span>
          {tool?.result}
        </div>
      )}
    </div>
  );
};

export default ToolCallBadge;
