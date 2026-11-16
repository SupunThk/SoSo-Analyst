'use client';

import React from 'react';
import { useSodexTrading } from './SodexTradingProvider';

export const SODEX_APP_URL = 'https://sodex.com';
export const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-accent-green/50 bg-accent-green/10 px-3 py-1.5 font-sans text-xs font-semibold text-accent-green transition-colors hover:border-accent-green hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50';
export const SECONDARY_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 font-sans text-xs font-medium text-text-primary transition-colors hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50';

// Builder fee is in tenths of a basis point: 50 -> 0.05%.
export const builderFeePct = (fee: number) => `${Number((fee / 1000).toFixed(3))}%`;

// Explains and runs the one-time "enable trading" step. Renders nothing once
// trading is ready.
export default function EnableTradingCard({ compact = false }: { compact?: boolean }) {
  const { phase, config, error, busy, enableTrading, refresh } = useSodexTrading();
  if (phase === 'ready' || phase === 'loading') return null;

  const fee = config ? builderFeePct(config.builderFee) : '';
  const network = config?.network === 'testnet' ? ' testnet' : '';

  let title = 'Enable SoDEX trading';
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  switch (phase) {
    case 'unavailable':
      title = 'In-app trading is not live yet';
      body = 'You can still trade this market directly on SoDEX.';
      action = <a href={SODEX_APP_URL} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>Open SoDEX</a>;
      break;
    case 'needs_signin':
      title = 'Sign in to trade';
      body = 'Connect and sign in with your wallet to trade SoDEX perps from SoSo Analyst.';
      break;
    case 'not_activated':
      title = 'Activate your SoDEX account';
      body = `This wallet has no SoDEX${network} trading account yet. Deposit at least 5 USDC on SoDEX to activate it, then come back.`;
      action = (
        <div className="flex flex-wrap gap-2">
          <a href={SODEX_APP_URL} target="_blank" rel="noopener noreferrer" className={PRIMARY_BTN}>Deposit on SoDEX</a>
          <button type="button" onClick={() => void refresh()} className={SECONDARY_BTN}>I deposited</button>
        </div>
      );
      break;
    case 'needs_approval':
      title = 'Approve the builder fee';
      body = `Your trading key is set up. SoSo Analyst now charges a ${fee} builder fee on each fill; approve it once to keep placing orders here.`;
      action = (
        <button type="button" disabled={busy} onClick={() => void enableTrading()} className={PRIMARY_BTN}>
          {busy ? 'Waiting for wallet…' : 'Approve in wallet'}
        </button>
      );
      break;
    case 'error':
      title = 'Trading status unavailable';
      body = error;
      action = <button type="button" onClick={() => void refresh()} className={SECONDARY_BTN}>Retry</button>;
      break;
    default:
      body = (
        <ul className="space-y-1.5">
          {config?.builderId != null ? (
            <li>• One wallet signature creates an app trading key for your SoDEX{network} account and approves a <span className="text-white">{fee} builder fee</span> to SoSo Analyst on each fill.</li>
          ) : (
            <li>• One wallet signature creates an app trading key for your SoDEX{network} account.</li>
          )}
          <li>• The key can only place and cancel orders. It cannot withdraw or transfer funds, and it expires in 7 days.</li>
          <li>• The key stays in this browser, and you confirm every order.</li>
        </ul>
      );
      action = (
        <button type="button" disabled={busy} onClick={() => void enableTrading()} className={PRIMARY_BTN}>
          {busy ? 'Waiting for wallet…' : 'Enable trading'}
        </button>
      );
  }

  return (
    <div className={`rounded-md border border-accent-amber/30 bg-accent-amber/[0.04] ${compact ? 'p-3' : 'p-4'} font-sans text-xs`}>
      <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent-amber">{title}</div>
      {body && <div className="mb-3 leading-relaxed text-text-secondary">{body}</div>}
      {error && phase !== 'error' && <div className="mb-3 text-accent-red">{error}</div>}
      {action}
    </div>
  );
}
