'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';

const QUESTIONS = [
  { cmd: 'CMD-01', icon: '📊', text: 'Give me a full market overview report — BTC price, top movers, sector trends, news, macro calendar, and strategic outlook.' },
  { cmd: 'CMD-02', icon: '📰', text: 'Give me a headline-first crypto news report: top stories, why each matters, market readthrough, and what to watch next.' },
  { cmd: 'CMD-03', icon: '🏦', text: 'Give me a US Bitcoin spot ETF flow report: latest flows, top funds, AUM/volume context, BTC price readthrough, and risks.' },
  { cmd: 'CMD-04', icon: '🏦', text: "Give me a MicroStrategy Bitcoin treasury report: purchase history, latest accumulation, BTC amounts, and balance-sheet readthrough." },
  { cmd: 'CMD-05', icon: '🏦', text: 'Give me a Bitcoin treasury companies report: key public companies, holdings, and balance-sheet readthrough.' },
  { cmd: 'CMD-06', icon: '💼', text: 'Give me a crypto equities watchlist report for MSTR, COIN, MARA, and RIOT: prices, movers, and risks.' },
  { cmd: 'CMD-07', icon: '🔥', text: 'Give me a ranked crypto sector report: sector leaders, laggards, key evidence, rotation takeaway, and risks.' },
  { cmd: 'CMD-08', icon: '🔍', text: 'Give me a Bitcoin deep-dive report: tokenomics, supply, price trend, liquidity, and risks.' },
  { cmd: 'CMD-09', icon: '⚖️', text: 'Compare Bitcoin and Ethereum in a report table: price, market cap, volume, relative strength, and takeaway.' },
  { cmd: 'CMD-10', icon: '📉', text: 'Give me a macro history report for CPI and Fed Funds Rate: data trend, crypto impact, and watch-next events.' },
  { cmd: 'CMD-11', icon: '📈', text: 'Give me a SoSoValue SSI index report: index performance, constituents, sector mapping, and rotation takeaway.' },
  { cmd: 'CMD-12', icon: '📆', text: 'Give me a crypto macro calendar report: upcoming events, dates, expected impact, and what to watch next.' },
  { cmd: 'CMD-13', icon: '💰', text: 'Give me an Ethereum price snapshot report: current price, 24h performance, volume, market cap, and context.' },
  { cmd: 'CMD-14', icon: '📘', text: 'Give me a SoDEX markets report with BTC-USD order book depth, spreads, liquidity, and source scope.' },
  { cmd: 'CMD-15', icon: '🚀', text: 'Give me a crypto fundraising report: recent rounds, amounts, investors, categories, and market readthrough.' },
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onSelect }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleClick = (e: React.MouseEvent, text: string) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect(text);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // If the scroll is vertical, convert to horizontal
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="relative mb-3">
      <div 
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex overflow-x-auto gap-2 pb-2 px-2 scrollbar-hide fade-edges ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      >
        {QUESTIONS.map((q, index) => (
          <motion.div
            key={q.cmd}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.015, 0.18), duration: 0.18 }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            className="shrink-0"
          >
            {/* Native title, not a CSS tooltip: this strip scrolls, so overflow would clip one. */}
            <button
              type="button"
              title={q.text}
              onClick={(e) => handleClick(e, q.text)}
              className={`flex h-[34px] max-w-[520px] select-none items-center gap-2 rounded-md border border-border/95 bg-[#060A06]/95 px-2.5 font-mono font-bold tracking-[0.08em] text-text-secondary shadow-[0_2px_14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-accent-green/45 hover:bg-accent-green/[0.06] hover:text-accent-green hover:shadow-[0_4px_22px_rgba(0,255,157,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
            >
              <span className="shrink-0 whitespace-nowrap text-[8px] opacity-50 font-bold tracking-widest">[{q.cmd}]</span>
              <span className="shrink-0 text-xs">{q.icon}</span>
              <span className="min-w-0 max-w-[420px] truncate text-[13px] tracking-tight">{q.text}</span>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions;
