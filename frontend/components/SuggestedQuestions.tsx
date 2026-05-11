import React from 'react';

const QUESTIONS = [
  "Compare Bitcoin and Ethereum using live market data.",
  "Give me a US Bitcoin ETF flow brief with the recent trend and top funds.",
  "What are the latest Bitcoin headlines and what do they imply for the market?",
  "Show the macro calendar over the next week that could move crypto.",
  "Summarize MicroStrategy's Bitcoin purchase history and latest accumulation.",
  "Show the key public companies with Bitcoin treasury exposure.",
  "Give me a crypto equities watchlist update for MSTR, COIN, MARA, and RIOT.",
  "What are the hottest crypto news stories right now?"
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onSelect }) => {
  return (
    <div className="flex overflow-x-auto gap-2 pb-4 px-6 scrollbar-hide">
      {QUESTIONS.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          className="whitespace-nowrap px-4 py-1.5 rounded-sm border border-border bg-surface text-[11px] font-mono text-text-secondary hover:border-accent-green hover:text-white hover:bg-accent-green/5 transition-all uppercase tracking-tight"
        >
          {q}
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
