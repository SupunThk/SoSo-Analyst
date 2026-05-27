'use client';

import React from 'react';

interface Constituent {
  symbol: string;
  weight: number;           // 0-1 fractional
  changePct24h?: number | null;
}

interface ConstituentBarProps {
  constituents: Constituent[];
  /** Max number to show */
  limit?: number;
}

const ACCENT_COLORS = [
  'bg-accent-green',
  'bg-accent-cyan',
  'bg-accent-amber',
  'bg-purple-400',
  'bg-blue-400',
  'bg-pink-400',
  'bg-orange-400',
  'bg-teal-400',
];

const ConstituentBar: React.FC<ConstituentBarProps> = ({ constituents, limit = 8 }) => {
  const items = constituents.slice(0, limit);
  if (items.length === 0) return null;

  // Normalise weights so the bar fills to 100 %
  const totalWeight = items.reduce((sum, c) => sum + (c.weight || 0), 0);

  return (
    <div className="space-y-2.5">
      {/* Stacked colour bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {items.map((c, i) => {
          const pct = totalWeight > 0 ? (c.weight / totalWeight) * 100 : 0;
          return (
            <div
              key={c.symbol}
              className={`${ACCENT_COLORS[i % ACCENT_COLORS.length]} opacity-80 transition-all duration-500`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0 }}
              title={`${c.symbol}: ${(c.weight * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Legend pills */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {items.map((c, i) => (
          <div key={c.symbol} className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${ACCENT_COLORS[i % ACCENT_COLORS.length]} opacity-80`}
            />
            <span className="text-[10px] font-mono font-bold text-white uppercase truncate">
              {c.symbol}
            </span>
            <span className="text-[10px] font-mono text-text-secondary tabular-nums">
              {(c.weight * 100).toFixed(1)}%
            </span>
            {typeof c.changePct24h === 'number' && Number.isFinite(c.changePct24h) && (
              <span
                className={`text-[9px] font-mono tabular-nums ${
                  c.changePct24h >= 0 ? 'text-accent-green' : 'text-red-400'
                }`}
              >
                {c.changePct24h >= 0 ? '+' : ''}{c.changePct24h.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConstituentBar;
