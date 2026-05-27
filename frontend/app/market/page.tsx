import React from 'react';
import Header from '@/components/Header';
import MarketIntelligenceDashboard from '@/components/MarketIntelligenceDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market | SoSo Analyst',
  description: 'Live Market Intelligence, Regime, Rotation, and Trends.',
};

export default function MarketPage() {
  return (
    <div className="flex h-screen w-screen max-w-[100vw] bg-background overflow-hidden font-sans matrix-grid text-text-primary">
      <main className="flex-1 min-w-0 w-full max-w-full flex flex-col h-screen max-h-screen relative">
        {/* Fixed header — does not scroll */}
        <div className="shrink-0 z-20">
          <Header />
        </div>

        {/* Scrollable content area below the header */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 py-6 md:py-8 max-w-[1400px] mx-auto w-full">
            <div className="mb-6 flex flex-col gap-1">
              <h1 className="text-2xl md:text-3xl font-sans font-bold text-white tracking-tight uppercase">
                Market <span className="text-accent-green">Intelligence</span>
              </h1>
              <p className="text-sm text-text-secondary font-mono tracking-wide uppercase">
                Live Regime, Sector Rotation, Token Intel & Alerts
              </p>
            </div>

            <MarketIntelligenceDashboard />
          </div>
        </div>

        {/* CRT Overlays */}
        <div className="crt-overlay pointer-events-none fixed inset-0 z-50" />
        <div className="crt-vignette pointer-events-none fixed inset-0 z-50" />
      </main>
    </div>
  );
}
