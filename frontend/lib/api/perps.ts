// Cross-venue crypto perpetuals (backend /api/market/perps, SoSoValue v3).
import { apiUrl, readJson } from './core';

export type FundingRegime = 'crowded_longs' | 'long_leaning' | 'neutral' | 'short_leaning' | 'crowded_shorts' | 'unknown';

export interface PerpAssetSummary {
  asset: string;
  venues: string[];
  contracts: number;
  openInterestUsd: number;
  turnover24hUsd: number;
  oiWeightedFundingAprPct: number | null;
  fundingAprSpreadPct: number | null;
  change24hPct: number | null;
  fundingRegime: FundingRegime;
}

export interface PerpVenueSummary {
  venue: string;
  contracts: number;
  openInterestUsd: number;
  turnover24hUsd: number;
  oiWeightedFundingAprPct: number | null;
}

export interface PerpExtreme {
  fullSymbol: string;
  asset: string;
  venue: string;
  fundingAprPct: number | null;
  openInterestUsd: number | null;
  turnover24hUsd: number | null;
}

export interface PerpBoard {
  totals: {
    contracts: number;
    assets: number;
    openInterestUsd: number;
    turnover24hUsd: number;
    oiWeightedFundingAprPct: number | null;
  };
  venues: PerpVenueSummary[];
  topAssets: PerpAssetSummary[];
  highestFunding: PerpExtreme[];
  lowestFunding: PerpExtreme[];
  freshness: Record<string, { medianQuoteAgeMinutes: number }>;
  asOf: string;
  note: string;
}

export interface PerpLeg {
  fullSymbol: string;
  base: string;
  quoteAsset: string | null;
  venue: string;
  last: number | null;
  change24hPct: number | null;
  turnover24hUsd: number | null;
  openInterestUsd: number | null;
  fundingRatePct: number | null;
  fundingAprPct: number | null;
  fundingIntervalHours: number | null;
  nextFundingTime: string | null;
  depthPlus2PctUsd: number | null;
  depthMinus2PctUsd: number | null;
  quoteAsOf: string | null;
  quoteAgeMinutes: number | null;
}

export interface PerpAssetDetail extends PerpAssetSummary {
  found: true;
  priceGap: { gapBps: number; highest: string; lowest: string; comparedLegs: string[] } | null;
  legs: PerpLeg[];
  freshness: Record<string, { medianQuoteAgeMinutes: number }>;
  note: string;
}

export async function fetchPerpBoard(signal?: AbortSignal): Promise<PerpBoard> {
  const res = await fetch(apiUrl('/api/market/perps?limit=30'), { signal });
  return readJson<PerpBoard>(res);
}

export async function fetchPerpAsset(asset: string, signal?: AbortSignal): Promise<PerpAssetDetail> {
  const res = await fetch(apiUrl(`/api/market/perps/${encodeURIComponent(asset)}`), { signal });
  return readJson<PerpAssetDetail>(res);
}
