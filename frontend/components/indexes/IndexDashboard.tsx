'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { fetchSosoIndices, fetchSosoIndicesOverview } from '@/lib/api';
import { IndexCard } from './IndexCard';

interface IndexSummary {
  ticker: string;
  name?: string;
  price?: number | null;
  changePct24h?: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractResponseList = (payload: unknown): unknown[] => {
  if (!isRecord(payload)) return [];
  return Array.isArray(payload.data) ? payload.data : [];
};

const parseIndexSummary = (item: unknown): IndexSummary | null => {
  if (typeof item === 'string') return { ticker: item };
  if (!isRecord(item)) return null;

  const ticker = String(item.ticker || item.symbol || item.name || item.id || '').trim();
  if (!ticker) return null;

  return {
    ticker,
    name: String(item.fullName || item.name || item.ticker || ''),
    price: toNumberOrNull(item.price),
    changePct24h: toNumberOrNull(item.change_pct_24h ?? item.changePct24h),
  };
};

export const IndexDashboard = () => {
  const [indices, setIndices] = useState<IndexSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchSosoIndicesOverview();
        if (cancelled) return;

        const list = extractResponseList(res)
          .map(parseIndexSummary)
          .filter((item): item is IndexSummary => Boolean(item));

        if (list.length > 0) {
          setIndices(list);
          setError(null);
        } else {
          setError('Unexpected response format from indices API.');
        }
      } catch {
        try {
          const fallback = await fetchSosoIndices();
          if (cancelled) return;

          const list = extractResponseList(fallback)
            .map(parseIndexSummary)
            .filter((item): item is IndexSummary => Boolean(item));

          setIndices(list);
          setError(list.length ? 'Using index list without live snapshots.' : 'Failed to load indices data.');
        } catch {
          if (!cancelled) setError('Failed to load indices data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Aggregate stats ──
  const stats = useMemo(() => {
    const withPrices = indices.filter(i => typeof i.changePct24h === 'number' && Number.isFinite(i.changePct24h));
    if (withPrices.length === 0) return null;

    const changes = withPrices.map(i => i.changePct24h as number);
    const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
    const best = withPrices.reduce((a, b) => ((a.changePct24h ?? -Infinity) > (b.changePct24h ?? -Infinity) ? a : b));
    const worst = withPrices.reduce((a, b) => ((a.changePct24h ?? Infinity) < (b.changePct24h ?? Infinity) ? a : b));

    return { avg, best, worst, count: indices.length };
  }, [indices]);

  const formatPctBadge = (val: number | null | undefined) => {
    if (val === undefined || val === null || !Number.isFinite(val)) return '—';
    // Handle fractional (0.05 = 5%) or direct percentage
    const pct = Math.abs(val) < 1 && Math.abs(val) > 0 ? val * 100 : val;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  };

  const pctColor = (val: number | null | undefined) => {
    if (val === undefined || val === null) return 'text-text-secondary';
    return val >= 0 ? 'text-accent-green' : 'text-red-400';
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-20 space-y-6">
        {/* Skeleton header */}
        <div className="animate-pulse space-y-3">
          <div className="h-7 w-56 rounded bg-white/[0.06]" />
          <div className="h-4 w-80 rounded bg-white/[0.03]" />
        </div>
        {/* Skeleton cards grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-[#050805]/90 p-5 animate-pulse space-y-4"
            >
              <div className="flex justify-between">
                <div className="h-5 w-28 rounded bg-white/[0.06]" />
                <div className="h-5 w-16 rounded bg-white/[0.06]" />
              </div>
              <div className="h-12 w-full rounded bg-white/[0.03]" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-14 rounded bg-white/[0.03]" />
                <div className="h-14 rounded bg-white/[0.03]" />
                <div className="h-14 rounded bg-white/[0.03]" />
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.04]" />
              <div className="h-9 w-full rounded-lg bg-accent-green/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-20 space-y-6">
      {/* ── Header ── */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-sans text-white tracking-tight">
            SoSoValue <span className="text-accent-green">Indexes</span>
          </h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-green/10 border border-accent-green/20">
            <span className="w-1.5 h-1.5 bg-accent-green rounded-full shadow-[0_0_6px_rgba(0,255,157,0.6)] animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-accent-green tracking-wider uppercase">LIVE</span>
          </span>
        </div>
        <p className="text-sm font-mono text-text-secondary">
          Track proprietary crypto indexes — performance, constituents, and buy directly on SoSoValue.
        </p>
      </div>

      {/* ── Aggregate Stats Bar ── */}
      {stats && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-[#050805]/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-text-secondary uppercase tracking-wider">Indices</span>
            <span className="text-sm font-mono font-bold text-white">{stats.count}</span>
          </div>
          <div className="w-px h-5 bg-border/80" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-text-secondary uppercase tracking-wider">Avg 24H</span>
            <span className={`text-sm font-mono font-bold tabular-nums ${pctColor(stats.avg)}`}>
              {formatPctBadge(stats.avg)}
            </span>
          </div>
          <div className="w-px h-5 bg-border/80" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-text-secondary uppercase tracking-wider">Best</span>
            <span className="text-xs font-mono text-white">{stats.best.ticker?.toUpperCase()}</span>
            <span className={`text-xs font-mono font-bold tabular-nums ${pctColor(stats.best.changePct24h)}`}>
              {formatPctBadge(stats.best.changePct24h)}
            </span>
          </div>
          <div className="w-px h-5 bg-border/80" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-text-secondary uppercase tracking-wider">Worst</span>
            <span className="text-xs font-mono text-white">{stats.worst.ticker?.toUpperCase()}</span>
            <span className={`text-xs font-mono font-bold tabular-nums ${pctColor(stats.worst.changePct24h)}`}>
              {formatPctBadge(stats.worst.changePct24h)}
            </span>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/[0.04] p-4">
          <span className="text-xs font-mono text-accent-amber">⚠ {error}</span>
        </div>
      )}

      {/* ── Cards Grid ── */}
      {indices.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {indices.map((idx, index) => (
            <IndexCard key={idx.ticker} ticker={idx.ticker} index={index} initialSnapshot={idx} />
          ))}
        </div>
      ) : !error ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-12 h-12 rounded-full border border-border/60 flex items-center justify-center">
            <span className="text-xl text-text-secondary">📊</span>
          </div>
          <span className="text-sm font-mono text-text-secondary text-center">
            No indices data available at the moment.
          </span>
        </div>
      ) : null}
    </div>
  );
};
