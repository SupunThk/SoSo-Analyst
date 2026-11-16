'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useSodexTrading } from './SodexTradingProvider';
import EnableTradingCard, { SECONDARY_BTN } from './EnableTradingCard';

const num = (value: string | number | null | undefined, digits = 2) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
};

const sideLabel = (side: string | number) => (String(side) === '1' || String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL');

// The user's SoDEX perps positions and open orders, with close and cancel.
export default function PositionsPanel() {
  const { phase, status, refresh, closePosition, cancelOrder } = useSodexTrading();
  const [pending, setPending] = useState<string | null>(null);

  if (phase !== 'ready') return <EnableTradingCard />;

  const positions = status?.positions ?? [];
  const orders = status?.openOrders ?? [];

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setPending(id);
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-[#060A06]">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-white">Your SoDEX perps</h2>
        <div className="flex items-center gap-3 font-mono text-[11px] text-text-secondary">
          <span>Available <span className="text-white">${num(status?.availableMarginUsd)}</span></span>
          <button type="button" onClick={() => void refresh()} className="hover:text-white">Refresh</button>
        </div>
      </div>

      {positions.length === 0 && orders.length === 0 ? (
        <p className="px-4 py-4 font-sans text-sm text-text-secondary">No open positions or orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left font-mono text-xs tabular-nums">
            <thead className="text-[10px] uppercase tracking-wider text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Market</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Entry / price</th>
                <th className="px-3 py-2 text-right font-medium">PnL / liq.</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {positions.map((p) => {
                const long = Number(p.size) > 0;
                const pnl = Number(p.unrealizedPnl);
                return (
                  <tr key={`pos-${p.symbol}`}>
                    <td className="px-4 py-2.5 text-white">
                      {p.symbol} <span className={long ? 'text-accent-green' : 'text-accent-red'}>{long ? 'LONG' : 'SHORT'}{p.leverage ? ` ${p.leverage}x` : ''}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-white">{num(Math.abs(Number(p.size)), 6)}</td>
                    <td className="px-3 py-2.5 text-right text-text-secondary">{num(p.entryPrice, 6)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>{num(p.unrealizedPnl)}</span>
                      <span className="text-text-secondary"> / {num(p.liquidationPrice, 6)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() => {
                          if (window.confirm(`Close your ${p.symbol} position at market?`)) {
                            void run(`pos-${p.symbol}`, () => closePosition(p.symbol, p.size), `Close order sent for ${p.symbol}`);
                          }
                        }}
                        className={SECONDARY_BTN}
                      >
                        {pending === `pos-${p.symbol}` ? 'Closing…' : 'Close'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {orders.map((o) => (
                <tr key={`ord-${o.orderId}`}>
                  <td className="px-4 py-2.5 text-white">
                    {o.symbol} <span className="text-text-secondary">{sideLabel(o.side)}{o.stopPrice ? ' STOP' : ''}{o.reduceOnly ? ' RO' : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white">{num(o.quantity, 6)}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">{num(o.stopPrice ?? o.price, 6)}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">open order</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void run(`ord-${o.orderId}`, () => cancelOrder(o.symbol, o.orderId), 'Order cancelled')}
                      className={SECONDARY_BTN}
                    >
                      {pending === `ord-${o.orderId}` ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
