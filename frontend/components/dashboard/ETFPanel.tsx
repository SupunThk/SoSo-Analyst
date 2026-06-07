'use client';

import React, { useEffect, useRef, useState } from 'react';
import { fetchSosoETFSummary, type SosoEtfSummary, isAbortError } from '@/lib/api';
import { PanelHeader, LoadingPanel, formatCompact } from './ui';

const ETF_POLL_INTERVAL_MS = 120_000; // 120s — ETF data changes slowly (daily)

export const ETFPanel = () => {
  const [data, setData] = useState<SosoEtfSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const latestDataRef = useRef<SosoEtfSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetchSosoETFSummary(controller.signal);
        if (res) {
          latestDataRef.current = res;
          setData(res);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        // On any error (including rate limit), keep showing stale data
        if (latestDataRef.current) {
          setData(latestDataRef.current);
        }
      } finally {
        setLoading(false);
      }
    };
    
    load();
    const interval = window.setInterval(load, ETF_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  if (loading) return <LoadingPanel />;

  const renderMetric = (
    label: string, 
    value: number | null | undefined, 
    prefix: string = '$', 
    tone: string = 'text-white'
  ) => {
    if (value == null || !Number.isFinite(value)) {
      return (
        <div className="bg-white/5 rounded-md p-3 border border-white/10 flex flex-col items-center justify-center">
          <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider mb-1">{label}</span>
          <span className="text-[10px] font-mono text-text-secondary/60 italic">Awaiting data…</span>
        </div>
      );
    }

    // Color inflow values based on sign
    const inflowTone = label.toLowerCase().includes('inflow') 
      ? (value >= 0 ? 'text-accent-green' : 'text-red-400')
      : tone;

    return (
      <div className="bg-white/5 rounded-md p-3 border border-white/10 flex flex-col items-center justify-center">
        <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider mb-1">{label}</span>
        <span className={`text-sm font-sans font-bold tabular-nums ${inflowTone}`}>
          {value < 0 ? '-' : ''}{prefix}{formatCompact(Math.abs(value))}
        </span>
      </div>
    );
  };

  return (
    <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)] flex flex-col justify-between">
      <PanelHeader kicker="Institutional Flows" title="ETF Dashboard" />
      <div className="mt-4 flex flex-col gap-4">
        {!data ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
              <svg className="animate-spin h-3.5 w-3.5 text-accent-green/60" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Synchronizing ETF data…</span>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {renderMetric('BTC Daily Net Inflow', data.btcDailyNetInflow, '$', 'text-accent-green')}
              {renderMetric('BTC Total Net Assets', data.btcTotalNetAssets)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {renderMetric('ETH Daily Net Inflow', data.ethDailyNetInflow, '$', 'text-accent-cyan')}
              {renderMetric('ETH Total Net Assets', data.ethTotalNetAssets)}
            </div>
            {(data.btcTotalVolume != null || data.ethTotalVolume != null) && (
              <div className="grid grid-cols-2 gap-3">
                {renderMetric('BTC Volume', data.btcTotalVolume, '$', 'text-accent-amber')}
                {renderMetric('ETH Volume', data.ethTotalVolume, '$', 'text-accent-amber')}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
