// Price, comparison, pairs, sectors, indexes and crypto equities.
const { asArray } = require('../../utils/common');
const {
  clamp,
  round,
  getFirstNumber,
  directionalLabel,
  confidenceFromCoverage,
  makeBreakdown,
  estimateRiskScore,
  buildAnalysis,
  scorePriceChange,
  formatPercent,
  analyzeDefault
} = require('./shared');

const analyzeSnapshot = (toolName, data) => {
  const snapshot = data?.snapshot || data || {};
  const change24h = getFirstNumber(snapshot.change_pct_24h, snapshot.changePct24h);
  const change7d = getFirstNumber(snapshot.change_pct_7d, snapshot.changePct7d);
  const change30d = getFirstNumber(snapshot.change_pct_30d, snapshot.changePct30d);
  const athChange = getFirstNumber(snapshot.ath_change_pct, snapshot.athChangePct);
  const price = getFirstNumber(snapshot.price);

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  const before24h = score;
  score = scorePriceChange(score, change24h, 3, 10);
  if (score !== before24h) scoreBreakdown.push(makeBreakdown('24h price change', score - before24h, 'Short-term price momentum crossed a threshold.', { change24hPercent: round(change24h) }));
  const before7d = score;
  score = scorePriceChange(score, change7d, 5, 15);
  if (score !== before7d) scoreBreakdown.push(makeBreakdown('7d price change', score - before7d, 'Weekly price momentum crossed a threshold.', { change7dPercent: round(change7d) }));
  const before30d = score;
  score = scorePriceChange(score, change30d, 10, 25);
  if (score !== before30d) scoreBreakdown.push(makeBreakdown('30d price change', score - before30d, 'Monthly price momentum crossed a threshold.', { change30dPercent: round(change30d) }));

  const signals = [];
  const risks = [];
  if (price !== null) signals.push(`Current price available: ${price}.`);
  if (change24h !== null) signals.push(`24h change is ${formatPercent(change24h)}.`);
  if (change7d !== null) signals.push(`7d change is ${formatPercent(change7d)}.`);
  if (change30d !== null) signals.push(`30d change is ${formatPercent(change30d)}.`);
  if (athChange !== null && athChange <= -40) {
    risks.push(`Asset remains ${formatPercent(Math.abs(athChange))} below all-time high.`);
  }
  if (change24h !== null && Math.abs(change24h) >= 10) {
    risks.push('Large 24h move increases reversal and liquidation risk.');
  }

  const available = [change24h, change7d, change30d, price].filter((value) => value !== null).length;
  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, change24h !== null && Math.abs(change24h) >= 10 ? 50 : 35),
    confidence: confidenceFromCoverage(available, 4),
    signals,
    risks,
    metrics: {
      price,
      change24hPercent: round(change24h),
      change7dPercent: round(change7d),
      change30dPercent: round(change30d),
      athChangePercent: round(athChange)
    },
    scoreBreakdown
  });
};

const analyzeCompareAssets = (toolName, data) => {
  const symA = data?.assetA?.symbol || 'A';
  const symB = data?.assetB?.symbol || 'B';
  const legA = analyzeSnapshot('get_asset_snapshot', { snapshot: data?.assetA?.snapshot });
  const legB = analyzeSnapshot('get_asset_snapshot', { snapshot: data?.assetB?.snapshot });

  const mergedScore = clamp(Math.round((legA.directionalScore + legB.directionalScore) / 2), 0, 100);
  const mergedRisk = clamp(Math.round((legA.riskScore + legB.riskScore) / 2), 0, 100);

  const prefixSignals = (leg, sym) => (leg.signals || []).map((s) => `${sym}: ${s}`);
  const signals = [...prefixSignals(legA, symA), ...prefixSignals(legB, symB)].slice(0, 8);
  const risks = [...(legA.risks || []), ...(legB.risks || [])].slice(0, 8);

  const confRank = { low: 0, medium: 1, high: 2 };
  const mergedConf =
    Math.min(confRank[legA.confidence] ?? 0, confRank[legB.confidence] ?? 0) === 2
      ? 'high'
      : Math.min(confRank[legA.confidence] ?? 0, confRank[legB.confidence] ?? 0) === 1
        ? 'medium'
        : 'low';

  return buildAnalysis({
    toolName,
    label: directionalLabel(mergedScore),
    score: mergedScore,
    riskScore: mergedRisk,
    confidence: mergedConf,
    signals,
    risks,
    metrics: {
      legA: { symbol: symA, ...legA.metrics },
      legB: { symbol: symB, ...legB.metrics }
    },
    scoreBreakdown: [...(legA.scoreBreakdown || []), ...(legB.scoreBreakdown || [])].slice(0, 10),
    caveats: ['Comparison uses averaged directional scoring from two live snapshots.']
  });
};

const analyzePriceHistory = (toolName, data) => {
  const analytics = data?.analytics || {};
  const klines = asArray(data?.klines);
  const closes = klines
    .map((item) => getFirstNumber(item.close))
    .filter((value) => value !== null && value > 0);
  const highs = klines
    .map((item) => getFirstNumber(item.high))
    .filter((value) => value !== null && value > 0);

  const periodChange = getFirstNumber(analytics.periodChangePercent);
  const volatility = getFirstNumber(analytics.volatility);
  const periodHigh = getFirstNumber(analytics.periodHigh, highs.length ? Math.max(...highs) : null);
  const latestClose = closes.length ? closes[closes.length - 1] : getFirstNumber(analytics.periodClose);
  const drawdownFromHigh = periodHigh && latestClose
    ? ((latestClose - periodHigh) / periodHigh) * 100
    : null;

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  const beforePeriod = score;
  score = scorePriceChange(score, periodChange, 3, 10);
  if (score !== beforePeriod) scoreBreakdown.push(makeBreakdown('period price change', score - beforePeriod, 'Period return crossed a directional threshold.', { periodChangePercent: round(periodChange) }));
  if (periodChange !== null && periodChange >= 25) {
    score += 6;
    scoreBreakdown.push(makeBreakdown('strong upside trend', 6, 'Period return exceeded 25%.', { periodChangePercent: round(periodChange) }));
  }
  if (periodChange !== null && periodChange <= -25) {
    score -= 6;
    scoreBreakdown.push(makeBreakdown('strong downside trend', -6, 'Period return fell below -25%.', { periodChangePercent: round(periodChange) }));
  }
  if (drawdownFromHigh !== null && drawdownFromHigh <= -20) {
    score -= 6;
    scoreBreakdown.push(makeBreakdown('drawdown from high', -6, 'Latest close is more than 20% below the period high.', { drawdownFromHighPercent: round(drawdownFromHigh) }));
  }
  if (volatility !== null && volatility >= 30) {
    score -= 4;
    scoreBreakdown.push(makeBreakdown('high volatility', -4, 'Period volatility is elevated.', { volatilityPercent: round(volatility) }));
  }

  const signals = [];
  const risks = [];
  if (periodChange !== null) signals.push(`Period change is ${formatPercent(periodChange)}.`);
  if (analytics.trend) signals.push(`Calculated trend is ${analytics.trend}.`);
  if (drawdownFromHigh !== null) signals.push(`Latest close is ${formatPercent(drawdownFromHigh)} from period high.`);
  if (volatility !== null && volatility >= 15) risks.push(`Elevated period volatility: ${formatPercent(volatility)}.`);
  if (drawdownFromHigh !== null && drawdownFromHigh <= -20) risks.push('Deep drawdown from period high weakens trend quality.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, volatility !== null && volatility >= 30 ? 58 : 38),
    confidence: klines.length >= 20 ? 'high' : klines.length >= 7 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      candleCount: klines.length,
      periodChangePercent: round(periodChange),
      volatilityPercent: round(volatility),
      drawdownFromHighPercent: round(drawdownFromHigh)
    },
    scoreBreakdown
  });
};

const analyzeTradingPairs = (toolName, data) => {
  const pairs = asArray(data?.pairs);
  const totalPairs = getFirstNumber(data?.totalPairs) || pairs.length;
  const exchangeCount = new Set(pairs.map((pair) => pair.exchange || pair.exchangeName).filter(Boolean)).size;
  let score = 45;
  const scoreBreakdown = [makeBreakdown('base liquidity', 45, 'Market access starts below neutral until pair coverage is confirmed.')];
  if (totalPairs >= 50) {
    score += 25;
    scoreBreakdown.push(makeBreakdown('trading pair coverage', 25, 'Very broad trading-pair coverage.', { totalPairs }));
  } else if (totalPairs >= 15) {
    score += 15;
    scoreBreakdown.push(makeBreakdown('trading pair coverage', 15, 'Moderate trading-pair coverage.', { totalPairs }));
  } else if (totalPairs >= 5) {
    score += 5;
    scoreBreakdown.push(makeBreakdown('trading pair coverage', 5, 'Basic trading-pair coverage.', { totalPairs }));
  }
  if (exchangeCount >= 5) {
    score += 8;
    scoreBreakdown.push(makeBreakdown('exchange coverage', 8, 'Asset appears across at least 5 exchanges.', { exchangeCount }));
  }

  return buildAnalysis({
    toolName,
    label: score >= 65 ? 'high_liquidity' : score <= 40 ? 'low_liquidity' : 'moderate_liquidity',
    score,
    riskScore: totalPairs < 5 ? 70 : totalPairs < 15 ? 50 : 35,
    scoreMeaning: 'market access/liquidity coverage, not a price forecast',
    confidence: totalPairs >= 10 ? 'medium' : 'low',
    signals: [`Found ${totalPairs} trading pairs across ${exchangeCount || 'unknown'} exchanges.`],
    risks: totalPairs < 5 ? ['Limited trading-pair coverage can increase liquidity risk.'] : [],
    metrics: {
      totalPairs,
      exchangeCount
    },
    scoreBreakdown
  });
};

const analyzeSectorSpotlight = (toolName, data) => {
  const sectors = asArray(data?.sectors);
  const changes = sectors
    .map((s) => getFirstNumber(s.change_pct_24h, s.changePct24h))
    .filter((value) => value !== null);

  if (!changes.length) {
    return buildAnalysis({
      toolName,
      label: 'neutral',
      score: 50,
      confidence: 'low',
      signals: [],
      risks: [],
      metrics: { sectorCount: sectors.length },
      scoreBreakdown: [makeBreakdown('base', 50, 'No comparable 24h sector momentum in payload.')],
      caveats: sectors.length ? ['Sector rows did not include usable 24h change fields.'] : []
    });
  }

  const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  const beforeAvg = score;
  score = scorePriceChange(score, avg, 2, 7);
  if (score !== beforeAvg) {
    scoreBreakdown.push(
      makeBreakdown('average sector 24h change', score - beforeAvg, 'Cross-sector average 24h move shifted the score.', {
        averageChange24hPercent: round(avg)
      })
    );
  }

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore([], Math.abs(avg) >= 5 ? 45 : 35),
    confidence: sectors.length >= 6 ? 'medium' : 'low',
    signals: [`Average sector 24h change across ${changes.length} sectors: ${formatPercent(round(avg))}.`],
    risks: Math.abs(avg) >= 8 ? ['Broad sector churn can amplify single-name volatility.'] : [],
    metrics: { sectorCount: sectors.length, averageChange24hPercent: round(avg) },
    scoreBreakdown
  });
};

const analyzeCryptoEquitiesWatchlist = (toolName, data) => {
  const stocks = asArray(data?.stocks).filter((s) => s && s.snapshot && typeof s.snapshot === 'object');
  if (!stocks.length) {
    return analyzeDefault(toolName, data);
  }

  const legs = stocks.map((s) => analyzeSnapshot('get_asset_snapshot', { snapshot: s.snapshot }));
  const mergedScore = clamp(
    Math.round(legs.reduce((sum, leg) => sum + leg.directionalScore, 0) / legs.length),
    0,
    100
  );
  const mergedRisk = clamp(
    Math.round(legs.reduce((sum, leg) => sum + leg.riskScore, 0) / legs.length),
    0,
    100
  );

  const prefixSignals = (leg, ticker) => (leg.signals || []).map((sig) => `${ticker || '?'}: ${sig}`);
  const signals = stocks.flatMap((s, i) => prefixSignals(legs[i], s.ticker)).slice(0, 8);
  const risks = legs.flatMap((leg) => leg.risks || []).slice(0, 8);

  const confRank = { low: 0, medium: 1, high: 2 };
  const minRank = Math.min(...legs.map((leg) => confRank[leg.confidence] ?? 0));
  const mergedConf = minRank === 2 ? 'high' : minRank === 1 ? 'medium' : 'low';

  return buildAnalysis({
    toolName,
    label: directionalLabel(mergedScore),
    score: mergedScore,
    riskScore: mergedRisk,
    confidence: mergedConf,
    signals,
    risks,
    metrics: { stockCount: stocks.length },
    scoreBreakdown: legs.flatMap((leg) => leg.scoreBreakdown || []).slice(0, 10),
    caveats: ['Averages directional scoring across crypto-equity snapshots in the watchlist.']
  });
};

const analyzeIndexOverview = (toolName, data) => {
  const snapshot = data?.snapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    return analyzeSnapshot(toolName, { snapshot });
  }

  const indices = asArray(data?.indices);
  const count = data?.count ?? indices.length;
  return buildAnalysis({
    toolName,
    label: 'neutral',
    score: 50,
    confidence: count > 0 ? 'low' : 'low',
    signals: count ? [`Returned ${count} index definitions (list mode; no single-index market snapshot).`] : [],
    risks: [],
    metrics: { indexCount: count },
    scoreBreakdown: [makeBreakdown('base', 50, 'Index catalog mode does not include a consolidated performance snapshot.')],
    caveats: []
  });
};

module.exports = {
  analyzeSnapshot,
  analyzeCompareAssets,
  analyzePriceHistory,
  analyzeTradingPairs,
  analyzeSectorSpotlight,
  analyzeCryptoEquitiesWatchlist,
  analyzeIndexOverview
};
