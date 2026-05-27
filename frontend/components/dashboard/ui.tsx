import React from 'react';
import { RotationRow } from '@/lib/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const formatPct = (value: number | null | undefined, digits = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
};

export const formatPrice = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumSignificantDigits: 4,
  }).format(value);
};

export const formatCompact = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

export const pctTone = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-text-secondary';
  if (value > 0) return 'text-accent-green';
  if (value < 0) return 'text-accent-red';
  return 'text-text-secondary';
};

export const severityTone = (severity: string) => {
  if (severity === 'high') return 'border-accent-red/40 text-accent-red bg-accent-red/[0.06]';
  if (severity === 'medium') return 'border-accent-amber/40 text-accent-amber bg-accent-amber/[0.06]';
  return 'border-accent-cyan/35 text-accent-cyan bg-accent-cyan/[0.05]';
};

export const sourceLabel = (row: RotationRow) => row.source || (row.ticker ? 'SoSo SSI' : 'SoSo Sector');

export const updatedLabel = (iso?: string) => {
  if (!iso) return 'LIVE';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'LIVE';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const MetricPill = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="min-w-0 rounded-md border border-border/80 bg-black/25 px-3 py-2">
    <div className="text-[8px] font-mono uppercase tracking-[0.16em] text-text-secondary truncate">
      {label}
    </div>
    <div className={cn('mt-1 text-[13px] font-mono font-bold tabular-nums truncate', tone || 'text-white')}>
      {value}
    </div>
  </div>
);

export const PanelHeader = ({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-text-secondary">
        {kicker}
      </div>
      <h2 className="mt-1 text-[13px] md:text-[15px] font-mono font-bold uppercase tracking-[0.08em] text-white truncate">
        {title}
      </h2>
    </div>
    {action}
  </div>
);

export const LoadingPanel = () => (
  <div className="rounded-md border border-border/80 bg-[#050805]/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
    <div className="h-3 w-28 rounded-sm bg-accent-green/10" />
    <div className="mt-4 grid grid-cols-3 gap-2">
      <div className="h-16 rounded-md bg-white/[0.03]" />
      <div className="h-16 rounded-md bg-white/[0.03]" />
      <div className="h-16 rounded-md bg-white/[0.03]" />
    </div>
    <div className="mt-3 h-24 rounded-md bg-white/[0.03]" />
  </div>
);

export const RotationRowBar = ({ row, maxAbs }: { row: RotationRow; maxAbs: number }) => {
  const value = row.changePct24h;
  const width = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(4, Math.min(100, (Math.abs(value) / Math.max(maxAbs, 1)) * 100))
    : 4;
  const positive = typeof value === 'number' && value >= 0;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-mono font-bold text-white">
            {row.name}
          </div>
          <div className="truncate text-[8px] font-mono uppercase tracking-[0.12em] text-text-secondary">
            {sourceLabel(row)}
          </div>
        </div>
        <div className={cn('shrink-0 text-[11px] font-mono font-bold tabular-nums', pctTone(value))}>
          {formatPct(value)}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
        <div
          className={cn('h-full rounded-sm', positive ? 'bg-accent-green/80' : 'bg-accent-red/80')}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};
