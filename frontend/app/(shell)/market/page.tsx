import React from 'react';
import MarketIntelligenceDashboard from '@/components/MarketIntelligenceDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market | SoSo Analyst',
  description: 'Live Market Intelligence, Regime, Rotation, and Trends.',
};

export default function MarketPage() {
  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar">
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
  );
}
