const {
  SOSO_API_BASE,
  getCurrencyCatalog,
  resolveCurrencyId,
  sosoGet
} = require('../clients/soso');
const { getSodexTickers } = require('../clients/sodex');
const { asArray, normalizeLookupValue } = require('../normalizers/toolResult');
const { mapNewsItems } = require('../tools/executors/helpers');
const { sleep } = require('../utils/common');

const INTELLIGENCE_CACHE_TTL_MS = 90 * 1000;
const TOKEN_CACHE_TTL_MS = 60 * 1000;
const SOSO_RATE_LIMIT_WARNING = 'SoSoValue rate limit reached; using cached and fallback data for delayed snapshots.';

const TRACKED_ASSETS = [
  { query: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', sector: 'BTC' },
  { query: 'ethereum', symbol: 'ETH', name: 'Ethereum', sector: 'ETH' },
  { query: 'solana', symbol: 'SOL', name: 'Solana', sector: 'Layer1' },
  { query: 'xrp', symbol: 'XRP', name: 'XRP', sector: 'PayFi' },
  { query: 'bnb', symbol: 'BNB', name: 'BNB', sector: 'CeFi' }
];

const INDEX_LABELS = {
  ssiSocialFi: 'SocialFi',
  ssiRWA: 'RWA',
  ssiDeFi: 'DeFi',
  ssiAI: 'AI',
  ssiMeme: 'Meme',
  ssiDePIN: 'DePIN',
  ssiNFT: 'NFT',
  ssiMAG7: 'MAG7',
  ssiCeFi: 'CeFi',
  ssiLayer1: 'Layer 1',
  ssiGameFi: 'GameFi',
  ssiPayFi: 'PayFi',
  ssiLayer2: 'Layer 2'
};

const DEFAULT_INDEX_TICKERS = [
  'ssiAI',
  'ssiMeme',
  'ssiDeFi',
  'ssiLayer1',
  'ssiLayer2',
  'ssiDePIN',
  'ssiRWA',
  'ssiCeFi'
];

const TOKEN_SECTOR_HINTS = {
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'Layer1',
  XRP: 'PayFi',
  BNB: 'CeFi',
  DOGE: 'Meme',
  SHIB: 'Meme',
  PEPE: 'Meme',
  LINK: 'DeFi',
  UNI: 'DeFi',
  AAVE: 'DeFi',
  NEAR: 'AI',
  FET: 'AI',
  TAO: 'AI',
  AR: 'DePIN',
  RNDR: 'DePIN',
  OP: 'Layer2',
  ARB: 'Layer2'
};

let intelligenceCache = {
  expiresAt: 0,
  data: null,
  inflight: null
};

const tokenCache = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeChangeToPercent = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
};

const round = (value, digits = 2) => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const mean = (values) => {
  const clean = values.map(toNumber).filter((value) => value !== null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const formatPct = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return 'N/A';
  return `${parsed >= 0 ? '+' : ''}${round(parsed, 2)}%`;
};

const formatAbsPct = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return 'N/A';
  return `${round(Math.abs(parsed), 2)}%`;
};

const getPayloadData = (payload) => (
  payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
);

const extractList = (value) => {
  const data = getPayloadData(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.tickers)) return data.tickers;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const safeRequest = async (name, fn) => {
  try {
    return {
      name,
      status: 'success',
      data: await fn()
    };
  } catch (error) {
    const statusCode = error.response?.status || null;
    return {
      name,
      status: 'error',
      error: statusCode === 429 ? 'SoSoValue rate limit reached.' : (error.message || String(error)),
      statusCode,
      rateLimited: statusCode === 429
    };
  }
};

const addWarning = (warnings, warning) => {
  if (warning && !warnings.includes(warning)) {
    warnings.push(warning);
  }
};

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

const getRowChange = (row) => toNumber(row?.changePct24h);

const buildRotationSignals = ({ sectors = [], indices = [], assets = [] }) => {
  const sectorRows = sectors.filter((row) => row.name && getRowChange(row) !== null);
  const indexRows = indices.filter((row) => row.name && getRowChange(row) !== null);
  const allRows = [
    ...sectorRows.map((row) => ({ ...row, source: 'SoSoValue Sector' })),
    ...indexRows.map((row) => ({ ...row, source: 'SoSo SSI Index' }))
  ];
  const sorted = [...allRows].sort((a, b) => getRowChange(b) - getRowChange(a));
  const btc = assets.find((asset) => asset.symbol === 'BTC') || sectorRows.find((row) => row.name === 'BTC');
  const eth = assets.find((asset) => asset.symbol === 'ETH') || sectorRows.find((row) => row.name === 'ETH');
  const btcChange = getRowChange(btc);
  const ethChange = getRowChange(eth);
  const signals = [];

  const addRelativeSignal = (name, row, benchmarkName, benchmarkChange, threshold = 1.5) => {
    const change = getRowChange(row);
    if (change === null || benchmarkChange === null) return;
    const spread = change - benchmarkChange;
    if (spread >= threshold) {
      signals.push({
        label: `${name} relative strength`,
        severity: row.changePct24h >= 0 ? 'positive' : 'watch',
        detail: `${name} is outperforming ${benchmarkName} by ${formatPct(spread)} over 24h.`,
        evidence: [`${name}: ${formatPct(change)}`, `${benchmarkName}: ${formatPct(benchmarkChange)}`]
      });
    } else if (spread <= -threshold) {
      signals.push({
        label: `${name} underperformance`,
        severity: 'negative',
        detail: `${name} is lagging ${benchmarkName} by ${formatPct(Math.abs(spread))} over 24h.`,
        evidence: [`${name}: ${formatPct(change)}`, `${benchmarkName}: ${formatPct(benchmarkChange)}`]
      });
    }
  };

  ['AI', 'Meme', 'DeFi', 'Layer1', 'Layer 1', 'Layer2', 'Layer 2', 'RWA', 'GameFi', 'DePIN']
    .forEach((name) => {
      const row = allRows.find((item) => normalizeLookupValue(item.name) === normalizeLookupValue(name));
      if (row) addRelativeSignal(row.name, row, 'BTC', btcChange);
    });

  if (btcChange !== null && ethChange !== null && ethChange - btcChange <= -1) {
    signals.push({
      label: 'ETH beta weakness',
      severity: 'negative',
      detail: `ETH is weaker than BTC by ${formatPct(Math.abs(ethChange - btcChange))}.`,
      evidence: [`ETH: ${formatPct(ethChange)}`, `BTC: ${formatPct(btcChange)}`]
    });
  }

  return {
    leaders: sorted.slice(0, 5),
    laggards: sorted.slice(-5).reverse(),
    signals: signals.slice(0, 8)
  };
};

const classifyMarketRegime = ({ assets = [], sectors = [], indices = [] }) => {
  const riskSectors = sectors
    .filter((row) => !['StableCoin', 'BTC', 'ETH'].includes(row.name))
    .map(getRowChange)
    .filter((value) => value !== null);
  const assetChanges = assets.map(getRowChange).filter((value) => value !== null);
  const indexChanges = indices.map(getRowChange).filter((value) => value !== null);
  const broadSample = [...assetChanges, ...riskSectors, ...indexChanges];
  const broadAverage = mean(broadSample) || 0;
  const positiveCount = broadSample.filter((value) => value > 0).length;
  const breadthPct = broadSample.length ? (positiveCount / broadSample.length) * 100 : 0;
  const dispersion = broadSample.length ? Math.max(...broadSample) - Math.min(...broadSample) : 0;
  const btc = assets.find((asset) => asset.symbol === 'BTC') || sectors.find((row) => row.name === 'BTC');
  const eth = assets.find((asset) => asset.symbol === 'ETH') || sectors.find((row) => row.name === 'ETH');
  const btcChange = getRowChange(btc);
  const ethChange = getRowChange(eth);
  const majorsAverage = mean([btcChange, ethChange]) || 0;
  const altAverage = mean(assets.filter((asset) => !['BTC', 'ETH'].includes(asset.symbol)).map(getRowChange)) || broadAverage;
  const stable = sectors.find((row) => row.name === 'StableCoin');
  const rotation = buildRotationSignals({ sectors, indices, assets });
  const leader = rotation.leaders[0] || null;
  const laggard = rotation.laggards[0] || null;

  let label = 'Chop';
  if (broadAverage <= -1.5 && breadthPct <= 35) {
    label = 'Risk-Off';
  } else if (broadAverage >= 1.5 && breadthPct >= 55) {
    label = 'Risk-On';
  } else if (dispersion >= 4 || Math.abs(altAverage - majorsAverage) >= 1) {
    label = 'Rotation';
  }

  const score = clamp(
    50 + (broadAverage * 8) + ((breadthPct - 50) * 0.35) + ((altAverage - majorsAverage) * 2.5),
    0,
    100
  );
  const confidence = clamp(
    45 + (Math.min(broadSample.length, 25) * 1.4) + Math.min(Math.abs(broadAverage) * 4, 14) + Math.min(dispersion * 2.2, 16),
    45,
    94
  );

  const drivers = [
    `${positiveCount}/${broadSample.length || 0} tracked assets, sectors, and SSI indices are positive over 24h.`,
    `Broad 24h average is ${formatPct(broadAverage)}; BTC is ${formatPct(btcChange)} and ETH is ${formatPct(ethChange)}.`,
    leader && laggard
      ? `Leadership spread: ${leader.name} ${formatPct(leader.changePct24h)} versus ${laggard.name} ${formatPct(laggard.changePct24h)}.`
      : null,
    stable?.marketcapDomPct !== null && stable
      ? `Stablecoin market-cap dominance is ${formatPct(stable.marketcapDomPct)}.`
      : null
  ].filter(Boolean);

  const watch = [
    btcChange !== null ? `BTC 24h direction: ${formatPct(btcChange)}.` : null,
    ethChange !== null ? `ETH relative to BTC: ${formatPct((ethChange || 0) - (btcChange || 0))}.` : null,
    leader ? `Keep ${leader.name} on the strength watchlist.` : null,
    laggard ? `Watch ${laggard.name} for continued underperformance or a failed breakdown.` : null
  ].filter(Boolean);

  const risks = [];
  if (label === 'Risk-Off') risks.push('Negative breadth means bounces need confirmation from BTC and ETH, not only isolated sector strength.');
  if (dispersion >= 4) risks.push('High cross-sector dispersion can make broad-market summaries misleading; relative strength matters more than averages.');
  if (stable?.marketcapDomPct >= 10 && broadAverage < 0) risks.push('High stablecoin dominance plus negative breadth points to defensive positioning.');

  return {
    label,
    score: Math.round(score),
    confidence: Math.round(confidence),
    breadthPct: round(breadthPct, 1),
    broadAveragePct: round(broadAverage, 2),
    dispersionPct: round(dispersion, 2),
    majorsAveragePct: round(majorsAverage, 2),
    altAveragePct: round(altAverage, 2),
    drivers,
    risks,
    watch
  };
};

const buildOpportunityScanner = ({ assets = [], sectors = [], indices = [], sodex = {} }) => {
  const opportunities = [];
  const btc = assets.find((asset) => asset.symbol === 'BTC');
  const btcChange = getRowChange(btc);
  const sectorLookup = new Map(sectors.map((row) => [normalizeLookupValue(row.name), row]));
  const sodexLookup = new Map((sodex.tracked || []).map((row) => [row.symbol, row]));

  assets.forEach((asset) => {
    const change = getRowChange(asset);
    if (change === null) return;
    const benchmark = asset.symbol === 'BTC' ? null : btcChange;
    const relative = benchmark === null || benchmark === undefined ? null : change - benchmark;
    const sodexRow = sodexLookup.get(asset.symbol);
    const perps = sodexRow?.perps;
    const spread = perps?.spreadPct ?? sodexRow?.spot?.spreadPct;
    const liquidity = perps?.quoteVolume24h ?? sodexRow?.spot?.quoteVolume24h;

    if (relative !== null && relative >= 0.75) {
      opportunities.push({
        id: `asset-strength-${asset.symbol}`,
        type: 'Relative Strength',
        symbol: asset.symbol,
        title: `${asset.symbol} holding up better than BTC`,
        score: clamp(62 + relative * 6 + (spread !== null && spread <= 0.05 ? 8 : 0), 0, 95),
        bias: 'watch-long',
        evidence: [
          `${asset.symbol} 24h: ${formatPct(change)}`,
          `BTC 24h: ${formatPct(btcChange)}`,
          spread !== null ? `SoDEX spread: ${formatPct(spread)}` : null
        ].filter(Boolean),
        risk: 'Only actionable if BTC stops dragging the broad tape lower.',
        nextStep: `Monitor ${asset.symbol} versus BTC and confirm SoDEX depth before sizing.`
      });
    } else if (relative !== null && relative <= -0.75) {
      opportunities.push({
        id: `asset-weakness-${asset.symbol}`,
        type: 'Relative Weakness',
        symbol: asset.symbol,
        title: `${asset.symbol} lagging BTC`,
        score: clamp(58 + Math.abs(relative) * 6 + (spread !== null && spread <= 0.05 ? 7 : 0), 0, 92),
        bias: 'avoid-or-hedge',
        evidence: [
          `${asset.symbol} 24h: ${formatPct(change)}`,
          `BTC 24h: ${formatPct(btcChange)}`,
          liquidity ? `SoDEX quote volume: ${Math.round(liquidity).toLocaleString('en-US')}` : null
        ].filter(Boolean),
        risk: 'Weak assets can snap back hard if broad risk appetite recovers.',
        nextStep: `Do not treat weakness as a short setup unless trend and order-book pressure agree.`
      });
    }
  });

  const rankedSectors = sectors
    .filter((row) => getRowChange(row) !== null && !['BTC', 'ETH', 'StableCoin'].includes(row.name))
    .sort((a, b) => getRowChange(b) - getRowChange(a));
  const strongestSector = rankedSectors[0];
  const weakestSector = rankedSectors[rankedSectors.length - 1];
  if (strongestSector) {
    opportunities.push({
      id: `sector-strength-${normalizeLookupValue(strongestSector.name)}`,
      type: 'Sector Rotation',
      symbol: strongestSector.name,
      title: `${strongestSector.name} leading the sector board`,
      score: clamp(60 + Math.max(0, getRowChange(strongestSector)) * 5, 0, 90),
      bias: getRowChange(strongestSector) >= 0 ? 'watch-long' : 'relative-watch',
      evidence: [
        `${strongestSector.name} 24h: ${formatPct(strongestSector.changePct24h)}`,
        `BTC 24h: ${formatPct(btcChange)}`
      ],
      risk: 'Sector leadership without matching spot volume can fade quickly.',
      nextStep: `Compare the leading constituents of ${strongestSector.name} before acting.`
    });
  }
  if (weakestSector && weakestSector !== strongestSector) {
    opportunities.push({
      id: `sector-weakness-${normalizeLookupValue(weakestSector.name)}`,
      type: 'Risk Control',
      symbol: weakestSector.name,
      title: `${weakestSector.name} is the weakest board`,
      score: clamp(56 + Math.abs(getRowChange(weakestSector)) * 4, 0, 90),
      bias: 'reduce-risk',
      evidence: [
        `${weakestSector.name} 24h: ${formatPct(weakestSector.changePct24h)}`,
        `Sector dominance: ${formatPct(weakestSector.marketcapDomPct)}`
      ],
      risk: 'Avoid over-weighting the weakest sleeve until relative performance stabilizes.',
      nextStep: `Use alerts for ${weakestSector.name} relative to BTC instead of chasing first bounce.`
    });
  }

  return opportunities
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => ({ ...item, score: Math.round(item.score) }));
};

const buildAlertEngine = ({ regime, sectors = [], assets = [], rotation = {}, sodex = {} }) => {
  const btc = assets.find((asset) => asset.symbol === 'BTC');
  const btcChange = getRowChange(btc);
  const triggered = [];
  const templates = [
    {
      id: 'risk-off-breadth',
      title: 'Risk-off breadth break',
      condition: 'Broad average < -1.5% and breadth < 35%',
      severity: 'high'
    },
    {
      id: 'sector-relative-strength',
      title: 'Sector outperforming BTC',
      condition: 'Any sector beats BTC by at least 2%',
      severity: 'medium'
    },
    {
      id: 'sector-breakdown',
      title: 'Sector lagging BTC',
      condition: 'Any sector trails BTC by at least 2%',
      severity: 'medium'
    },
    {
      id: 'sodex-tight-spread',
      title: 'SoDEX tight-spread watch',
      condition: 'Tracked market spread <= 0.05%',
      severity: 'low'
    },
    {
      id: 'stablecoin-defense',
      title: 'Stablecoin defensive posture',
      condition: 'Stablecoin dominance > 10% while broad average is negative',
      severity: 'medium'
    }
  ];

  if (regime.broadAveragePct < -1.5 && regime.breadthPct < 35) {
    triggered.push({
      templateId: 'risk-off-breadth',
      title: 'Risk-off breadth break is active',
      severity: 'high',
      evidence: [`Broad average: ${formatPct(regime.broadAveragePct)}`, `Breadth: ${formatPct(regime.breadthPct)}`]
    });
  }

  sectors.forEach((sector) => {
    const change = getRowChange(sector);
    if (change === null || btcChange === null || ['BTC', 'ETH', 'StableCoin'].includes(sector.name)) return;
    const spread = change - btcChange;
    if (spread >= 2) {
      triggered.push({
        templateId: 'sector-relative-strength',
        title: `${sector.name} is outperforming BTC`,
        severity: change >= 0 ? 'medium' : 'low',
        evidence: [`${sector.name}: ${formatPct(change)}`, `BTC: ${formatPct(btcChange)}`, `Spread: ${formatPct(spread)}`]
      });
    } else if (spread <= -2) {
      triggered.push({
        templateId: 'sector-breakdown',
        title: `${sector.name} is trailing BTC`,
        severity: 'medium',
        evidence: [`${sector.name}: ${formatPct(change)}`, `BTC: ${formatPct(btcChange)}`, `Spread: ${formatPct(spread)}`]
      });
    }
  });

  (sodex.tracked || []).forEach((row) => {
    const market = row.perps || row.spot;
    if (market?.spreadPct !== null && market?.spreadPct <= 0.05) {
      triggered.push({
        templateId: 'sodex-tight-spread',
        title: `${row.symbol} has a tight SoDEX spread`,
        severity: 'low',
        evidence: [`Spread: ${formatPct(market.spreadPct)}`, `Market: ${market.symbol}`]
      });
    }
  });

  const stable = sectors.find((sector) => sector.name === 'StableCoin');
  if (stable?.marketcapDomPct > 10 && regime.broadAveragePct < 0) {
    triggered.push({
      templateId: 'stablecoin-defense',
      title: 'Stablecoin defensive posture is active',
      severity: 'medium',
      evidence: [`Stablecoin dominance: ${formatPct(stable.marketcapDomPct)}`, `Broad average: ${formatPct(regime.broadAveragePct)}`]
    });
  }

  return {
    templates,
    triggered: triggered.slice(0, 8),
    rotationSignals: asArray(rotation.signals).slice(0, 5)
  };
};

const buildMarketIntelligencePayload = async () => {
  const startedAt = Date.now();
  const [trackedAssets, sectorSpotlight, indexRotation, sodex] = await Promise.all([
    fetchTrackedAssets(),
    fetchSectorSpotlight(),
    fetchIndexRotation(),
    fetchSodexContext()
  ]);

  const sectors = sectorSpotlight.sectors;
  const indices = indexRotation.indices;
  const assets = hydrateAssetsWithFallbacks(trackedAssets.assets, sectors, sodex);
  const regime = classifyMarketRegime({ assets, sectors, indices });
  const rotation = {
    sectors,
    spotlight: sectorSpotlight.spotlight,
    indices,
    ...buildRotationSignals({ sectors, indices, assets })
  };
  const opportunities = buildOpportunityScanner({ assets, sectors, indices, sodex });
  const alerts = buildAlertEngine({ regime, sectors, assets, rotation, sodex });
  const warnings = [
    ...trackedAssets.warnings,
    ...(indexRotation.warnings || []),
    sectorSpotlight.status.status === 'error' ? `Sector spotlight failed: ${sectorSpotlight.status.error}` : null,
    sodex.status.spot === 'error' ? `SoDEX spot failed: ${sodex.status.spotError}` : null,
    sodex.status.perps === 'error' ? `SoDEX perps failed: ${sodex.status.perpsError}` : null
  ].filter(Boolean);
  const dedupedWarnings = [...new Set(warnings)];

  return {
    source: 'SoSoValue + SoSo SSI + SoDEX',
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    regime,
    tickerAssets: assets,
    rotation,
    opportunities,
    alerts,
    sodex,
    warnings: dedupedWarnings,
    evidence: [
      `Regime=${regime.label}, confidence=${regime.confidence}, breadth=${formatPct(regime.breadthPct)}.`,
      ...regime.drivers.slice(0, 3),
      ...rotation.signals.slice(0, 3).map((signal) => signal.detail)
    ].slice(0, 8)
  };
};

const buildMarketIntelligence = async (options = {}) => {
  const force = Boolean(options.force);
  if (!force && intelligenceCache.data && intelligenceCache.expiresAt > Date.now()) {
    return intelligenceCache.data;
  }

  if (!intelligenceCache.inflight) {
    intelligenceCache.inflight = buildMarketIntelligencePayload()
      .then((data) => {
        intelligenceCache.data = data;
        intelligenceCache.expiresAt = Date.now() + INTELLIGENCE_CACHE_TTL_MS;
        return data;
      })
      .finally(() => {
        intelligenceCache.inflight = null;
      });
  }

  return intelligenceCache.inflight;
};

const analyzeKlines = (klines) => {
  const rows = asArray(klines).map((row) => ({
    date: row.date || row.time || row.t,
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
    safeRequest('tokenNews', () => sosoGet('/news/featured/currency', {
      currencyId: assetRecord.currency_id,
      pageNum: 1,
      pageSize: 5
    }, SOSO_API_BASE)),
    buildMarketIntelligence()
  ]);

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
    news[0]?.title ? `Latest featured headline: ${news[0].title}` : null
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

const buildTokenIntelligence = async (assetQuery, options = {}) => {
  const key = normalizeLookupValue(assetQuery);
  const cached = tokenCache.get(key);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await buildTokenIntelligencePayload(assetQuery);
  tokenCache.set(key, {
    data,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS
  });
  return data;
};

module.exports = {
  buildAlertEngine,
  buildMarketIntelligence,
  buildOpportunityScanner,
  buildRotationSignals,
  buildTokenIntelligence,
  classifyMarketRegime,
  normalizeChangeToPercent
};
