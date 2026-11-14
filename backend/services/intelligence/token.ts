// Token intelligence: per-asset snapshot, klines, news and SoDEX context (cached).
import {
  resolveCurrencyId,
  sosoGet
} from '../../clients/soso.ts';
import { asArray, normalizeLookupValue } from '../../normalizers/toolResult.ts';
import { mapNewsItems } from '../../tools/executors/helpers.ts';
import { normalizeAssetSnapshot } from './sources.ts';
import { buildMarketIntelligence } from './market.ts';
import {
  SOSO_RATE_LIMIT_WARNING,
  TOKEN_SECTOR_HINTS,
  toNumber,
  round,
  formatPct,
  formatAbsPct,
  getPayloadData,
  extractList,
  safeRequest
} from './shared.ts';

const TOKEN_CACHE_TTL_MS = 60 * 1000;

const tokenCache = new Map();

const TOKEN_CACHE_MAX_KEYS = Number(process.env.MARKET_TOKEN_CACHE_MAX_KEYS) || 100;

const analyzeKlines = (klines) => {
  const rows = asArray(klines).map((row) => ({
    date: row.timestamp ? new Date(Number(row.timestamp)).toISOString().slice(0, 10) : (row.date || row.time || row.t),
    open: toNumber(row.open ?? row.o),
    high: toNumber(row.high ?? row.h),
    low: toNumber(row.low ?? row.l),
    close: toNumber(row.close ?? row.c),
    volume: toNumber(row.volume ?? row.v)
  })).filter((row) => row.close !== null);

  const first = rows[0];
  const last = rows[rows.length - 1];
  const highs = rows.map((row) => row.high).filter((value) => value !== null);
  const lows = rows.map((row) => row.low).filter((value) => value !== null);
  const periodChangePct = first?.close && last?.close ? ((last.close - first.close) / first.close) * 100 : null;

  return {
    count: rows.length,
    firstDate: first?.date || null,
    lastDate: last?.date || null,
    periodChangePct: round(periodChangePct, 2),
    periodHigh: highs.length ? Math.max(...highs) : null,
    periodLow: lows.length ? Math.min(...lows) : null,
    lastClose: last?.close || null,
    trend: periodChangePct === null ? null : periodChangePct > 1 ? 'uptrend' : periodChangePct < -1 ? 'downtrend' : 'range'
  };
};

const findSodexForSymbol = (sodex, symbol) => {
  const upper = String(symbol || '').toUpperCase();
  const tracked = asArray(sodex?.tracked).find((row) => row.symbol === upper);
  if (tracked) return tracked;
  return {
    symbol: upper,
    spot: null,
    perps: asArray(sodex?.liquidPerps).find((row) => row.symbol === `${upper}-USD`) || null,
    tradable: false
  };
};

const buildTokenIntelligencePayload = async (assetQuery) => {
  const assetRecord = await resolveCurrencyId(assetQuery);
  const symbol = String(assetRecord.symbol || '').toUpperCase();
  const [snapshotReq, klinesReq, newsReq, market] = await Promise.all([
    safeRequest('tokenSnapshot', () => sosoGet(`/currencies/${assetRecord.currency_id}/market-snapshot`)),
    safeRequest('tokenKlines', () => sosoGet(`/currencies/${assetRecord.currency_id}/klines`, { interval: '1d', limit: 30 })),
    safeRequest('tokenNews', () => sosoGet('/news', {
      currency_id: assetRecord.currency_id,
      page: 1,
      page_size: 5,
      language: 'en'
    })),
    buildMarketIntelligence()
  ]);

  if (snapshotReq.status === 'error' && klinesReq.status === 'error') {
    throw new Error(`Upstream API failure: Could not load token intelligence for ${symbol}.`);
  }

  const directSnapshot = snapshotReq.status === 'success'
    ? normalizeAssetSnapshot(assetRecord, getPayloadData(snapshotReq.data), { symbol, name: assetRecord.name })
    : normalizeAssetSnapshot(assetRecord, {}, { symbol, name: assetRecord.name });
  const cachedSnapshot = market.tickerAssets.find((asset) => asset.symbol === symbol);
  const snapshot = directSnapshot.price !== null || directSnapshot.changePct24h !== null
    ? directSnapshot
    : cachedSnapshot
      ? { ...directSnapshot, ...cachedSnapshot, id: directSnapshot.id || cachedSnapshot.id }
      : directSnapshot;
  const klines = klinesReq.status === 'success' ? extractList(klinesReq.data) : [];
  const trend = analyzeKlines(klines);
  const news = newsReq.status === 'success' ? mapNewsItems(getPayloadData(newsReq.data)?.list, 5) : [];
  const btc = market.tickerAssets.find((asset) => asset.symbol === 'BTC');
  const eth = market.tickerAssets.find((asset) => asset.symbol === 'ETH');
  const sectorName = TOKEN_SECTOR_HINTS[symbol] || snapshot.sector;
  const sector = market.rotation.sectors.find((row) =>
    normalizeLookupValue(row.name) === normalizeLookupValue(sectorName)
  ) || null;
  const sodexMarket = findSodexForSymbol(market.sodex, symbol);
  const relativeToBtc = snapshot.changePct24h !== null && btc?.changePct24h !== null
    ? round(snapshot.changePct24h - btc.changePct24h, 2)
    : null;
  const relativeToEth = snapshot.changePct24h !== null && eth?.changePct24h !== null
    ? round(snapshot.changePct24h - eth.changePct24h, 2)
    : null;
  const relativeToSector = snapshot.changePct24h !== null && sector?.changePct24h !== null
    ? round(snapshot.changePct24h - sector.changePct24h, 2)
    : null;

  const whyMoving = [
    `24h move is ${formatPct(snapshot.changePct24h)} with BTC at ${formatPct(btc?.changePct24h)} and ETH at ${formatPct(eth?.changePct24h)}.`,
    relativeToBtc !== null
      ? `${symbol} is ${relativeToBtc >= 0 ? 'outperforming' : 'underperforming'} BTC by ${formatAbsPct(relativeToBtc)}.`
      : null,
    sector
      ? `${sector.name} sector is ${formatPct(sector.changePct24h)}, putting ${symbol} ${relativeToSector >= 0 ? 'above' : 'below'} its sector by ${formatAbsPct(relativeToSector)}.`
      : null,
    trend.periodChangePct !== null
      ? `30-session trend is ${trend.trend} with a ${formatPct(trend.periodChangePct)} period move.`
      : null,
    sodexMarket.perps?.spreadPct !== null
      ? `SoDEX ${sodexMarket.perps.symbol} spread is ${formatPct(sodexMarket.perps.spreadPct)} with funding at ${formatPct(sodexMarket.perps.fundingRatePct)}.`
      : null,
    news[0]?.title ? `Latest headline: ${news[0].title}` : null
  ].filter(Boolean).slice(0, 6);

  return {
    source: 'SoSoValue + SoSo SSI + SoDEX',
    fetchedAt: new Date().toISOString(),
    asset: {
      id: snapshot.id,
      symbol,
      name: snapshot.name
    },
    snapshot,
    relative: {
      toBtcPct: relativeToBtc,
      toEthPct: relativeToEth,
      toSectorPct: relativeToSector,
      sector: sector ? {
        name: sector.name,
        changePct24h: sector.changePct24h,
        marketcapDomPct: sector.marketcapDomPct
      } : null
    },
    trend,
    sodex: sodexMarket,
    news,
    whyMoving,
    evidence: [
      `${symbol} price: ${snapshot.price ?? 'N/A'}`,
      `${symbol} 24h: ${formatPct(snapshot.changePct24h)}`,
      `BTC 24h: ${formatPct(btc?.changePct24h)}`,
      `ETH 24h: ${formatPct(eth?.changePct24h)}`,
      sector ? `${sector.name} sector 24h: ${formatPct(sector.changePct24h)}` : null,
      sodexMarket.perps ? `SoDEX perps: ${sodexMarket.perps.symbol}, spread ${formatPct(sodexMarket.perps.spreadPct)}` : null
    ].filter(Boolean),
    warnings: [
      snapshotReq.status === 'error' ? (snapshotReq.rateLimited ? SOSO_RATE_LIMIT_WARNING : `Snapshot failed: ${snapshotReq.error}`) : null,
      klinesReq.status === 'error' ? `Klines failed: ${klinesReq.error}` : null,
      newsReq.status === 'error' ? `News failed: ${newsReq.error}` : null
    ].filter(Boolean).filter((warning, index, list) => list.indexOf(warning) === index)
  };
};

const buildTokenIntelligence = async (assetQuery, options: Record<string, any> = {}) => {
  const key = normalizeLookupValue(assetQuery);
  const cached = tokenCache.get(key);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await buildTokenIntelligencePayload(assetQuery);
  if (tokenCache.size >= TOKEN_CACHE_MAX_KEYS && !tokenCache.has(key)) {
    const oldestKey = tokenCache.keys().next().value;
    if (oldestKey) tokenCache.delete(oldestKey);
  }
  tokenCache.set(key, {
    data,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS
  });
  return data;
};

export { buildTokenIntelligence };
