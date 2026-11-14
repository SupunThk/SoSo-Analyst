// Fetches and normalises SoSoValue / SoDEX data for market intelligence.
const {
  getCurrencyCatalog,
  resolveCurrencyId,
  sosoGet
} = require('../../clients/soso');
const { getSodexTickers } = require('../../clients/sodex');
const { asArray, normalizeLookupValue } = require('../../normalizers/toolResult');
const { sleep } = require('../../utils/common');
const {
  SOSO_RATE_LIMIT_WARNING,
  TRACKED_ASSETS,
  INDEX_LABELS,
  DEFAULT_INDEX_TICKERS,
  TOKEN_SECTOR_HINTS,
  toNumber,
  normalizeChangeToPercent,
  round,
  getPayloadData,
  extractList,
  safeRequest,
  addWarning
} = require('./shared');

const findCatalogAsset = (catalog, spec) => {
  const wanted = [spec.query, spec.symbol, spec.name].map(normalizeLookupValue).filter(Boolean);
  return catalog.find((record) => {
    const candidates = [record.name, record.fullName, record.symbol, record.currencyName]
      .map(normalizeLookupValue);
    return candidates.some((candidate) => wanted.includes(candidate));
  });
};

const normalizeAssetSnapshot = (assetRecord, snapshot, fallback = {}) => {
  const data = snapshot || {};
  return {
    id: String(assetRecord?.currency_id || assetRecord?.currencyId || assetRecord?.id || fallback.id || ''),
    symbol: String(assetRecord?.symbol || fallback.symbol || '').toUpperCase(),
    name: assetRecord?.name || assetRecord?.fullName || fallback.name || assetRecord?.symbol || 'Unknown',
    sector: TOKEN_SECTOR_HINTS[String(assetRecord?.symbol || fallback.symbol || '').toUpperCase()] || fallback.sector || null,
    price: toNumber(data.price),
    changePct24h: round(normalizeChangeToPercent(data.change_pct_24h ?? data.changePct24h), 2),
    changePct7d: round(normalizeChangeToPercent(data.change_pct_7d ?? data.changePct7d ?? data.roi_7d), 2),
    changePct30d: round(normalizeChangeToPercent(data.change_pct_30d ?? data.changePct30d ?? data.roi_1m), 2),
    marketCap: toNumber(data.market_cap ?? data.marketcap ?? data.marketCap),
    volume24h: toNumber(data.volume_24h ?? data.turnover_24h ?? data.volume24h),
    marketCapRank: toNumber(data.marketcap_rank ?? data.market_cap_rank ?? data.rank),
    high24h: toNumber(data.high_24h ?? data.high24h),
    low24h: toNumber(data.low_24h ?? data.low24h),
    dominancePct: round(normalizeChangeToPercent(data.market_dominance ?? data.marketDominance), 2)
  };
};

const fetchTrackedAssets = async () => {
  let catalog = [];
  const assets = [];
  const warnings = [];

  try {
    catalog = await getCurrencyCatalog();
  } catch (error) {
    return {
      assets: TRACKED_ASSETS.map((spec) => ({
        id: '',
        symbol: spec.symbol,
        name: spec.name,
        sector: spec.sector,
        price: null,
        changePct24h: null,
        changePct7d: null,
        changePct30d: null,
        marketCap: null,
        volume24h: null,
        marketCapRank: null,
        high24h: null,
        low24h: null,
        dominancePct: null
      })),
      warnings: [`Currency catalog failed: ${error.message || String(error)}`]
    };
  }

  for (const spec of TRACKED_ASSETS) {
    const record = findCatalogAsset(catalog, spec) || await resolveCurrencyId(spec.query).catch(() => null);
    if (!record) {
      warnings.push(`No SoSoValue currency record resolved for ${spec.symbol}.`);
      continue;
    }

    const request = await safeRequest(`asset:${spec.symbol}`, () =>
      sosoGet(`/currencies/${record.currency_id}/market-snapshot`)
    );
    if (request.status === 'success') {
      assets.push(normalizeAssetSnapshot(record, getPayloadData(request.data), spec));
    } else {
      addWarning(warnings, request.rateLimited ? SOSO_RATE_LIMIT_WARNING : `${spec.symbol} snapshot failed: ${request.error}`);
      assets.push({
        id: String(record.currency_id || ''),
        symbol: spec.symbol,
        name: spec.name,
        sector: spec.sector,
        price: null,
        changePct24h: null,
        changePct7d: null,
        changePct30d: null,
        marketCap: null,
        volume24h: null,
        marketCapRank: null,
        high24h: null,
        low24h: null,
        dominancePct: null
      });
    }
    await sleep(300);
  }

  return { assets, warnings };
};

const hydrateAssetsWithFallbacks = (assets, sectors, sodex) => assets.map((asset) => {
  const sectorMatch = sectors.find((row) =>
    normalizeLookupValue(row.name) === normalizeLookupValue(asset.symbol) ||
    normalizeLookupValue(row.name) === normalizeLookupValue(asset.sector)
  );
  const sodexMatch = asArray(sodex?.tracked).find((row) => row.symbol === asset.symbol);
  const sodexTicker = sodexMatch?.perps || sodexMatch?.spot;

  return {
    ...asset,
    price: asset.price ?? sodexTicker?.lastPrice ?? sodexTicker?.markPrice ?? null,
    changePct24h: asset.changePct24h ?? sodexTicker?.changePct24h ?? sectorMatch?.changePct24h ?? null,
    volume24h: asset.volume24h ?? sodexTicker?.quoteVolume24h ?? null
  };
});

const normalizeSectorRow = (item, kind = 'sector') => ({
  name: String(item?.name || item?.sector || 'Unknown').trim(),
  kind,
  changePct24h: round(normalizeChangeToPercent(item?.change_pct_24h ?? item?.changePct24h), 2),
  marketcapDomPct: round(normalizeChangeToPercent(item?.marketcap_dom ?? item?.marketcapDom), 2)
});

const fetchSectorSpotlight = async () => {
  const request = await safeRequest('sectorSpotlight', () => sosoGet('/currencies/sector-spotlight'));
  if (request.status !== 'success') {
    return {
      sectors: [],
      spotlight: [],
      status: request
    };
  }

  const data = getPayloadData(request.data);
  return {
    sectors: asArray(data?.sector).map((item) => normalizeSectorRow(item, 'sector')),
    spotlight: asArray(data?.spotlight).map((item) => normalizeSectorRow(item, 'spotlight')),
    status: request
  };
};

const fetchIndexRotation = async () => {
  const catalogRequest = await safeRequest('indexCatalog', () => sosoGet('/indices'));
  if (catalogRequest.status !== 'success') {
    return {
      indices: [],
      status: catalogRequest
    };
  }

  const catalog = extractList(catalogRequest.data).map(String);
  const selectedTickers = DEFAULT_INDEX_TICKERS.filter((ticker) => catalog.includes(ticker));
  const indices = [];
  const warnings = [];

  for (const ticker of selectedTickers) {
    const snapshotRequest = await safeRequest(`index:${ticker}`, () =>
      sosoGet(`/indices/${ticker}/market-snapshot`)
    );
    if (snapshotRequest.status === 'success') {
      const data = getPayloadData(snapshotRequest.data);
      indices.push({
        ticker,
        name: INDEX_LABELS[ticker] || ticker.replace(/^ssi/, ''),
        price: round(data?.price, 4),
        changePct24h: round(normalizeChangeToPercent(data?.change_pct_24h ?? data?.changePct24h), 2),
        roi7d: round(normalizeChangeToPercent(data?.roi_7d), 2),
        roi1m: round(normalizeChangeToPercent(data?.roi_1m), 2),
        roi3m: round(normalizeChangeToPercent(data?.roi_3m), 2),
        ytd: round(normalizeChangeToPercent(data?.ytd), 2)
      });
    } else {
      addWarning(warnings, snapshotRequest.rateLimited ? SOSO_RATE_LIMIT_WARNING : `${ticker} snapshot failed: ${snapshotRequest.error}`);
    }
    await sleep(200);
  }

  return {
    indices,
    warnings,
    status: catalogRequest
  };
};

const normalizeSodexTicker = (item) => {
  const symbol = String(item?.symbol || item?.s || item?.market || item?.name || '').toUpperCase();
  const bid = toNumber(item?.bidPx ?? item?.bid ?? item?.b);
  const ask = toNumber(item?.askPx ?? item?.ask ?? item?.a);
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const spreadPct = mid && ask >= bid ? ((ask - bid) / mid) * 100 : null;

  return {
    symbol,
    lastPrice: toNumber(item?.lastPx ?? item?.last ?? item?.price ?? item?.markPrice),
    markPrice: toNumber(item?.markPrice),
    indexPrice: toNumber(item?.indexPrice),
    changePct24h: round(normalizeChangeToPercent(item?.changePct ?? item?.change_pct_24h), 2),
    quoteVolume24h: toNumber(item?.quoteVolume ?? item?.quote_volume ?? item?.turnover24h),
    bid,
    ask,
    spreadPct: round(spreadPct, 4),
    fundingRatePct: round(normalizeChangeToPercent(item?.fundingRate), 4),
    openInterest: toNumber(item?.openInterest)
  };
};

const fetchSodexContext = async () => {
  const [spot, perps] = await Promise.all([
    safeRequest('sodexSpotTickers', () => getSodexTickers('spot')),
    safeRequest('sodexPerpsTickers', () => getSodexTickers('perps'))
  ]);

  const spotTickers = spot.status === 'success' ? extractList(spot.data).map(normalizeSodexTicker).filter((item) => item.symbol) : [];
  const perpsTickers = perps.status === 'success' ? extractList(perps.data).map(normalizeSodexTicker).filter((item) => item.symbol) : [];
  const tracked = TRACKED_ASSETS.map((asset) => {
    const perpsSymbol = `${asset.symbol}-USD`;
    const spotMatch = spotTickers.find((item) => item.symbol.includes(asset.symbol) && item.symbol.includes('USDC'));
    const perpsMatch = perpsTickers.find((item) => item.symbol === perpsSymbol);
    return {
      symbol: asset.symbol,
      spot: spotMatch || null,
      perps: perpsMatch || null,
      tradable: Boolean(spotMatch || perpsMatch)
    };
  });

  const liquidPerps = perpsTickers
    .filter((item) => item.quoteVolume24h !== null)
    .sort((a, b) => (b.quoteVolume24h || 0) - (a.quoteVolume24h || 0))
    .slice(0, 10);

  return {
    status: {
      spot: spot.status,
      perps: perps.status,
      spotError: spot.error,
      perpsError: perps.error
    },
    counts: {
      spotTickers: spotTickers.length,
      perpsTickers: perpsTickers.length
    },
    tracked,
    liquidPerps
  };
};

module.exports = {
  normalizeAssetSnapshot,
  fetchTrackedAssets,
  hydrateAssetsWithFallbacks,
  fetchSectorSpotlight,
  fetchIndexRotation,
  fetchSodexContext
};
