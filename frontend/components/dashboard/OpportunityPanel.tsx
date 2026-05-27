import React from 'react';
import { MarketIntelligence } from '@/lib/types';
import { PanelHeader } from './ui';

export const OpportunityPanel = ({
  data,
  onRunQuery,
}: {
  data: MarketIntelligence;
  onRunQuery?: (query: string) => void;
}) => (
  <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
    <PanelHeader
      kicker="Opportunity Scanner"
      title="Ranked Signals"
      action={(
        <button
          type="button"
          onClick={() => onRunQuery?.('Show me the opportunity scanner with exact evidence and risks.')}
          className="shrink-0 rounded-md border border-accent-amber/35 bg-accent-amber/[0.05] px-2.5 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-accent-amber hover:border-accent-amber/60 hover:bg-accent-amber/10"
        >
          Ask
        </button>
      )}
    />

    <div className="mt-4 space-y-2">
      {data.opportunities.slice(0, 5).map((opportunity) => (
        <div
          key={opportunity.id}
          className="rounded-md border border-border/70 bg-black/20 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-mono font-bold text-white">
                {opportunity.title}
              </div>
              <div className="mt-1 truncate text-[8px] font-mono uppercase tracking-[0.16em] text-text-secondary">
                {opportunity.type} / {opportunity.bias}
              </div>
            </div>
            <div className="shrink-0 rounded-md border border-accent-green/25 bg-accent-green/[0.06] px-2 py-1 text-[11px] font-mono font-bold text-accent-green">
              {opportunity.score}
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            {opportunity.evidence.slice(0, 3).map((fact) => (
              <div key={fact} className="min-w-0 truncate text-[9px] font-mono text-text-primary">
                {fact}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] font-mono leading-relaxed text-text-secondary">
            {opportunity.nextStep}
          </div>
        </div>
      ))}
    </div>
  </section>
);
