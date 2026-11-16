// Turn the deterministic analysis synthesis into an optional, single-asset
// trade idea that the UI can open as a pre-filled SoDEX order ticket.
//
// Deliberately conservative: an idea is produced only when the answer focused
// on exactly one asset, that asset has a SoDEX perp market, and the synthesis
// leans clearly one way. The user still chooses size, leverage and confirms.
import NodeCache from 'node-cache';
import { getSodexSymbols } from '../clients/sodex.ts';

export interface TradeIdea {
  symbol: string; // SoDEX perps symbol, e.g. BTC-USD
  asset: string;
  side: 'long' | 'short';
  directionalScore: number;
  riskScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  rationale: string[];
  riskFlags: string[];
  suggestedStopPct: number;
}

const LONG_THRESHOLD = 65;
const SHORT_THRESHOLD = 40;

const NAME_TO_TICKER: Record<string, string> = {
  bitcoin: 'BTC', btc: 'BTC', xbt: 'BTC',
  ethereum: 'ETH', ether: 'ETH', eth: 'ETH',
  solana: 'SOL', sol: 'SOL',
  ripple: 'XRP', xrp: 'XRP',
  bnb: 'BNB', binancecoin: 'BNB',
  dogecoin: 'DOGE', doge: 'DOGE',
  cardano: 'ADA', ada: 'ADA',
  avalanche: 'AVAX', avax: 'AVAX',
  chainlink: 'LINK', link: 'LINK',
  sui: 'SUI',
  hyperliquid: 'HYPE', hype: 'HYPE',
  litecoin: 'LTC', ltc: 'LTC',
  uniswap: 'UNI', uni: 'UNI',
  aave: 'AAVE',
  ethena: 'ENA', ena: 'ENA',
  ondo: 'ONDO',
  aster: 'ASTER'
};

const ASSET_ARG_KEYS = ['asset', 'symbol', 'coin', 'token', 'currency'];

// "BTC-USD" -> BTC, "vBTC_vUSDC" -> BTC, "bitcoin" -> BTC, "SOL" -> SOL.
export const normalizeAsset = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw) return null;
  raw = raw.replace(/-USD[TC]?$/i, '').replace(/_v?USD[TC]?$/i, '').replace(/^v(?=[A-Z0-9]{2,}$)/, '');
  const key = raw.toLowerCase();
  if (NAME_TO_TICKER[key]) return NAME_TO_TICKER[key];
  return /^[A-Za-z0-9]{2,10}$/.test(raw) ? raw.toUpperCase() : null;
};

export const assetsFromToolCalls = (toolCalls: Array<{ input?: Record<string, unknown> | null }> = []) => {
  const assets = new Set<string>();
  for (const call of toolCalls) {
    const input = call?.input || {};
    for (const key of ASSET_ARG_KEYS) {
      const asset = normalizeAsset(input[key]);
      if (asset) assets.add(asset);
    }
    if (Array.isArray(input.assets)) {
      for (const item of input.assets) {
        const asset = normalizeAsset(item);
        if (asset) assets.add(asset);
      }
    }
  }
  return assets;
};

const suggestedStopFor = (riskScore: number | null) => {
  if (riskScore === null) return 4;
  if (riskScore >= 70) return 5;
  if (riskScore >= 40) return 4;
  return 3;
};

export const buildTradeIdea = ({
  synthesis,
  toolCalls,
  perpsSymbols
}: {
  synthesis: any;
  toolCalls: Array<{ input?: Record<string, unknown> | null }>;
  perpsSymbols: Set<string>;
}): TradeIdea | null => {
  if (!synthesis || typeof synthesis.directionalScore !== 'number') return null;

  const assets = assetsFromToolCalls(toolCalls);
  if (assets.size !== 1) return null;
  const [asset] = [...assets];
  const symbol = `${asset}-USD`;
  if (!perpsSymbols.has(symbol)) return null;

  const score = synthesis.directionalScore;
  const side = score >= LONG_THRESHOLD ? 'long' : score <= SHORT_THRESHOLD ? 'short' : null;
  if (!side) return null;

  const riskScore = typeof synthesis.riskScore === 'number' ? synthesis.riskScore : null;
  return {
    symbol,
    asset,
    side,
    directionalScore: score,
    riskScore,
    confidence: ['low', 'medium', 'high'].includes(synthesis.confidence) ? synthesis.confidence : 'low',
    rationale: (Array.isArray(synthesis.thesis) ? synthesis.thesis : []).slice(0, 3).map(readable),
    riskFlags: [
      ...(Array.isArray(synthesis.riskFlags) ? synthesis.riskFlags : []),
      ...(Array.isArray(synthesis.conflicts) ? synthesis.conflicts : [])
    ].slice(0, 3).map(readable),
    suggestedStopPct: suggestedStopFor(riskScore)
  };
};

// Synthesis lines are prefixed with the tool that produced them
// ("get_asset_price_history: Trend is bearish."); users only need the finding.
const readable = (line) => String(line).replace(/^[a-z][a-z0-9_]*:\s*/, '');

const symbolCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120, maxKeys: 4 });

const loadPerpsSymbols = async (): Promise<Set<string>> => {
  const cached = symbolCache.get<Set<string>>('perps');
  if (cached) return cached;
  const symbols = await getSodexSymbols('perps');
  const names = new Set<string>(
    (Array.isArray(symbols) ? symbols : []).map((s) => String(s?.name || s?.symbol || '').toUpperCase()).filter(Boolean)
  );
  symbolCache.set('perps', names);
  return names;
};

// Never let trade-idea generation break an answer.
export const attachTradeIdea = async <T extends { analysisSynthesis?: any; toolCalls?: any[] }>(result: T) => {
  try {
    if (!result?.analysisSynthesis) return { ...result, tradeIdea: null };
    const perpsSymbols = await loadPerpsSymbols();
    return {
      ...result,
      tradeIdea: buildTradeIdea({ synthesis: result.analysisSynthesis, toolCalls: result.toolCalls || [], perpsSymbols })
    };
  } catch (error) {
    console.warn('Trade idea skipped:', error?.message || error);
    return { ...result, tradeIdea: null };
  }
};
