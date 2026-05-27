'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Typography } from '@mui/material';

interface Trade {
  id: number;
  price: number;
  amount: number;
  time: number;
  isBuyerMaker: boolean; // if true, it's a SELL (red), if false, it's a BUY (green)
}

interface RecentTradesProps {
  symbol: string;
}

type TradeUpdate = {
  t?: string | number;
  p?: string | number;
  q?: string | number;
  T?: string | number;
  S?: string;
};

type TradeMessage = {
  channel?: string;
  type?: string;
  data?: TradeUpdate[];
};

export const RecentTrades: React.FC<RecentTradesProps> = ({ symbol }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setTrades([]);
    }, 0);

    const wsUrl = `wss://mainnet-gw.sodex.dev/ws/perps`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(JSON.stringify({
        op: 'subscribe',
        params: {
          channel: 'trade',
          symbols: [symbol]
        }
      }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const message = JSON.parse(event.data) as TradeMessage;
        if (message.channel === 'trade' && message.type === 'update' && Array.isArray(message.data)) {
          const newTrades: Trade[] = message.data.map((d) => ({
            id: Number(d.t ?? d.T ?? Date.now()),
            price: Number(d.p),
            amount: Number(d.q),
            time: Number(d.T ?? Date.now()),
            isBuyerMaker: d.S === 'SELL' // SELL means taker was seller (red)
          }));

          setTrades((prev) => {
            const updated = [...newTrades, ...prev];
            return updated.slice(0, 50); // Keep last 50 trades
          });
        }
      } catch {}
    };

    return () => {
      window.clearTimeout(resetTimer);
      if (wsRef.current === ws) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  const formatPrice = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const formatAmount = (a: number) => a.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const formatTime = (t: number) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#060A06] border border-border/50 rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50 bg-black/40">
        <Typography variant="caption" className="font-mono text-text-secondary tracking-widest uppercase">
          Recent Trades
        </Typography>
      </div>
      
      <div className="flex px-3 py-1.5 border-b border-border/30 text-[10px] font-mono text-text-secondary/70">
        <div className="w-1/3 text-left">Price</div>
        <div className="w-1/3 text-right">Amount</div>
        <div className="w-1/3 text-right">Time</div>
      </div>

      <div className="flex-1 overflow-y-hidden relative custom-scrollbar">
        <div className="absolute inset-0 overflow-y-auto">
          {trades.map((trade) => (
            <div key={trade.id} className="flex px-3 py-1 hover:bg-white/5 text-[11px] font-mono transition-colors">
              <div className={`w-1/3 text-left ${trade.isBuyerMaker ? 'text-[#FF2A4D]' : 'text-[#00FF9D]'}`}>
                {formatPrice(trade.price)}
              </div>
              <div className="w-1/3 text-right text-white">
                {formatAmount(trade.amount)}
              </div>
              <div className="w-1/3 text-right text-text-secondary">
                {formatTime(trade.time)}
              </div>
            </div>
          ))}
          {trades.length === 0 && (
            <div className="p-4 text-center text-xs font-mono text-text-secondary">
              Awaiting trades...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
