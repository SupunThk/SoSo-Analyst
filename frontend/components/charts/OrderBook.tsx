'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Typography } from '@mui/material';

interface OrderLevel {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  symbol: string;
}

type OrderBookMessage = {
  channel?: string;
  type?: string;
  data?: {
    b?: [string, string][];
    a?: [string, string][];
  };
};

export const OrderBook: React.FC<OrderBookProps> = ({ symbol }) => {
  const [bids, setBids] = useState<OrderLevel[]>([]);
  const [asks, setAsks] = useState<OrderLevel[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const bidsRef = useRef<Map<number, number>>(new Map());
  const asksRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    bidsRef.current.clear();
    asksRef.current.clear();
    const resetTimer = window.setTimeout(() => {
      setBids([]);
      setAsks([]);
    }, 0);

    const wsUrl = `wss://mainnet-gw.sodex.dev/ws/perps`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(JSON.stringify({
        op: 'subscribe',
        params: {
          channel: 'l4Book',
          symbol: symbol
        }
      }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const message = JSON.parse(event.data) as OrderBookMessage;
        if (message.channel === 'l4Book' && message.data) {
          const { type, data } = message;
          const { b, a } = data;

          if (type === 'snapshot') {
            bidsRef.current.clear();
            asksRef.current.clear();
          }

          if (Array.isArray(b)) {
            b.forEach((bid: [string, string]) => {
              const price = parseFloat(bid[0]);
              const amount = parseFloat(bid[1]);
              if (amount === 0) bidsRef.current.delete(price);
              else bidsRef.current.set(price, amount);
            });
          }

          if (Array.isArray(a)) {
            a.forEach((ask: [string, string]) => {
              const price = parseFloat(ask[0]);
              const amount = parseFloat(ask[1]);
              if (amount === 0) asksRef.current.delete(price);
              else asksRef.current.set(price, amount);
            });
          }

          const sortedBids = Array.from(bidsRef.current.entries())
            .sort((x, y) => y[0] - x[0])
            .slice(0, 15);
            
          let runningBidTotal = 0;
          const parsedBids = sortedBids.map(([price, amount]) => {
            runningBidTotal += amount;
            return { price, amount, total: runningBidTotal };
          });

          const sortedAsks = Array.from(asksRef.current.entries())
            .sort((x, y) => x[0] - y[0])
            .slice(0, 15);
            
          let runningAskTotal = 0;
          const parsedAsks = sortedAsks.map(([price, amount]) => {
            runningAskTotal += amount;
            return { price, amount, total: runningAskTotal };
          });

          parsedAsks.reverse();

          setBids(parsedBids);
          setAsks(parsedAsks);
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

  const maxTotal = Math.max(
    (bids[bids.length - 1]?.total || 0),
    (asks[0]?.total || 0) // because asks are reversed, the last accumulated is at index 0
  );

  const formatPrice = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const formatAmount = (a: number) => a.toLocaleString('en-US', { maximumFractionDigits: 4 });

  const renderLevel = (level: OrderLevel, type: 'bid' | 'ask') => {
    const depthPercent = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
    const isAsk = type === 'ask';
    
    return (
      <div key={level.price} className="relative flex px-3 py-[2px] hover:bg-white/5 text-[11px] font-mono transition-colors group z-0">
        {/* Depth Bar Background */}
        <div 
          className={`absolute top-0 bottom-0 right-0 z-[-1] opacity-15 transition-all duration-75 ${isAsk ? 'bg-[#FF2A4D]' : 'bg-[#00FF9D]'}`}
          style={{ width: `${depthPercent}%` }}
        />
        
        <div className={`w-1/3 text-left ${isAsk ? 'text-[#FF2A4D]' : 'text-[#00FF9D]'}`}>
          {formatPrice(level.price)}
        </div>
        <div className="w-1/3 text-right text-white">
          {formatAmount(level.amount)}
        </div>
        <div className="w-1/3 text-right text-text-secondary">
          {formatAmount(level.total)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#060A06] border border-border/50 rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50 bg-black/40">
        <Typography variant="caption" className="font-mono text-text-secondary tracking-widest uppercase">
          Order Book
        </Typography>
      </div>
      
      <div className="flex px-3 py-1.5 border-b border-border/30 text-[10px] font-mono text-text-secondary/70">
        <div className="w-1/3 text-left">Price</div>
        <div className="w-1/3 text-right">Amount</div>
        <div className="w-1/3 text-right">Total</div>
      </div>

      <div className="flex-1 overflow-y-hidden flex flex-col relative custom-scrollbar">
        <div className="absolute inset-0 flex flex-col">
          
          {/* ASKS (Sells) */}
          <div className="flex-1 overflow-y-auto flex flex-col justify-end">
            {asks.map(ask => renderLevel(ask, 'ask'))}
          </div>

          {/* SPREAD (Current Price Approximation) */}
          <div className="py-2 px-3 border-y border-border/30 bg-white/5 flex items-center justify-between">
            <Typography variant="body2" className={`font-mono font-bold ${asks.length > 0 && bids.length > 0 && asks[asks.length - 1].price < bids[0].price ? 'text-[#FF2A4D]' : 'text-[#00FF9D]'}`}>
              {bids.length > 0 ? formatPrice(bids[0].price) : '---'}
            </Typography>
            <Typography variant="caption" className="font-mono text-text-secondary">
              Spread: {bids.length > 0 && asks.length > 0 ? formatPrice(asks[asks.length - 1].price - bids[0].price) : '---'}
            </Typography>
          </div>

          {/* BIDS (Buys) */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {bids.map(bid => renderLevel(bid, 'bid'))}
          </div>
          
        </div>
      </div>
    </div>
  );
};
