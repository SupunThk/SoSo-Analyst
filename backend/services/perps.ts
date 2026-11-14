// Cross-venue crypto perpetuals from the SoSoValue Market Data API (v3).
//
// One catalog call (`/instruments?type=perp&underlying=crypto&expand=quote`)
// returns every crypto perp across BINANCE, HYPERLIQUID and SODEX with its
// live quote: last price, 24h turnover, open interest, current funding and
// ±2% order-book depth. sosoGet caches it for 60s, so the page and the AI
// tools share one upstream request per minute.
//
// Venue snapshots are not synchronised: Binance prices in this feed can lag
// ~25 minutes while SoDEX is near real time. Comparing those prices would
// report a fake basis, so cross-venue price gaps are only computed between
// legs whose quotes were taken within PRICE_SYNC_WINDOW_MS of each other.
import { sosoGet, SOSO_V3_BASE } from '../clients/soso.ts';

const PRICE_SYNC_WINDOW_MS = 3 * 60 * 1000;
// Funding on thin contracts is noise; extremes only consider legs with real volume.
const EXTREME_MIN_TURNOVER_USD = 5_000_000;

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
  fundingAsOf: string | null;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value: number | null, digits = 2): number | null =>
  value === null ? null : Number(value.toFixed(digits));

const sum = (values: (number | null)[]): number =>
  values.reduce<number>((total, v) => total + (v ?? 0), 0);

// BTC-USDT-PERP -> USDT. Binance also lists coin-margined style symbols like
// BTC-U-PERP; the quote asset is whatever sits between base and PERP.
const parseQuoteAsset = (symbol: string, base: string): string | null => {
  const match = String(symbol || '').match(/^(.+)-([^-]+)-PERP$/i);
  if (!match || match[1].toUpperCase() !== base.toUpperCase()) return null;
  return match[2].toUpperCase();
};

const USD_QUOTES = /^(USD|USDT|USDC|USD1|U|FDUSD)$/;

const toLeg = (row: any): PerpLeg | null => {
  const quote = row?.quote;
  if (!quote || !row.underlying_symbol) return null;
  const base = String(row.underlying_symbol).toUpperCase();
  const quoteAsset = parseQuoteAsset(row.symbol, base);
  // Coin-quoted contracts (ETH-BTC-PERP) report their "USD" fields in the
  // quote coin, which would understate OI ~60,000x; keep them out of USD sums.
  const usd = (value: unknown, digits = 0) => (quoteAsset && USD_QUOTES.test(quoteAsset) ? round(num(value), digits) : null);
  return {
    fullSymbol: row.primary_full_symbol || quote.full_symbol,
    base,
    quoteAsset,
    venue: String(row.venue || quote.venue || '').toUpperCase(),
    last: num(quote.last),
    change24hPct: round(num(quote.chg_24h)),
    turnover24hUsd: usd(quote.turnover_24h),
    openInterestUsd: usd(quote.open_interest_usd),
    // v3 funding fields are already percentages ("0.0013" = 0.0013%).
    fundingRatePct: num(quote.funding_rate),
    fundingAprPct: round(num(quote.funding_rate_apr)),
    fundingIntervalHours: num(quote.funding_interval_hours),
    nextFundingTime: num(quote.next_funding_time) ? new Date(Number(quote.next_funding_time)).toISOString() : null,
    depthPlus2PctUsd: usd(quote.plus_depth_usd),
    depthMinus2PctUsd: usd(quote.minus_depth_usd),
    quoteAsOf: quote.as_of || null,
    fundingAsOf: quote.funding_as_of || null
  };
};

// A quote-currency leg priced in another coin (ETH-BTC-PERP) is not a USD
// price and must not enter price comparisons.
const isUsdQuoted = (leg: PerpLeg) => leg.quoteAsset !== null && USD_QUOTES.test(leg.quoteAsset);

let memo: { payload: unknown; legs: PerpLeg[] } | null = null;

const fetchPerpLegs = async (): Promise<PerpLeg[]> => {
  const payload = await sosoGet('/instruments', {
    type: 'perp',
    underlying: 'crypto',
    expand: 'quote',
    limit: 2000
  }, SOSO_V3_BASE);
  // sosoGet returns the same cached object for 60s; reuse the parsed legs.
  if (memo?.payload === payload) return memo.legs;
  const legs = (payload?.data?.instruments || []).map(toLeg).filter(Boolean) as PerpLeg[];
  memo = { payload, legs };
  return legs;
};

const ageMinutes = (iso: string | null, now: number) =>
  iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : null;

// OI-weighted funding: what the aggregate long/short positioning is paying.
const weightedFundingApr = (legs: PerpLeg[]): number | null => {
  const weighted = legs.filter((l) => l.fundingAprPct !== null && (l.openInterestUsd ?? 0) > 0);
  const totalOi = sum(weighted.map((l) => l.openInterestUsd));
  if (!totalOi) return null;
  return round(weighted.reduce((acc, l) => acc + (l.fundingAprPct as number) * (l.openInterestUsd as number), 0) / totalOi);
};

// Price gap across venues, only between snapshots taken at nearly the same time.
const syncedPriceGap = (legs: PerpLeg[]) => {
  const priced = legs
    .filter((l) => isUsdQuoted(l) && l.last !== null && l.quoteAsOf)
    .sort((a, b) => Date.parse(b.quoteAsOf as string) - Date.parse(a.quoteAsOf as string));
  if (priced.length < 2) return null;
  const newest = Date.parse(priced[0].quoteAsOf as string);
  const synced = priced.filter((l) => newest - Date.parse(l.quoteAsOf as string) <= PRICE_SYNC_WINDOW_MS);
  if (new Set(synced.map((l) => l.venue)).size < 2) return null;
  const prices = synced.map((l) => l.last as number);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    gapBps: round(((max - min) / min) * 10_000, 1),
    highest: synced.find((l) => l.last === max)?.fullSymbol,
    lowest: synced.find((l) => l.last === min)?.fullSymbol,
    comparedLegs: synced.map((l) => l.fullSymbol)
  };
};

const venueFreshness = (legs: PerpLeg[], now: number) => {
  const byVenue = new Map<string, number[]>();
  for (const leg of legs) {
    const age = ageMinutes(leg.quoteAsOf, now);
    if (age === null) continue;
    byVenue.set(leg.venue, [...(byVenue.get(leg.venue) || []), age]);
  }
  return Object.fromEntries([...byVenue].map(([venue, ages]) => {
    ages.sort((a, b) => a - b);
    return [venue, { medianQuoteAgeMinutes: ages[Math.floor(ages.length / 2)] }];
  }));
};

const summarizeAsset = (base: string, legs: PerpLeg[]) => {
  const fundingLegs = legs.filter((l) => l.fundingAprPct !== null);
  const aprs = fundingLegs.map((l) => l.fundingAprPct as number);
  return {
    asset: base,
    venues: [...new Set(legs.map((l) => l.venue))].sort(),
    contracts: legs.length,
    openInterestUsd: sum(legs.map((l) => l.openInterestUsd)),
    turnover24hUsd: sum(legs.map((l) => l.turnover24hUsd)),
    oiWeightedFundingAprPct: weightedFundingApr(legs),
    fundingAprSpreadPct: aprs.length >= 2 ? round(Math.max(...aprs) - Math.min(...aprs)) : null,
    change24hPct: [...legs].sort((a, b) => (b.turnover24hUsd ?? 0) - (a.turnover24hUsd ?? 0))[0]?.change24hPct ?? null
  };
};

// Funding regime label from the OI-weighted APR. Roughly 11% APR is the
// Binance baseline (0.01% per 8h), so that band reads as neutral-to-long.
const fundingRegime = (apr: number | null) => {
  if (apr === null) return 'unknown';
  if (apr >= 30) return 'crowded_longs';
  if (apr >= 15) return 'long_leaning';
  if (apr > -5) return 'neutral';
  if (apr > -20) return 'short_leaning';
  return 'crowded_shorts';
};

const getPerpAsset = async (asset: string) => {
  const base = String(asset || '').trim().toUpperCase().replace(/-?PERP$/, '');
  const legs = (await fetchPerpLegs()).filter((l) => l.base === base);
  if (!legs.length) {
    return { asset: base, found: false, error: `No crypto perpetual contracts found for ${base}.` };
  }
  const now = Date.now();
  const summary = summarizeAsset(base, legs);
  return {
    found: true,
    ...summary,
    fundingRegime: fundingRegime(summary.oiWeightedFundingAprPct),
    priceGap: syncedPriceGap(legs),
    legs: [...legs]
      .sort((a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0))
      .map((l) => ({ ...l, quoteAgeMinutes: ageMinutes(l.quoteAsOf, now) })),
    freshness: venueFreshness(legs, now),
    source: 'SoSoValue Market Data API v3',
    note: 'Funding and APR are percentages. Prices from venues with stale snapshots are excluded from the price-gap comparison.'
  };
};

const getPerpBoard = async ({ limit = 15 }: { limit?: number } = {}) => {
  const legs = await fetchPerpLegs();
  const now = Date.now();
  const byAsset = new Map<string, PerpLeg[]>();
  for (const leg of legs) byAsset.set(leg.base, [...(byAsset.get(leg.base) || []), leg]);

  const assets = [...byAsset].map(([base, assetLegs]) => ({
    ...summarizeAsset(base, assetLegs),
    fundingRegime: fundingRegime(weightedFundingApr(assetLegs))
  }));
  assets.sort((a, b) => b.openInterestUsd - a.openInterestUsd);

  const liquid = legs.filter((l) => l.fundingAprPct !== null && (l.turnover24hUsd ?? 0) >= EXTREME_MIN_TURNOVER_USD);
  const byApr = [...liquid].sort((a, b) => (b.fundingAprPct as number) - (a.fundingAprPct as number));
  const pickLeg = (l: PerpLeg) => ({
    fullSymbol: l.fullSymbol,
    asset: l.base,
    venue: l.venue,
    fundingAprPct: l.fundingAprPct,
    openInterestUsd: l.openInterestUsd,
    turnover24hUsd: l.turnover24hUsd
  });

  const venues = [...new Set(legs.map((l) => l.venue))].sort().map((venue) => {
    const venueLegs = legs.filter((l) => l.venue === venue);
    return {
      venue,
      contracts: venueLegs.length,
      openInterestUsd: sum(venueLegs.map((l) => l.openInterestUsd)),
      turnover24hUsd: sum(venueLegs.map((l) => l.turnover24hUsd)),
      oiWeightedFundingAprPct: weightedFundingApr(venueLegs)
    };
  });

  const max = Math.min(Math.max(Number(limit) || 15, 1), 50);
  return {
    totals: {
      contracts: legs.length,
      assets: byAsset.size,
      openInterestUsd: sum(legs.map((l) => l.openInterestUsd)),
      turnover24hUsd: sum(legs.map((l) => l.turnover24hUsd)),
      oiWeightedFundingAprPct: weightedFundingApr(legs)
    },
    venues,
    topAssets: assets.slice(0, max),
    highestFunding: byApr.slice(0, 5).map(pickLeg),
    lowestFunding: byApr.slice(-5).reverse().map(pickLeg),
    freshness: venueFreshness(legs, now),
    asOf: new Date(now).toISOString(),
    source: 'SoSoValue Market Data API v3',
    note: `Funding extremes only include contracts with at least $${EXTREME_MIN_TURNOVER_USD / 1e6}M 24h turnover. APR values are percentages.`
  };
};

export { fetchPerpLegs, getPerpAsset, getPerpBoard, fundingRegime, parseQuoteAsset, syncedPriceGap, PRICE_SYNC_WINDOW_MS };
