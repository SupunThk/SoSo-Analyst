'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { Icon } from '@/components/ui/Icon';
import { WalletConnection, MarketRegime } from '@/lib/types';
import { fetchMarketIntelligence } from '@/lib/api';
import { QUICK_PROMPTS } from '@/lib/quickPrompts';

const REGIME_TONE: Record<string, string> = {
  'Risk-On': 'border-accent-green/30 bg-accent-green/[0.07] text-accent-green',
  'Risk-Off': 'border-accent-red/30 bg-accent-red/[0.07] text-accent-red',
  Rotation: 'border-accent-amber/30 bg-accent-amber/[0.07] text-accent-amber',
  Chop: 'border-white/15 bg-white/[0.04] text-text-primary',
};

const RISK_LABEL: Record<string, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  elevated: 'Elevated risk',
  high: 'High risk',
};

interface HeroStateProps {
  onRunQuery: (query: string) => void;
  onOpenManual: () => void;
  onConnectWallet: (connection: WalletConnection) => void | Promise<void>;
  walletAddress?: string | null;
}

const formatSigned = (value: number) => `${value >= 0 ? '+' : ''}${value}%`;

const HeroState: React.FC<HeroStateProps> = ({ onRunQuery, onOpenManual }) => {
  const [regime, setRegime] = useState<MarketRegime | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMarketIntelligence(controller.signal)
      .then((data) => {
        if (data?.regime) setRegime(data.regime);
      })
      .catch(() => { /* the hero works without the regime strip */ });
    return () => controller.abort();
  }, []);

  return (
    <div className="relative z-10 flex-1 min-h-0 overflow-y-auto scroll-smooth px-4 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center py-8 md:py-12">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-green/30 bg-accent-green/[0.06] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-accent-green">
            <Icon name="bolt" size={12} />
            Live SoSoValue intelligence
          </span>

          <h2 className="mt-5 max-w-3xl font-sans text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-4xl md:text-[44px]">
            Ask anything about crypto markets
          </h2>
          <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary sm:text-base">
            Grounded answers from live data: spot ETF flows, sector rotation, Fed rate odds,
            token unlocks, fundraising and news.
          </p>

          {regime && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => onRunQuery('Explain the current market regime: what is driving it, breadth, and the key risks to watch.')}
              className={`mt-5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors hover:brightness-125 ${REGIME_TONE[regime.label] || REGIME_TONE.Chop}`}
              aria-label={`Market regime ${regime.label}. Ask for an explanation.`}
            >
              <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {regime.label}
              </span>
              <span className="text-text-secondary">Breadth {formatSigned(regime.breadthPct)}</span>
              <span className="text-text-secondary">{RISK_LABEL[regime.riskLevel] || 'Moderate risk'}</span>
            </motion.button>
          )}
        </div>

        <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 md:mt-10 lg:grid-cols-3 lg:gap-3">
          {QUICK_PROMPTS.map((prompt, idx) => (
            <motion.button
              key={prompt.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * idx, duration: 0.25 }}
              onClick={() => onRunQuery(prompt.text)}
              aria-label={`Ask: ${prompt.label}`}
              className="hero-grid-card group flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface/80 p-3.5 text-left transition-colors hover:border-accent-green/40 hover:bg-surface-alt sm:flex-col sm:gap-0 sm:p-4"
            >
              <div className="flex shrink-0 items-center justify-between sm:w-full">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent-green/20 bg-accent-green/[0.06] text-accent-green">
                  <Icon name={prompt.icon} size={16} />
                </span>
                <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary sm:inline">
                  {prompt.tag}
                </span>
              </div>
              <div className="min-w-0 sm:mt-3">
                <div className="flex items-center gap-1.5 font-sans text-[15px] font-medium text-white">
                  {prompt.label}
                  <Icon
                    name="arrowRight"
                    size={14}
                    className="text-accent-green opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </div>
                <p className="mt-1 line-clamp-2 font-sans text-[13px] leading-snug text-text-secondary">
                  {prompt.description}
                </p>
              </div>
            </motion.button>
          ))}
        </div>

        <p className="mt-6 text-center font-sans text-xs text-text-secondary">
          Type <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-primary">/help</kbd> for commands, or{' '}
          <button type="button" onClick={onOpenManual} className="text-accent-green underline-offset-2 hover:underline">
            open the manual
          </button>
          .
        </p>
      </div>
    </div>
  );
};

export default HeroState;
