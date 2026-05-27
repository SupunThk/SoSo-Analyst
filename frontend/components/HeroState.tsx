'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

import WalletConnect from '@/components/WalletConnect';
import { WalletConnection } from '@/lib/types';

const DEFAULT_HERO_QUERIES = [
  { icon: '📊', label: 'Regime', text: 'Give me the current market regime, rotation leaders, active alerts, and opportunities.' },
  { icon: '📈', label: 'Rotation', text: 'Show the SoSo SSI index rotation map and explain leaders and laggards.' },
  { icon: '🔎', label: 'Token Moving', text: 'Why is SOL moving? Use token intelligence, relative strength, SoDEX liquidity, and news.' },
  { icon: '🚨', label: 'Alerts', text: 'Which market alerts are firing right now and what exact data triggered them?' },
  { icon: '💹', label: 'Scanner', text: 'Show me the opportunity scanner with exact evidence and risks.' },
  { icon: '📰', label: 'News', text: 'What are the hottest crypto news stories right now and how do they affect the regime?' },
];

const DEFAULT_MOCK_PROMPTS = [
  "Analyze smart money flows into AI tokens",
  "What is the current SoSo SSI rotation?",
  "Show me token intelligence for SOL",
  "Scan for regime change alerts",
];

interface HeroStateProps {
  onRunQuery: (query: string) => void;
  onOpenManual: () => void;
  onConnectWallet: (connection: WalletConnection) => void | Promise<void>;
  walletAddress?: string | null;
}

const HeroState: React.FC<HeroStateProps> = ({ onRunQuery, onConnectWallet, walletAddress }) => {
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [heroQueries, setHeroQueries] = useState(DEFAULT_HERO_QUERIES);
  const [mockPrompts, setMockPrompts] = useState(DEFAULT_MOCK_PROMPTS);

  // Fetch trending token on mount to make prompts dynamic
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=["SOLUSDT","PEPEUSDT","DOGEUSDT","SUIUSDT","AVAXUSDT","LINKUSDT","WIFUSDT","RENDERUSDT"]');
        const data = await response.json();
        
        // Find the token with the highest 24h price change
        let topGainer = data[0];
        for (let i = 1; i < data.length; i++) {
          if (parseFloat(data[i].priceChangePercent) > parseFloat(topGainer.priceChangePercent)) {
            topGainer = data[i];
          }
        }
        
        const trendingTicker = topGainer.symbol.replace('USDT', '');
        const change = parseFloat(topGainer.priceChangePercent).toFixed(1);

        setHeroQueries(prev => prev.map(q => 
          q.label === 'Token Moving' 
            ? { ...q, label: `${trendingTicker} +${change}%`, text: `Why is ${trendingTicker} pumping? Use token intelligence, relative strength, SoDEX liquidity, and news.` }
            : q
        ));

        setMockPrompts(prev => prev.map(p => 
          p.includes('SOL') ? `Show me token intelligence for ${trendingTicker}` : p
        ));

      } catch (err) {
        console.error("Failed to fetch trending token", err);
      }
    };
    
    fetchTrending();
  }, []);

  useEffect(() => {
    const currentPrompt = mockPrompts[promptIndex];
    let timeout: NodeJS.Timeout;

    if (isDeleting) {
      if (typedText === '') {
        timeout = setTimeout(() => {
          setIsDeleting(false);
          setPromptIndex((prev) => (prev + 1) % mockPrompts.length);
        }, 30);
      } else {
        timeout = setTimeout(() => {
          setTypedText(typedText.slice(0, -1));
        }, 30);
      }
    } else {
      if (typedText === currentPrompt) {
        timeout = setTimeout(() => setIsDeleting(true), 2500);
      } else {
        timeout = setTimeout(() => {
          // If the prompt changed dynamically and no longer matches what we've typed, 
          // force a delete phase to cleanly reset.
          if (!currentPrompt.startsWith(typedText)) {
            setIsDeleting(true);
          } else {
            setTypedText(currentPrompt.slice(0, typedText.length + 1));
          }
        }, 70);
      }
    }

    return () => clearTimeout(timeout);
  }, [typedText, isDeleting, promptIndex, mockPrompts]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth px-4 sm:px-6 pt-6 md:pt-10 pb-8 relative z-10">
      <div className="max-w-7xl min-h-full mx-auto w-full flex flex-col items-center justify-start">
        <div className="mb-5 flex w-full flex-col items-center justify-between gap-4 md:mb-6 md:flex-row">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <div className="hero-logo shrink-0">
              <Image
                src="/logo-v2.png"
                alt="SoSo Analyst"
                width={92}
                height={92}
                className="select-none object-contain h-16 w-16 md:h-20 md:w-20"
                priority
              />
            </div>
            <div className="min-w-0 text-center md:text-left">
              <div className="text-xs font-sans font-medium text-text-secondary uppercase tracking-widest">
                SoSo Analyst Terminal
              </div>
              <h2 className="mt-1 text-xl md:text-2xl font-sans font-bold tracking-tight text-white uppercase">
                Live Market Intelligence
              </h2>
            </div>
          </div>

          <p className="hero-tagline max-w-sm text-center text-xs font-sans font-medium text-text-secondary/90 tracking-widest uppercase leading-relaxed md:text-right">
            Regime / Rotation / Token Movement / Alerts
          </p>
        </div>

        {/* Animated Typing Effect */}
        <div className="w-full mb-6 flex justify-center">
          <div className="text-center font-mono text-accent-green text-sm md:text-base border border-accent-green/30 bg-accent-green/[0.05] rounded-md px-6 py-3 shadow-[0_0_15px_rgba(0,255,157,0.1)] inline-block min-w-[280px] max-w-2xl h-12 flex items-center justify-center">
            <span className="text-glow-green">{typedText}</span>
            <span className="typing-cursor ml-[1px]" />
          </div>
        </div>



        {/* Connect Wallet CTA if not connected */}
        {!walletAddress && (
          <div className="mt-8 mb-4 flex justify-center w-full">
            <WalletConnect onConnect={onConnectWallet} walletAddress={walletAddress || null} />
          </div>
        )}

        {/* Quick Action Grid */}
        <div className="w-full mt-5 mb-5 md:mb-8 rounded-md glass-panel p-2.5 md:p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_48px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-2.5 w-full">
            {heroQueries.map((q, idx) => (
              <motion.button
                key={q.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.3 }}
                type="button"
                aria-label={`Run sample query: ${q.label}`}
                onClick={() => onRunQuery(q.text)}
                className="hero-grid-card glass-panel motion-safe:active:scale-[0.99] w-full min-w-0 overflow-hidden flex flex-col items-start gap-1.5 p-2.5 md:p-3.5 rounded-md hover:border-accent-green/45 hover:bg-accent-green/[0.07] text-left group min-h-[74px] md:min-h-[92px]"
              >
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <span className="text-sm">{q.icon}</span>
                  <span className="min-w-0 truncate text-xs font-sans font-semibold text-accent-green tracking-wider uppercase group-hover:text-white transition-colors">
                    {q.label}
                  </span>
                </div>
                <span className="block w-full min-w-0 overflow-hidden whitespace-normal break-words [overflow-wrap:anywhere] text-xs font-sans text-text-secondary leading-relaxed line-clamp-2">
                  {q.text}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default HeroState;
