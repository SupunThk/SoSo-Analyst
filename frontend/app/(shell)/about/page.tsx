export default function AboutPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="p-8 border border-accent-green/30 bg-[#060A06]/90 rounded-md shadow-lg max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold text-accent-green mb-4 uppercase tracking-widest font-mono">About SoSo Analyst</h1>
        <p className="text-sm text-text-secondary mb-6 leading-relaxed font-sans">
          SoSo Analyst is an AI-powered crypto research terminal. It connects to real-time market data, ETF flows, tokenomics, and more to provide deterministic market intelligence.
        </p>
        <p className="text-xs text-text-secondary/70 font-mono">
          Terminal v3.0 — powered by Gemini, SoSoValue, SoDEX, and Etherscan.
        </p>
      </div>
    </div>
  );
}
