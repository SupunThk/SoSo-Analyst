'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip } from './ui/Tooltip';
import { Icon } from './ui/Icon';
import WalletConnect from './WalletConnect';
import { WalletConnection } from '@/lib/types';
import { NAV_ITEMS, isNavActive } from '@/lib/navigation';

interface HeaderProps {
  onOpenManual?: () => void;
  onConnectWallet?: (connection: WalletConnection) => void | Promise<void>;
  walletAddress?: string | null;
  onToggleMobileSidebar?: () => void;
  mobileSidebarOpen?: boolean;
}

const formatUtc = (now: Date) =>
  [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');

const Header: React.FC<HeaderProps> = ({ onOpenManual, onConnectWallet, walletAddress, onToggleMobileSidebar, mobileSidebarOpen }) => {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(formatUtc(new Date()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex w-full max-w-full items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-3 py-2 backdrop-blur-md sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-6">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
            aria-controls="sessions-sidebar"
            aria-label={mobileSidebarOpen ? 'Close sessions sidebar' : 'Open sessions sidebar'}
            aria-expanded={Boolean(mobileSidebarOpen)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
        )}

        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md" aria-label="SoSo Analyst home">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent-green/35 bg-accent-green/[0.08] text-accent-green">
            <Icon name="terminal" size={16} />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-green shadow-[0_0_6px_rgba(0,255,157,0.8)]" aria-hidden />
          </span>
          <span className="truncate font-sans text-[15px] font-semibold tracking-tight text-white sm:text-base">
            SoSo <span className="text-accent-green">Analyst</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative rounded-md px-3 py-1.5 font-sans text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/[0.06] text-white' : 'text-text-secondary hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-accent-green" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden items-center gap-3 rounded-md border border-border bg-surface/70 px-3 py-1.5 lg:flex">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent-green">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-green" />
            </span>
            Live
          </span>
          <span className="h-3.5 w-px bg-border" aria-hidden />
          <span className="font-mono text-[11px] tabular-nums text-text-primary" aria-label="UTC time">
            {time || '--:--:--'} <span className="text-text-secondary">UTC</span>
          </span>
        </div>

        {onOpenManual && (
          <Tooltip title="System manual" placement="bottom">
            <button
              type="button"
              onClick={onOpenManual}
              className="hidden h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-white md:flex"
              aria-label="Open system manual"
            >
              <Icon name="help" size={18} />
            </button>
          </Tooltip>
        )}

        {onConnectWallet && (
          <WalletConnect onConnect={onConnectWallet} walletAddress={walletAddress || null} />
        )}
      </div>
    </header>
  );
};

export default Header;
