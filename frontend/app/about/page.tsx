import React from 'react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-text-primary font-mono matrix-grid">
      <div className="p-8 border border-accent-green/30 bg-[#060A06]/90 rounded-md shadow-lg max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold text-accent-green mb-4 uppercase tracking-widest">About SoSo Analyst</h1>
        <p className="text-sm text-text-secondary mb-6 leading-relaxed">
          SoSo Analyst is an AI-powered crypto research terminal. It connects to real-time market data, ETF flows, tokenomics, and more to provide deterministic market intelligence.
        </p>
        <div className="flex justify-center">
          <Link href="/" className="px-4 py-2 border border-accent-green/50 text-accent-green hover:bg-accent-green/10 rounded-md transition-colors text-xs uppercase tracking-widest">
            Return to Terminal
          </Link>
        </div>
      </div>
    </div>
  );
}
