'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Chip } from './ui/Chip';
import { motion } from 'motion/react';
import { MarketIntelligence, TokenIntelligence } from '@/lib/types';
import { fetchMarketIntelligence, fetchTokenIntelligence, isAbortError, isRateLimitError } from '@/lib/api';

import { MetricPill, LoadingPanel, updatedLabel, formatCompact } from './dashboard/ui';
import { RegimePanel } from './dashboard/RegimePanel';
import { RotationPanel } from './dashboard/RotationPanel';
import { TokenPanel } from './dashboard/TokenPanel';
import { OpportunityPanel } from './dashboard/OpportunityPanel';
import { AlertEnginePanel } from './dashboard/AlertEnginePanel';
import { ETFPanel } from './dashboard/ETFPanel';
import { NewsPanel } from './dashboard/NewsPanel';
import { MacroPanel } from './dashboard/MacroPanel';

const ALERT_STORAGE_KEY = 'soso_signal_alert_disabled_ids';

interface MarketIntelligenceDashboardProps {
  onRunQuery?: (query: string) => void;
}

const WarningNote = ({ children }: { children: React.ReactNode }) => (
  <div role="status" className="flex items-start gap-2 rounded-md border border-accent-amber/25 bg-accent-amber/[0.045] px-3 py-1.5 font-mono text-[9px] text-accent-amber">
    <span aria-hidden>⚠</span>
    <span>{children}</span>
  </div>
);

const MarketIntelligenceDashboard: React.FC<MarketIntelligenceDashboardProps> = ({ onRunQuery }) => {
  const [data, setData] = useState<MarketIntelligence | null>(null);
  const [token, setToken] = useState<TokenIntelligence | null>(null);
  const [selectedToken, setSelectedToken] = useState('BTC');
  const [disabledAlertIds, setDisabledAlertIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      window.localStorage.removeItem(ALERT_STORAGE_KEY);
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const latestMarketDataRef = useRef<MarketIntelligence | null>(null);
  const latestTokenRef = useRef<TokenIntelligence | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setError(null);
        const intelligence = await fetchMarketIntelligence(controller.signal);
        if (controller.signal.aborted) return;
        latestMarketDataRef.current = intelligence;
        setData(intelligence);
        setWarning(null);
        setLoading(false);
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        // Rate limit: silently keep stale data, never show rate-limit error
        if (isRateLimitError(err)) {
          if (latestMarketDataRef.current) {
            setData(latestMarketDataRef.current);
            setWarning(null);
          }
          setLoading(false);
          // No stale data — stay in loading state, retry will happen next interval
          return;
        }
        const message = err instanceof Error ? err.message : 'Market intelligence failed.';
        if (latestMarketDataRef.current) {
          setWarning(message);
        } else {
          setError(message);
        }
        setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadToken = async () => {
      setTokenLoading(true);
      try {
        const intelligence = await fetchTokenIntelligence(selectedToken, controller.signal);
        latestTokenRef.current = intelligence;
        setToken(intelligence);
      } catch (err) {
        if (isAbortError(err)) return;
        // On any error (including rate limit), keep stale token data
        setToken(latestTokenRef.current);
      } finally {
        setTokenLoading(false);
      }
    };

    loadToken();
    return () => {
      controller.abort();
    };
  }, [selectedToken]);

  const toggleAlert = (id: string) => {
    setDisabledAlertIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="grid w-full gap-4 lg:grid-cols-2">
        <LoadingPanel />
        <LoadingPanel />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="w-full rounded-md border border-accent-red/35 bg-accent-red/5 px-4 py-3 font-mono text-text-primary">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-accent-red">
          ⚠ Market Intelligence Offline
        </div>
        <div className="mt-2 text-[11px] font-mono leading-relaxed text-text-primary">
          {error || 'No intelligence payload returned.'}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="relative overflow-hidden flex flex-col gap-2 rounded-md border border-border/80 bg-[#030503]/80 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_42px_rgba(0,0,0,0.28)] md:flex-row md:items-center md:justify-between">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-green/45 to-transparent" />
        <div className="min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-text-secondary">
            Intelligence Layer
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="truncate text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-white">
              SoSoValue / SoSo SSI / SoDEX
            </span>
            <Chip
              tone={data.regime.score >= 55 ? 'green' : data.regime.score <= 45 ? 'red' : 'amber'}
              className="h-5"
            >
              {data.regime.label}
            </Chip>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:min-w-[330px]">
          <MetricPill label="Updated" value={updatedLabel(data.fetchedAt)} tone="text-accent-green" />
          <MetricPill label="Latency" value={`${data.latencyMs}ms`} tone="text-accent-cyan" />
          <MetricPill label="SoDEX" value={`${formatCompact(data.sodex.counts.perpsTickers)} perps`} tone="text-accent-amber" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <RegimePanel data={data} onRunQuery={onRunQuery} />
        <RotationPanel data={data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <TokenPanel
          token={token}
          selectedToken={selectedToken}
          setSelectedToken={setSelectedToken}
          loading={tokenLoading}
          onRunQuery={onRunQuery}
        />
        <OpportunityPanel data={data} onRunQuery={onRunQuery} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ETFPanel />
        <NewsPanel />
        <MacroPanel />
      </div>

      <AlertEnginePanel
        data={data}
        disabledAlertIds={disabledAlertIds}
        toggleAlert={toggleAlert}
      />

      {warning && <WarningNote>{warning}</WarningNote>}

      {data.warnings.length > 0 && <WarningNote>{data.warnings.slice(0, 2).join(' | ')}</WarningNote>}
    </motion.div>
  );
};

export default MarketIntelligenceDashboard;
