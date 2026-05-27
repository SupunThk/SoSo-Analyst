'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import WalletConnect from './WalletConnect';
import { WalletConnection } from '@/lib/types';

interface HeaderProps {
  onOpenManual?: () => void;
  onConnectWallet?: (connection: WalletConnection) => void | Promise<void>;
  walletAddress?: string | null;
  onToggleMobileSidebar?: () => void;
  mobileSidebarOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onOpenManual, onConnectWallet, walletAddress, onToggleMobileSidebar, mobileSidebarOpen }) => {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  const [colonVisible, setColonVisible] = useState(true);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const start = Date.now();

    const tick = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      setTime(`${h}:${m}:${s}`);
      setColonVisible(prev => !prev);
      setUptime(Math.floor((Date.now() - start) / 1000));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(min).padStart(2, '0')}${colonVisible ? ':' : ' '}${String(sec).padStart(2, '0')}`;
  };

  return (
    <header className="glass-panel relative w-full max-w-full border-b border-border/80 py-2.5 px-3 sm:px-4 md:px-6 flex justify-between items-center gap-2 sticky top-0 z-20 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2 md:gap-4 min-w-0 pr-24 sm:pr-32 md:pr-0">
        {/* Hamburger menu — mobile only */}
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="md:hidden flex flex-col items-center justify-center w-8 h-8 gap-[5px] text-text-secondary hover:text-accent-green transition-colors"
            title="Open Sidebar"
            aria-controls="sessions-sidebar"
            aria-label={mobileSidebarOpen ? 'Close sessions sidebar' : 'Open sessions sidebar'}
            aria-expanded={Boolean(mobileSidebarOpen)}
          >
            <span className="block w-4 h-[1.5px] bg-current rounded-full" />
            <span className="block w-4 h-[1.5px] bg-current rounded-full" />
            <span className="block w-3 h-[1.5px] bg-current rounded-full" />
          </button>
        )}

          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-2 h-2 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.6)]" />
              <div className="absolute inset-0 w-2 h-2 bg-accent-green rounded-full animate-ping opacity-30" />
            </div>
            <h1 className="font-mono text-xs sm:text-sm md:text-base font-bold tracking-tight text-white uppercase truncate hover:text-accent-green transition-colors">
              SoSo<span className="text-accent-green text-glow-green">Analyst</span>
            </h1>
          </Link>
        <div className="h-4 w-px bg-border hidden md:block" />
        <span className="text-[11px] font-mono font-medium text-text-secondary uppercase tracking-widest hidden md:block">
          Terminal v3.0
        </span>
        
        {/* Navigation Tabs */}
        <div className="hidden md:flex bg-black/40 border border-white/5 rounded-md p-1 shadow-inner gap-1 ml-2">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-sm text-xs font-sans font-medium transition-colors ${
              pathname === '/'
                ? 'bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            Terminal
          </Link>

          <Link
            href="/market"
            className={`px-3 py-1.5 rounded-sm text-xs font-sans font-medium transition-colors ${
              pathname === '/market'
                ? 'bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            Market
          </Link>

          <Link
            href="/indexes"
            className={`px-3 py-1.5 rounded-sm text-xs font-sans font-medium transition-colors ${
              pathname === '/indexes'
                ? 'bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            Indexes
          </Link>
          
          <Link
            href="/profile"
            className={`px-3 py-1.5 rounded-sm text-xs font-sans font-medium transition-colors ${
              pathname === '/profile'
                ? 'bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            Dashboard
          </Link>

          <Link
            href="/charts"
            className={`px-3 py-1.5 rounded-sm text-xs font-sans font-medium transition-colors flex items-center gap-1.5 ${
              pathname === '/charts'
                ? 'bg-white/10 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="w-1.5 h-1.5 bg-accent-amber rounded-full shadow-[0_0_4px_rgba(255,180,0,0.6)]"></span>
            Charts
          </Link>

        </div>
      </div>

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 shrink-0 md:static md:translate-y-0 md:gap-5">
        <div className="hidden md:flex items-center gap-5">

          {onOpenManual && (
            <Tooltip title="System Manual" placement="bottom">
              <button
                onClick={onOpenManual}
                className="text-text-secondary hover:text-white transition-colors font-mono text-xs px-1"
                aria-label="System Manual"
              >
                [ ? ]
              </button>
            </Tooltip>
          )}

          <div className="h-6 w-px bg-border" />

          {/* Uptime */}
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-sans font-medium text-text-secondary uppercase tracking-wider">UPTIME</span>
            <span className="text-xs font-mono text-accent-green tabular-nums">{formatUptime(uptime)}</span>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* UTC Clock */}
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-sans font-medium text-text-secondary uppercase tracking-wider">UTC</span>
            <span className="text-xs font-mono text-accent-green text-glow-green tabular-nums font-bold">
              {time}
            </span>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Status */}
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-sans font-medium text-text-secondary uppercase tracking-wider">STATUS</span>
            <Chip
              size="small"
              label="LIVE"
              color="primary"
              variant="outlined"
              sx={{
                mt: 0.25,
                height: 18,
                fontSize: 10,
                bgcolor: 'rgba(0,255,157,0.06)',
                '& .MuiChip-label': { px: 0.75 },
                '&::before': {
                  content: '""',
                  width: 5,
                  height: 5,
                  borderRadius: '999px',
                  bgcolor: 'primary.main',
                  boxShadow: '0 0 8px rgba(0,255,157,0.8)',
                  ml: 0.75,
                },
              }}
            />
          </div>

          <div className="h-6 w-px bg-border" />
        </div>

        {/* User Profile / Wallet */}
        {onConnectWallet && (
          <div className="flex flex-col items-end gap-1">
            <span className="hidden md:block text-[10px] font-sans font-medium text-text-secondary uppercase tracking-wider">PROFILE</span>
            <WalletConnect onConnect={onConnectWallet} walletAddress={walletAddress || null} />
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
