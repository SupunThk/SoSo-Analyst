'use client';

import React from 'react';
import type { TradeIdea } from '@/lib/types';
import { useSodexTrading } from './SodexTradingProvider';

// A signal from the analysis synthesis, with a one-click path to a pre-filled
// SoDEX order ticket. The user still sets size and confirms the order.
export default function TradeIdeaCard({ idea }: { idea: TradeIdea }) {
  const { openTicket, config } = useSodexTrading();
  if (config && !config.enabled) return null;

  const long = idea.side === 'long';
  const tone = long ? 'text-accent-green border-accent-green/30 bg-accent-green/[0.04]' : 'text-accent-red border-accent-red/30 bg-accent-red/[0.04]';

  return (
    <div className={`mx-4 mb-4 rounded-md border p-3 md:mx-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-wider">
          Signal: {idea.side} {idea.symbol}
          <span className="text-text-secondary"> · confidence {idea.confidence}{typeof idea.riskScore === 'number' ? ` · risk ${idea.riskScore}/100` : ''}</span>
        </div>
        <button
          type="button"
          onClick={() => openTicket({
            symbol: idea.symbol,
            side: idea.side,
            source: 'chat',
            rationale: idea.rationale,
            suggestedStopPct: idea.suggestedStopPct,
            context: `Analyst signal: ${idea.side} ${idea.symbol} (score ${idea.directionalScore}/100). Suggested stop-loss ${idea.suggestedStopPct}%.`,
          })}
          className="rounded-md border border-current px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
        >
          Open ticket on SoDEX
        </button>
      </div>
      {idea.rationale.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-sans text-xs text-text-secondary">
          {idea.rationale.map((line) => <li key={line}>• {line}</li>)}
        </ul>
      )}
      {idea.riskFlags.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 font-sans text-xs text-accent-amber">
          {idea.riskFlags.map((line) => <li key={line}>! {line}</li>)}
        </ul>
      )}
      <p className="mt-2 font-sans text-[10px] text-text-secondary">Not financial advice. You choose the size and confirm every order.</p>
    </div>
  );
}
