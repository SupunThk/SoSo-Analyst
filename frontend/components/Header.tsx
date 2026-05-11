'use client';

import React, { useState, useEffect } from 'react';

const Header: React.FC = () => {
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
    <header className="border-b border-border bg-[#030503]/90 backdrop-blur-md py-2.5 px-6 flex justify-between items-center sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-2 h-2 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.6)]" />
            <div className="absolute inset-0 w-2 h-2 bg-accent-green rounded-full animate-ping opacity-30" />
          </div>
          <h1 className="font-mono text-base font-bold tracking-tight text-white uppercase">
            SoSo<span className="text-accent-green text-glow-green">Analyst</span>
          </h1>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-[9px] font-mono font-medium text-text-secondary uppercase tracking-[0.15em]">
          Terminal v2.0
        </span>
      </div>
      
      <div className="hidden md:flex items-center gap-5">
        {/* Uptime */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-mono text-text-secondary uppercase tracking-widest">UPTIME</span>
          <span className="text-[11px] font-mono text-accent-green tabular-nums">{formatUptime(uptime)}</span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* UTC Clock */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-mono text-text-secondary uppercase tracking-widest">UTC</span>
          <span className="text-[11px] font-mono text-accent-green text-glow-green tabular-nums font-bold">
            {time}
          </span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Status */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-mono text-text-secondary uppercase tracking-widest">STATUS</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 bg-accent-green rounded-full" />
            <span className="text-[10px] font-mono text-accent-green font-bold">LIVE</span>
          </div>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Powered by */}
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-mono text-text-secondary uppercase tracking-widest">ENGINE</span>
          <span className="text-[10px] font-mono font-bold text-white">SOSOVALUE + GEMINI</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
