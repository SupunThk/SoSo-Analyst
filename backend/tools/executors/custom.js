const {
  SOSO_API_BASE,
  SOSO_OPENAPI_V2_BASE,
  formatEtfCountryCode,
  normalizeEtfAssetSymbol,
  resolveCurrencyId,
  sosoGet,
  sosoPost
} = require('../../clients/soso');
const {
  DEFAULT_WATCHLIST_TICKERS,
  asArray,
  normalizeLookupValue,
  sanitizeForGemini
} = require('../../normalizers/toolResult');
const { formatToolErrorMessage } = require('./shared');
const { mapNewsItems } = require('./helpers');
const {
  buildMarketIntelligence,
  buildTokenIntelligence,
  normalizeChangeToPercent
} = require('../../services/marketIntelligence');
const {
  getEtfType,
  getSosoList,
  normalizeEtfHistory,
  normalizeEtfMetricItem,
  buildEtfFlowAnalytics,
  getEtfMetricValue
} = require('./etfHelpers');

const getPayloadData = (payload) => (
  payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
);

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value, digits = 2) => {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const normalizeSectorSpotlightRow = (item = {}, kind = 'sector') => {
  const changePct24h = round(normalizeChangeToPercent(
    item.change_pct_24h ?? item.changePct24h ?? item.priceChange24h ?? item.roi_24h
  ));
  const marketCap = toNumberOrNull(item.market_cap ?? item.marketCap ?? item.marketcap);
  const volume24h = toNumberOrNull(item.volume_24h ?? item.volume24h ?? item.turnover_24h);
  const marketcapDomPct = round(normalizeChangeToPercent(
    item.marketcap_dom ?? item.marketcapDom ?? item.marketcap_dom_pct ?? item.marketcapDomPct
  ));
  const name = String(item.name || item.sector || item.ticker || item.symbol || 'Unknown').trim();

  return {
    name,
    ticker: item.ticker || item.symbol,
    kind: item.kind || kind,
    change_pct_24h: changePct24h,
    changePct24h,
    market_cap: marketCap,
    marketCap,
    volume_24h: volume24h,
    volume24h,
    marketcap_dom_pct: marketcapDomPct,
    marketcapDomPct,
    price: toNumberOrNull(item.price),
    top_currencies: asArray(item.top_currencies || item.topCurrencies || item.constituents)
      .slice(0, 5)
      .map((c) => c.name || c.symbol || c.ticker || c)
      .filter(Boolean)
  };
};

const extractSectorSpotlightRows = (payload, limit) => {
  const data = getPayloadData(payload);
  const sectorRows = (Array.isArray(data) ? data : asArray(data?.sector || data?.sectors || data?.list))
    .map((item) => normalizeSectorSpotlightRow(item, 'sector'))
    .filter((item) => item.name && item.name !== 'Unknown');
  const spotlightRows = asArray(data?.spotlight)
    .map((item) => normalizeSectorSpotlightRow(item, 'spotlight'))
    .filter((item) => item.name && item.name !== 'Unknown');
  const rows = sectorRows.length ? sectorRows : spotlightRows;

  return {
    rows: rows.slice(0, limit),
    spotlight: spotlightRows.slice(0, limit)
  };
};

const dedupeSectorRows = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = normalizeLookupValue(row.name || row.ticker || row.symbol);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortSectorRows = (rows) => [...rows].sort((a, b) => {
  const left = toNumberOrNull(a.change_pct_24h ?? a.changePct24h);
  const right = toNumberOrNull(b.change_pct_24h ?? b.changePct24h);
  if (left === null && right === null) return String(a.name).localeCompare(String(b.name));
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
});

const buildSectorFallbackFromMarketIntelligence = async (limit, fallbackReason) => {
  const market = await buildMarketIntelligence();
  const rotation = market?.rotation || {};
  let sourceScope = 'Market-intelligence rotation fallback from SoSoValue sector data.';
  let sectors = dedupeSectorRows([
    ...asArray(rotation.sectors).map((item) => normalizeSectorSpotlightRow(item, item.kind || 'sector')),
    ...asArray(rotation.spotlight).map((item) => normalizeSectorSpotlightRow(item, item.kind || 'spotlight'))
  ]);

  if (!sectors.length) {
    sectors = dedupeSectorRows(asArray(rotation.indices).map((item) =>
      normalizeSectorSpotlightRow({ ...item, name: item.name || item.ticker }, 'index')
    ));
    sourceScope = 'SoSoValue SSI index rotation fallback because sector spotlight rows were unavailable.';
  }

  if (!sectors.length) {
    sectors = asArray(market?.tickerAssets)
      .filter((asset) => asset?.sector || asset?.symbol)
      .map((asset) => ({
        name: asset.sector || asset.name || asset.symbol,
        ticker: asset.symbol,
        kind: 'asset-proxy',
        change_pct_24h: asset.changePct24h,
        changePct24h: asset.changePct24h,
        price: asset.price,
        market_cap: asset.marketCap,
        marketCap: asset.marketCap,
        volume_24h: asset.volume24h,
        volume24h: asset.volume24h,
        top_currencies: [asset.symbol].filter(Boolean)
      }))
      .filter((row) => row.change_pct_24h !== null && row.change_pct_24h !== undefined);
    sourceScope = market?.topMovers?.scope || 'Tracked major assets used as sector proxies.';
  }

  const ranked = sortSectorRows(dedupeSectorRows(sectors)).slice(0, limit);
  return {
    count: ranked.length,
    sectors: ranked,
    source: 'market-intelligence-fallback',
    sourceScope,
    fallbackReason,
    regime: market?.regime ? {
      label: market.regime.label,
      confidence: market.regime.confidence,
      breadthPct: market.regime.breadthPct,
      broadAveragePct: market.regime.broadAveragePct
    } : undefined,
    warnings: [
      fallbackReason,
      ...asArray(market?.warnings)
    ].filter(Boolean)
  };
};

const customToolExecutors = {
  async get_market_intelligence() {
    return buildMarketIntelligence();
  },
  async get_token_intelligence(args = {}) {
    return buildTokenIntelligence(args.asset || 'bitcoin');
  },
  async compare_assets(args = {}) {
    const [assetARecord, assetBRecord] = await Promise.all([
      resolveCurrencyId(args.assetA),
      resolveCurrencyId(args.assetB)
    ]);

    const [assetAResponse, assetBResponse] = await Promise.all([
      sosoGet(`/currencies/${assetARecord.currency_id}/market-snapshot`),
      sosoGet(`/currencies/${assetBRecord.currency_id}/market-snapshot`)
    ]);

    return {
      assetA: {
        id: assetARecord.currency_id,
        name: assetARecord.name,
        symbol: assetARecord.symbol,
        snapshot: sanitizeForGemini(assetAResponse.data)
      },
      assetB: {
        id: assetBRecord.currency_id,
        name: assetBRecord.name,
        symbol: assetBRecord.symbol,
        snapshot: sanitizeForGemini(assetBResponse.data)
      }
    };
  },
  async get_asset_news_brief(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news/featured/currency', {
      currencyId: assetRecord.currency_id,
      pageNum: 1,
      pageSize: limit
    }, SOSO_API_BASE);

    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      total: response.data?.total,
      items: mapNewsItems(response.data?.list, limit)
    };
  },
  async get_hot_news_digest(args = {}) {
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news/hot');
    return {
      total: response.data?.total,
      items: mapNewsItems(response.data?.list, limit)
    };
  },
  async get_etf_flow_brief(args = {}) {
    const assetSymbol = normalizeEtfAssetSymbol(args.assetSymbol);
    const countryCode = formatEtfCountryCode(args.countryCode);
    const days = Math.min(Math.max(Number(args.days) || 5, 1), 30);
    const type = getEtfType(assetSymbol);

    try {
      const [historyResponse, metricsResponse] = await Promise.all([
        sosoPost('/etf/historicalInflowChart', { type }, SOSO_OPENAPI_V2_BASE),
        sosoPost('/etf/currentEtfDataMetrics', { type }, SOSO_OPENAPI_V2_BASE)
      ]);

      const history = normalizeEtfHistory(getSosoList(historyResponse), days);
      const etfs = getSosoList(metricsResponse);
      const topEtfs = etfs.slice(0, 10).map(normalizeEtfMetricItem);

      return {
        assetSymbol,
        countryCode,
        type,
        sourceEndpoint: 'openapi/v2/etf',
        etfCount: etfs.length,
        tickers: etfs.slice(0, 10).map((item) => item.ticker),
        aggregate: {
          totalNetAssets: getEtfMetricValue(metricsResponse.data?.totalNetAssets),
          totalNetAssetsPercentage: getEtfMetricValue(metricsResponse.data?.totalNetAssetsPercentage),
          totalTokenHoldings: getEtfMetricValue(metricsResponse.data?.totalTokenHoldings),
          dailyNetInflow: getEtfMetricValue(metricsResponse.data?.dailyNetInflow),
          cumNetInflow: getEtfMetricValue(metricsResponse.data?.cumNetInflow),
          dailyTotalValueTraded: getEtfMetricValue(metricsResponse.data?.dailyTotalValueTraded)
        },
        history,
        topEtfs,
        flowAnalytics: buildEtfFlowAnalytics(history)
      };
    } catch (officialEndpointError) {
      const [listResponse, historyResponse] = await Promise.all([
        sosoGet('/etfs', { symbol: assetSymbol, country_code: countryCode }),
        sosoGet('/etfs/summary-history', { symbol: assetSymbol, country_code: countryCode, days })
      ]);

      const etfs = asArray(listResponse.data);
      const topTickers = etfs.slice(0, 3).map((item) => item.ticker);
      const snapshotResponses = await Promise.all(topTickers.map((ticker) =>
        sosoGet(`/etfs/${ticker}/market-snapshot`, { symbol: assetSymbol })
      ));

      const history = normalizeEtfHistory(asArray(historyResponse.data), days);

      return {
        assetSymbol,
        countryCode,
        type,
        sourceEndpoint: 'legacy/openapi/v1/etfs',
        sourceFallbackReason: formatToolErrorMessage(officialEndpointError, 'SoSoValue ETF v2'),
        etfCount: etfs.length,
        tickers: etfs.slice(0, 10).map((item) => item.ticker),
        history,
        topEtfs: snapshotResponses.map((item) => sanitizeForGemini(item.data)),
        flowAnalytics: buildEtfFlowAnalytics(history)
      };
    }
  },
  async get_macro_crypto_calendar(args = {}) {
    const daysAhead = Math.min(Math.max(Number(args.daysAhead) || 7, 1), 21);
    const response = await sosoGet('/macro/events');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);

    const events = asArray(response.data).filter((item) => {
      const date = new Date(item.date);
      return date >= today && date <= end;
    });

    return {
      from: today.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      events: sanitizeForGemini(events)
    };
  },
  async get_crypto_equities_watchlist(args = {}) {
    const requestedTickers = asArray(args.tickers).map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    const tickers = (requestedTickers.length ? requestedTickers : DEFAULT_WATCHLIST_TICKERS).slice(0, 8);
    const [listResponse, ...snapshotResponses] = await Promise.all([
      sosoGet('/crypto-stocks'),
      ...tickers.map((ticker) => sosoGet(`/crypto-stocks/${ticker}/market-snapshot`))
    ]);

    const catalog = asArray(listResponse.data);
    const stocks = tickers.map((ticker, index) => {
      const meta = catalog.find((item) => item.ticker === ticker) || {};
      return {
        ticker,
        name: meta.name,
        exchange: meta.exchange,
        sector: meta.sector,
        snapshot: sanitizeForGemini(snapshotResponses[index]?.data)
      };
    });

    return { stocks };
  },
  async get_btc_treasury_brief(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet('/btc-treasuries');
    return {
      companies: asArray(response.data).slice(0, limit).map((item) => ({
        ticker: item.ticker,
        name: item.name,
        list_location: item.list_location
      }))
    };
  },
  async get_btc_purchase_history_brief(args = {}) {
    const ticker = String(args.ticker || '').trim().toUpperCase();
    const response = await sosoGet(`/btc-treasuries/${ticker}/purchase-history`);
    return {
      companyTicker: ticker,
      purchases: asArray(response.data).slice(0, 20).map((item) => sanitizeForGemini(item))
    };
  },
  async get_asset_snapshot(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/market-snapshot`);
    const d = response.data || {};
    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      snapshot: {
        price: d.price,
        change_pct_24h: d.change_pct_24h ?? d.changePct24h,
        change_pct_7d: d.change_pct_7d ?? d.changePct7d,
        change_pct_30d: d.change_pct_30d ?? d.changePct30d,
        market_cap: d.market_cap ?? d.marketcap ?? d.marketCap,
        volume_24h: d.volume_24h ?? d.turnover_24h ?? d.volume24h,
        circulating_supply: d.circulating_supply ?? d.circulatingSupply,
        total_supply: d.total_supply ?? d.totalSupply,
        max_supply: d.max_supply ?? d.maxSupply,
        ath: d.ath ?? d.all_time_high ?? d.allTimeHigh,
        ath_change_pct: d.ath_change_pct ?? d.athChangePct,
        atl: d.atl ?? d.all_time_low ?? d.allTimeLow,
        market_cap_rank: d.marketcap_rank ?? d.rank ?? d.market_cap_rank,
        high_24h: d.high_24h ?? d.high24h,
        low_24h: d.low_24h ?? d.low24h,
        market_dominance: d.market_dominance ?? d.marketDominance
      }
    };
  },
  async get_asset_price_history(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const interval = ['1h', '4h', '1d', '1w'].includes(args.interval) ? args.interval : '1d';
    const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 90);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/klines`, { interval, limit });
    const klines = asArray(response.data).slice(-limit).map((k) => ({
      date: k.date || k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume
    }));

    // Compute analytics from the kline data
    const closes = klines.map((k) => Number(k.close)).filter((v) => !isNaN(v) && v > 0);
    const highs = klines.map((k) => Number(k.high)).filter((v) => !isNaN(v) && v > 0);
    const lows = klines.map((k) => Number(k.low)).filter((v) => !isNaN(v) && v > 0);
    const periodHigh = highs.length ? Math.max(...highs) : null;
    const periodLow = lows.length ? Math.min(...lows) : null;
    const periodOpen = closes.length ? closes[0] : null;
    const periodClose = closes.length ? closes[closes.length - 1] : null;
    const periodChangePercent = (periodOpen && periodClose) ? (((periodClose - periodOpen) / periodOpen) * 100).toFixed(2) : null;
    const volatility = (periodHigh && periodLow && periodLow > 0) ? (((periodHigh - periodLow) / periodLow) * 100).toFixed(2) : null;

    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      interval,
      count: klines.length,
      klines,
      analytics: {
        periodHigh,
        periodLow,
        periodOpen,
        periodClose,
        periodChangePercent: periodChangePercent ? `${periodChangePercent}%` : null,
        volatility: volatility ? `${volatility}%` : null,
        trend: periodChangePercent !== null
          ? (Number(periodChangePercent) > 0 ? 'bullish' : Number(periodChangePercent) < 0 ? 'bearish' : 'flat')
          : null
      }
    };
  },
  async get_sector_spotlight(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
    const sourceEndpoint = '/currencies/sector-spotlight';

    try {
      const response = await sosoGet(sourceEndpoint);
      const { rows, spotlight } = extractSectorSpotlightRows(response, limit);

      if (rows.length) {
        return {
          count: rows.length,
          sourceEndpoint,
          sourceScope: 'SoSoValue sector spotlight.',
          sectors: sortSectorRows(rows),
          spotlight
        };
      }

      return buildSectorFallbackFromMarketIntelligence(
        limit,
        'Direct SoSoValue sector spotlight returned no sector rows.'
      );
    } catch (error) {
      try {
        return await buildSectorFallbackFromMarketIntelligence(
          limit,
          `Direct SoSoValue sector spotlight failed: ${formatToolErrorMessage(error, 'SoSoValue sector spotlight')}`
        );
      } catch (fallbackError) {
        return {
          count: 0,
          sourceEndpoint,
          sectors: [],
          fallbackReason: `Direct SoSoValue sector spotlight failed: ${formatToolErrorMessage(error, 'SoSoValue sector spotlight')}`,
          warnings: [
            `Market-intelligence fallback failed: ${formatToolErrorMessage(fallbackError, 'market intelligence')}`
          ]
        };
      }
    }
  },
  async get_fundraising_overview(args = {}) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet('/fundraising/projects');
    const projects = asArray(response.data).slice(0, limit);
    return {
      count: projects.length,
      projects: projects.map((p) => ({
        name: p.name || p.project_name,
        amount: p.amount || p.raise_amount,
        round: p.round || p.funding_round,
        date: p.date || p.announce_date,
        investors: asArray(p.investors || p.lead_investors).slice(0, 3).map((i) => i.name || i)
      }))
    };
  },
  async get_token_economics(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const [snapshotRes, supplyRes] = await Promise.all([
      sosoGet(`/currencies/${assetRecord.currency_id}/market-snapshot`),
      sosoGet(`/currencies/${assetRecord.currency_id}/supply`).catch(() => ({ data: [] }))
    ]);
    const d = snapshotRes.data || {};
    const supplyHistory = asArray(supplyRes.data).slice(-12);

    const circulating = Number(d.circulating_supply ?? d.circulatingSupply) || null;
    const total = Number(d.total_supply ?? d.totalSupply) || null;
    const max = Number(d.max_supply ?? d.maxSupply) || null;

    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      tokenomics: {
        circulating_supply: circulating,
        total_supply: total,
        max_supply: max,
        supply_ratio: (circulating && max) ? `${((circulating / max) * 100).toFixed(1)}%` : (circulating && total) ? `${((circulating / total) * 100).toFixed(1)}%` : null,
        is_inflationary: max ? circulating < max : null,
        remaining_supply: (max && circulating) ? max - circulating : null
      },
      supplyHistory: supplyHistory.map((s) => ({
        date: s.date || s.time,
        circulating_supply: s.circulating_supply ?? s.circulatingSupply,
        total_supply: s.total_supply ?? s.totalSupply
      }))
    };
  },
  async get_trading_pairs(args = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/pairs`);
    const pairs = asArray(response.data).slice(0, limit);
    return {
      asset: {
        id: assetRecord.currency_id,
        name: assetRecord.name,
        symbol: assetRecord.symbol
      },
      totalPairs: asArray(response.data).length,
      pairs: pairs.map((p) => ({
        exchange: p.exchange || p.exchangeName,
        pair: p.pair || p.symbol || `${p.base}/${p.quote}`,
        price: p.price || p.last,
        volume_24h: p.volume_24h ?? p.volume24h ?? p.turnover,
        spread: p.spread,
        trust_score: p.trust_score ?? p.trustScore
      }))
    };
  },
  async get_index_overview(args = {}) {
    if (args.ticker) {
      const [snapshotRes, constituentsRes] = await Promise.all([
        sosoGet(`/indices/${args.ticker}/market-snapshot`),
        sosoGet(`/indices/${args.ticker}/constituents`)
      ]);
      return {
        ticker: args.ticker,
        snapshot: sanitizeForGemini(snapshotRes.data),
        constituents: asArray(constituentsRes.data).slice(0, 10).map((c) => ({
          name: c.name || c.currency,
          symbol: c.symbol,
          weight: c.weight || c.percentage,
          change_pct_24h: c.change_pct_24h ?? c.changePct24h
        }))
      };
    }
    const response = await sosoGet('/indices');
    const indices = asArray(response.data);
    return {
      count: indices.length,
      indices: indices.slice(0, 15).map((idx) => ({
        ticker: idx.ticker,
        name: idx.name,
        description: idx.description
      }))
    };
  },
  // PARKED: get_analysis_charts — no routing rule, no eval coverage, no UI use case.
  // Uncomment after collecting observability data that shows demand.
  // async get_analysis_charts(args = {}) {
  //   if (args.chartName) {
  //     const response = await sosoGet(`/analyses/${args.chartName}`);
  //     return {
  //       chartName: args.chartName,
  //       data: sanitizeForGemini(response.data)
  //     };
  //   }
  //   const response = await sosoGet('/analyses');
  //   const charts = asArray(response.data);
  //   return {
  //     count: charts.length,
  //     charts: charts.slice(0, 20).map((c) => ({
  //       name: c.chart_name || c.chartName || c.name,
  //       title: c.title || c.display_name || c.displayName,
  //       category: c.category,
  //       description: c.description
  //     }))
  //   };
  // },
  async get_macro_event_history(args = {}) {
    const event = String(args.event || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 24);
    const response = await sosoGet(`/macro/events/${event}/history`);
    const history = asArray(response.data).slice(-limit);
    return {
      event,
      count: history.length,
      history: history.map((h) => ({
        date: h.date || h.time,
        actual: h.actual,
        forecast: h.forecast,
        previous: h.previous,
        impact: h.impact
      }))
    };
  },
};

module.exports = { customToolExecutors };
