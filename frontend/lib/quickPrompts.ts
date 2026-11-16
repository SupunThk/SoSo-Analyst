import { signalQuestion } from '@/lib/share';

export type QuickPromptIcon = 'chart' | 'bank' | 'trend' | 'pie' | 'lock' | 'rocket' | 'news' | 'bolt';

export interface QuickPrompt {
  id: string;
  icon: QuickPromptIcon;
  tag: string;
  label: string;
  description: string;
  /** Short form shown in the sidebar and composer chips. */
  short: string;
  text: string;
}

// Each prompt maps onto a backend tool-routing intent, so every card returns
// grounded SoSoValue data rather than a generic model answer.
export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'signal',
    icon: 'bolt',
    tag: 'Signal',
    label: 'BTC Trade Signal',
    description: 'Price trend and news scored into a long or short bias, with a ticket you can open on SoDEX.',
    short: 'BTC signal',
    text: signalQuestion('BTC'),
  },
  {
    id: 'overview',
    icon: 'chart',
    tag: 'Summary',
    label: 'Market Overview',
    description: 'BTC price, total market cap, top movers, sector trends and the macro backdrop.',
    short: 'Overview',
    text: 'Give me a full market overview report - BTC price, total crypto market cap, top movers, sector trends, news, macro calendar, and strategic outlook.',
  },
  {
    id: 'etf',
    icon: 'bank',
    tag: 'Institutional',
    label: 'ETF Flows',
    description: 'Daily net flows for US spot Bitcoin and Ether ETFs, top funds and AUM context.',
    short: 'ETF flows',
    text: 'Give me a US Bitcoin spot ETF flow report: latest flows, top funds, AUM/volume context, BTC price readthrough, and risks.',
  },
  {
    id: 'fed',
    icon: 'trend',
    tag: 'Macro',
    label: 'Fed Rate Odds',
    description: 'FOMC rate probabilities, the latest CPI print and what they mean for crypto.',
    short: 'Fed odds',
    text: 'What are the current FOMC rate probabilities for the next Fed meeting, what did the latest CPI print show, and what does it mean for crypto?',
  },
  {
    id: 'sectors',
    icon: 'pie',
    tag: 'Rotation',
    label: 'Sector Rotation',
    description: 'Ranked sector leaders and laggards with the evidence behind the rotation.',
    short: 'Sectors',
    text: 'Give me a ranked crypto sector report: sector leaders, laggards, key evidence, rotation takeaway, and risks.',
  },
  {
    id: 'unlocks',
    icon: 'lock',
    tag: 'Supply',
    label: 'Token Unlocks',
    description: 'Supply, allocation and upcoming unlock schedule for a token.',
    short: 'Unlocks',
    text: 'Show the token economics for Arbitrum (ARB): circulating vs max supply, allocation, and upcoming unlocks with their size.',
  },
];
