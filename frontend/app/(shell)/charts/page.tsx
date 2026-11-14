'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the charting components with SSR disabled
const TradingViewChart = dynamic(
  () => import('@/components/charts/TradingViewChart').then(mod => mod.TradingViewChart),
  { ssr: false }
);

const OrderBook = dynamic(
  () => import('@/components/charts/OrderBook').then(mod => mod.OrderBook),
  { ssr: false }
);

const RecentTrades = dynamic(
  () => import('@/components/charts/RecentTrades').then(mod => mod.RecentTrades),
  { ssr: false }
);

const SodexAnalytics = dynamic(
  () => import('@/components/charts/SodexAnalytics').then(mod => mod.SodexAnalytics),
  { ssr: false }
);

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'SUI'];
const INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
];
const SELECT_CLASS =
  'h-10 rounded-md border border-white/20 bg-white/5 px-3 font-mono text-sm text-white transition-colors hover:border-white/40 focus:border-[#FFB400] focus:outline-none [&>option]:bg-[#060A06]';

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('BTC-USD');
  const [candleInterval, setCandleInterval] = useState('1m');

  const handleTradeRedirect = () => {
    // Open SoDEX in a new tab with the pre-filled trade parameters
    window.open(`https://sodex.com/trade?symbol=${symbol.toUpperCase()}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex-1 p-4 md:p-6 transition-all overflow-y-auto w-full h-full">
      <div className="max-w-[1600px] mx-auto w-full">
        {/* Header Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 font-sans text-2xl font-semibold tracking-tight text-white md:text-3xl">
              <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_8px_rgba(0,255,157,0.6)]" aria-hidden /> Charts
            </h1>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Advanced charting and market depth visualization
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select aria-label="Market" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`${SELECT_CLASS} min-w-[130px]`}>
              {SYMBOLS.map((asset) => (
                <option key={asset} value={`${asset}-USD`}>{asset} / USD</option>
              ))}
            </select>
            <select aria-label="Candle interval" value={candleInterval} onChange={(e) => setCandleInterval(e.target.value)} className={SELECT_CLASS}>
              {INTERVALS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Terminal Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[420px] lg:min-h-[600px] xl:h-[750px] mb-6">
          {/* Chart Area */}
          <div className="lg:col-span-9 flex flex-col relative min-h-[360px] lg:min-h-0">
            <TradingViewChart symbol={symbol} interval={candleInterval} height={750} />
          </div>

          {/* Side Panels */}
          <div className="lg:col-span-3 flex flex-col gap-4 min-h-[420px] lg:min-h-0 xl:h-[750px]">
            <div className="flex-1 overflow-hidden min-h-[400px]">
              <OrderBook symbol={symbol} />
            </div>
            <div className="h-[250px] overflow-hidden">
              <RecentTrades symbol={symbol} />
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-[#060A06] border border-border/50 p-4 md:p-6 rounded-lg mb-10">
          <div className="mb-4 md:mb-0">
            <h2 className="text-white font-mono tracking-tight mb-1 text-lg">
              Ready to execute?
            </h2>
            <p className="text-text-secondary text-sm">
              Deploy your capital on SoDEX with 0% slippage and minimal fees.
            </p>
          </div>
          
          <button
            type="button"
            onClick={handleTradeRedirect}
            className="rounded-md bg-[#00FF9D] px-8 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] text-black transition-all hover:bg-[#00cc7d] hover:shadow-[0_0_15px_rgba(0,255,157,0.4)]"
          >
            [ PLACE TRADE ON SODEX ]
          </button>
        </div>

        {/* ═══ SoDEX MARKET ANALYTICS ═══ */}
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
            <span className="text-[10px] font-mono text-text-secondary tracking-[0.2em] uppercase whitespace-nowrap">
              SoDEX Market Analytics — Live
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
          </div>
          <SodexAnalytics />
        </div>

      </div>
    </div>
  );
}
