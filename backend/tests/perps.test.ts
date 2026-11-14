// Cross-venue perpetuals (SoSoValue Market Data API v3).
import axios from 'axios';

const originalAxiosGet = axios.get;
const NOW = Date.parse('2026-11-14T22:09:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const perp = (symbol: string, venue: string, base: string, quote: Record<string, unknown>) => ({
  instrument_type: 'derivative',
  symbol,
  venue,
  underlying_type: 'crypto',
  underlying_symbol: base,
  primary_full_symbol: `${symbol}.${venue}`,
  quote: { full_symbol: `${symbol}.${venue}`, venue, class: 'perp', ...quote }
});

// Binance quotes lag ~24 minutes in the real feed; HL and SoDEX are fresh.
const CATALOG = [
  perp('BTC-USDT-PERP', 'BINANCE', 'BTC', { last: '64830', turnover_24h: '16000000000', open_interest_usd: '6000000000', funding_rate: '0.0031', funding_rate_apr: '3.4', funding_interval_hours: 8, plus_depth_usd: '90000000', minus_depth_usd: '80000000', as_of: minutesAgo(24) }),
  perp('BTC-USDC-PERP', 'HYPERLIQUID', 'BTC', { last: '64045', turnover_24h: '5000000000', open_interest_usd: '2000000000', funding_rate: '0.0000', funding_rate_apr: '-0.12', funding_interval_hours: 1, as_of: minutesAgo(0) }),
  perp('BTC-USDC-PERP', 'SODEX', 'BTC', { last: '64077', turnover_24h: '150000000', open_interest_usd: '140000000', funding_rate: '0.0013', funding_rate_apr: '10.95', funding_interval_hours: 1, as_of: minutesAgo(1) }),
  perp('ETH-BTC-PERP', 'BINANCE', 'ETH', { last: '0.0275', turnover_24h: '9000000', open_interest_usd: '5000000', funding_rate_apr: '2', as_of: minutesAgo(0) }),
  perp('ETH-USDC-PERP', 'HYPERLIQUID', 'ETH', { last: '1746', turnover_24h: '900000000', open_interest_usd: '700000000', funding_rate_apr: '45', as_of: minutesAgo(0) }),
  perp('DOGE-USDT-PERP', 'BINANCE', 'DOGE', { last: '0.1', turnover_24h: '20000000', open_interest_usd: '30000000', funding_rate_apr: '-40', as_of: minutesAgo(0) }),
  // Illiquid: extreme funding that must not appear in the extremes lists.
  perp('TINY-USDT-PERP', 'BINANCE', 'TINY', { last: '1', turnover_24h: '50000', open_interest_usd: '10000', funding_rate_apr: '900', as_of: minutesAgo(0) })
];

const loadPerps = async () => {
  const calls: { url: string; params: any }[] = [];
  (axios as any).get = async (url: string, options: Record<string, any> = {}) => {
    calls.push({ url, params: options.params });
    if (!url.endsWith('/openapi/v3/instruments')) throw new Error(`Unexpected GET ${url}`);
    return { data: { code: 0, status: 'ok', data: { count: CATALOG.length, has_more: false, instruments: CATALOG } } };
  };
  vi.resetModules();
  process.env.SOSO_API_KEY = 'test-soso-key';
  return { perps: await import('../services/perps.ts'), calls };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  (axios as any).get = originalAxiosGet;
});

test('asset view aggregates venues with an OI-weighted funding APR', async () => {
  const { perps, calls } = await loadPerps();
  const btc: any = await perps.getPerpAsset('btc');

  expect(calls[0].params).toMatchObject({ type: 'perp', underlying: 'crypto', expand: 'quote' });
  expect(btc.found).toBe(true);
  expect(btc.venues).toEqual(['BINANCE', 'HYPERLIQUID', 'SODEX']);
  expect(btc.openInterestUsd).toBe(8_140_000_000);
  // (3.4*6000 + -0.12*2000 + 10.95*140) / 8140
  expect(btc.oiWeightedFundingAprPct).toBeCloseTo(2.66, 2);
  expect(btc.fundingRegime).toBe('neutral');
  expect(btc.legs[0].fullSymbol).toBe('BTC-USDT-PERP.BINANCE');
  expect(btc.legs[0].quoteAgeMinutes).toBe(24);
});

test('price gap ignores venues whose snapshot is stale', async () => {
  const { perps } = await loadPerps();
  const btc: any = await perps.getPerpAsset('BTC');

  // Binance (24 min old, $64,830) would fake a ~120 bps gap; only HL vs SoDEX compare.
  expect(btc.priceGap.comparedLegs).toEqual(['BTC-USDC-PERP.HYPERLIQUID', 'BTC-USDC-PERP.SODEX']);
  expect(btc.priceGap.gapBps).toBeCloseTo(5, 0);
});

test('coin-quoted contracts never enter USD price comparisons', async () => {
  const { perps } = await loadPerps();
  const eth: any = await perps.getPerpAsset('ETH');
  expect(eth.priceGap).toBeNull();
  // ETH-BTC reports "USD" fields in BTC; they must not leak into USD totals.
  expect(eth.legs.find((l) => l.quoteAsset === 'BTC').openInterestUsd).toBeNull();
  expect(eth.openInterestUsd).toBe(700_000_000);
  expect(perps.parseQuoteAsset('ETH-BTC-PERP', 'ETH')).toBe('BTC');
  expect(perps.parseQuoteAsset('BTC-U-PERP', 'BTC')).toBe('U');
});

test('board ranks assets by OI and filters illiquid funding extremes', async () => {
  const { perps } = await loadPerps();
  const board: any = await perps.getPerpBoard({ limit: 3 });

  expect(board.topAssets.map((a) => a.asset)).toEqual(['BTC', 'ETH', 'DOGE']);
  expect(board.highestFunding[0].fullSymbol).toBe('ETH-USDC-PERP.HYPERLIQUID');
  expect(board.lowestFunding[0].fullSymbol).toBe('DOGE-USDT-PERP.BINANCE');
  expect(board.highestFunding.some((l) => l.asset === 'TINY')).toBe(false);
  expect(board.venues.map((v) => v.venue)).toEqual(['BINANCE', 'HYPERLIQUID', 'SODEX']);
  expect(board.topAssets.find((a) => a.asset === 'ETH').fundingRegime).toBe('crowded_longs');
});

test('unknown asset returns a clear not-found result', async () => {
  const { perps } = await loadPerps();
  const result: any = await perps.getPerpAsset('NOTACOIN');
  expect(result.found).toBe(false);
  expect(result.error).toMatch(/NOTACOIN/);
});
