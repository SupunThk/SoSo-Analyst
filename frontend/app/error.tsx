'use client';

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background text-text-primary font-mono flex items-center justify-center px-6">
      <section className="w-full max-w-xl border border-accent-red/40 bg-[#060A06] p-6 rounded-sm">
        <p className="text-[10px] uppercase tracking-[0.2em] text-accent-red mb-3">
          System Fault
        </p>
        <h1 className="text-xl font-bold text-white mb-3">Terminal session failed</h1>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">
          The interface hit an unexpected error. The analysis engine may still be available after a reset.
        </p>
        {error.digest && (
          <p className="text-[10px] text-text-secondary mb-5">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 border border-accent-green/40 text-accent-green hover:bg-accent-green hover:text-black transition-colors text-xs font-bold uppercase tracking-widest rounded-sm"
        >
          Reset Interface
        </button>
      </section>
    </main>
  );
}
