'use client';

import React, { useEffect, useState } from 'react';
import { fetchSosoMacroEvents } from '@/lib/api';
import { PanelHeader, LoadingPanel } from './ui';

interface MacroEvent {
  date?: string | number;
  events?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const extractMacroEvents = (payload: unknown): MacroEvent[] => {
  if (!isRecord(payload)) return [];
  const data = payload.data;
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.list) ? data.list : [];

  return rows.filter(isRecord).map((item) => ({
    date: typeof item.date === 'string' || typeof item.date === 'number' ? item.date : undefined,
    events: Array.isArray(item.events) ? item.events.filter((event): event is string => typeof event === 'string') : [],
  }));
};

export const MacroPanel = () => {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchSosoMacroEvents();
        if (!cancelled) {
          setEvents(extractMacroEvents(res).slice(0, 4));
        }
      } catch (err) {
        console.error('Failed to fetch macro events', err);
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
      <PanelHeader kicker="Economic Calendar" title="Macro Events" />
      <div className="mt-4 space-y-3">
        {events.length > 0 ? (
          events.map((event, idx) => (
            <div key={event.date || idx} className="flex flex-col gap-1.5 border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-sans font-medium text-white truncate max-w-[70%]">
                  {event.events?.[0] || 'Macro Event'}
                </h4>
                <span className="text-[9px] font-mono text-accent-amber bg-accent-amber/10 px-1.5 py-0.5 rounded-sm">
                  {event.date ? new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {event.events?.slice(1, 3).map((subEvent: string, i: number) => (
                  <span key={i} className="text-[9px] font-mono text-text-secondary truncate block max-w-full">
                    • {subEvent}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs font-mono text-text-secondary">No upcoming macro events.</div>
        )}
      </div>
    </section>
  );
};
