import type { Metadata } from 'next';
import BuilderStats from '@/components/trade/BuilderStats';

export const metadata: Metadata = {
  title: 'Builder Stats | SoSo Analyst',
  description: 'Live SoDEX builder-code statistics for SoSo Analyst: traders, volume, fills and builder fees.',
};

export default function BuilderPage() {
  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 md:py-8">
        <div className="mb-5 flex flex-col gap-1 md:mb-6">
          <h1 className="flex items-center gap-2.5 font-sans text-2xl font-semibold tracking-tight text-white md:text-3xl">
            <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_8px_rgba(0,255,157,0.6)]" aria-hidden />
            Builder Stats
          </h1>
          <p className="font-sans text-sm text-text-secondary">
            Trades placed on SoDEX through SoSo Analyst, from SoDEX&apos;s own builder-code records.
          </p>
        </div>
        <BuilderStats />
      </div>
    </div>
  );
}
