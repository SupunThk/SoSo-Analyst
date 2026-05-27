'use client';

import React, { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { motion } from 'framer-motion';
import { MarketIntelligence, TokenIntelligence } from '@/lib/types';
import { fetchMarketIntelligence, fetchTokenIntelligence } from '@/lib/api';

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
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const intelligence = await fetchMarketIntelligence();
        if (!cancelled) {
          latestMarketDataRef.current = intelligence;
          setData(intelligence);
          setWarning(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Market intelligence failed.';
        if (!cancelled) {
          if (latestMarketDataRef.current) {
            setWarning(message);
          } else {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadToken = async () => {
      setTokenLoading(true);
      try {
        const intelligence = await fetchTokenIntelligence(selectedToken);
        if (!cancelled) {
          latestTokenRef.current = intelligence;
          setToken(intelligence);
        }
      } catch {
        if (!cancelled) {
          setToken(latestTokenRef.current);
        }
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    };

    loadToken();
    return () => {
      cancelled = true;
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
      <Alert
        severity="error"
        variant="outlined"
        sx={{
          width: '100%',
          bgcolor: 'rgba(255,68,68,0.05)',
          borderColor: 'rgba(255,68,68,0.35)',
          color: 'text.primary',
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
        }}
      >
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-accent-red">
          Market Intelligence Offline
        </div>
        <div className="mt-2 text-[11px] font-mono leading-relaxed text-text-primary">
          {error || 'No intelligence payload returned.'}
        </div>
      </Alert>
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
              size="small"
              label={data.regime.label}
              color={data.regime.score >= 55 ? 'primary' : data.regime.score <= 45 ? 'error' : 'warning'}
              variant="outlined"
              sx={{ height: 20, fontSize: 9, bgcolor: 'rgba(255,255,255,0.025)' }}
            />
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

      {warning && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{
            bgcolor: 'rgba(255,184,0,0.045)',
            borderColor: 'rgba(255,184,0,0.25)',
            color: '#FFB800',
            py: 0,
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 9,
          }}
        >
          {warning}
        </Alert>
      )}

      {data.warnings.length > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{
            bgcolor: 'rgba(255,184,0,0.045)',
            borderColor: 'rgba(255,184,0,0.25)',
            color: '#FFB800',
            py: 0,
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 9,
          }}
        >
          {data.warnings.slice(0, 2).join(' | ')}
        </Alert>
      )}
    </motion.div>
  );
};

export default MarketIntelligenceDashboard;
