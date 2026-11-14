import {
  formatEtfCountryCode,
  normalizeEtfAssetSymbol,
  resolveCurrencyId,
  resolveCurrencyMatches,
  sosoGet
} from '../../clients/soso.ts';
import {
  DEFAULT_WATCHLIST_TICKERS,
  asArray,
  normalizeLookupValue,
  sanitizeForGemini
} from '../../normalizers/toolResult.ts';
import { formatToolErrorMessage } from './shared.ts';
import { mapNewsItems } from './helpers.ts';
import {
  buildMarketIntelligence,
  buildTokenIntelligence,
  normalizeChangeToPercent
} from '../../services/marketIntelligence.ts';
import { normalizeEtfHistory, buildEtfFlowAnalytics } from './etfHelpers.ts';
import {
  CHART_ALIASES,
  MACRO_EVENT_ALIASES,
  fractionToPercent,
  getPagedList,
  msToIsoDate,
  parseMacroValue,
  summarizeFomcMeeting
} from './sosoValue.ts';
import type { ToolArgs } from '../../types/tools.ts';

const getPayloadData = (payload) => (
  payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
);

// Snapshot changes and returns are decimal fractions (-0.05 = -5%); tools hand
// the model and analyzers percentages. At most 12 fields, most useful first:
// the Gemini preview (sanitizeForGemini) keeps only the first 12 keys.
const toSnapshotPercents = (d: Record<string, any> = {}) => ({
  price: toNumberOrNull(d.price),
  change_pct_24h: round(fractionToPercent(d.change_pct_24h)),
  market_cap: toNumberOrNull(d.marketcap ?? d.market_cap),
  volume_24h: toNumberOrNull(d.turnover_24h ?? d.volume_24h),
  market_cap_rank: toNumberOrNull(d.marketcap_rank),
  high_24h: toNumberOrNull(d.high_24h),
  low_24h: toNumberOrNull(d.low_24h),
  ath: toNumberOrNull(d.ath),
  ath_change_pct: d.down_from_ath === '' || d.down_from_ath == null ? null : round(-Math.abs(fractionToPercent(d.down_from_ath))),
  fdv: toNumberOrNull(d.fdv),
  circulating_supply: toNumberOrNull(d.circulating_supply),
  max_supply: toNumberOrNull(d.max_supply)
});

const assetRef = (record) => ({ id: record.currency_id, name: record.name, symbol: record.symbol });

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

const normalizeSectorSpotlightRow = (item: Record<string, any> = {}, kind = 'sector') => {
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
  async get_token_intelligence(args: ToolArgs = {}) {
    return buildTokenIntelligence(args.asset || 'bitcoin');
  },
  async compare_assets(args: ToolArgs = {}) {
    const [assetARecord, assetBRecord] = await Promise.all([
      resolveCurrencyId(args.assetA),
      resolveCurrencyId(args.assetB)
    ]);

    const [assetAResponse, assetBResponse] = await Promise.all([
      sosoGet(`/currencies/${assetARecord.currency_id}/market-snapshot`),
      sosoGet(`/currencies/${assetBRecord.currency_id}/market-snapshot`)
    ]);

    return {
      assetA: { ...assetRef(assetARecord), snapshot: toSnapshotPercents(assetAResponse.data) },
      assetB: { ...assetRef(assetBRecord), snapshot: toSnapshotPercents(assetBResponse.data) }
    };
  },
  async get_asset_news_brief(args: ToolArgs = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news', {
      currency_id: assetRecord.currency_id,
      page: 1,
      page_size: limit,
      language: 'en'
    });
    const { list, total } = getPagedList(response);

    return {
      asset: assetRef(assetRecord),
      total,
      items: mapNewsItems(list, limit)
    };
  },
  async get_hot_news_digest(args: ToolArgs = {}) {
    const limit = Math.min(Number(args.limit) || 5, 10);
    const response = await sosoGet('/news/hot', { page: 1, page_size: limit, language: 'en' });
    const { list, total } = getPagedList(response);
    return {
      total,
      items: mapNewsItems(list, limit)
    };
  },
  async search_crypto_news(args: ToolArgs = {}) {
    const keyword = String(args.keyword || args.query || '').trim();
    if (!keyword) throw new Error('A news search keyword is required.');
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
    const response = await sosoGet('/news/search', { keyword, page: 1, page_size: limit, language: 'en' });
    const { list, total } = getPagedList(response);
    return {
      keyword,
      total,
      items: mapNewsItems(list, limit)
    };
  },
  async get_etf_flow_brief(args: ToolArgs = {}) {
    const assetSymbol = normalizeEtfAssetSymbol(args.assetSymbol);
    const countryCode = formatEtfCountryCode(args.countryCode);
    const days = Math.min(Math.max(Number(args.days) || 5, 1), 30);

    // summary-history takes limit (newest rows); one extra row gives the oldest
    // day a baseline when only cumulative inflow is present.
    const [listResponse, historyResponse] = await Promise.all([
      sosoGet('/etfs', { symbol: assetSymbol, country_code: countryCode }),
      sosoGet('/etfs/summary-history', { symbol: assetSymbol, country_code: countryCode, limit: days + 1 })
    ]);

    const etfs = asArray(listResponse.data);
    const history = normalizeEtfHistory(asArray(historyResponse.data), days);
    const latest: Record<string, any> = history[history.length - 1] || {};
    const topTickers = etfs.slice(0, 3).map((item) => item.ticker).filter(Boolean);
    const snapshotResponses = await Promise.all(topTickers.map((ticker) =>
      sosoGet(`/etfs/${ticker}/market-snapshot`).catch(() => null)
    ));

    return {
      assetSymbol,
      countryCode,
      sourceEndpoint: 'openapi/v1/etfs',
      etfCount: etfs.length,
      tickers: etfs.slice(0, 10).map((item) => item.ticker),
      aggregate: {
        date: latest.date,
        dailyNetInflow: latest.total_net_flow ?? null,
        cumNetInflow: latest.cum_net_inflow ?? null,
        totalNetAssets: latest.total_net_assets ?? null,
        dailyTotalValueTraded: latest.total_value_traded ?? null
      },
      history,
      topEtfs: snapshotResponses.filter(Boolean).map((item) => {
        const d = item.data || {};
        return {
          ticker: d.ticker,
          date: d.date,
          daily_net_inflow: toNumberOrNull(d.net_inflow),
          cumulative_net_inflow: toNumberOrNull(d.cum_inflow),
          net_assets: toNumberOrNull(d.net_assets),
          market_price: toNumberOrNull(d.mkt_price),
          premium_discount_pct: round(fractionToPercent(d.prem_dsc), 3),
          value_traded: toNumberOrNull(d.value_traded),
          sponsor_fee_pct: round(fractionToPercent(d.sponsor_fee), 3)
        };
      }),
      flowAnalytics: buildEtfFlowAnalytics(history)
    };
  },
  async get_macro_crypto_calendar(args: ToolArgs = {}) {
    const daysAhead = Math.min(Math.max(Number(args.daysAhead) || 7, 1), 21);
    const response = await sosoGet('/macro/events');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + daysAhead);

    const events = asArray(response.data)
      .filter((item) => {
        const date = new Date(item.date);
        return date >= today && date <= end;
      })
      // Event names can carry trailing spaces upstream.
      .map((item) => ({ date: item.date, events: asArray(item.events).map((name) => String(name).trim()) }));

    return {
      from: today.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      events
    };
  },
  async get_crypto_equities_watchlist(args: ToolArgs = {}) {
    const requestedTickers = asArray(args.tickers).map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    const tickers = (requestedTickers.length ? requestedTickers : DEFAULT_WATCHLIST_TICKERS).slice(0, 8);
    const [listResponse, ...snapshotResponses] = await Promise.all([
      sosoGet('/crypto-stocks'),
      ...tickers.map((ticker) => sosoGet(`/crypto-stocks/${ticker}/market-snapshot`))
    ]);

    const catalog = asArray(listResponse.data);
    const stocks = tickers.map((ticker, index) => {
      const meta = catalog.find((item) => item.ticker === ticker) || {};
      const d = snapshotResponses[index]?.data || {};
      return {
        ticker,
        name: meta.name,
        exchange: meta.exchange,
        sector: meta.sector,
        snapshot: {
          price: toNumberOrNull(d.mkt_price),
          market_status: d.mkt_status,
          volume: toNumberOrNull(d.volume),
          turnover: toNumberOrNull(d.turnover),
          market_cap: toNumberOrNull(d.total_marketcap),
          circulating_market_cap: toNumberOrNull(d.circulating_marketcap),
          pe_ttm: round(d.pe_ttm),
          pb: round(d.pb),
          as_of: msToIsoDate(d.timestamp)
        }
      };
    });

    return { stocks };
  },
  async get_btc_treasury_brief(args: ToolArgs = {}) {
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
  async get_btc_purchase_history_brief(args: ToolArgs = {}) {
    const ticker = String(args.ticker || '').trim().toUpperCase();
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    const response = await sosoGet(`/btc-treasuries/${ticker}/purchase-history`, { limit });
    // Rows are newest first.
    return {
      companyTicker: ticker,
      purchases: asArray(response.data).slice(0, limit).map((item) => ({
        date: item.date,
        btc_acquired: toNumberOrNull(item.btc_acq),
        btc_holding_after: toNumberOrNull(item.btc_holding),
        acquisition_cost_usd: toNumberOrNull(item.acq_cost),
        avg_cost_per_btc_usd: toNumberOrNull(item.btc_acq) ? round(Number(item.acq_cost) / Number(item.btc_acq), 0) : null
      }))
    };
  },
  async get_asset_snapshot(args: ToolArgs = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/market-snapshot`);
    return {
      asset: assetRef(assetRecord),
      snapshot: toSnapshotPercents(response.data)
    };
  },
  async get_asset_price_history(args: ToolArgs = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    // Only daily candles exist upstream, covering the most recent ~3 months.
    const interval = '1d';
    const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 90);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/klines`, { interval, limit });
    const klines = asArray(response.data)
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-limit)
      .map((k) => ({
        date: msToIsoDate(k.timestamp),
        open: toNumberOrNull(k.open),
        high: toNumberOrNull(k.high),
        low: toNumberOrNull(k.low),
        close: toNumberOrNull(k.close),
        volume: toNumberOrNull(k.volume)
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
      asset: assetRef(assetRecord),
      interval,
      ...(args.interval && args.interval !== '1d' ? { note: `Only daily candles are available; returned 1d instead of ${args.interval}.` } : {}),
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
  async get_sector_spotlight(args: ToolArgs = {}) {
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
  async get_fundraising_overview(args: ToolArgs = {}) {
    const query = String(args.project || args.asset || '').trim();

    // Without a project there is no "recent rounds" feed upstream (the project
    // list is ~15k names, unordered), so fall back to fundraising headlines.
    if (!query) {
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 10);
      const response = await sosoGet('/news/search', { keyword: 'crypto VC funding', page: 1, page_size: limit, language: 'en' });
      const { list } = getPagedList(response);
      return {
        scope: 'recent fundraising headlines',
        note: 'SoSoValue has no feed of recent rounds; these are fundraising headlines. Pass a project name for its rounds, investors and valuation, or use web search for raises announced this week.',
        items: mapNewsItems(list, limit)
      };
    }

    // Listed tokens resolve through the currency catalog; other projects by name.
    let detail = null;
    let projectName = query;
    const [currencyMatch] = await resolveCurrencyMatches(query);
    if (currencyMatch && normalizeLookupValue(currencyMatch.symbol) === normalizeLookupValue(query)
      || currencyMatch && normalizeLookupValue(currencyMatch.name) === normalizeLookupValue(query)) {
      projectName = currencyMatch.name;
      detail = (await sosoGet(`/currencies/${currencyMatch.currency_id}/fundraising`)).data;
    }
    if (!detail || !asArray(detail.fundraising_rounds).length) {
      const projects = asArray((await sosoGet('/fundraising/projects')).data);
      const wanted = normalizeLookupValue(query);
      const project = projects.find((p) => normalizeLookupValue(p.project_name) === wanted)
        || projects.find((p) => normalizeLookupValue(p.project_name).startsWith(wanted));
      if (project) {
        projectName = project.project_name;
        detail = (await sosoGet(`/fundraising/projects/${project.project_id}`)).data;
      }
    }
    if (!detail) {
      throw new Error(`No SoSoValue fundraising record found for "${query}".`);
    }

    const rounds = asArray(detail.fundraising_rounds)
      .map((r) => ({
        round: r.round,
        amount: r.amount_display || r.amount,
        valuation: r.valuation ?? null,
        date: msToIsoDate(r.timestamp ?? r.date),
        investors: asArray(r.investors).slice(0, 6).map((i) => (i.is_lead_investor ? `${i.name} (lead)` : i.name))
      }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    return {
      project: projectName,
      projectId: detail.project_id,
      twitter: detail.twitter_username,
      roundCount: rounds.length,
      rounds: rounds.slice(0, 10),
      investors: asArray(detail.investors).slice(0, 10).map((i) => i.name),
      investmentStats: detail.investment_stats,
      team: asArray(detail.team).slice(0, 5).map((m) => `${m.name}${m.position ? ` (${m.position})` : ''}`)
    };
  },
  async get_token_economics(args: ToolArgs = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const id = assetRecord.currency_id;
    const [snapshotRes, supplyRes, economicsRes] = await Promise.all([
      sosoGet(`/currencies/${id}/market-snapshot`),
      sosoGet(`/currencies/${id}/supply`, { page: 1, page_size: 12 }).catch(() => null),
      sosoGet(`/currencies/${id}/token-economics`).catch(() => null)
    ]);
    const d = snapshotRes.data || {};
    const supplyHistory = getPagedList(supplyRes).list;
    const economics = economicsRes?.data || {};

    const circulating = toNumberOrNull(d.circulating_supply);
    const total = toNumberOrNull(d.total_supply);
    const max = toNumberOrNull(d.max_supply) || null;
    const now = Date.now();
    const upcomingUnlocks = asArray(economics.unlock_timeline)
      .filter((u) => Number(u.timestamp) >= now)
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(0, 5)
      .map((u) => ({
        date: msToIsoDate(u.timestamp),
        totalAmount: round(asArray(u.vestings).reduce((sum, v) => sum + (Number(v.amount) || 0), 0), 0),
        vestings: asArray(u.vestings).map((v) => ({ label: v.label, amount: round(v.amount, 0) }))
      }));

    return {
      asset: assetRef(assetRecord),
      tokenomics: {
        circulating_supply: circulating,
        total_supply: total,
        max_supply: max,
        supply_ratio: (circulating && max) ? `${((circulating / max) * 100).toFixed(1)}%` : (circulating && total) ? `${((circulating / total) * 100).toFixed(1)}%` : null,
        // Unknown circulating supply must stay unknown (null < max would read as true).
        is_inflationary: max && circulating ? circulating < max : null,
        remaining_supply: (max && circulating) ? max - circulating : null,
        fdv: toNumberOrNull(d.fdv),
        market_cap: toNumberOrNull(d.marketcap)
      },
      allocation: asArray(economics.token_allocation).map((a) => ({ holder: a.holder, percentage: toNumberOrNull(a.percentage) })),
      unlockStatus: economics.token_unlock
        ? { unlocked: toNumberOrNull(economics.token_unlock.unlocked), totalLocked: toNumberOrNull(economics.token_unlock.total_locked) }
        : null,
      upcomingUnlocks,
      // Supply rows are newest first.
      supplyHistory: supplyHistory.map((row) => ({
        date: row.date,
        circulating_supply: toNumberOrNull(row.circulating_supply),
        total_supply: toNumberOrNull(row.total_supply)
      }))
    };
  },
  async get_trading_pairs(args: ToolArgs = {}) {
    const assetRecord = await resolveCurrencyId(args.asset);
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const response = await sosoGet(`/currencies/${assetRecord.currency_id}/pairs`, { page: 1, page_size: limit });
    const { list, total } = getPagedList(response);
    return {
      asset: assetRef(assetRecord),
      totalPairs: total,
      pairs: list.slice(0, limit).map((p) => ({
        exchange: p.market,
        pair: `${p.base}/${p.target}`,
        price: toNumberOrNull(p.price),
        volume_24h: toNumberOrNull(p.turnover_24h),
        // Order-book depth: USD needed to move the price up or down (+/-2%).
        cost_to_move_up_usd: toNumberOrNull(p.cost_to_move_up_usd),
        cost_to_move_down_usd: toNumberOrNull(p.cost_to_move_down_usd)
      }))
    };
  },
  async get_index_overview(args: ToolArgs = {}) {
    if (args.ticker) {
      const ticker = String(args.ticker).trim();
      const [snapshotRes, constituentsRes] = await Promise.all([
        sosoGet(`/indices/${ticker}/market-snapshot`),
        sosoGet(`/indices/${ticker}/constituents`)
      ]);
      const snap = snapshotRes.data || {};
      return {
        ticker,
        snapshot: {
          price: toNumberOrNull(snap.price),
          change_pct_24h: round(fractionToPercent(snap.change_pct_24h)),
          change_pct_7d: round(fractionToPercent(snap.roi_7d)),
          change_pct_30d: round(fractionToPercent(snap.roi_1m)),
          change_pct_90d: round(fractionToPercent(snap.roi_3m)),
          change_pct_1y: round(fractionToPercent(snap.roi_1y)),
          change_pct_ytd: round(fractionToPercent(snap.ytd))
        },
        constituents: asArray(constituentsRes.data).slice(0, 15).map((c) => ({
          symbol: String(c.symbol || '').toUpperCase(),
          currencyId: c.currency_id,
          weight_pct: round(fractionToPercent(c.weight))
        }))
      };
    }
    // The index list is an array of ticker strings.
    const response = await sosoGet('/indices');
    const indices = asArray(response.data).map((item) => (typeof item === 'string' ? item : item?.ticker)).filter(Boolean);
    return {
      count: indices.length,
      indices: indices.map((ticker) => ({ ticker, name: `SoSoValue ${String(ticker).replace(/^ssi/i, '')} Index` })),
      note: 'Pass a ticker (e.g. ssimag7, ssiDeFi) for performance and constituents.'
    };
  },
  async get_analysis_chart(args: ToolArgs = {}) {
    const requested = String(args.chart || args.chartName || '').trim();
    const limit = Math.min(Math.max(Number(args.limit) || 14, 1), 90);
    const catalog = asArray((await sosoGet('/analyses')).data);
    const names = catalog.map((c) => c.chart_name);
    const lowered = requested.toLowerCase();
    const chartName = names.includes(requested)
      ? requested
      : CHART_ALIASES[lowered] || names.find((n) => n.includes(lowered.replace(/[\s-]+/g, '_')));

    if (!chartName) {
      return {
        error: `Unknown chart "${requested}".`,
        availableCharts: names
      };
    }

    // Rows are newest first; a series key is omitted when its value is null.
    const response = await sosoGet(`/analyses/${chartName}`, { limit });
    const fields = asArray(catalog.find((c) => c.chart_name === chartName)?.fields).map((f) => f.name);
    const rows = asArray(response.data).map((row) => {
      const out: Record<string, any> = { date: msToIsoDate(row.timestamp) };
      for (const key of fields) out[key] = row[key] ?? null;
      return out;
    });
    const latest = rows[0] || {};
    const oldest = rows[rows.length - 1] || {};
    const changes = Object.fromEntries(fields
      .filter((key) => typeof latest[key] === 'number' && typeof oldest[key] === 'number')
      .map((key) => [key, { latest: latest[key], earliest: oldest[key], change: round(latest[key] - oldest[key], 4) }]));

    return {
      chart: chartName,
      series: fields,
      count: rows.length,
      latest,
      changeOverPeriod: changes,
      rows
    };
  },
  async get_macro_event_history(args: ToolArgs = {}) {
    const requested = String(args.event || '').trim();
    const event = MACRO_EVENT_ALIASES[requested.toLowerCase()] || requested;
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 24);
    const response = await sosoGet(`/macro/events/${encodeURIComponent(event)}/history`, { limit });
    // Rows are newest first; an unknown event name returns [].
    const history = asArray(response.data).slice(0, limit);
    return {
      event,
      count: history.length,
      ...(history.length ? {} : { note: `No history for "${event}". Use names as listed by the macro calendar, e.g. "CPI (YoY)", "Nonfarm Payrolls", "Core PCE Price Index (YoY)".` }),
      history: history.map((h) => ({
        date: h.date,
        actual: h.actual === '' ? null : h.actual,
        forecast: h.forecast === '' ? null : h.forecast,
        previous: h.previous === '' ? null : h.previous,
        released: h.actual !== '' && h.actual != null,
        surprise: parseMacroValue(h.actual) !== null && parseMacroValue(h.forecast) !== null
          ? round(parseMacroValue(h.actual) - parseMacroValue(h.forecast), 3)
          : null
      }))
    };
  },
  async get_crypto_market_overview() {
    const response = await sosoGet('/market/overview');
    const d = response.data || {};
    return {
      totalMarketCapUsd: toNumberOrNull(d.total_market_cap),
      // This endpoint already reports a percentage (-5.3 = -5.3%).
      totalMarketCapChangePct24h: round(d.total_market_cap_change_pct),
      totalVolume24hUsd: toNumberOrNull(d.total_volume_24h),
      ethGasGwei: round(d.eth_gas_gwei, 3),
      btcFeeSatPerVb: round(d.btc_gas_sat_vb, 2),
      asOf: d.as_of ? new Date(Number(d.as_of)).toISOString() : null
    };
  },
  async get_fed_rate_outlook() {
    const [fomcRes, ratesRes] = await Promise.all([
      sosoGet('/macro/fomc-probabilities'),
      sosoGet('/macro/rates').catch(() => null)
    ]);
    const fomc = fomcRes.data || {};
    const rateRanges = asArray(fomc.rate_ranges);
    return {
      upcomingMeetings: asArray(fomc.meetings).slice(0, 4).map((meeting) => summarizeFomcMeeting(rateRanges, meeting)),
      moneyMarketRates: asArray(ratesRes?.data).map((r) => ({
        code: r.code,
        name: r.name,
        latestValue: parseMacroValue(r.latest_value),
        unit: r.unit,
        latestDate: r.latest_date
      })),
      asOf: fomc.as_of ? new Date(Number(fomc.as_of)).toISOString() : null
    };
  },
};

export { customToolExecutors };

