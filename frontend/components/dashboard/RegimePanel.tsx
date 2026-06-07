import React from 'react';
import { MarketIntelligence } from '@/lib/types';
import { cn, formatPct, pctTone, MetricPill, PanelHeader } from './ui';

export const RegimePanel = ({
  data,
  onRunQuery,
}: {
  data: MarketIntelligence;
  onRunQuery?: (query: string) => void;
}) => {
  const regime = data.regime;
  const scoreWidth = Math.max(0, Math.min(100, regime.score));

  return (
    <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
      <PanelHeader
        kicker="Market Regime"
        title={regime.label}
        action={(
          <button
            type="button"
            onClick={() => onRunQuery?.('Give me a full market overview — BTC price, top movers, sector trends, and macro calendar.')}
            className="shrink-0 rounded-md border border-accent-green/35 bg-accent-green/[0.05] px-2.5 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-accent-green hover:border-accent-green/60 hover:bg-accent-green/10"
          >
            Ask
          </button>
        )}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricPill label="Confidence" value={`${regime.confidence}%`} tone="text-accent-cyan" />
        <MetricPill label="Breadth" value={formatPct(regime.breadthPct, 1)} tone={pctTone(regime.breadthPct - 50)} />
        <MetricPill label="Broad Avg" value={formatPct(regime.broadAveragePct)} tone={pctTone(regime.broadAveragePct)} />
        <MetricPill label="Dispersion" value={formatPct(regime.dispersionPct)} tone="text-accent-purple" />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[8px] font-mono uppercase tracking-[0.16em] text-text-secondary">
          <span>Risk Appetite Score</span>
          <span>{regime.score}/100</span>
        </div>
        <div className="h-2 overflow-hidden rounded-sm bg-white/[0.06]">
          <div
            className={cn(
              'h-full rounded-sm',
              regime.score >= 60 ? 'bg-accent-green' : regime.score >= 40 ? 'bg-accent-amber' : 'bg-accent-red'
            )}
            style={{ width: `${scoreWidth}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-accent-green">
            Drivers
          </div>
          <div className="space-y-2">
            {regime.drivers.slice(0, 4).map((driver) => (
              <div key={driver} className="text-left text-[10px] font-mono leading-relaxed text-text-primary/90">
                {driver}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-accent-amber">
            Watch
          </div>
          <div className="space-y-2">
            {regime.watch.slice(0, 4).map((item) => (
              <div key={item} className="text-[10px] font-mono leading-relaxed text-text-secondary">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
