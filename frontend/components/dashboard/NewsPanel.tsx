'use client';

import React, { useEffect, useState } from 'react';
import { fetchSosoHotNews } from '@/lib/api';
import { PanelHeader, LoadingPanel } from './ui';

interface NewsItem {
  id?: string | number;
  title?: string;
  sourceName?: string;
  release_time?: string | number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const extractNewsItems = (payload: unknown): NewsItem[] => {
  if (!isRecord(payload)) return [];
  const data = payload.data;
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.list) ? data.list : [];
  return rows.filter(isRecord).map((item) => ({
    id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : undefined,
    title: typeof item.title === 'string' ? item.title : undefined,
    sourceName: typeof item.sourceName === 'string' ? item.sourceName : undefined,
    release_time: typeof item.release_time === 'string' || typeof item.release_time === 'number'
      ? item.release_time
      : undefined,
  }));
};

const formatReleaseTime = (value: string | number | undefined) => {
  const timestamp = value === undefined ? null : Number(value);
  if (!timestamp || !Number.isFinite(timestamp)) return 'Live';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const NewsPanel = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchSosoHotNews();
        if (!cancelled) {
          setNews(extractNewsItems(res).slice(0, 5));
        }
      } catch (err) {
        console.error('Failed to fetch hot news', err);
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

  if (loading) return <LoadingPanel />;

  return (
    <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
      <PanelHeader kicker="Breaking" title="Hot Crypto News" />
      <div className="mt-4 space-y-3">
        {news.length > 0 ? (
          news.map((item, idx) => (
            <div key={item.id || idx} className="flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0 last:pb-0">
              <h4 className="text-xs font-sans font-medium text-white line-clamp-2 leading-snug">
                {item.title || 'Untitled update'}
              </h4>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-mono uppercase text-text-secondary">
                  {item.sourceName || 'SoSoValue'}
                </span>
                <span className="text-[9px] font-mono text-accent-green">
                  {formatReleaseTime(item.release_time)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs font-mono text-text-secondary">No news available.</div>
        )}
      </div>
    </section>
  );
};
