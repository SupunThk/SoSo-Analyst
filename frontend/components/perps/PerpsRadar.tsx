'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import TradeAssetButton from '@/components/trade/TradeAssetButton';
import {
  fetchPerpAsset,
  fetchPerpBoard,
  isAbortError,
  isRateLimitError,
  type FundingRegime,
  type PerpAssetDetail,
  type PerpBoard,
  type PerpExtreme,
} from '@/lib/api';

const REFRESH_MS = 60_000;

// ── formatting ───────────────────────────────────────────────────────────────
const usdCompact = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const pct = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;

const price = (value: number | null) => {
  if (value === null) return '—';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return value.toPrecision(4);
};

// Funding is a positioning signal, not good/bad: amber = longs paying (long
// crowding), cyan = shorts paying (short crowding). Green/red stay for price.
const fundingTone = (apr: number | null | undefined) => {
  if (apr === null || apr === undefined) return 'text-text-secondary';
  if (apr >= 15) return 'text-accent-amber';
  if (apr <= -5) return 'text-accent-cyan';
  return 'text-text-primary';
};

const REGIME: Record<FundingRegime, { label: string; className: string }> = {
  crowded_longs: { label: 'Crowded longs', className: 'border-accent-amber/50 bg-accent-amber/15 text-accent-amber' },
  long_leaning: { label: 'Long leaning', className: 'border-accent-amber/25 bg-accent-amber/[0.06] text-accent-amber' },
  neutral: { label: 'Neutral', className: 'border-border-bright bg-white/[0.03] text-text-secondary' },
  short_leaning: { label: 'Short leaning', className: 'border-accent-cyan/25 bg-accent-cyan/[0.06] text-accent-cyan' },
  crowded_shorts: { label: 'Crowded shorts', className: 'border-accent-cyan/50 bg-accent-cyan/15 text-accent-cyan' },
  unknown: { label: 'No funding', className: 'border-border bg-transparent text-text-secondary' },
};

const VENUE_LABEL: Record<string, string> = { BINANCE: 'Binance', HYPERLIQUID: 'Hyperliquid', SODEX: 'SoDEX' };
const venueName = (venue: string) => VENUE_LABEL[venue] || venue;

// Positioning context shown on the order ticket. Informational only: the side
// is never prefilled from the radar.
const regimeContext = (detail: PerpAssetDetail) => {
  const apr = detail.oiWeightedFundingAprPct;
  const aprText = apr === null ? '' : ` (OI-weighted funding ${pct(apr)} APR)`;
  switch (detail.fundingRegime) {
    case 'crowded_longs': return `Crowded longs${aprText}: longs are paying shorts, and a long squeeze is the larger risk.`;
    case 'long_leaning': return `Long leaning${aprText}: longs pay a modest funding premium.`;
    case 'crowded_shorts': return `Crowded shorts${aprText}: shorts are paying longs, and a short squeeze is the larger risk.`;
    case 'short_leaning': return `Short leaning${aprText}: shorts pay a modest funding premium.`;
    case 'neutral': return `Funding is neutral${aprText}.`;
    default: return undefined;
  }
};

const askAnalyst = (query: string) => {
  window.dispatchEvent(new CustomEvent('soso:run-query', { detail: { query } }));
};

// ── small pieces ─────────────────────────────────────────────────────────────
function RegimeBadge({ regime }: { regime: FundingRegime }) {
  const style = REGIME[regime] || REGIME.unknown;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${style.className}`}>
      {style.label}
    </span>
  );
}

// Diverging bar centred on 0, clamped to ±50% APR.
function FundingBar({ apr }: { apr: number | null }) {
  const clamped = Math.max(-50, Math.min(50, apr ?? 0));
  const width = `${(Math.abs(clamped) / 50) * 50}%`;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/[0.06]" aria-hidden>
      <span className="absolute left-1/2 top-0 h-full w-px bg-border-bright" />
      {apr !== null && (
        <span
          className={`absolute top-0 h-full rounded-full ${clamped >= 0 ? 'left-1/2 bg-accent-amber/80' : 'right-1/2 bg-accent-cyan/80'}`}
          style={{ width }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/80 p-3.5 sm:p-4">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">{label}</div>
      <div className={`mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 font-sans text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}

function Panel({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-surface/80 ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function ExtremeList({ title, rows, onSelect }: { title: string; rows: PerpExtreme[]; onSelect: (asset: string) => void }) {
  return (
    <Panel title={title}>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.fullSymbol}>
            <button
              type="button"
              onClick={() => onSelect(row.asset)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="min-w-0">
                <span className="block truncate font-sans text-sm font-medium text-white">{row.asset}</span>
                <span className="block font-mono text-[11px] text-text-secondary">{venueName(row.venue)} · OI {usdCompact(row.openInterestUsd)}</span>
              </span>
              <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${fundingTone(row.fundingAprPct)}`}>
                {pct(row.fundingAprPct, 1)}
              </span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-3 font-sans text-sm text-text-secondary">No liquid contracts.</li>}
      </ul>
    </Panel>
  );
}

// ── asset drill-down ─────────────────────────────────────────────────────────
function AssetDetail({ asset }: { asset: string }) {
  const [detail, setDetail] = useState<PerpAssetDetail | null>(null);
  // Errors are keyed by asset so switching assets clears them without a reset.
  const [failure, setFailure] = useState<{ asset: string; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPerpAsset(asset, controller.signal)
      .then(setDetail)
      .catch((err) => {
        if (!isAbortError(err)) setFailure({ asset, message: err.message || 'Failed to load contracts.' });
      });
    return () => controller.abort();
  }, [asset]);

  const error = failure?.asset === asset ? failure.message : null;
  const loading = !detail || detail.asset !== asset;

  return (
    <Panel
      title={`${asset} contracts by venue`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <TradeAssetButton
            asset={asset}
            source="radar"
            context={detail && detail.asset === asset ? regimeContext(detail) : undefined}
          />
          <button
            type="button"
            onClick={() => askAnalyst(`Analyze ${asset} perpetual futures positioning: funding across venues, open interest, depth, and what it implies for squeeze risk.`)}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent-green/35 bg-accent-green/[0.06] px-2.5 py-1 font-sans text-xs font-medium text-accent-green transition-colors hover:border-accent-green/70"
          >
            Ask analyst <Icon name="arrowRight" size={13} />
          </button>
        </div>
      }
    >
      {error ? (
        <p className="px-4 py-4 font-sans text-sm text-accent-red">{error}</p>
      ) : loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-white/[0.04]" />)}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 px-4 py-3 font-mono text-xs">
            <span className="text-text-secondary">OI <span className="text-white">{usdCompact(detail.openInterestUsd)}</span></span>
            <span className="text-text-secondary">Funding APR <span className={fundingTone(detail.oiWeightedFundingAprPct)}>{pct(detail.oiWeightedFundingAprPct)}</span></span>
            <span className="text-text-secondary">Venue spread <span className="text-white">{detail.fundingAprSpreadPct === null ? '—' : `${detail.fundingAprSpreadPct.toFixed(1)} pts`}</span></span>
            {detail.priceGap && (
              <span className="text-text-secondary">Price gap <span className="text-white">{detail.priceGap.gapBps} bps</span></span>
            )}
            <RegimeBadge regime={detail.fundingRegime} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-2 font-medium">Contract</th>
                  <th className="px-3 py-2 text-right font-medium">Last</th>
                  <th className="px-3 py-2 text-right font-medium">Funding</th>
                  <th className="px-3 py-2 text-right font-medium">APR</th>
                  <th className="px-3 py-2 text-right font-medium">Open interest</th>
                  <th className="px-3 py-2 text-right font-medium">Depth ±2%</th>
                  <th className="px-4 py-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono text-xs tabular-nums">
                {detail.legs.map((leg) => (
                  <tr key={leg.fullSymbol} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="font-sans text-[13px] text-white">{venueName(leg.venue)}</div>
                      <div className="text-[11px] text-text-secondary">{leg.fullSymbol.replace(/\.[A-Z]+$/, '')}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-text-primary">
                      {price(leg.last)}
                      {leg.quoteAsset && !/^(USD|USDT|USDC|USD1|U|FDUSD)$/.test(leg.quoteAsset) && (
                        <span className="ml-1 text-[10px] text-text-secondary">{leg.quoteAsset}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-text-secondary">
                      {leg.fundingRatePct === null ? '—' : `${leg.fundingRatePct.toFixed(4)}%`}
                      {leg.fundingIntervalHours ? <span className="text-[10px]"> /{leg.fundingIntervalHours}h</span> : null}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${fundingTone(leg.fundingAprPct)}`}>{pct(leg.fundingAprPct)}</td>
                    <td className="px-3 py-2.5 text-right text-white">{usdCompact(leg.openInterestUsd)}</td>
                    <td className="px-3 py-2.5 text-right text-text-secondary">
                      {leg.depthPlus2PctUsd === null ? '—' : `${usdCompact(leg.depthMinus2PctUsd)} / ${usdCompact(leg.depthPlus2PctUsd)}`}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${(leg.quoteAgeMinutes ?? 0) > 5 ? 'text-accent-amber' : 'text-text-secondary'}`}>
                      {leg.quoteAgeMinutes === null ? '—' : `${leg.quoteAgeMinutes}m`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border/60 px-4 py-2.5 font-sans text-[11px] leading-relaxed text-text-secondary">
            Depth is bid / ask liquidity within 2% of price. The price gap only compares venues whose quotes were taken within 3 minutes of each other; older snapshots are flagged in amber.
          </p>
        </>
      )}
    </Panel>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function PerpsRadar() {
  const [board, setBoard] = useState<PerpBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('BTC');

  const load = useCallback((signal?: AbortSignal) => {
    fetchPerpBoard(signal)
      .then((data) => { setBoard(data); setError(null); })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(isRateLimitError(err) ? 'Data source is rate limited. Retrying in a minute.' : err.message || 'Failed to load perpetuals.');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  const selectAsset = (asset: string) => {
    setSelected(asset);
    document.getElementById('perp-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!board) {
    return error ? (
      <div className="rounded-lg border border-accent-red/30 bg-accent-red/[0.05] p-4 font-sans text-sm text-accent-red">{error}</div>
    ) : (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface/60" />)}
      </div>
    );
  }

  const totalOi = board.totals.openInterestUsd || 1;

  return (
    <div className="space-y-4 md:space-y-5">
      {error && (
        <div className="rounded-md border border-accent-amber/30 bg-accent-amber/[0.05] px-3 py-2 font-sans text-xs text-accent-amber">{error} Showing the last loaded data.</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open interest" value={usdCompact(board.totals.openInterestUsd)} sub={`${board.totals.contracts} contracts · ${board.totals.assets} assets`} />
        <Kpi label="24h turnover" value={usdCompact(board.totals.turnover24hUsd)} sub="All venues, rolling 24h" />
        <Kpi
          label="Funding APR"
          value={pct(board.totals.oiWeightedFundingAprPct, 1)}
          sub="Open-interest weighted"
          tone={fundingTone(board.totals.oiWeightedFundingAprPct)}
        />
        <Kpi
          label="Positioning"
          value={REGIME[board.topAssets[0]?.fundingRegime || 'unknown'].label}
          sub={`${board.topAssets[0]?.asset ?? '—'}, the largest market`}
          tone="text-white text-lg sm:text-xl"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {board.venues.map((venue) => (
          <div key={venue.venue} className="rounded-lg border border-border bg-surface/80 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-sans text-sm font-semibold text-white">{venueName(venue.venue)}</span>
              <span className="font-mono text-[11px] text-text-secondary">
                {venue.contracts} contracts
                {board.freshness[venue.venue] && ` · ${board.freshness[venue.venue].medianQuoteAgeMinutes}m old`}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2 font-mono tabular-nums">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">OI</div>
                <div className="text-lg font-semibold text-white">{usdCompact(venue.openInterestUsd)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">Funding APR</div>
                <div className={`text-lg font-semibold ${fundingTone(venue.oiWeightedFundingAprPct)}`}>{pct(venue.oiWeightedFundingAprPct, 1)}</div>
              </div>
            </div>
            <div className="mt-3 h-1 rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-accent-green/70" style={{ width: `${(venue.openInterestUsd / totalOi) * 100}%` }} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-text-secondary">{((venue.openInterestUsd / totalOi) * 100).toFixed(1)}% of open interest</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Top markets by open interest">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 text-right font-medium">Open interest</th>
                  <th className="px-3 py-2 text-right font-medium">24h</th>
                  <th className="w-[180px] px-3 py-2 font-medium">Funding APR</th>
                  <th className="px-4 py-2 font-medium">Regime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono text-xs tabular-nums">
                {board.topAssets.map((asset) => (
                  <tr
                    key={asset.asset}
                    onClick={() => selectAsset(asset.asset)}
                    className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${selected === asset.asset ? 'bg-accent-green/[0.05]' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left" onClick={() => selectAsset(asset.asset)} aria-label={`Show ${asset.asset} contracts`}>
                        <span className="font-sans text-[13px] font-semibold text-white">{asset.asset}</span>
                        <span className="ml-2 text-[11px] text-text-secondary">{asset.venues.map(venueName).join(' · ')}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right text-white">{usdCompact(asset.openInterestUsd)}</td>
                    <td className={`px-3 py-2.5 text-right ${asset.change24hPct === null ? 'text-text-secondary' : asset.change24hPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {pct(asset.change24hPct, 1)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-16 shrink-0 text-right font-semibold ${fundingTone(asset.oiWeightedFundingAprPct)}`}>{pct(asset.oiWeightedFundingAprPct, 1)}</span>
                        <FundingBar apr={asset.oiWeightedFundingAprPct} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><RegimeBadge regime={asset.fundingRegime} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y divide-border/50 md:hidden">
            {board.topAssets.map((asset) => (
              <li key={asset.asset}>
                <button
                  type="button"
                  onClick={() => selectAsset(asset.asset)}
                  className={`w-full px-4 py-3 text-left ${selected === asset.asset ? 'bg-accent-green/[0.05]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-sans text-sm font-semibold text-white">{asset.asset}</span>
                    <span className="font-mono text-sm text-white">{usdCompact(asset.openInterestUsd)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-xs">
                    <span className={`w-16 shrink-0 font-semibold ${fundingTone(asset.oiWeightedFundingAprPct)}`}>{pct(asset.oiWeightedFundingAprPct, 1)}</span>
                    <FundingBar apr={asset.oiWeightedFundingAprPct} />
                    <RegimeBadge regime={asset.fundingRegime} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <ExtremeList title="Highest funding · longs pay" rows={board.highestFunding} onSelect={selectAsset} />
          <ExtremeList title="Lowest funding · shorts pay" rows={board.lowestFunding} onSelect={selectAsset} />
        </div>
      </div>

      <motion.div id="perp-detail" key={selected} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="scroll-mt-4">
        <AssetDetail asset={selected} />
      </motion.div>

      <p className="font-sans text-[11px] leading-relaxed text-text-secondary">
        Source: SoSoValue Market Data API v3, refreshed every minute. Funding APR annualises each venue&apos;s current rate; ~11% matches the standard 0.01% per 8h baseline. {board.note}
      </p>
    </div>
  );
}
