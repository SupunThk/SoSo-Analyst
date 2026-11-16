'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { fetchPerpsMarkets, findSymbol, markPriceFor, sizeOrder, type PerpsMarkets } from '@/lib/sodex/market';
import { useSodexTrading, type TicketRequest } from './SodexTradingProvider';
import EnableTradingCard, { PRIMARY_BTN, SECONDARY_BTN, SODEX_APP_URL, builderFeePct } from './EnableTradingCard';

const usd = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INPUT =
  'h-9 w-full rounded-md border border-white/15 bg-white/[0.03] px-2.5 font-mono text-sm text-white focus:border-accent-green/60 focus:outline-none';

type Step = 'form' | 'confirm' | 'submitting';

export default function OrderTicket({ request, onClose }: { request: TicketRequest; onClose: () => void }) {
  const { phase, config, status, placeOrder } = useSodexTrading();
  const [markets, setMarkets] = useState<PerpsMarkets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [side, setSide] = useState<'long' | 'short' | null>(request.side ?? null);
  const [sizeUsd, setSizeUsd] = useState('50');
  const [leverage, setLeverage] = useState(2);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLossPct, setStopLossPct] = useState(request.suggestedStopPct ? String(request.suggestedStopPct) : '');
  const [takeProfitPct, setTakeProfitPct] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchPerpsMarkets().then(setMarkets).catch((err) => setLoadError(err.message || 'Failed to load SoDEX markets.'));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && step !== 'submitting') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  const symbol = markets ? findSymbol(markets, request.symbol) : null;
  const mark = markets ? markPriceFor(markets, request.symbol) : null;
  const maxLeverage = Math.min(config?.maxLeverage ?? 10, symbol?.maxLeverage ?? 10);
  const size = Number(sizeUsd);
  const limit = orderType === 'limit' ? Number(limitPrice) : null;
  const sl = Number(stopLossPct) || null;
  const tp = Number(takeProfitPct) || null;

  const preview = useMemo(() => {
    if (!symbol || !mark || !side || !(size > 0)) return null;
    if (orderType === 'limit' && !(limit && limit > 0)) return null;
    try {
      return sizeOrder({ symbol, side, sizeUsd: size, referencePrice: mark, limitPrice: limit });
    } catch {
      return null;
    }
  }, [symbol, mark, side, size, orderType, limit]);

  const notional = preview?.notionalUsd ?? 0;
  const margin = notional / leverage;
  const builderFeeUsd = config ? notional * (config.builderFee / 1000) / 100 : 0;
  const available = status?.availableMarginUsd ?? null;

  const blockers: string[] = [];
  if (!side) blockers.push('Choose long or short.');
  if (preview?.errors.length) blockers.push(...preview.errors);
  if (config && (preview?.boundNotionalUsd ?? 0) > config.maxOrderNotionalUsd) blockers.push(`App limit is ${usd(config.maxOrderNotionalUsd)} per order, counted at the order's worst-case price.`);
  if (available !== null && margin > available) blockers.push(`Needs ${usd(margin)} margin; ${usd(available)} available.`);
  if (sl !== null && (sl <= 0 || sl >= 50)) blockers.push('Stop-loss must be between 0% and 50%.');
  if (tp !== null && (tp <= 0 || tp >= 500)) blockers.push('Take-profit must be between 0% and 500%.');

  const warnings: string[] = [];
  if (leverage > 5) warnings.push(`${leverage}x leverage: a ${(100 / leverage).toFixed(1)}% move against you wipes the margin.`);
  if (!sl) warnings.push('No stop-loss set.');

  const canReview = phase === 'ready' && Boolean(preview) && blockers.length === 0;

  const submit = async () => {
    if (!side) return;
    setStep('submitting');
    setSubmitError(null);
    try {
      const result = await placeOrder({
        symbol: request.symbol,
        side,
        sizeUsd: size,
        leverage,
        limitPrice: limit,
        stopLossPct: sl,
        takeProfitPct: tp,
        source: request.source,
      });
      if (!result.ok) throw new Error(result.message || 'SoDEX rejected the order.');
      const entry = result.results[0];
      toast.success(`${side === 'long' ? 'Long' : 'Short'} ${request.symbol} submitted${entry?.orderID ? ` · #${entry.orderID}` : ''}`);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Order failed.');
      setStep('confirm');
    }
  };

  const body = (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => step !== 'submitting' && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-ticket-title"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-lg border border-white/10 bg-[#060A06] p-4 shadow-2xl sm:max-w-md sm:rounded-lg sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="order-ticket-title" className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
              Trade {request.symbol}
            </h2>
            <p className="mt-0.5 font-sans text-[11px] text-text-secondary">
              SoDEX perps{config?.network === 'testnet' ? ' · testnet' : ''}{mark ? ` · mark ${mark}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={step === 'submitting'} className="font-mono text-xs text-text-secondary hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {request.context && <p className="mb-3 font-sans text-xs leading-relaxed text-text-secondary">{request.context}</p>}
        {request.rationale && request.rationale.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-md border border-white/10 bg-white/[0.02] p-2.5 font-sans text-xs text-text-secondary">
            {request.rationale.map((line) => <li key={line}>• {line}</li>)}
          </ul>
        )}

        {phase !== 'ready' ? (
          <EnableTradingCard compact />
        ) : loadError ? (
          <p className="font-sans text-sm text-accent-red">{loadError}</p>
        ) : !markets ? (
          <div className="h-40 animate-pulse rounded-md bg-white/[0.04]" />
        ) : !symbol || !mark ? (
          <p className="font-sans text-sm text-text-secondary">
            {request.symbol} is not listed on SoDEX{config?.network === 'testnet' ? ' testnet' : ''}.{' '}
            <a className="text-accent-green underline" href={SODEX_APP_URL} target="_blank" rel="noopener noreferrer">Browse SoDEX markets</a>
          </p>
        ) : step === 'form' ? (
          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-2 gap-2">
              {(['long', 'short'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide(value)}
                  className={`h-9 rounded-md border font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                    side === value
                      ? value === 'long' ? 'border-accent-green bg-accent-green/15 text-accent-green' : 'border-accent-red bg-accent-red/15 text-accent-red'
                      : 'border-white/15 text-text-secondary hover:border-white/35'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            {request.side && side === request.side && (
              <p className="text-[11px] text-text-secondary">Side prefilled from the analyst signal. You can change it.</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-text-secondary">Size (USD)</span>
                <input className={INPUT} inputMode="decimal" value={sizeUsd} onChange={(e) => setSizeUsd(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-text-secondary">Order type</span>
                <select className={INPUT} value={orderType} onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}>
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </label>
            </div>

            {orderType === 'limit' && (
              <label className="block space-y-1">
                <span className="text-text-secondary">Limit price</span>
                <input className={INPUT} inputMode="decimal" value={limitPrice} placeholder={String(mark)} onChange={(e) => setLimitPrice(e.target.value)} />
              </label>
            )}

            <label className="block space-y-1">
              <span className="flex justify-between text-text-secondary"><span>Leverage</span><span className="font-mono text-white">{leverage}x</span></span>
              <input type="range" min={1} max={maxLeverage} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-full accent-[#00ff9d]" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-text-secondary">Stop-loss %</span>
                <input className={INPUT} inputMode="decimal" value={stopLossPct} placeholder="e.g. 3" onChange={(e) => setStopLossPct(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-text-secondary">Take-profit %</span>
                <input className={INPUT} inputMode="decimal" value={takeProfitPct} placeholder="optional" onChange={(e) => setTakeProfitPct(e.target.value)} />
              </label>
            </div>

            {(blockers.length > 0 || warnings.length > 0) && preview && (
              <ul className="space-y-1">
                {blockers.map((line) => <li key={line} className="text-accent-red">✕ {line}</li>)}
                {warnings.map((line) => <li key={line} className="text-accent-amber">! {line}</li>)}
              </ul>
            )}

            <button type="button" disabled={!canReview} onClick={() => setStep('confirm')} className={`${PRIMARY_BTN} w-full py-2`}>
              Review order
            </button>
          </div>
        ) : (
          <div className="space-y-3 font-sans text-xs">
            <dl className="divide-y divide-white/10 rounded-md border border-white/10 font-mono">
              {[
                ['Side', <span key="side" className={side === 'long' ? 'text-accent-green' : 'text-accent-red'}>{side?.toUpperCase()} {leverage}x</span>],
                ['Type', orderType === 'market' ? 'Market (IOC, max 1% slippage)' : `Limit @ ${preview?.price}`],
                ['Quantity', `${preview?.quantity} ${symbol.baseCoin}`],
                ['Order value', usd(notional)],
                ['Margin used', usd(margin)],
                ['Stop-loss / TP', `${sl ? `${sl}%` : 'none'} / ${tp ? `${tp}%` : 'none'}`],
                ['SoSo Analyst builder fee', `${config ? builderFeePct(config.builderFee) : ''} ≈ ${usd(builderFeeUsd)}`],
                ['SoDEX trading fee', 'per your SoDEX fee tier'],
                ['Available margin', available === null ? '—' : usd(available)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3 px-3 py-2">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd className="text-right text-white">{value}</dd>
                </div>
              ))}
            </dl>
            {warnings.map((line) => <p key={line} className="text-accent-amber">! {line}</p>)}
            {submitError && <p className="text-accent-red">{submitError}</p>}
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Not financial advice. Trading perps with leverage can lose more than you expect. This order is signed by your app trading key and sent to SoDEX.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={step === 'submitting'} onClick={() => setStep('form')} className={`${SECONDARY_BTN} py-2`}>Back</button>
              <button type="button" disabled={step === 'submitting'} onClick={() => void submit()} className={`${PRIMARY_BTN} py-2`}>
                {step === 'submitting' ? 'Submitting…' : 'Confirm order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
