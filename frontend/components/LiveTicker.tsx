'use client';

import React, { useState, useEffect, useRef } from 'react';
import Chip from '@mui/material/Chip';
import { motion } from 'framer-motion';
import { TickerAsset } from '@/lib/types';
import { fetchTickerData } from '@/lib/api';

const CRYPTO_ICONS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
  XRP: '✕',
  BNB: '◆',
};

const LiveTicker: React.FC = () => {
  const [assets, setAssets] = useState<TickerAsset[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchTickerData();
      if (data.length) {
        setAssets(data);
        setIsLoaded(true);
      }
    };

    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!isLoaded || !assets.length) return null;

  const formatPrice = (price: number | null) => {
    if (price == null) return '—';
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${price.toFixed(4)}`;
  };

  const formatChange = (change: number | null) => {
    if (change == null) return '—';
    const pct = Math.abs(change) <= 1 ? change * 100 : change;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${Number(pct).toFixed(2)}%`;
  };

  // Duplicate items for infinite scroll effect
  const doubled = [...assets, ...assets];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="relative border-b border-border/80 bg-[#030503]/85 backdrop-blur-md overflow-hidden shadow-[inset_0_1px_0_rgba(0,255,157,0.06)]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-px bg-gradient-to-r from-transparent via-accent-green/30 to-transparent"
        aria-hidden
      />
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-[#030503] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#030503] to-transparent z-10" />
      
      <div
        ref={scrollRef}
        className="flex items-center gap-6 py-2 px-4 ticker-scroll"
      >
        {doubled.map((asset, i) => {
          const isPositive = (asset.change_pct_24h ?? 0) >= 0;
          return (
            <div
              key={`${asset.symbol}-${i}`}
              className="flex items-center gap-2 whitespace-nowrap select-none py-0.5"
            >
              <span className="text-[10px] font-mono text-text-secondary opacity-60 w-3 text-center">
                {CRYPTO_ICONS[asset.symbol?.toUpperCase()] || '●'}
              </span>
              <span className="text-[10px] font-mono font-bold text-text-primary tracking-wide w-10">
                {asset.symbol?.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-white tabular-nums w-[70px] text-right">
                {formatPrice(asset.price)}
              </span>
              <div className="w-[75px] flex justify-end">
                <Chip
                  size="small"
                  label={formatChange(asset.change_pct_24h)}
                  color={isPositive ? 'primary' : 'error'}
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: 9,
                    borderColor: isPositive ? 'rgba(0,255,157,0.32)' : 'rgba(255,68,68,0.32)',
                    bgcolor: isPositive ? 'rgba(0,255,157,0.055)' : 'rgba(255,68,68,0.055)',
                    '& .MuiChip-label': { px: 0.65 },
                  }}
                />
              </div>
              <span className="text-border/80 mx-1 text-[10px]">│</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default LiveTicker;
