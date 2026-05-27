'use client';

import React, { useEffect, useRef } from 'react';

interface SystemManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TITLE_ID = 'system-manual-title';

const SystemManualModal: React.FC<SystemManualModalProps> = ({ isOpen, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="relative w-full max-w-2xl bg-[#060A06] border border-accent-green/35 rounded-md shadow-[0_0_40px_rgba(0,255,157,0.12),0_24px_64px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.05] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-accent-green/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.6)] animate-pulse" />
            <h2 id={TITLE_ID} className="text-accent-green font-mono text-sm font-bold tracking-widest uppercase">
              System Manual & Capabilities
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors p-1"
            title="Close (Esc)"
            aria-label="Close system manual"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
            <div>
              <p className="text-sm text-text-primary mb-4 leading-relaxed font-mono">
                SoSo Analyst is a specialized terminal calibrated <strong className="text-accent-green">strictly for cryptocurrency market analysis</strong> and macroeconomic tracking. 
                Queries outside of this scope will be automatically rejected.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-accent-green/80 uppercase tracking-widest border-b border-border pb-1">Supported Domains</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-accent-cyan text-sm mb-1 font-bold">📊 Market Data</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Live prices, trading volume, 24h/7d changes, market cap, ATH/ATL data, and real-time asset comparisons.</p>
                </div>
                
                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-accent-amber text-sm mb-1 font-bold">📈 Trend & Technicals</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Historical price movements, computed volatility, trends, and kline/candlestick data extraction.</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-accent-purple text-sm mb-1 font-bold">💼 Institutional Flows</div>
                  <p className="text-xs text-text-secondary leading-relaxed">US spot ETF daily net flows, fund performance, and public company Bitcoin treasury holdings (MSTR, etc).</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-accent-blue text-sm mb-1 font-bold">🔍 Tokenomics</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Circulating supply, maximum supply, unlock schedules, inflation tracking, and exchange trading pairs.</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-white text-sm mb-1 font-bold">🏛️ Macro & Indices</div>
                  <p className="text-xs text-text-secondary leading-relaxed">FOMC, CPI, employment data schedules, historical macro event impact, and <strong className="text-accent-green font-normal">SoSoValue SSI Indices</strong>.</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm">
                  <div className="text-accent-green text-sm mb-1 font-bold">📰 Venture & Intelligence</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Hottest crypto news, asset sentiment, <strong className="text-accent-green font-normal">sector spotlights</strong>, and <strong className="text-accent-green font-normal">VC fundraising/investment data</strong>.</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm md:col-span-2">
                  <div className="text-accent-green text-sm mb-1 font-bold">🧭 Market Intelligence Layer</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Deterministic regime detection, SoSo SSI rotation map, token movement explainers, opportunity scanner, and alert triggers built from live SoSoValue and SoDEX data.</p>
                </div>

                <div className="p-3 border border-border bg-[#0a100a] rounded-sm md:col-span-2">
                  <div className="text-accent-cyan text-sm mb-1 font-bold">📘 SoDEX Reads</div>
                  <p className="text-xs text-text-secondary leading-relaxed">Spot/perps markets, tickers, order books, wallet balances, open orders, positions, and recent trade history. Live trade execution is disabled until signed order submission is fully implemented.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-red-500/80 uppercase tracking-widest mb-2">Restricted Queries</h3>
              <p className="text-xs text-text-secondary leading-relaxed font-mono">
                The terminal will block and reject general knowledge questions, programming help, creative writing, or casual conversational prompts.
              </p>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-accent-cyan/80 uppercase tracking-widest mb-3">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-text-secondary">
                  <kbd className="px-1.5 py-0.5 border border-border rounded text-[9px] text-accent-green bg-surface">Ctrl+K</kbd>
                  <span>Focus input</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <kbd className="px-1.5 py-0.5 border border-border rounded text-[9px] text-accent-green bg-surface">Ctrl+L</kbd>
                  <span>Clear terminal</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <kbd className="px-1.5 py-0.5 border border-border rounded text-[9px] text-accent-green bg-surface">Esc</kbd>
                  <span>Close modal</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <kbd className="px-1.5 py-0.5 border border-border rounded text-[9px] text-accent-green bg-surface">↑ ↓</kbd>
                  <span>Command history</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemManualModal;
