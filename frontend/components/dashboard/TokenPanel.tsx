import React from 'react';
import { TokenIntelligence } from '@/lib/types';
import { cn, formatPct, formatPrice, pctTone, MetricPill, PanelHeader } from './ui';

const TOKEN_CHOICES = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'];

export const TokenPanel = ({
  token,
  selectedToken,
  setSelectedToken,
  loading,
  onRunQuery,
}: {
  token: TokenIntelligence | null;
  selectedToken: string;
  setSelectedToken: (token: string) => void;
  loading: boolean;
  onRunQuery?: (query: string) => void;
}) => (
  <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
    <PanelHeader
      kicker="Token Intelligence"
      title={token ? `${token.asset.symbol} Movement` : `${selectedToken} Movement`}
      action={(
        <button
          type="button"
          onClick={() => onRunQuery?.(`Why is ${selectedToken} moving? Use token intelligence, relative strength, SoDEX liquidity, and news.`)}
          className="shrink-0 rounded-md border border-accent-cyan/35 bg-accent-cyan/[0.05] px-2.5 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-accent-cyan hover:border-accent-cyan/60 hover:bg-accent-cyan/10"
        >
          Ask
        </button>
      )}
    />

    <div className="mt-4 flex flex-wrap gap-2">
      {TOKEN_CHOICES.map((tokenSymbol) => (
        <button
          key={tokenSymbol}
          type="button"
          onClick={() => setSelectedToken(tokenSymbol)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors',
            selectedToken === tokenSymbol
              ? 'border-accent-green/60 bg-accent-green/[0.1] text-accent-green'
              : 'border-border/80 bg-black/20 text-text-secondary hover:border-accent-green/35 hover:text-white'
          )}
        >
          {tokenSymbol}
        </button>
      ))}
    </div>

    {loading && (
      <div className="mt-4 rounded-md border border-border/70 bg-white/[0.025] p-4 text-[10px] font-mono uppercase tracking-[0.16em] text-text-secondary">
        Loading token intelligence...
      </div>
    )}

    {!loading && token && (
      <>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricPill label="Price" value={formatPrice(token.snapshot.price)} tone="text-white" />
          <MetricPill label="24h" value={formatPct(token.snapshot.changePct24h)} tone={pctTone(token.snapshot.changePct24h)} />
          <MetricPill label="Vs BTC" value={formatPct(token.relative.toBtcPct)} tone={pctTone(token.relative.toBtcPct)} />
          <MetricPill label="SoDEX Spread" value={formatPct(token.sodex.perps?.spreadPct ?? token.sodex.spot?.spreadPct)} tone="text-accent-cyan" />
        </div>

        <div className="mt-4 space-y-2">
          {token.whyMoving.slice(0, 5).map((reason) => (
            <div
              key={reason}
              className="rounded-md border border-border/70 bg-black/20 px-3 py-2 text-[10px] font-mono leading-relaxed text-text-primary"
            >
              {reason}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <MetricPill label="30 Session" value={formatPct(token.trend.periodChangePct)} tone={pctTone(token.trend.periodChangePct)} />
          <MetricPill label="Trend" value={token.trend.trend || 'N/A'} tone="text-accent-purple" />
          <MetricPill label="Sector" value={token.relative.sector?.name || 'N/A'} tone="text-accent-amber" />
        </div>
      </>
    )}
  </section>
);
