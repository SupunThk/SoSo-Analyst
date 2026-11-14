'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';

import WalletConnect from '@/components/WalletConnect';
import { WalletConnection, MarketRegime } from '@/lib/types';
import { fetchMarketIntelligence } from '@/lib/api';

const DEFAULT_HERO_QUERIES = [
  { icon: '📊', label: 'Market Overview', text: 'Give me a full market overview report - BTC price, top movers, sector trends, news, macro calendar, and strategic outlook.' },
  { icon: '📰', label: 'Hot News', text: 'Give me a headline-first crypto news report: top stories, why each matters, market readthrough, and what to watch next.' },
  { icon: '🏦', label: 'ETF Flows', text: 'Give me a US Bitcoin spot ETF flow report: latest flows, top funds, AUM/volume context, BTC price readthrough, and risks.' },
  { icon: '🔥', label: 'Sectors', text: 'Give me a ranked crypto sector report: sector leaders, laggards, key evidence, rotation takeaway, and risks.' },
  { icon: '📉', label: 'Macro Events', text: 'Give me a crypto macro calendar report: upcoming events, dates, expected impact, and what to watch next.' },
];

const DEFAULT_MOCK_PROMPTS = [
  'Give me a Bitcoin price snapshot report',
  'Compare Bitcoin and Ethereum in a report table',
  'Give me a ranked sector rotation report',
];

const REGIME_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  'Risk-On': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.2)]' },
  'Risk-Off': { bg: 'bg-red-500/15', text: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.2)]' },
  'Rotation': { bg: 'bg-amber-500/15', text: 'text-amber-400', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]' },
  'Chop': { bg: 'bg-slate-400/15', text: 'text-slate-400', glow: 'shadow-[0_0_12px_rgba(148,163,184,0.15)]' },
};

const RISK_COLORS: Record<string, { dot: string; label: string }> = {
  low: { dot: 'bg-emerald-400', label: 'Low Risk' },
  moderate: { dot: 'bg-amber-400', label: 'Moderate' },
  elevated: { dot: 'bg-orange-400', label: 'Elevated' },
  high: { dot: 'bg-red-400', label: 'High Risk' },
};

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
  const [regime, setRegime] = useState<MarketRegime | null>(null);

  // Fetch market regime on mount
  useEffect(() => {
    const controller = new AbortController();
    fetchMarketIntelligence(controller.signal)
      .then((data) => {
        if (data?.regime) setRegime(data.regime);
      })
      .catch(() => { /* silently ignore — hero still works without regime */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const currentPrompt = DEFAULT_MOCK_PROMPTS[promptIndex];
    let timeout: NodeJS.Timeout;

    if (isDeleting) {
      if (typedText === '') {
        timeout = setTimeout(() => {
          setIsDeleting(false);
          setPromptIndex((prev) => (prev + 1) % DEFAULT_MOCK_PROMPTS.length);
        }, 30);
      } else {
        timeout = setTimeout(() => {
          setTypedText(typedText.slice(0, -1));
        }, 30);
      }
    } else if (typedText === currentPrompt) {
      timeout = setTimeout(() => setIsDeleting(true), 2500);
    } else {
      timeout = setTimeout(() => {
        if (!currentPrompt.startsWith(typedText)) {
          setIsDeleting(true);
        } else {
          setTypedText(currentPrompt.slice(0, typedText.length + 1));
        }
      }, 70);
    }

    return () => clearTimeout(timeout);
  }, [typedText, isDeleting, promptIndex]);

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
            Prices / News / ETF Flows / Macro / Sectors
          </p>
        </div>

        {/* ── Market Regime Indicator ── */}
        {regime && (() => {
          const regimeStyle = REGIME_COLORS[regime.label] || REGIME_COLORS['Chop'];
          const riskStyle = RISK_COLORS[regime.riskLevel] || RISK_COLORS['moderate'];
          return (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className={`w-full mb-5 flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-white/[0.06] ${regimeStyle.bg} ${regimeStyle.glow}`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${riskStyle.dot} animate-pulse`} />
                <span className={`font-mono text-xs font-bold uppercase tracking-wider ${regimeStyle.text}`}>
                  {regime.label}
                </span>
              </div>
              <span className="text-white/20">│</span>
              <span className="font-mono text-[10px] text-text-secondary uppercase tracking-wider">
                Breadth {regime.breadthPct >= 0 ? '+' : ''}{regime.breadthPct}%
              </span>
              <span className="text-white/20">│</span>
              <span className={`font-mono text-[10px] uppercase tracking-wider ${riskStyle.dot.replace('bg-', 'text-')}`}>
                {riskStyle.label}
              </span>
            </motion.div>
          );
        })()}

        <div className="w-full mb-6 flex justify-center">
          <div className="text-center font-mono text-accent-green text-sm md:text-base border border-accent-green/30 bg-accent-green/[0.05] rounded-md px-6 py-3 shadow-[0_0_15px_rgba(0,255,157,0.1)] inline-flex min-w-[280px] max-w-2xl h-12 items-center justify-center">
            <span className="text-glow-green">{typedText}</span>
            <span className="typing-cursor ml-[1px]" />
          </div>
        </div>

        {!walletAddress && (
          <div className="mt-8 mb-4 flex justify-center w-full">
            <WalletConnect onConnect={onConnectWallet} walletAddress={walletAddress || null} />
          </div>
        )}

        <div className="w-full mt-5 mb-5 md:mb-8 rounded-md glass-panel p-2.5 md:p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_48px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-2.5 w-full">
            {DEFAULT_HERO_QUERIES.map((q, idx) => (
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
