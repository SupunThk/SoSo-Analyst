'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { Button, Typography, MenuItem, Select } from '@mui/material';

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

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('BTC-USD');
  const [interval, setInterval] = useState('1m');

  const handleTradeRedirect = () => {
    // Open SoDEX in a new tab with the pre-filled trade parameters
    window.open(`https://sodex.com/trade?symbol=${symbol.toUpperCase()}`, '_blank');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#020302] overflow-x-hidden">
      <Header />
      
      <main className="flex-1 p-4 md:p-6 transition-all">
        <div className="max-w-[1600px] mx-auto w-full">
          {/* Header Controls */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <Typography variant="h4" className="font-orbitron font-bold text-white tracking-wider flex items-center gap-3">
                <span className="text-[#00FF9D]">●</span> TERMINAL
              </Typography>
              <Typography variant="body2" className="text-text-secondary font-mono mt-1">
                Advanced charting and market depth visualization
              </Typography>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Select
                size="small"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                sx={{
                  color: 'white',
                  fontFamily: 'monospace',
                  bgcolor: 'rgba(255,255,255,0.05)',
                  minWidth: '130px',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FFB400' },
                  '.MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' }
                }}
              >
                <MenuItem value="BTC-USD">BTC / USD</MenuItem>
                <MenuItem value="ETH-USD">ETH / USD</MenuItem>
                <MenuItem value="SOL-USD">SOL / USD</MenuItem>
                <MenuItem value="BNB-USD">BNB / USD</MenuItem>
                <MenuItem value="XRP-USD">XRP / USD</MenuItem>
                <MenuItem value="DOGE-USD">DOGE / USD</MenuItem>
                <MenuItem value="ADA-USD">ADA / USD</MenuItem>
                <MenuItem value="AVAX-USD">AVAX / USD</MenuItem>
                <MenuItem value="LINK-USD">LINK / USD</MenuItem>
                <MenuItem value="SUI-USD">SUI / USD</MenuItem>
              </Select>
              <Select
                size="small"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                sx={{
                  color: 'white',
                  fontFamily: 'monospace',
                  bgcolor: 'rgba(255,255,255,0.05)',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FFB400' },
                  '.MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' }
                }}
              >
                <MenuItem value="1m">1m</MenuItem>
                <MenuItem value="5m">5m</MenuItem>
                <MenuItem value="15m">15m</MenuItem>
                <MenuItem value="1h">1h</MenuItem>
                <MenuItem value="4h">4h</MenuItem>
                <MenuItem value="1d">1D</MenuItem>
              </Select>
            </div>
          </div>

          {/* Terminal Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[750px] mb-6">
            {/* Chart Area */}
            <div className="lg:col-span-9 flex flex-col relative">
              <TradingViewChart symbol={symbol} interval={interval} height={750} />
            </div>

            {/* Side Panels */}
            <div className="lg:col-span-3 flex flex-col gap-4 h-[750px]">
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
              <Typography variant="h6" className="text-white font-mono tracking-tight mb-1">
                Ready to execute?
              </Typography>
              <Typography variant="body2" className="text-text-secondary">
                Deploy your capital on SoDEX with 0% slippage and minimal fees.
              </Typography>
            </div>
            
            <Button 
              variant="contained" 
              onClick={handleTradeRedirect}
              sx={{
                bgcolor: '#00FF9D',
                color: 'black',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                px: 4,
                py: 1.5,
                '&:hover': {
                  bgcolor: '#00cc7d',
                  boxShadow: '0 0 15px rgba(0, 255, 157, 0.4)'
                }
              }}
            >
              [ PLACE TRADE ON SODEX ]
            </Button>
          </div>

        </div>
      </main>
    </div>
  );
}
