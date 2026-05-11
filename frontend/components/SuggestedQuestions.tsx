'use client';

import React, { useRef, useState, useEffect } from 'react';

const QUESTIONS = [
  { cmd: 'CMD-01', icon: '📊', text: 'Compare Bitcoin and Ethereum using live market data.' },
  { cmd: 'CMD-02', icon: '💹', text: 'Give me a US Bitcoin ETF flow brief with the recent trend and top funds.' },
  { cmd: 'CMD-03', icon: '📰', text: 'What are the latest Bitcoin headlines and what do they imply for the market?' },
  { cmd: 'CMD-04', icon: '🏛️', text: 'Show the macro calendar over the next week that could move crypto.' },
  { cmd: 'CMD-05', icon: '🏦', text: "Summarize MicroStrategy's Bitcoin purchase history and latest accumulation." },
  { cmd: 'CMD-06', icon: '🏦', text: 'Show the key public companies with Bitcoin treasury exposure.' },
  { cmd: 'CMD-07', icon: '💼', text: 'Give me a crypto equities watchlist update for MSTR, COIN, MARA, and RIOT.' },
  { cmd: 'CMD-08', icon: '📰', text: 'What are the hottest crypto news stories right now?' },
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
        {QUESTIONS.map((q) => (
          <div
            key={q.cmd}
            onClick={(e) => handleClick(e, q.text)}
            className="group whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-[#060A06] text-[10px] font-mono text-text-secondary hover:border-accent-green/50 hover:text-accent-green hover:bg-accent-green/5 transition-all select-none"
          >
            <span className="text-[8px] opacity-40 group-hover:opacity-70 font-bold tracking-widest">[{q.cmd}]</span>
            <span className="text-xs">{q.icon}</span>
            <span className="tracking-tight">{q.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions;
