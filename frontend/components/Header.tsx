import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-md py-3 px-6 flex justify-between items-center sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent-green rounded-full shadow-[0_0_8px_rgba(0,255,157,0.5)] animate-pulse" />
          <h1 className="font-mono text-lg font-bold tracking-tight text-white uppercase">
            SoSo<span className="text-accent-green">Analyst</span>
          </h1>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-[10px] font-mono font-medium text-text-secondary uppercase tracking-[0.2em]">
          Terminal v1.0.4
        </span>
      </div>
      
      <div className="hidden md:flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono text-text-secondary uppercase">Market Status</span>
          <span className="text-[11px] font-mono text-accent-green">LIVE // CONNECTED</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono text-text-secondary block">POWERED BY</span>
          <span className="text-[11px] font-mono font-bold text-white">SOSOVALUE + GEMINI</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
