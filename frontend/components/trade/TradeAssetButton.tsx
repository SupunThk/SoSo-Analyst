'use client';

import React, { useEffect, useState } from 'react';
import { fetchPerpsMarkets, perpSymbolForAsset } from '@/lib/sodex/market';
import type { TradeSource } from '@/lib/api/trading';
import { useSodexTrading, type TicketRequest } from './SodexTradingProvider';

// "Trade on SoDEX" for a plain asset ticker. Renders nothing when SoDEX has no
// perp market for the asset.
export default function TradeAssetButton({
  asset,
  source,
  context,
  side,
  rationale,
  suggestedStopPct,
  label,
  className,
}: {
  asset: string;
  source: TradeSource;
  context?: string;
  side?: TicketRequest['side'];
  rationale?: string[];
  suggestedStopPct?: number | null;
  label?: string;
  className?: string;
}) {
  const { openTicket, config } = useSodexTrading();
  const [symbol, setSymbol] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPerpsMarkets()
      .then((markets) => {
        if (active) setSymbol(perpSymbolForAsset(markets, asset)?.name ?? null);
      })
      .catch(() => {
        if (active) setSymbol(null);
      });
    return () => { active = false; };
  }, [asset]);

  if (!symbol || config?.enabled === false) return null;

  return (
    <button
      type="button"
      onClick={() => openTicket({ symbol, side, source, context, rationale, suggestedStopPct })}
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/[0.06] px-2.5 py-1 font-sans text-xs font-medium text-accent-amber transition-colors hover:border-accent-amber/80'}
    >
      {label ?? `Trade ${symbol}`}
    </button>
  );
}
