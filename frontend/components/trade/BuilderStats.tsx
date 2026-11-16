'use client';

import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchBuilderStats, type BuilderStats as Stats, type TradeSource } from '@/lib/api/trading';
import { isAbortError } from '@/lib/api';
import { builderFeePct } from './EnableTradingCard';

const REFRESH_MS = 60_000;

const usd = (value: number, compact = false) =>
  compact && Math.abs(value) >= 1000
    ? `$${Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SOURCE_LABEL: Record<TradeSource, string> = {
  chat: 'AI signal (chat)',
  radar: 'Perps Radar',
  charts: 'Charts',
  positions: 'Position close',
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-white">{value}</div>
      {sub && <div className="mt-0.5 font-sans text-[11px] text-text-secondary">{sub}</div>}
    </div>
  );
}

export default function BuilderStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetchBuilderStats(controller.signal)
      .then((next) => { setStats(next); setError(null); })
      .catch((err) => { if (!isAbortError(err)) setError(err.message || 'Failed to load builder stats.'); });
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  if (error && !stats) return <p className="font-sans text-sm text-accent-red">{error}</p>;
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />)}
      </div>
    );
  }

  const { config, summary, daily, appTrades } = stats;
  const network = config.network === 'testnet' ? 'SoDEX testnet' : 'SoDEX mainnet';

  if (!summary) {
    return (
      <div className="rounded-lg border border-border/60 bg-surface p-5 font-sans text-sm text-text-secondary">
        {config.builderId
          ? `No builder activity recorded yet on ${network}. Stats appear after the first fill through SoSo Analyst.`
          : 'In-app trading has not launched yet. Stats will appear here once the SoSo Analyst builder code is live.'}
      </div>
    );
  }

  const chartData = daily.map((row) => ({
    date: row.date.slice(5),
    fee: Number(row.builderFee) || 0,
    volume: Number(row.tradeVolume) || 0,
  }));
  const signalTrades = appTrades?.find((row) => row.source === 'chat');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Traders" value={Number(summary.userCount).toLocaleString()} sub="authorized the builder code" />
        <Kpi label="Volume" value={usd(Number(summary.tradeVolume), true)} sub="traded notional" />
        <Kpi label="Fills" value={Number(summary.tradeCount).toLocaleString()} />
        <Kpi label="Builder fees" value={usd(Number(summary.builderFee))} sub={`${builderFeePct(config.builderFee)} per fill`} />
      </div>

      <div className="rounded-lg border border-border/60 bg-surface p-4">
        <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-text-secondary">
          <span>Daily builder fees</span>
          <span>{network} · builder #{summary.builderCode}</span>
        </div>
        {chartData.length === 0 ? (
          <p className="py-8 text-center font-sans text-sm text-text-secondary">No daily records yet.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#1A2A1A" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#8a9a8a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#8a9a8a', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#0A0F0A', border: '1px solid #2A3F2A', fontSize: 12 }}
                  formatter={(value, name) => [usd(Number(value)), name === 'fee' ? 'Builder fee' : 'Volume']}
                />
                <Bar dataKey="fee" fill="#00FF9D" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {appTrades && appTrades.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface">
          <div className="border-b border-border/60 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-text-secondary">
            Where trades start
            {signalTrades && <span className="ml-2 text-accent-green">· {signalTrades.trades} from AI signals</span>}
          </div>
          <table className="w-full text-left font-mono text-xs tabular-nums">
            <tbody className="divide-y divide-border/50">
              {appTrades.map((row) => (
                <tr key={row.source}>
                  <td className="px-4 py-2.5 font-sans text-text-primary">{SOURCE_LABEL[row.source] ?? row.source}</td>
                  <td className="px-3 py-2.5 text-right text-white">{row.trades} orders</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">{usd(row.notionalUsd, true)}</td>
                  <td className="px-4 py-2.5 text-right text-text-secondary">{row.wallets} wallets</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
