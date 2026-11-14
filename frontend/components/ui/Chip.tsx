import type { ReactNode } from 'react';

export type ChipTone = 'green' | 'red' | 'amber' | 'neutral';

const TONES: Record<ChipTone, string> = {
  green: 'border-accent-green/35 bg-accent-green/[0.055] text-accent-green',
  red: 'border-accent-red/35 bg-accent-red/[0.055] text-accent-red',
  amber: 'border-accent-amber/35 bg-accent-amber/[0.055] text-accent-amber',
  neutral: 'border-border bg-white/[0.025] text-text-secondary',
};

type ChipProps = {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
};

// Small outlined status label (replaces MUI Chip).
export function Chip({ children, tone = 'neutral', className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex h-[18px] items-center gap-1 rounded-md border px-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
