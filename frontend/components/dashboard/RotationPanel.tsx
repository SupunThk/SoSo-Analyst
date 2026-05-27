import React from 'react';
import { MarketIntelligence } from '@/lib/types';
import { cn, formatPct, PanelHeader, RotationRowBar } from './ui';

export const RotationPanel = ({ data }: { data: MarketIntelligence }) => {
  const rows = data.rotation.sectors
    .filter((row) => typeof row.changePct24h === 'number')
    .slice(0, 16);
  const maxAbs = rows.reduce((max, row) => Math.max(max, Math.abs(row.changePct24h || 0)), 1);

  return (
    <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
      <PanelHeader kicker="Index Rotation Map" title="Sector Heat" />

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <RotationRowBar key={`${row.kind}-${row.name}`} row={row} maxAbs={maxAbs} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-accent-green">
            Leaders
          </div>
          <div className="space-y-1.5">
            {data.rotation.leaders.slice(0, 4).map((row) => (
              <div
                key={`leader-${row.name}-${row.ticker || ''}`}
                className="flex items-center justify-between gap-3 rounded-md border border-accent-green/15 bg-accent-green/[0.035] px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-[10px] font-mono text-white">{row.name}</span>
                <span className="shrink-0 text-[10px] font-mono font-bold text-accent-green">{formatPct(row.changePct24h)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-accent-red">
            Laggards
          </div>
          <div className="space-y-1.5">
            {data.rotation.laggards.slice(0, 4).map((row) => (
              <div
                key={`laggard-${row.name}-${row.ticker || ''}`}
                className="flex items-center justify-between gap-3 rounded-md border border-accent-red/15 bg-accent-red/[0.035] px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-[10px] font-mono text-white">{row.name}</span>
                <span className="shrink-0 text-[10px] font-mono font-bold text-accent-red">{formatPct(row.changePct24h)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.rotation.signals.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.rotation.signals.slice(0, 3).map((signal, index) => (
            <div
              key={`${signal.label}-${signal.detail}-${index}`}
              className={cn(
                'rounded-md border px-3 py-2 text-[10px] font-mono leading-relaxed',
                signal.severity === 'negative'
                  ? 'border-accent-red/20 bg-accent-red/[0.035] text-accent-red'
                  : signal.severity === 'positive'
                    ? 'border-accent-green/20 bg-accent-green/[0.035] text-accent-green'
                    : 'border-accent-amber/20 bg-accent-amber/[0.035] text-accent-amber'
              )}
            >
              {signal.detail}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
