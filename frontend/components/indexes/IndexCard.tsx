'use client';

import React, { useEffect, useRef, useState } from 'react';
import { fetchSosoIndexSnapshot, fetchSosoIndexConstituents, fetchSosoIndexKlines } from '@/lib/api';
import SparklineChart from './SparklineChart';
import ConstituentBar from './ConstituentBar';

type IndexSnapshot = Record<string, unknown>;
type ConstituentRow = Record<string, unknown>;

interface IndexCardProps {
  ticker: string;
  index?: number;
  initialSnapshot?: unknown;
}

const SSI_BUY_URL = 'https://ssi.sosovalue.com/';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const unwrapData = (payload: unknown) =>
  isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const recordArray = (value: unknown): ConstituentRow[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const hasSnapshotDetail = (value: unknown) => isRecord(value) && [
  value.price,
  value.change_pct_24h,
  value.changePct24h,
  value.roi_7d,
  value.roi_1m,
  value.ytd,
].some((item) => item !== undefined && item !== null);

export const IndexCard: React.FC<IndexCardProps> = ({ ticker, index = 0, initialSnapshot = null }) => {
  const initialSnapshotRecord = isRecord(initialSnapshot) ? initialSnapshot : null;
  const cardRef = useRef<HTMLElement | null>(null);
  const loadedTickerRef = useRef<string | null>(null);
  const [shouldLoadDetails, setShouldLoadDetails] = useState(false);
  const [snapshot, setSnapshot] = useState<IndexSnapshot | null>(initialSnapshotRecord);
  const [constituents, setConstituents] = useState<ConstituentRow[]>([]);
  const [klinesPrices, setKlinesPrices] = useState<number[]>([]);
  const [klinesMeta, setKlinesMeta] = useState<{ high: number; low: number; volume: number } | null>(null);
  const [loading, setLoading] = useState(!initialSnapshotRecord);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (shouldLoadDetails) return;

    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoadDetails(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadDetails(true);
        observer.disconnect();
      }
    }, { rootMargin: '360px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoadDetails]);

  useEffect(() => {
    if (!shouldLoadDetails || loadedTickerRef.current === ticker) return;

    let cancelled = false;
    const load = async () => {
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(index * 350, 3500)));
      }
      if (cancelled) return;

      try {
        loadedTickerRef.current = ticker;
        const needsSnapshot = !hasSnapshotDetail(snapshot);
        const [snapRes, constRes, klinesRes] = await Promise.all([
          needsSnapshot ? fetchSosoIndexSnapshot(ticker).catch(() => null) : Promise.resolve(null),
          fetchSosoIndexConstituents(ticker).catch(() => null),
          fetchSosoIndexKlines(ticker).catch(() => null),
        ]);

        if (!cancelled) {
          // Snapshot: try data directly or nested
          const snap = unwrapData(snapRes);
          if (isRecord(snap)) setSnapshot(snap);

          // Constituents
          const constData = unwrapData(constRes);
          const constituentRows = recordArray(constData);
          if (constituentRows.length > 0) setConstituents(constituentRows);

          // Klines
          const klinesData = unwrapData(klinesRes);
          if (Array.isArray(klinesData) && klinesData.length > 0) {
            const prices = klinesData
              .map((row) => isRecord(row) ? firstNumber(row.close, row.price, row.value) : null)
              .filter((value): value is number => typeof value === 'number');
            setKlinesPrices(prices);

            // Extract high/low/volume from klines
            const highs = klinesData
              .map((row) => isRecord(row) ? firstNumber(row.high) : null)
              .filter((value): value is number => typeof value === 'number');
            const lows = klinesData
              .map((row) => isRecord(row) ? firstNumber(row.low) : null)
              .filter((value): value is number => typeof value === 'number');
            const volumes = klinesData
              .map((row) => isRecord(row) ? firstNumber(row.volume, row.vol) ?? 0 : 0);
            if (highs.length > 0 || lows.length > 0) {
              setKlinesMeta({
                high: highs.length > 0 ? Math.max(...highs) : 0,
                low: lows.length > 0 ? Math.min(...lows.filter(v => v > 0)) : 0,
                volume: volumes.reduce((a: number, b: number) => a + b, 0),
              });
            }
          }

          if (!snap && constituentRows.length === 0 && !(Array.isArray(klinesData) && klinesData.length > 0) && !snapshot) {
            setError(true);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker, index, shouldLoadDetails, snapshot]);

  // ── Formatting helpers ──
  const formatPct = (val: number | null | undefined) => {
    if (val === undefined || val === null || !Number.isFinite(val)) return null;
    const pct = Math.abs(val) < 2 && Math.abs(val) > 0 && Math.abs(val) !== 1 ? val * 100 : val;
    return { value: pct, label: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, positive: pct >= 0 };
  };

  const formatUsd = (val: number | null | undefined) => {
    if (val === undefined || val === null || !Number.isFinite(val)) return 'N/A';
    if (val >= 1000) return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (val >= 1) return `$${val.toFixed(2)}`;
    return `$${val.toFixed(4)}`;
  };

  const formatCompact = (val: number | null | undefined) => {
    if (val === undefined || val === null || !Number.isFinite(val) || val === 0) return null;
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);
  };

  const displayName = ticker
    .replace(/^ssi/i, 'SSI ')
    .replace(/_/g, ' ')
    .toUpperCase();

  // ── Loading state ──
  if (loading) {
    return (
      <div ref={cardRef as React.RefObject<HTMLDivElement>} className="rounded-xl border border-border/60 bg-[#050805]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)] relative overflow-hidden">
        <div className="animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="h-6 w-32 rounded bg-white/[0.06]" />
            <div className="h-6 w-16 rounded bg-white/[0.06]" />
          </div>
          <div className="h-10 w-48 rounded bg-white/[0.04] mb-5" />
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="h-16 rounded-lg bg-white/[0.03]" />
            <div className="h-16 rounded-lg bg-white/[0.03]" />
            <div className="h-16 rounded-lg bg-white/[0.03]" />
            <div className="h-16 rounded-lg bg-white/[0.03]" />
          </div>
          <div className="h-3 w-full rounded-full bg-white/[0.04] mb-5" />
          <div className="h-10 w-full rounded-xl bg-accent-green/[0.05]" />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error && !snapshot) {
    return (
      <div ref={cardRef as React.RefObject<HTMLDivElement>} className="rounded-xl border border-border/60 bg-[#050805]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
        <div className="text-xs font-mono text-text-secondary">
          <span className="text-accent-amber">⚠</span> Failed to load <span className="text-white">{displayName}</span>
        </div>
      </div>
    );
  }

  // ── Extract all available metrics ──
  const change24h = formatPct(firstNumber(snapshot?.change_pct_24h, snapshot?.changePct24h, snapshot?.changePercent24h));
  const roi7d = formatPct(firstNumber(snapshot?.roi_7d, snapshot?.roi7d, snapshot?.changePercent7d));
  const roi1m = formatPct(firstNumber(snapshot?.roi_1m, snapshot?.roi1m, snapshot?.changePercent30d));
  const roi3m = formatPct(firstNumber(snapshot?.roi_3m, snapshot?.roi3m, snapshot?.changePercent90d));
  const ytd = formatPct(firstNumber(snapshot?.ytd, snapshot?.roiYtd, snapshot?.changePercentYtd));
  const roi1y = formatPct(firstNumber(snapshot?.roi_1y, snapshot?.roi1y, snapshot?.changePercent1y));
  const marketCap = formatCompact(firstNumber(snapshot?.market_cap, snapshot?.marketCap, snapshot?.totalMarketCap));
  const volume24h = formatCompact(firstNumber(snapshot?.volume_24h, snapshot?.volume24h, snapshot?.tradingVolume));
  const dominance = firstNumber(snapshot?.marketcap_dom_pct, snapshot?.marketCapDominance, snapshot?.dominancePct);
  const totalSupply = formatCompact(firstNumber(snapshot?.total_supply, snapshot?.totalSupply));

  // Build metrics array dynamically (only show what's available)
  const roiMetrics = [
    { label: '24H', data: change24h },
    { label: '7D', data: roi7d },
    { label: '1M', data: roi1m },
    { label: '3M', data: roi3m },
    { label: 'YTD', data: ytd },
    { label: '1Y', data: roi1y },
  ].filter(m => m.data !== null);

  return (
    <section ref={cardRef} className="group relative rounded-xl border border-border/60 bg-[#050805]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)] hover:border-accent-green/30 transition-all duration-300 flex flex-col gap-3.5">
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl bg-accent-green/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-accent-green/10 border border-accent-green/20">
              <span className="text-[9px] font-mono font-bold text-accent-green tracking-wider">SSI</span>
            </span>
            <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider truncate">
              SoSoValue Index
            </span>
          </div>
          <h3 className="text-base font-sans font-bold text-white tracking-tight truncate">
            {displayName}
          </h3>
        </div>

        <div className="text-right shrink-0">
          {snapshot && (
            <>
              <div className="text-lg font-bold text-white font-sans tabular-nums">
                {formatUsd(firstNumber(snapshot.price))}
              </div>
              {change24h && (
                <div className={`text-xs font-mono font-bold tabular-nums ${change24h.positive ? 'text-accent-green' : 'text-red-400'}`}>
                  {change24h.label}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sparkline ── */}
      {klinesPrices.length >= 2 && (
        <div className="relative z-10 -mx-1">
          <SparklineChart data={klinesPrices} width={320} height={52} className="w-full" />
        </div>
      )}

      {/* ── ROI Metrics Grid ── */}
      {roiMetrics.length > 0 && (
        <div className={`grid gap-1.5 relative z-10 ${roiMetrics.length <= 3 ? 'grid-cols-3' : roiMetrics.length <= 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'}`}>
          {roiMetrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-white/[0.06] bg-white/[0.025] py-2 px-1.5 flex flex-col items-center gap-0.5">
              <span className="text-[7px] font-mono text-text-secondary uppercase tracking-[0.14em]">
                {m.label}
              </span>
              <span className={`text-[11px] font-mono font-bold tabular-nums ${m.data!.positive ? 'text-accent-green' : 'text-red-400'}`}>
                {m.data!.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Market Stats Row ── */}
      {(marketCap || volume24h || klinesMeta) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 relative z-10 px-1">
          {marketCap && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">MCap</span>
              <span className="text-[11px] font-mono font-bold text-white tabular-nums">${marketCap}</span>
            </div>
          )}
          {volume24h && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">Vol 24H</span>
              <span className="text-[11px] font-mono font-bold text-accent-cyan tabular-nums">${volume24h}</span>
            </div>
          )}
          {klinesMeta && klinesMeta.high > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">High</span>
              <span className="text-[11px] font-mono font-bold text-accent-green tabular-nums">{formatUsd(klinesMeta.high)}</span>
            </div>
          )}
          {klinesMeta && klinesMeta.low > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">Low</span>
              <span className="text-[11px] font-mono font-bold text-red-400 tabular-nums">{formatUsd(klinesMeta.low)}</span>
            </div>
          )}
          {dominance != null && Number.isFinite(dominance) && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">Dom</span>
              <span className="text-[11px] font-mono font-bold text-accent-amber tabular-nums">{(dominance < 1 ? dominance * 100 : dominance).toFixed(1)}%</span>
            </div>
          )}
          {totalSupply && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-text-secondary uppercase tracking-wider">Supply</span>
              <span className="text-[11px] font-mono font-bold text-white tabular-nums">{totalSupply}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Constituents ── */}
      {constituents.length > 0 && (
        <div className="relative z-10">
          <span className="text-[9px] font-mono text-text-secondary uppercase tracking-[0.16em] mb-2 block">
            Top Holdings ({constituents.length})
          </span>
          <ConstituentBar
            constituents={constituents.map((c) => ({
              symbol: String(c.symbol || c.currency_id || c.name || c.currencyName || '?'),
              weight: firstNumber(c.weight, c.percentage, c.ratio) ?? 0,
              changePct24h: firstNumber(c.change_pct_24h, c.changePct24h),
            }))}
          />
        </div>
      )}

      {/* ── Buy CTA ── */}
      <a
        href={SSI_BUY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-accent-green/30 bg-accent-green/[0.06] hover:bg-accent-green/15 hover:border-accent-green/60 transition-all duration-200 group/btn"
      >
        <span className="text-xs font-sans font-bold text-accent-green tracking-wide uppercase group-hover/btn:text-white transition-colors">
          Buy on SoSoValue
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-green group-hover/btn:text-white transition-colors group-hover/btn:translate-x-0.5 duration-200">
          <path d="M7 17l9.2-9.2M17 17V7H7" />
        </svg>
      </a>
    </section>
  );
};
