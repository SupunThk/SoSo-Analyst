'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const BOOT_LINES = [
  { text: '> BIOS CHECK ........................ OK', delay: 0 },
  { text: '> MEMORY TEST ...................... 64GB OK', delay: 150 },
  { text: '> LOADING KERNEL ................... SoSo Analyst v3.0', delay: 300 },
  { text: '> CONNECTING TO SOSOVALUE API ...... ', delay: 500, append: 'CONNECTED', appendDelay: 400 },
  { text: '> INITIALIZING GEMINI ENGINE ....... ', delay: 1000, append: 'READY', appendDelay: 400 },
  { text: '> LOADING MARKET DATA FEEDS ....... ', delay: 1500, append: 'ACTIVE', appendDelay: 300 },
  { text: '> CRYPTO INDICES ................... SYNCED', delay: 2100 },
  { text: '> ETF FLOW MONITORS ............... ONLINE', delay: 2300 },
  { text: '> MACRO EVENT SCANNER ............. ARMED', delay: 2500 },
  { text: '> SECURITY HANDSHAKE .............. VERIFIED', delay: 2700 },
  { text: '', delay: 2900 },
  { text: '  ╔══════════════════════════════════════════╗', delay: 3000 },
  { text: '  ║     SOSO ANALYST TERMINAL v3.0           ║', delay: 3100 },
  { text: '  ║     REAL-TIME CRYPTO INTELLIGENCE        ║', delay: 3200 },
  { text: '  ╚══════════════════════════════════════════╝', delay: 3300 },
  { text: '', delay: 3400 },
  { text: '> ALL SYSTEMS NOMINAL. TERMINAL READY.', delay: 3500 },
];

interface TerminalBootProps {
  onComplete: () => void;
}

const TerminalBoot: React.FC<TerminalBootProps> = ({ onComplete }) => {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [appendedMap, setAppendedMap] = useState<Record<number, boolean>>({});
  const [fadeOut, setFadeOut] = useState(false);
  const [isBootedChecked, setIsBootedChecked] = useState(false);

  useEffect(() => {
    let bootCheckTimer: ReturnType<typeof setTimeout> | undefined;

    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('hasBooted')) {
        onComplete();
        return;
      } else {
        sessionStorage.setItem('hasBooted', 'true');
        bootCheckTimer = setTimeout(() => setIsBootedChecked(true), 0);
      }
    }

    return () => {
      if (bootCheckTimer) clearTimeout(bootCheckTimer);
    };
  }, [onComplete]);

  useEffect(() => {
    if (!isBootedChecked) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      const showAll = setTimeout(() => {
        setVisibleLines(BOOT_LINES.map((line) => line.text));
        setAppendedMap(
          BOOT_LINES.reduce<Record<number, boolean>>((acc, line, idx) => {
            if (line.append) acc[idx] = true;
            return acc;
          }, {})
        );
        setFadeOut(true);
      }, 0);
      const done = setTimeout(() => onComplete(), 150);
      return () => {
        clearTimeout(showAll);
        clearTimeout(done);
      };
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_LINES.forEach((line, idx) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines(prev => [...prev, line.text]);

          if (line.append && line.appendDelay) {
            timers.push(
              setTimeout(() => {
                setAppendedMap(prev => ({ ...prev, [idx]: true }));
              }, line.appendDelay)
            );
          }
        }, line.delay)
      );
    });

    // Start fade out
    timers.push(
      setTimeout(() => setFadeOut(true), 4000)
    );

    // Complete
    timers.push(
      setTimeout(() => onComplete(), 4600)
    );

    return () => timers.forEach(clearTimeout);
  }, [isBootedChecked, onComplete]);

  if (!isBootedChecked) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#020502] flex items-center justify-center transition-opacity duration-500 overflow-hidden ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
            rotate: [0, 90, 180, 270, 360]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-96 h-96 rounded-full blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #00ff9d 0%, #00b8ff 100%)'
          }}
        />
      </div>

      <div className="w-full max-w-2xl px-8 relative z-10">
        <div className="font-mono text-[11px] leading-6 text-accent-green">
          {visibleLines.map((line, idx) => {
            const bootLine = BOOT_LINES[idx];
            const hasAppend = bootLine?.append;
            const isAppended = appendedMap[idx];

            return (
              <div key={idx} className="whitespace-pre">
                {line}
                {hasAppend && (
                  <span className={`font-bold ${isAppended ? 'text-accent-green text-glow-green' : 'text-accent-amber animate-pulse'}`}>
                    {isAppended ? bootLine.append : '...'}
                  </span>
                )}
              </div>
            );
          })}
          {visibleLines.length < BOOT_LINES.length && (
            <span className="inline-block w-2 h-4 bg-accent-green cursor-blink" />
          )}
        </div>
      </div>

      {/* Scanlines on boot screen */}
      <div className="crt-overlay pointer-events-none" />
      <div className="crt-vignette pointer-events-none" />
    </div>
  );
};

export default TerminalBoot;
