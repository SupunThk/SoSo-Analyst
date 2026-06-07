'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ── WsTickerData from SoDEX allTicker channel ──
interface WsTickerData {
  E: number;    // Event time ms
  s: string;    // Symbol
  c: string;    // Last price
  Q: string;    // Last quantity
  w: string;    // Weighted avg price
  a: string;    // Best ask price
  A: string;    // Best ask qty
  b: string;    // Best bid price
  B: string;    // Best bid qty
  p: string;    // Price change
  P: number;    // Price change %
  o: string;    // Open price
  h: string;    // High price
  l: string;    // Low price
  v: string;    // Base volume 24h
  q: string;    // Quote volume 24h (USD)
  O: number;    // Statistics open time
  C: number;    // Statistics close time
}

interface AllTickerMessage {
  channel: 'allTicker';
  type: 'snapshot' | 'update';
  data: WsTickerData[];
}

interface TickerSnapshot {
  symbol: string;
  lastPrice: number;
  changePct: number;
  changeAbs: number;
  quoteVolume: number;
  baseVolume: number;
  high: number;
  low: number;
  open: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  updatedAt: number;
}

type WsStatus = 'connecting' | 'connected' | 'disconnected';

const WS_URL = 'wss://mainnet-gw.sodex.dev/ws/perps';
const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 5_000;

// ── Helpers ──
const fmtCompact = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtPrice = (n: number) => {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
};

const fmtPct = (n: number) => {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};



const heatColor = (pct: number) => {
  if (pct >= 5) return 'rgba(0,255,157,0.55)';
  if (pct >= 2) return 'rgba(0,255,157,0.35)';
  if (pct >= 0.5) return 'rgba(0,255,157,0.18)';
  if (pct >= -0.5) return 'rgba(255,255,255,0.06)';
  if (pct >= -2) return 'rgba(255,42,77,0.18)';
  if (pct >= -5) return 'rgba(255,42,77,0.35)';
  return 'rgba(255,42,77,0.55)';
};

const parseTickerData = (d: WsTickerData): TickerSnapshot => {
  const bestBid = Number(d.b) || 0;
  const bestAsk = Number(d.a) || 0;
  return {
    symbol: d.s,
    lastPrice: Number(d.c) || 0,
    changePct: d.P ?? 0,
    changeAbs: Number(d.p) || 0,
    quoteVolume: Number(d.q) || 0,
    baseVolume: Number(d.v) || 0,
    high: Number(d.h) || 0,
    low: Number(d.l) || 0,
    open: Number(d.o) || 0,
    bestBid,
    bestAsk,
    spread: bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 0,
    updatedAt: d.E || Date.now(),
  };
};

// ── Tooltip ──
const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { symbol: string; quoteVolume: number; changePct: number } }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0A0F0A] border border-border/60 rounded px-3 py-2 text-[10px] font-mono shadow-lg">
      <div className="text-white font-bold">{d.symbol}</div>
      <div className="text-text-secondary mt-0.5">Volume: {fmtCompact(d.quoteVolume)}</div>
      <div className={`mt-0.5 ${d.changePct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmtPct(d.changePct)}</div>
    </div>
  );
};

// ══════════════════════════════════════════
// ── MAIN COMPONENT ──
// ══════════════════════════════════════════
export const SodexAnalytics: React.FC = () => {
  const [tickers, setTickers] = useState<Map<string, TickerSnapshot>>(new Map());
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const tickersRef = useRef<Map<string, TickerSnapshot>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setStatus('connected');

        // Subscribe to allTicker
        ws.send(JSON.stringify({
          op: 'subscribe',
          params: { channel: 'allTicker' },
        }));

        // Setup ping keepalive
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.op === 'pong') return; // Keepalive ack

          if (msg.channel === 'allTicker' && Array.isArray(msg.data)) {
            const tickerMsg = msg as AllTickerMessage;

            if (tickerMsg.type === 'snapshot') {
              const newMap = new Map<string, TickerSnapshot>();
              tickerMsg.data.forEach((d) => {
                newMap.set(d.s, parseTickerData(d));
              });
              tickersRef.current = newMap;
            } else {
              // update — merge
              tickerMsg.data.forEach((d) => {
                tickersRef.current.set(d.s, parseTickerData(d));
              });
            }

            setTickers(new Map(tickersRef.current));
            setLastRefresh(new Date());
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setStatus('disconnected');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setStatus('disconnected');
        if (pingRef.current) clearInterval(pingRef.current);

        // Auto-reconnect
        if (mountedRef.current) {
          reconnectRef.current = setTimeout(() => connectRef.current(), RECONNECT_DELAY_MS);
        }
      };
    } catch {
      setStatus('disconnected');
      if (mountedRef.current) {
        reconnectRef.current = setTimeout(() => connectRef.current(), RECONNECT_DELAY_MS);
      }
    }
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      connect();
    }, 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // ── Derived data ──
  const sortedByVolume = useMemo(() =>
    Array.from(tickers.values()).sort((a, b) => b.quoteVolume - a.quoteVolume),
    [tickers]
  );

  const topVolumeChart = useMemo(() =>
    sortedByVolume.slice(0, 10).map((t) => ({
      symbol: t.symbol.replace('-USD', ''),
      quoteVolume: t.quoteVolume,
      changePct: t.changePct,
    })),
    [sortedByVolume]
  );

  const volumeComparison = useMemo(() =>
    sortedByVolume.slice(0, 8).map((t) => ({
      symbol: t.symbol.replace('-USD', ''),
      quoteVolume: t.quoteVolume,
      baseVolume: t.baseVolume,
      changePct: t.changePct,
    })),
    [sortedByVolume]
  );

  const totalVolume = useMemo(() =>
    sortedByVolume.reduce((acc, t) => acc + t.quoteVolume, 0),
    [sortedByVolume]
  );

  const allPairs = useMemo(() =>
    Array.from(tickers.values()),
    [tickers]
  );

  if (tickers.size === 0) {
    return (
      <div className="rounded-md border border-border/50 bg-[#060A06] p-8 text-center">
        <div className="flex items-center justify-center gap-2 text-text-secondary font-mono text-[11px]">
          <div className={`w-1.5 h-1.5 rounded-full ${status === 'connecting' ? 'bg-accent-amber animate-pulse' : 'bg-accent-red'}`} />
          <span className="uppercase tracking-widest">
            {status === 'connecting' ? 'Connecting to SoDEX WebSocket...' : 'Waiting for SoDEX data...'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="space-y-4"
    >
      {/* ═══ HEADER STRIP ═══ */}
      <div className="relative overflow-hidden flex flex-col gap-2 rounded-md border border-border/80 bg-[#030503]/80 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_42px_rgba(0,0,0,0.28)] md:flex-row md:items-center md:justify-between">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/45 to-transparent" />
        <div className="min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-text-secondary">
            SoDEX Analytics
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="truncate text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-white">
              Perps Market Activity
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-accent-green shadow-[0_0_8px_rgba(0,255,157,0.6)]' : 'bg-accent-red'}`} />
              <span className={`text-[9px] font-mono ${status === 'connected' ? 'text-accent-green' : 'text-accent-red'}`}>
                {status === 'connected' ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:min-w-[330px]">
          <MetricPill label="Total Vol" value={fmtCompact(totalVolume)} tone="text-accent-cyan" />
          <MetricPill label="Active Pairs" value={`${tickers.size}`} tone="text-accent-green" />
          <MetricPill label="Updated" value={lastRefresh ? timeAgo(lastRefresh) : '—'} tone="text-accent-amber" />
        </div>
      </div>

      {/* ═══ ANALYTICS PANELS ═══ */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── Most Traded (Volume Bar Chart) ── */}
        <div className="rounded-md border border-border/50 bg-[#060A06] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-black/40 flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
              Most Traded — 24h Quote Volume
            </span>
          </div>
          <div className="p-4" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVolumeChart} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="symbol"
                  width={48}
                  tick={{ fill: '#E0E0E0', fontSize: 10, fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="quoteVolume" radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {topVolumeChart.map((entry, idx) => (
                    <Cell key={idx} fill={entry.changePct >= 0 ? 'rgba(0,255,157,0.55)' : 'rgba(255,42,77,0.55)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Volume Leaders (Ranked List) ── */}
        <div className="rounded-md border border-border/50 bg-[#060A06] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-black/40">
            <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
              Volume Leaders — Top Perps
            </span>
          </div>
          <div className="divide-y divide-border/20 max-h-[320px] overflow-y-auto custom-scrollbar">
            {sortedByVolume.slice(0, 12).map((t, idx) => (
              <div key={t.symbol} className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors">
                <span className="text-[10px] font-mono text-text-secondary w-5 text-right tabular-nums">
                  #{idx + 1}
                </span>
                <span className="text-[11px] font-mono font-bold text-white w-20 truncate">
                  {t.symbol.replace('-USD', '')}
                </span>
                <span className="text-[10px] font-mono text-text-secondary tabular-nums flex-1">
                  {fmtPrice(t.lastPrice)}
                </span>
                <span className="text-[10px] font-mono text-text-secondary tabular-nums w-20 text-right">
                  {fmtCompact(t.quoteVolume)}
                </span>
                <span className={`text-[10px] font-mono font-bold tabular-nums w-16 text-right ${t.changePct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {fmtPct(t.changePct)}
                </span>
                {/* Spread indicator */}
                <div className="w-14 text-right">
                  <span className="text-[9px] font-mono text-text-secondary/70 tabular-nums">
                    {t.spread.toFixed(3)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        {/* ── Volume Comparison Chart ── */}
        <div className="rounded-md border border-border/50 bg-[#060A06] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-black/40">
            <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
              Volume Comparison — Top 8 Pairs
            </span>
          </div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeComparison} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis
                  dataKey="symbol"
                  tick={{ fill: '#5A6A5A', fontSize: 9, fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="quoteVolume" radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {volumeComparison.map((entry, idx) => (
                    <Cell key={idx} fill={entry.changePct >= 0 ? 'rgba(0,255,157,0.45)' : 'rgba(255,42,77,0.45)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Market Activity Heatmap ── */}
        <div className="rounded-md border border-border/50 bg-[#060A06] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-black/40">
            <span className="text-[10px] font-mono text-text-secondary tracking-widest uppercase">
              Market Heatmap — 24h Change
            </span>
          </div>
          <div className="p-3 grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
            {allPairs
              .sort((a, b) => b.quoteVolume - a.quoteVolume)
              .map((t) => {
                // Scale tile size by relative volume
                const maxVol = sortedByVolume[0]?.quoteVolume || 1;
                const relSize = Math.max(0.6, Math.min(1, t.quoteVolume / maxVol * 2));
                return (
                  <div
                    key={t.symbol}
                    className="rounded border border-white/5 p-2 flex flex-col items-center justify-center text-center transition-all hover:border-white/15 hover:scale-[1.03] cursor-default"
                    style={{
                      backgroundColor: heatColor(t.changePct),
                      minHeight: `${relSize * 56}px`,
                    }}
                    title={`${t.symbol} | ${fmtPrice(t.lastPrice)} | Vol: ${fmtCompact(t.quoteVolume)}`}
                  >
                    <span className="text-[10px] font-mono font-bold text-white leading-tight">
                      {t.symbol.replace('-USD', '')}
                    </span>
                    <span className={`text-[9px] font-mono font-bold tabular-nums ${t.changePct >= 0 ? 'text-white' : 'text-white/90'}`}>
                      {fmtPct(t.changePct)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── Sub-components ──
const MetricPill: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className="flex flex-col gap-0.5 rounded bg-white/[0.025] border border-white/[0.04] px-2.5 py-1.5">
    <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-text-secondary">{label}</span>
    <span className={`text-[11px] font-mono font-bold tabular-nums ${tone}`}>{value}</span>
  </div>
);

const timeAgo = (date: Date): string => {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
};

export default SodexAnalytics;
