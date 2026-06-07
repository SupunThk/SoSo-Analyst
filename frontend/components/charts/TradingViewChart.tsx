'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  ColorType,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  CrosshairMode,
  type AreaData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { Box, CircularProgress, Typography } from '@mui/material';

interface TradingViewChartProps {
  symbol: string;
  interval?: string;
  height?: number;
}

type KlineRecord = {
  t: string | number;
  o: string | number;
  h: string | number;
  l: string | number;
  c: string | number;
  v: string | number;
};

type KlineResponse = {
  data?: unknown;
};

type HistoricalChartData = {
  candles: CandlestickData<Time>[];
  volumes: HistogramData<Time>[];
  closes: number[];
};

type CandleUpdate = KlineRecord;

type CandleMessage = {
  channel?: string;
  type?: string;
  data?: CandleUpdate;
};

type PriceSeriesApi = ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>;

const isKlineRecord = (value: unknown): value is KlineRecord => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<KlineRecord>;
  return row.t !== undefined && row.o !== undefined && row.h !== undefined && row.l !== undefined && row.c !== undefined && row.v !== undefined;
};

const fetchHistoricalData = async (symbol: string, interval: string, signal?: AbortSignal) => {
  const res = await fetch(`https://mainnet-gw.sodex.dev/api/v1/perps/markets/${symbol}/klines?interval=${interval}&limit=1000`, { signal });
  if (!res.ok) {
    if (res.status === 429) {
      // Wait and retry once on rate limit
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      const retryRes = await fetch(`https://mainnet-gw.sodex.dev/api/v1/perps/markets/${symbol}/klines?interval=${interval}&limit=1000`, { signal });
      if (!retryRes.ok) throw new Error('Failed to fetch historical data');
      const retryPayload = await retryRes.json() as KlineResponse;
      const retryData = Array.isArray(retryPayload.data) ? retryPayload.data.filter(isKlineRecord) : [];
      retryData.reverse();
      return buildChartData(retryData);
    }
    throw new Error('Failed to fetch historical data');
  }
  const payload = await res.json() as KlineResponse;
  const data = Array.isArray(payload.data) ? payload.data.filter(isKlineRecord) : [];
  data.reverse();
  return buildChartData(data);
};

const buildChartData = (data: KlineRecord[]): HistoricalChartData => {
  const candles: CandlestickData<Time>[] = [];
  const volumes: HistogramData<Time>[] = [];
  const closes: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const time = Math.floor(Number(d.t) / 1000) as Time;
      const open = Number(d.o);
      const high = Number(d.h);
      const low = Number(d.l);
      const close = Number(d.c);
      const volume = Number(d.v);
      
      candles.push({ time, open, high, low, close });
      volumes.push({ 
        time, 
        value: volume, 
        color: close >= open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)' 
      });
      closes.push(close);
    }
  
  return { candles, volumes, closes };
};

const calculateMA = (data: CandlestickData<Time>[], closes: number[], period: number): LineData<Time>[] => {
  const maData: LineData<Time>[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j];
    }
    maData.push({ time: data[i].time, value: sum / period });
  }
  return maData;
};

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ 
  symbol, 
  interval = '1m',
  height = 500 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<PriceSeriesApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  // UI Controls
  const [chartType, setChartType] = useState<'candles' | 'area'>('candles');
  const [showMAs, setShowMAs] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  // References to keep data accessible to WS without recreating the chart completely
  const historicalDataRef = useRef<HistoricalChartData | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Initialize Chart
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#A0AEC0' },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', timeVisible: true },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });
    chartRef.current = chart;

    const setupSeries = () => {
      // Main price series
      if (chartType === 'candles') {
        mainSeriesRef.current = chart.addSeries(CandlestickSeries, {
          upColor: '#00FF9D', downColor: '#FF2A4D',
          borderVisible: false, wickUpColor: '#00FF9D', wickDownColor: '#FF2A4D',
        });
      } else {
        mainSeriesRef.current = chart.addSeries(AreaSeries, {
          lineColor: '#00FF9D',
          topColor: 'rgba(0, 255, 157, 0.4)',
          bottomColor: 'rgba(0, 255, 157, 0.0)',
          lineWidth: 2,
        });
      }

      // Volume Series
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // set as an overlay
      });
      volumeSeriesRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      // MAs
      ma20SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(255, 180, 0, 0.8)', lineWidth: 1 });
      ma50SeriesRef.current = chart.addSeries(LineSeries, { color: 'rgba(59, 130, 246, 0.8)', lineWidth: 1 });
    };

    setupSeries();

    let lastValidWsTime = 0;
    let isMounted = true;
    const fetchController = new AbortController();

    const initData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchHistoricalData(symbol, interval, fetchController.signal);
        if (!isMounted) return;
        historicalDataRef.current = data;
        
        if (chartType === 'area') {
          const areaData: AreaData<Time>[] = data.candles.map((c) => ({ time: c.time, value: c.close }));
          (mainSeriesRef.current as ISeriesApi<'Area'> | null)?.setData(areaData);
        } else {
          (mainSeriesRef.current as ISeriesApi<'Candlestick'> | null)?.setData(data.candles);
        }
        volumeSeriesRef.current?.setData(data.volumes);
        
        if (data.candles.length > 0) {
          const lastTime = data.candles[data.candles.length - 1].time;
          lastValidWsTime = typeof lastTime === 'number' ? lastTime : 0;
        }

        ma20SeriesRef.current?.setData(calculateMA(data.candles, data.closes, 20));
        ma50SeriesRef.current?.setData(calculateMA(data.candles, data.closes, 50));
        
        setLoading(false);
        connectWebSocket();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isMounted) {
          setError(null); // Stay in loading state instead of showing error
          setLoading(false);
        }
      }
    };

    const connectWebSocket = () => {
      setStatus('connecting');
      try {
        const wsUrl = `wss://mainnet-gw.sodex.dev/ws/perps`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (wsRef.current !== ws) return;
          setStatus('connected');
          ws.send(JSON.stringify({
            op: "subscribe",
            params: {
              channel: "candle",
              symbol: symbol,
              interval: interval
            }
          }));
        };

        ws.onmessage = (event) => {
          if (wsRef.current !== ws) return;
          try {
            const message = JSON.parse(event.data) as CandleMessage;
            if (message.channel === 'candle' && message.type === 'update' && message.data) {
              const candle = message.data;
              const tickTime = Math.floor(Number(candle.t) / 1000);
              
              if (tickTime >= lastValidWsTime) {
                const close = Number(candle.c);
                const open = Number(candle.o);
                
                // Update Main
                if (mainSeriesRef.current) {
                  if (chartType === 'candles') {
                    (mainSeriesRef.current as ISeriesApi<"Candlestick">).update({
                      time: tickTime as Time, open,
                      high: Number(candle.h), low: Number(candle.l), close,
                    });
                  } else {
                    (mainSeriesRef.current as ISeriesApi<"Area">).update({ time: tickTime as Time, value: close });
                  }
                }

                if (volumeSeriesRef.current) {
                  volumeSeriesRef.current.update({
                    time: tickTime as Time,
                    value: Number(candle.v),
                    color: close >= open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'
                  });
                }
                
                lastValidWsTime = tickTime;
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setStatus('disconnected');
        };

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          setStatus('disconnected');
        };
      } catch {
        setStatus('disconnected');
      }
    };

    initData();
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      fetchController.abort();
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (chartRef.current) chartRef.current.remove();
    };
  }, [symbol, interval, height, chartType]);

  // Handle toggles without recreating the chart if possible
  useEffect(() => {
    if (ma20SeriesRef.current && ma50SeriesRef.current) {
      ma20SeriesRef.current.applyOptions({ visible: showMAs });
      ma50SeriesRef.current.applyOptions({ visible: showMAs });
    }
  }, [showMAs]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }
  }, [showVolume]);

  return (
    <Box className="relative w-full rounded-md border border-border/50 bg-[#060A06] overflow-hidden" sx={{ height }}>
      {loading && (
        <Box className="absolute inset-0 flex items-center justify-center bg-[#060A06]/80 z-20">
          <CircularProgress size={30} sx={{ color: '#00FF9D' }} />
        </Box>
      )}
      
      {error && (
        <Box className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-900/80 text-white px-4 py-2 rounded text-xs z-20 border border-red-500/50">
          {error}
        </Box>
      )}
      
      {/* Chart Status Indicator */}
      <Box className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-sm shadow-lg pointer-events-none">
        <Typography variant="body2" className="text-white font-mono font-bold">
          {symbol.toUpperCase()}
        </Typography>
        <Box className="w-px h-3 bg-white/20 mx-1" />
        <Box className="flex items-center gap-1.5">
          <Box className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-[#00FF9D] shadow-[0_0_8px_rgba(0,255,157,0.6)]' : 'bg-red-500'}`} />
          <Typography variant="caption" className={`font-mono text-[10px] ${status === 'connected' ? 'text-[#00FF9D]' : 'text-red-500'}`}>
            {status === 'connected' ? 'LIVE' : 'DISCONNECTED'}
          </Typography>
        </Box>
      </Box>

      {/* Chart Controls */}
      <Box className="absolute top-4 left-[160px] z-10 flex items-center gap-2">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 p-1 rounded-sm shadow-lg flex items-center gap-1">
          <button
            onClick={() => setChartType('candles')}
            className={`px-2 py-1 text-[10px] font-mono rounded-sm transition-colors ${chartType === 'candles' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            CANDLES
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`px-2 py-1 text-[10px] font-mono rounded-sm transition-colors ${chartType === 'area' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            AREA
          </button>
        </div>
        
        <div className="bg-black/60 backdrop-blur-md border border-white/10 p-1 rounded-sm shadow-lg flex items-center gap-1">
          <button
            onClick={() => setShowMAs(!showMAs)}
            className={`px-2 py-1 text-[10px] font-mono rounded-sm transition-colors ${showMAs ? 'bg-accent-amber/20 text-accent-amber' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            MA
          </button>
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-2 py-1 text-[10px] font-mono rounded-sm transition-colors ${showVolume ? 'bg-accent-blue/20 text-blue-400' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
          >
            VOL
          </button>
        </div>
      </Box>
      
      <div ref={chartContainerRef} className="w-full h-full" />
    </Box>
  );
};
