const { analyzeToolResult } = require('../analysis/deterministic');
const { combineToolAnalyses } = require('../analysis/synthesis');
const { sleep, asArray } = require('../utils/common');

const truncate = (value, maxLength = 4000) => {
  const str = String(value ?? '');
  return str.length > maxLength ? `${str.substring(0, maxLength)}... (truncated)` : str;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalizeLookupValue = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const DEFAULT_WATCHLIST_TICKERS = ['MSTR', 'COIN', 'MARA', 'RIOT', 'CLSK'];

/**
 * Past this depth, non-scalar values become "[object]" or "[n items]" to cap payload size.
 * Must stay ≥5: many tools nest facts one level deeper than the root (e.g. rows in `pairs`,
 * `klines`, `stocks[].snapshot`, `assetA.snapshot`). A threshold of 2 collapsed those entirely.
 */
const SANITIZE_FOR_GEMINI_MAX_DEPTH = 5;

const sanitizeForGemini = (value, depth = 0) => {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= SANITIZE_FOR_GEMINI_MAX_DEPTH) {
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }

    return '[object]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => sanitizeForGemini(item, depth + 1));
  }

  const entries = Object.entries(value).slice(0, 12);
  return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeForGemini(item, depth + 1)]));
};

const pickScalarFields = (value, limit = 8) => {
  if (!isPlainObject(value)) {
    return {};
  }

  const pickedEntries = Object.entries(value)
    .filter(([, item]) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
    .slice(0, limit);

  return Object.fromEntries(pickedEntries);
};

const buildArrayItemLabel = (item) => {
  if (!isPlainObject(item)) {
    return String(item);
  }

  return item.title || item.name || item.ticker || item.symbol || item.question || item.currency || item.slug || 'item';
};

const buildWalletDataPreview = (data) => ({
  address: data?.address,
  totalValueUsd: data?.totalValueUsd,
  source: data?.source,
  tokens: asArray(data?.tokens).slice(0, 15).map((token) => ({
    symbol: token.symbol,
    name: token.name,
    balance: token.balance,
    usdPrice: token.usdPrice,
    usdValue: token.usdValue,
    priceSource: token.priceSource,
    chain: token.chain,
    chainId: token.chainId,
    native: Boolean(token.native),
    contract: token.contract
  })),
  chainsScanned: asArray(data?.chainsScanned),
  chainIdsScanned: asArray(data?.chainIdsScanned),
  chainsAttempted: asArray(data?.chainsAttempted),
  chainCoverage: data?.chainCoverage,
  chainSummaries: asArray(data?.chainSummaries).map((chain) => ({
    chainId: chain.chainId,
    chain: chain.chain,
    nativeSymbol: chain.nativeSymbol,
    status: chain.status,
    nativeBalance: chain.nativeBalance,
    tokenContractsChecked: chain.tokenContractsChecked,
    valuedTokenCount: chain.valuedTokenCount,
    totalValueUsd: chain.totalValueUsd,
    errors: asArray(chain.errors).slice(0, 3)
  })),
  caveats: asArray(data?.caveats)
});

/** Keeps compare_assets snapshots readable for the model (sanitizeForGemini collapses depth-2 objects to "[object]"). */
const buildCompareAssetsPreview = (data) => {
  const row = (record) => {
    if (!record || !isPlainObject(record)) return null;
    return {
      name: record.name,
      symbol: record.symbol,
      id: record.id,
      ...pickScalarFields(record.snapshot, 20)
    };
  };

  return {
    assetA: row(data?.assetA),
    assetB: row(data?.assetB)
  };
};

const formatEvidenceValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) >= 1000 ? value.toLocaleString('en-US') : String(value);
  }
  return String(value);
};

const pushFact = (facts, label, value, suffix = '') => {
  const formatted = formatEvidenceValue(value);
  if (formatted === null) return;
  facts.push(`${label}: ${formatted}${suffix}`);
};

const pushMetrics = (facts, metrics = {}, limit = 5) => {
  Object.entries(metrics || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, limit)
    .forEach(([key, value]) => pushFact(facts, `metric.${key}`, value));
};

const buildEvidenceFacts = (toolName, args, data, analysis) => {
  const facts = [];

  switch (toolName) {
    case 'get_market_intelligence': {
      const regime = data?.regime || {};
      const rotation = data?.rotation || {};
      pushFact(facts, 'market regime', regime.label);
      pushFact(facts, 'regime confidence', regime.confidence);
      pushFact(facts, 'market breadth', regime.breadthPct, '%');
      pushFact(facts, 'broad 24h average', regime.broadAveragePct, '%');
      asArray(regime.drivers).slice(0, 3).forEach((driver, index) => facts.push(`driver ${index + 1}: ${driver}`));
      asArray(rotation.leaders).slice(0, 3).forEach((leader, index) => {
        facts.push(`rotation leader ${index + 1}: ${leader.name || leader.ticker} 24h=${leader.changePct24h ?? 'N/A'}%`);
      });
      asArray(rotation.laggards).slice(0, 3).forEach((laggard, index) => {
        facts.push(`rotation laggard ${index + 1}: ${laggard.name || laggard.ticker} 24h=${laggard.changePct24h ?? 'N/A'}%`);
      });
      asArray(data?.alerts?.triggered).slice(0, 3).forEach((alert, index) => facts.push(`active alert ${index + 1}: ${alert.title}`));
      asArray(data?.opportunities).slice(0, 3).forEach((opportunity, index) => facts.push(`opportunity ${index + 1}: ${opportunity.title} score=${opportunity.score}`));
      asArray(data?.topMovers?.gainers).forEach((gainer, index) => facts.push(`top gainer ${index + 1} (tracked): ${gainer.symbol} ${gainer.changePct24h}% price=${gainer.price}`));
      asArray(data?.topMovers?.losers).forEach((loser, index) => facts.push(`top loser ${index + 1} (tracked): ${loser.symbol} ${loser.changePct24h}% price=${loser.price}`));
      if (data?.topMovers?.scope) facts.push(`movers scope: ${data.topMovers.scope}`);
      break;
    }
    case 'get_token_intelligence': {
      const asset = data?.asset || {};
      const snapshot = data?.snapshot || {};
      const relative = data?.relative || {};
      facts.push(`asset: ${asset.name || args?.asset || 'unknown'}${asset.symbol ? ` (${asset.symbol})` : ''}`);
      pushFact(facts, 'price', snapshot.price);
      pushFact(facts, '24h change', snapshot.changePct24h, '%');
      pushFact(facts, 'relative to BTC', relative.toBtcPct, '%');
      pushFact(facts, 'relative to ETH', relative.toEthPct, '%');
      pushFact(facts, 'relative to sector', relative.toSectorPct, '%');
      pushFact(facts, '30-session trend', data?.trend?.trend);
      pushFact(facts, '30-session change', data?.trend?.periodChangePct, '%');
      pushFact(facts, 'SoDEX perps spread', data?.sodex?.perps?.spreadPct, '%');
      asArray(data?.whyMoving).slice(0, 4).forEach((reason, index) => facts.push(`why moving ${index + 1}: ${reason}`));
      asArray(data?.news).slice(0, 3).forEach((item, index) => facts.push(`headline ${index + 1}: ${item.title || 'untitled'}`));
      break;
    }
    case 'get_asset_snapshot': {
      const asset = data?.asset || {};
      const snapshot = data?.snapshot || {};
      facts.push(`asset: ${asset.name || args?.asset || 'unknown'}${asset.symbol ? ` (${asset.symbol})` : ''}`);
      pushFact(facts, 'price', snapshot.price);
      pushFact(facts, '24h change', snapshot.change_pct_24h, '%');
      pushFact(facts, '7d change', snapshot.change_pct_7d, '%');
      pushFact(facts, '30d change', snapshot.change_pct_30d, '%');
      pushFact(facts, 'market cap', snapshot.market_cap);
      pushFact(facts, '24h volume', snapshot.volume_24h);
      pushFact(facts, 'market cap rank', snapshot.market_cap_rank);
      break;
    }
    case 'get_asset_price_history': {
      const analytics = data?.analytics || {};
      facts.push(`asset: ${data?.asset?.name || args?.asset || 'unknown'}${data?.asset?.symbol ? ` (${data.asset.symbol})` : ''}`);
      pushFact(facts, 'candles returned', data?.count);
      pushFact(facts, 'interval', data?.interval);
      pushFact(facts, 'period open', analytics.periodOpen);
      pushFact(facts, 'period close', analytics.periodClose);
      pushFact(facts, 'period change', analytics.periodChangePercent);
      pushFact(facts, 'period high', analytics.periodHigh);
      pushFact(facts, 'period low', analytics.periodLow);
      pushFact(facts, 'volatility', analytics.volatility);
      pushFact(facts, 'trend', analytics.trend);
      break;
    }
    case 'compare_assets': {
      const row = (label, record) => {
        if (!record) return;
        const snapshot = record.snapshot || {};
        facts.push(`${label}: ${record.name || record.symbol || 'asset'}${record.symbol ? ` (${record.symbol})` : ''}`);
        pushFact(facts, `${label} price`, snapshot.price);
        pushFact(facts, `${label} 24h change`, snapshot.change_pct_24h ?? snapshot.changePct24h, '%');
        pushFact(facts, `${label} market cap`, snapshot.market_cap ?? snapshot.marketCap);
        pushFact(facts, `${label} 24h volume`, snapshot.volume_24h ?? snapshot.volume24h);
      };
      row('asset A', data?.assetA);
      row('asset B', data?.assetB);
      break;
    }
    case 'get_etf_flow_brief': {
      facts.push(`ETF asset: ${data?.assetSymbol || args?.assetSymbol || 'unknown'}`);
      pushFact(facts, 'ETF count', data?.etfCount);
      pushFact(facts, 'history points', asArray(data?.history).length);
      pushFact(facts, 'daily net inflow', data?.aggregate?.dailyNetInflow);
      pushFact(facts, 'cumulative net inflow', data?.aggregate?.cumNetInflow);
      pushFact(facts, 'total net assets', data?.aggregate?.totalNetAssets);
      pushFact(facts, 'daily value traded', data?.aggregate?.dailyTotalValueTraded);
      pushMetrics(facts, data?.flowAnalytics, 6);
      break;
    }
    case 'get_wallet_holdings': {
      const tokens = asArray(data?.tokens);
      const coverage = data?.chainCoverage || {};
      pushFact(facts, 'wallet total value USD', data?.totalValueUsd);
      pushFact(facts, 'holdings returned', tokens.length);
      pushFact(facts, 'chains attempted', coverage.attempted);
      pushFact(facts, 'chains with partial/successful coverage', coverage.successful);
      pushFact(facts, 'failed chains', coverage.failed);
      tokens.slice(0, 5).forEach((token, index) => {
        facts.push(`top holding ${index + 1}: ${token.balance} ${token.symbol || 'UNKNOWN'} on ${token.chain || 'unknown chain'}${Number(token.usdValue) > 0 ? ` valued at $${Number(token.usdValue).toFixed(2)}` : ' unpriced'}`);
      });
      asArray(data?.chainSummaries).slice(0, 5).forEach((chain) => {
        facts.push(`chain coverage: ${chain.chain} status=${chain.status}, native=${chain.nativeBalance} ${chain.nativeSymbol}, tokenContractsChecked=${chain.tokenContractsChecked}, valueUsd=${chain.totalValueUsd}`);
      });
      break;
    }
    case 'get_asset_news_brief':
    case 'get_hot_news_digest': {
      const items = asArray(data?.items);
      pushFact(facts, 'news items returned', items.length);
      items.slice(0, 5).forEach((item, index) => {
        facts.push(`headline ${index + 1}: ${item.title || item.name || 'untitled'}`);
      });
      break;
    }
    case 'get_sector_spotlight': {
      const sectors = asArray(data?.sectors);
      pushFact(facts, 'sector source scope', data?.sourceScope);
      pushFact(facts, 'sector fallback reason', data?.fallbackReason);
      pushFact(facts, 'sectors returned', sectors.length);
      sectors.slice(0, 5).forEach((sector, index) => {
        facts.push(`sector ${index + 1}: ${sector.name || sector.sector || 'unknown'}${sector.ticker ? ` (${sector.ticker})` : ''} kind=${sector.kind || 'sector'} 24h=${sector.change_pct_24h ?? sector.changePct24h ?? 'N/A'}, marketCap=${sector.market_cap ?? sector.marketCap ?? 'N/A'}, volume24h=${sector.volume_24h ?? sector.volume24h ?? 'N/A'}`);
      });
      break;
    }
    case 'get_token_economics': {
      const tokenomics = data?.tokenomics || {};
      facts.push(`asset: ${data?.asset?.name || args?.asset || 'unknown'}${data?.asset?.symbol ? ` (${data.asset.symbol})` : ''}`);
      pushFact(facts, 'circulating supply', tokenomics.circulating_supply);
      pushFact(facts, 'total supply', tokenomics.total_supply);
      pushFact(facts, 'max supply', tokenomics.max_supply);
      pushFact(facts, 'supply ratio', tokenomics.supply_ratio);
      pushFact(facts, 'remaining supply', tokenomics.remaining_supply);
      pushFact(facts, 'inflationary', tokenomics.is_inflationary);
      break;
    }
    case 'get_trading_pairs': {
      const pairs = asArray(data?.pairs);
      facts.push(`asset: ${data?.asset?.name || args?.asset || 'unknown'}${data?.asset?.symbol ? ` (${data.asset.symbol})` : ''}`);
      pushFact(facts, 'total pairs', data?.totalPairs);
      pairs.slice(0, 5).forEach((pair, index) => {
        facts.push(`pair ${index + 1}: ${pair.exchange || 'unknown exchange'} ${pair.pair || 'unknown pair'} volume24h=${pair.volume_24h ?? 'N/A'} spread=${pair.spread ?? 'N/A'}`);
      });
      break;
    }
    case 'get_sodex_analytics': {
      const summary = data?.data?.summary || data?.summary || {};
      pushFact(facts, 'SoDEX total pairs', summary.totalPairs);
      pushFact(facts, 'SoDEX total volume USD', summary.totalVolumeUsd);
      pushFact(facts, 'SoDEX perp volume USD', summary.totalPerpVolumeUsd);
      pushFact(facts, 'SoDEX spot volume USD', summary.totalSpotVolumeUsd);
      const gainers = asArray(data?.data?.topGainers || data?.topGainers);
      gainers.slice(0, 5).forEach((g, index) => {
        facts.push(`SoDEX top gainer ${index + 1}: ${g.symbol} ${g.changePct24h}% price=${g.lastPrice}`);
      });
      const losers = asArray(data?.data?.topLosers || data?.topLosers);
      losers.slice(0, 5).forEach((l, index) => {
        facts.push(`SoDEX top loser ${index + 1}: ${l.symbol} ${l.changePct24h}% price=${l.lastPrice}`);
      });
      const mostTraded = asArray(data?.data?.mostTraded || data?.mostTraded);
      mostTraded.slice(0, 3).forEach((t, index) => {
        facts.push(`SoDEX most traded ${index + 1}: ${t.symbol} volume=${t.quoteVolume24h}`);
      });
      break;
    }
    default:
      pushMetrics(facts, analysis?.metrics, 6);
      break;
  }

  if (analysis?.label) pushFact(facts, 'deterministic label', analysis.label);
  if (analysis?.confidence) pushFact(facts, 'deterministic confidence', analysis.confidence);
  asArray(analysis?.signals).slice(0, 3).forEach((signal, index) => facts.push(`signal ${index + 1}: ${signal}`));
  asArray(analysis?.risks).slice(0, 3).forEach((risk, index) => facts.push(`risk ${index + 1}: ${risk}`));

  const maxFacts = {
    get_market_intelligence: 24,
    get_token_intelligence: 20,
    get_wallet_holdings: 20
  }[toolName] ?? 16;

  return facts.filter(Boolean).slice(0, maxFacts);
};

const summarizeToolData = (toolName, args, data) => {
  const arrayData = asArray(data);

  switch (toolName) {
    case 'get_market_intelligence': {
      const regime = data?.regime || {};
      const leaders = asArray(data?.rotation?.leaders).slice(0, 3).map((item) => item.name || item.ticker).join(', ');
      const alerts = asArray(data?.alerts?.triggered).length;
      return `Returned market intelligence. Regime: ${regime.label || 'N/A'} (${regime.confidence || 'N/A'} confidence). Rotation leaders: ${leaders || 'N/A'}. Active alerts: ${alerts}.`;
    }
    case 'get_token_intelligence': {
      const asset = data?.asset || {};
      const snapshot = data?.snapshot || {};
      return `Returned token intelligence for ${asset.name || args?.asset || 'asset'} (${asset.symbol || ''}). 24h: ${snapshot.changePct24h ?? 'N/A'}%, trend: ${data?.trend?.trend || 'N/A'}.`;
    }
    case 'compare_assets': {
      return `Compared ${data?.assetA?.name || 'asset A'} and ${data?.assetB?.name || 'asset B'} using live market snapshots.`;
    }
    case 'get_asset_snapshot': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const symbol = data?.asset?.symbol || '';
      return `Returned live market snapshot for ${name} (${symbol}).`;
    }
    case 'get_asset_price_history': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const count = data?.count || 0;
      const analytics = data?.analytics || {};
      return `Returned ${count} ${data?.interval || '1d'} candles for ${name}. Period change: ${analytics.periodChangePercent || 'N/A'}, volatility: ${analytics.volatility || 'N/A'}, trend: ${analytics.trend || 'N/A'}.`;
    }
    case 'get_token_economics': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const tokenomics = data?.tokenomics || {};
      return `Returned tokenomics for ${name}. Supply ratio: ${tokenomics.supply_ratio || 'N/A'}, inflationary: ${tokenomics.is_inflationary ?? 'N/A'}.`;
    }
    case 'get_trading_pairs': {
      const name = data?.asset?.name || args?.asset || 'unknown';
      const count = data?.totalPairs || asArray(data?.pairs).length;
      return `Returned ${count} trading pairs for ${name}.`;
    }
    case 'get_index_overview': {
      if (data?.ticker) {
        const constituentsCount = asArray(data?.constituents).length;
        return `Returned index snapshot and ${constituentsCount} constituents for ${data.ticker}.`;
      }
      const count = data?.count || asArray(data?.indices).length;
      return `Returned ${count} SoSoValue indices.`;
    }
    case 'get_analysis_charts': {
      if (data?.chartName) {
        return `Returned analysis chart data for "${data.chartName}".`;
      }
      const count = data?.count || asArray(data?.charts).length;
      return `Returned ${count} available analysis charts.`;
    }
    case 'get_macro_event_history': {
      const count = data?.count || asArray(data?.history).length;
      return `Returned ${count} historical data points for macro event "${data?.event || args?.event}".`;
    }
    case 'get_sector_spotlight': {
      const count = data?.count || asArray(data?.sectors).length;
      const topSectors = asArray(data?.sectors).slice(0, 3).map((s) => s.name).join(', ');
      const scope = data?.sourceScope ? ` Scope: ${data.sourceScope}` : '';
      const fallback = data?.fallbackReason ? ` Fallback: ${data.fallbackReason}` : '';
      if (!count) {
        return `No sector spotlight rows returned.${fallback}`;
      }
      return `Returned ${count} sector rows. Top sectors: ${topSectors || 'N/A'}.${scope}${fallback}`;
    }
    case 'get_fundraising_overview': {
      const count = data?.count || asArray(data?.projects).length;
      const topProjects = asArray(data?.projects).slice(0, 3).map((p) => p.name).join(', ');
      return `Returned ${count} fundraising projects. Recent: ${topProjects}`;
    }
    case 'get_asset_news_brief': {
      const items = asArray(data?.items);
      if (!items.length) {
        return `No featured news items returned for ${data?.asset?.name || args?.asset || 'the requested asset'}.`;
      }

      return `Returned ${items.length} featured news items for ${data?.asset?.name || args?.asset}. Top titles: ${items.slice(0, 3).map((item) => item.title).join(' | ')}`;
    }
    case 'get_hot_news_digest': {
      const items = asArray(data?.items);
      if (!items.length) {
        return 'No hot news items returned.';
      }

      return `Returned ${items.length} hot news items. Top titles: ${items.slice(0, 3).map((item) => item.title).join(' | ')}`;
    }
    case 'get_etf_flow_brief': {
      const snapshots = asArray(data?.topEtfs);
      return `Built a ${data?.assetSymbol || ''} ETF flow brief with ${asArray(data?.history).length} history points and ${snapshots.length} top ETF snapshots.`;
    }
    case 'get_macro_crypto_calendar': {
      const items = asArray(data?.events);
      return `Returned ${items.length} macro calendar days relevant to crypto.`;
    }
    case 'get_crypto_equities_watchlist': {
      const items = asArray(data?.stocks);
      return `Returned a crypto equities watchlist with ${items.length} stock snapshots.`;
    }
    case 'get_btc_treasury_brief': {
      const items = asArray(data?.companies);
      return `Returned a BTC treasury brief with ${items.length} companies.`;
    }
    case 'get_btc_purchase_history_brief': {
      const items = asArray(data?.purchases);
      return `Returned ${items.length} BTC purchase history records for ${data?.companyTicker || args?.ticker}.`;
    }
    case 'get_wallet_holdings': {
      const tokens = asArray(data?.tokens);
      const chainsScanned = asArray(data?.chainsScanned);
      const coverage = data?.chainCoverage || {};
      const pricedCount = tokens.filter((token) => Number(token?.usdValue) > 0).length;
      const topHolding = tokens.find((token) => Number(token?.usdValue) > 0) || tokens[0];
      const topHoldingText = topHolding
        ? ` Top holding: ${topHolding.balance} ${topHolding.symbol} on ${topHolding.chain}${Number(topHolding.usdValue) > 0 ? ` (~$${Number(topHolding.usdValue).toFixed(2)})` : ' (unpriced)'}.`
        : '';
      return `Returned ${tokens.length} wallet holdings (${pricedCount} priced) across ${chainsScanned.length} scanned chain(s): ${chainsScanned.join(', ') || 'none'}. Total value: ${data?.totalValueUsd || 'N/A'} USD. Coverage: ${coverage.successful || 0}/${coverage.attempted || 0} chains succeeded.${topHoldingText}`;
    }
    case 'find_currency': {
      if (!arrayData.length) {
        return 'No matching currency records were found.';
      }

      const labels = arrayData
        .slice(0, 5)
        .map((item) => `${item.name} (${item.symbol}) => ${item.currency_id}`)
        .join(' | ');
      return `Resolved ${arrayData.length} matching currency records. Top matches: ${labels}`;
    }
    case 'get_hot_news':
    case 'get_featured_news':
    case 'search_news': {
      if (!arrayData.length) {
        return 'No news items returned.';
      }

      const headlines = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} news items. Top headlines: ${headlines}`;
    }
    case 'get_btc_treasuries':
    case 'get_crypto_stocks':
    case 'get_fundraising_projects':
    case 'get_etf_list': {
      if (!arrayData.length) {
        return 'No records returned.';
      }

      const labels = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} records. Top entries: ${labels}`;
    }
    case 'get_currency_klines':
    case 'get_etf_summary_history':
    case 'get_btc_purchase_history': {
      if (!arrayData.length) {
        return 'No historical records returned.';
      }

      return `Returned ${arrayData.length} historical records. Latest preview: ${JSON.stringify(sanitizeForGemini(arrayData[arrayData.length - 1], 1))}`;
    }
    case 'get_macro_events': {
      if (!arrayData.length) {
        return 'No macro events returned for the requested range.';
      }

      const labels = arrayData.slice(0, 3).map(buildArrayItemLabel).join(' | ');
      return `Returned ${arrayData.length} macro events. Closest items: ${labels}`;
    }
    case 'get_sodex_analytics': {
      const analyticsData = data?.data || data || {};
      const summary = analyticsData.summary || {};
      const gainers = asArray(analyticsData.topGainers);
      const losers = asArray(analyticsData.topLosers);
      const topGainer = gainers[0];
      const topLoser = losers[0];
      return `Returned SoDEX analytics: ${summary.totalPairs || 0} active pairs, total volume $${Math.round(summary.totalVolumeUsd || 0).toLocaleString('en-US')}. Top gainer: ${topGainer?.symbol || 'N/A'} (${topGainer?.changePct24h ?? 'N/A'}%). Top loser: ${topLoser?.symbol || 'N/A'} (${topLoser?.changePct24h ?? 'N/A'}%).`;
    }
    default: {
      if (isPlainObject(data)) {
        const fields = pickScalarFields(data);
        const preview = Object.keys(fields).length ? JSON.stringify(fields) : JSON.stringify(sanitizeForGemini(data, 1));
        return `Returned snapshot data for ${toolName}${Object.keys(args || {}).length ? ` with args ${JSON.stringify(args)}` : ''}. Preview: ${preview}`;
      }

      if (arrayData.length) {
        return `Returned ${arrayData.length} items for ${toolName}.`;
      }

      return `Returned data for ${toolName}.`;
    }
  }
};

const normalizeToolResult = (toolName, args, apiPayload, requestMeta) => {
  const code = apiPayload?.code;
  const message = apiPayload?.message;
  const data = Object.prototype.hasOwnProperty.call(apiPayload || {}, 'data') ? apiPayload.data : apiPayload;
  const analysis = analyzeToolResult(toolName, data, args);
  const summary = summarizeToolData(toolName, args, data);
  const evidenceFacts = buildEvidenceFacts(toolName, args, data, analysis);
  const source = toolName === 'get_wallet_holdings'
    ? 'Etherscan'
    : toolName.includes('sodex')
      ? 'SoDEX'
      : 'SoSoValue';

  return {
    source,
    tool: toolName,
    args: args || {},
    apiCode: code,
    summary,
    evidenceFacts,
    analysis,
    dataPreview:
      toolName === 'get_wallet_holdings'
        ? buildWalletDataPreview(data)
        : toolName === 'compare_assets'
          ? buildCompareAssetsPreview(data)
          : sanitizeForGemini(data),
    totalItems: Array.isArray(data) ? data.length : undefined
  };
};

const buildSynthesisContext = (toolAnalyses) => {
  const synthesis = combineToolAnalyses(toolAnalyses);
  return {
    synthesis,
    content: {
      role: 'user',
      parts: [{
        text: [
          'DETERMINISTIC CROSS-TOOL SYNTHESIS (INTERNAL ONLY)',
          'Use this synthesis as your high-level analytical frame. It contains calculated directional scores, risk assessments, and identified data conflicts.',
          'IMPORTANT: Do not expose raw scores, weights, or internal tool names from this object. Instead, synthesize this into a professional narrative.',
          JSON.stringify(synthesis)
        ].join('\n')
      }]
    }
  };
};

module.exports = {
  DEFAULT_WATCHLIST_TICKERS,
  asArray,
  buildEvidenceFacts,
  buildSynthesisContext,
  normalizeLookupValue,
  normalizeToolResult,
  sanitizeForGemini,
  summarizeToolData,
  truncate
};
