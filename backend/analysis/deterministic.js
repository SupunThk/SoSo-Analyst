const METHOD_VERSION = 'deterministic-analysis-v1';
const { asArray } = require('../utils/common');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.replace(/[$,%\s,]/g, '');
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const getFirstNumber = (...values) => {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
};

/** Parses fundraising-style amounts like "$50M", "10.5m", "1.2B" into USD when possible. */
const parseLooseUsdAmount = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;

  const direct = toNumber(String(raw));
  if (direct !== null) return direct;

  const s = String(raw).toLowerCase().replace(/[$,\s]/g, '').trim();
  const match = s.match(/([\d.]+)\s*([kmb])?\b/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return null;
  const suf = (match[2] || '').toLowerCase();
  const scale = suf === 'b' ? 1e9 : suf === 'm' ? 1e6 : suf === 'k' ? 1e3 : 1;
  return base * scale;
};

const getPurchaseBtcAmount = (row) =>
  getFirstNumber(
    row?.btc_amount,
    row?.amount_btc,
    row?.purchase_amount_btc,
    row?.btc,
    row?.quantity_btc,
    row?.quantity,
    row?.amount,
    row?.coins
  );

const getPurchaseDateMs = (row) => {
  const d = row?.purchase_date || row?.date || row?.time || row?.purchaseDate;
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

const getMacroEventDateMs = (ev) => {
  const d = ev?.date || ev?.event_date || ev?.datetime || ev?.releaseTime || ev?.release_time;
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

const MACRO_HIGH_IMPACT_RE =
  /\b(fomc|federal reserve|\bfed\b|cpi|pce|core pce|inflation|nfp|non-?farm|payroll|jobs report|interest rate|rate decision|ecb|boj|boe|gdp|ppi|pmi|retail sales|unemployment|jobless|claims|treasury auction|dot plot|powell)\b/i;

const isHighImpactMacroEvent = (ev) => {
  const impact = String(ev?.importance || ev?.impact || ev?.level || '').toLowerCase();
  if (impact.includes('high')) return true;
  const text = [ev?.title, ev?.name, ev?.event, ev?.description, ev?.eventName, ev?.type, ev?.country]
    .filter(Boolean)
    .join(' ');
  return MACRO_HIGH_IMPACT_RE.test(text);
};

const directionalLabel = (score) => {
  if (score >= 65) return 'bullish';
  if (score <= 40) return 'bearish';
  return 'neutral';
};

const confidenceFromCoverage = (available, possible) => {
  if (possible <= 0 || available <= 0) return 'low';
  const ratio = available / possible;
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.4) return 'medium';
  return 'low';
};

const SCORE_BANDS = {
  bearish: [0, 39],
  neutral: [40, 64],
  bullish: [65, 100]
};

const makeBreakdown = (factor, impact, reason, metrics = {}) => ({
  factor,
  impact,
  reason,
  metrics
});

const estimateRiskScore = (risks = [], base = 35) => clamp(base + risks.length * 8, 0, 100);

const TIMESTAMP_KEYS = new Set([
  'date',
  'time',
  'timestamp',
  'createdAt',
  'updatedAt',
  'releaseTime',
  'release_time',
  'publishedAt',
  'published_at'
]);

const collectTimestamps = (value, depth = 0, parentKey = '') => {
  if (depth > 5 || value == null) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number') {
    if (!TIMESTAMP_KEYS.has(parentKey)) {
      return [];
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? [] : [parsed.getTime()];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTimestamps(item, depth + 1, parentKey));
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectTimestamps(item, depth + 1, key));
  }

  return [];
};

const getDataFreshness = (data) => {
  const timestamps = collectTimestamps(data);
  if (!timestamps.length) {
    return {
      latestTimestamp: null,
      ageMinutes: null,
      status: 'unknown'
    };
  }

  const latest = Math.max(...timestamps);
  const ageMinutes = Math.max(0, Math.round((Date.now() - latest) / 60000));
  let status = 'stale';
  if (ageMinutes <= 60) status = 'fresh';
  else if (ageMinutes <= 24 * 60) status = 'recent';

  return {
    latestTimestamp: new Date(latest).toISOString(),
    ageMinutes,
    status
  };
};

const buildAnalysis = ({
  toolName,
  label = 'neutral',
  score = 50,
  signalScore,
  riskScore,
  confidence = 'low',
  signals = [],
  risks = [],
  metrics = {},
  caveats = [],
  scoreBreakdown = [],
  dataFreshness,
  scoreMeaning = 'directional market signal, not financial advice'
}) => {
  const normalizedSignals = signals.filter(Boolean).slice(0, 8);
  const normalizedRisks = risks.filter(Boolean).slice(0, 8);
  const normalizedSignalScore = clamp(Math.round(signalScore ?? score), 0, 100);

  return {
    method: METHOD_VERSION,
    tool: toolName,
    label,
    score: normalizedSignalScore,
    directionalScore: normalizedSignalScore,
    riskScore: clamp(Math.round(riskScore ?? estimateRiskScore(normalizedRisks)), 0, 100),
    scoreBands: SCORE_BANDS,
    scoreMeaning,
    confidence,
    signals: normalizedSignals,
    risks: normalizedRisks,
    metrics,
    scoreBreakdown: scoreBreakdown
      .filter(Boolean)
      .map((item) => ({
        factor: item.factor,
        impact: Number(item.impact) || 0,
        reason: item.reason,
        metrics: item.metrics || {}
      }))
      .slice(0, 10),
    dataFreshness: dataFreshness || {
      latestTimestamp: null,
      ageMinutes: null,
      status: 'unknown'
    },
    caveats: caveats.filter(Boolean).slice(0, 5)
  };
};

const scorePriceChange = (score, change, mediumThreshold, highThreshold) => {
  if (change === null) return score;
  if (change >= highThreshold) return score + 15;
  if (change >= mediumThreshold) return score + 8;
  if (change <= -highThreshold) return score - 15;
  if (change <= -mediumThreshold) return score - 8;
  return score;
};

const formatPercent = (value) => (value === null ? 'N/A' : `${round(value, 2)}%`);

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

const getFlowValue = (item) => getFirstNumber(
  item?.total_net_flow,
  item?.totalNetFlow,
  item?.netFlow,
  item?.net_flow,
  item?.flow
);

const analyzeEtfFlows = (toolName, data) => {
  const history = asArray(data?.history);
  const flowsFromHistory = history.map(getFlowValue).filter((value) => value !== null);
  const flowAnalytics = data?.flowAnalytics || {};
  const totalNetFlow = flowsFromHistory.length
    ? flowsFromHistory.reduce((sum, value) => sum + value, 0)
    : getFirstNumber(flowAnalytics.totalNetFlow);
  const avgDailyFlow = flowsFromHistory.length
    ? totalNetFlow / flowsFromHistory.length
    : getFirstNumber(flowAnalytics.avgDailyFlow);

  const positiveDays = flowsFromHistory.filter((value) => value > 0).length;
  const negativeDays = flowsFromHistory.filter((value) => value < 0).length;
  const latestFlow = flowsFromHistory.length ? flowsFromHistory[flowsFromHistory.length - 1] : null;
  const latestDirection = latestFlow === null
    ? String(flowAnalytics.flowTrend || '').replace('net_', '') || null
    : latestFlow >= 0 ? 'inflow' : 'outflow';

  let streak = 0;
  if (flowsFromHistory.length && latestDirection) {
    for (let index = flowsFromHistory.length - 1; index >= 0; index--) {
      const value = flowsFromHistory[index];
      if ((latestDirection === 'inflow' && value >= 0) || (latestDirection === 'outflow' && value < 0)) {
        streak++;
      } else {
        break;
      }
    }
  }

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  if (totalNetFlow !== null && totalNetFlow > 0) {
    score += 15;
    scoreBreakdown.push(makeBreakdown('net ETF flow', 15, 'Sampled ETF flows are net positive.', { totalNetFlow: round(totalNetFlow, 0) }));
  }
  if (totalNetFlow !== null && totalNetFlow < 0) {
    score -= 15;
    scoreBreakdown.push(makeBreakdown('net ETF flow', -15, 'Sampled ETF flows are net negative.', { totalNetFlow: round(totalNetFlow, 0) }));
  }
  if (flowsFromHistory.length) {
    const positiveRatio = positiveDays / flowsFromHistory.length;
    if (positiveRatio >= 0.65) {
      score += 8;
      scoreBreakdown.push(makeBreakdown('positive flow days', 8, 'Most sampled ETF flow sessions were positive.', { positiveRatio: round(positiveRatio * 100) }));
    }
    if (positiveRatio <= 0.35) {
      score -= 8;
      scoreBreakdown.push(makeBreakdown('positive flow days', -8, 'Most sampled ETF flow sessions were negative.', { positiveRatio: round(positiveRatio * 100) }));
    }
  }
  if (latestDirection === 'inflow' && streak >= 3) {
    score += 10;
    scoreBreakdown.push(makeBreakdown('ETF flow streak', 10, 'Recent ETF flow streak is supportive.', { streak, latestDirection }));
  }
  if (latestDirection === 'outflow' && streak >= 3) {
    score -= 10;
    scoreBreakdown.push(makeBreakdown('ETF flow streak', -10, 'Recent ETF flow streak is a headwind.', { streak, latestDirection }));
  }

  const signals = [];
  const risks = [];
  if (totalNetFlow !== null) signals.push(`Total net ETF flow is ${round(totalNetFlow, 0)} over the sampled period.`);
  if (flowsFromHistory.length) signals.push(`${positiveDays}/${flowsFromHistory.length} ETF flow sessions were positive.`);
  if (streak) signals.push(`${streak}-session ${latestDirection} streak.`);
  if (latestDirection === 'outflow' && streak >= 2) risks.push('Recent ETF outflow streak is a demand-side headwind.');
  if (totalNetFlow !== null && totalNetFlow < 0) risks.push('Sampled ETF flows are net negative.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, latestDirection === 'outflow' ? 55 : 32),
    confidence: flowsFromHistory.length >= 7 ? 'high' : flowsFromHistory.length >= 3 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      totalNetFlow: round(totalNetFlow, 0),
      avgDailyFlow: round(avgDailyFlow, 0),
      positiveDays,
      negativeDays,
      sampleDays: flowsFromHistory.length,
      latestDirection,
      streak
    },
    scoreBreakdown
  });
};

const BULLISH_NEWS_TERMS = [
  'adoption', 'approve', 'approved', 'breakout', 'bullish', 'buyback', 'gains',
  'inflow', 'partnership', 'rally', 'record', 'surge', 'upgrade', 'accumulate',
  'acquisition', 'launch', 'listing', 'profit', 'reserves'
];

const BEARISH_NEWS_TERMS = [
  'bearish', 'crash', 'delay', 'exploit', 'hack', 'investigation', 'lawsuit',
  'liquidation', 'outflow', 'plunge', 'rejection', 'risk', 'selloff', 'scam',
  'bankruptcy', 'breach', 'charges', 'fraud', 'probe', 'sanction'
];

const HIGH_IMPORTANCE_NEWS_TERMS = [
  'bitcoin', 'ethereum', 'etf', 'fed', 'fomc', 'cpi', 'sec', 'hack', 'exploit',
  'lawsuit', 'liquidation', 'bankruptcy', 'approval', 'rejection'
];

const SEVERE_BEARISH_NEWS_TERMS = [
  'exploit', 'hack', 'breach', 'lawsuit', 'fraud', 'bankruptcy', 'sanction'
];

const countKeywordHits = (text, terms) => {
  const normalized = String(text || '').toLowerCase();
  return terms.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0);
};

const normalizeHeadline = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const analyzeNews = (toolName, data) => {
  const items = asArray(data?.items);
  let bullishHits = 0;
  let bearishHits = 0;
  let severeBearishHits = 0;
  let importanceHits = 0;
  let recencyScore = 0;
  const uniqueHeadlines = new Set();
  const sources = new Set();

  for (const item of items) {
    const text = `${item?.title || ''} ${item?.content || ''}`;
    const normalizedHeadline = normalizeHeadline(item?.title);
    if (normalizedHeadline) uniqueHeadlines.add(normalizedHeadline);
    const source = item?.sourceLink || item?.source || item?.author;
    if (source) sources.add(String(source));
    bullishHits += countKeywordHits(text, BULLISH_NEWS_TERMS);
    bearishHits += countKeywordHits(text, BEARISH_NEWS_TERMS);
    severeBearishHits += countKeywordHits(text, SEVERE_BEARISH_NEWS_TERMS);
    importanceHits += countKeywordHits(text, HIGH_IMPORTANCE_NEWS_TERMS);

    const timestamp = item?.releaseTime || item?.release_time || item?.publishedAt || item?.date;
    const parsed = timestamp ? new Date(timestamp) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      const ageHours = Math.max(0, (Date.now() - parsed.getTime()) / 3600000);
      if (ageHours <= 6) recencyScore += 3;
      else if (ageHours <= 24) recencyScore += 2;
      else if (ageHours <= 72) recencyScore += 1;
    }
  }

  const netHits = bullishHits - bearishHits;
  const duplicateCount = Math.max(0, items.length - uniqueHeadlines.size);
  const sentimentScore = clamp(50 + clamp(netHits * 8, -24, 24) - severeBearishHits * 4, 0, 100);
  const importanceScore = clamp(importanceHits * 10 + sources.size * 4 + recencyScore - duplicateCount * 4, 0, 100);
  const score = sentimentScore;
  const scoreBreakdown = [
    makeBreakdown('base sentiment', 50, 'Neutral starting score.'),
    makeBreakdown('keyword balance', clamp(netHits * 8, -24, 24), 'Bullish minus bearish keyword cues.', { netKeywordHits: netHits }),
    severeBearishHits ? makeBreakdown('severe negative cues', -severeBearishHits * 4, 'Severe negative terms receive extra penalty.', { severeBearishHits }) : null
  ];
  const signals = [
    `Keyword scan found ${bullishHits} bullish and ${bearishHits} bearish cues across ${items.length} headlines.`,
    `News importance score is ${importanceScore}/100 across ${sources.size} sources.`
  ];
  const risks = [];
  if (bearishHits > bullishHits) risks.push('Headline keyword balance is skewed bearish.');
  if (severeBearishHits > 0) risks.push('Severe negative news terms appeared in the sample.');
  if (duplicateCount > 0) risks.push(`${duplicateCount} duplicate-like headline(s) reduced confidence.`);
  if (items.length < 3) risks.push('News sample is small; sentiment confidence is limited.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(sentimentScore),
    score,
    riskScore: estimateRiskScore(risks, severeBearishHits ? 60 : 35),
    confidence: items.length >= 5 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      itemCount: items.length,
      uniqueHeadlineCount: uniqueHeadlines.size,
      duplicateHeadlineCount: duplicateCount,
      sourceCount: sources.size,
      bullishKeywordHits: bullishHits,
      bearishKeywordHits: bearishHits,
      severeBearishHits,
      netKeywordHits: netHits,
      sentimentScore,
      importanceScore
    },
    scoreBreakdown,
    caveats: ['News sentiment is keyword-based and should be treated as a weak signal.']
  });
};

const analyzeTokenomics = (toolName, data) => {
  const tokenomics = data?.tokenomics || {};
  const supplyRatio = getFirstNumber(tokenomics.supply_ratio);
  const remainingSupply = getFirstNumber(tokenomics.remaining_supply);
  const isInflationary = tokenomics.is_inflationary;

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  if (supplyRatio !== null && supplyRatio >= 90) {
    score += 10;
    scoreBreakdown.push(makeBreakdown('supply ratio', 10, 'Most max supply appears circulating.', { supplyRatioPercent: round(supplyRatio) }));
  } else if (supplyRatio !== null && supplyRatio >= 60) {
    score += 4;
    scoreBreakdown.push(makeBreakdown('supply ratio', 4, 'A majority of supply appears circulating.', { supplyRatioPercent: round(supplyRatio) }));
  } else if (supplyRatio !== null && supplyRatio < 40) {
    score -= 12;
    scoreBreakdown.push(makeBreakdown('supply ratio', -12, 'Low circulating ratio raises dilution risk.', { supplyRatioPercent: round(supplyRatio) }));
  }
  if (isInflationary === true) {
    score -= 8;
    scoreBreakdown.push(makeBreakdown('remaining supply', -8, 'Returned data indicates remaining max supply.', { isInflationary: true }));
  }
  if (isInflationary === false) {
    score += 4;
    scoreBreakdown.push(makeBreakdown('remaining supply', 4, 'No remaining max-supply inflation detected from returned data.', { isInflationary: false }));
  }

  const signals = [];
  const risks = [];
  if (supplyRatio !== null) signals.push(`Circulating supply ratio is ${formatPercent(supplyRatio)}.`);
  if (isInflationary === false) signals.push('No remaining max-supply inflation detected from returned data.');
  if (isInflationary === true) risks.push('Remaining supply indicates future dilution risk.');
  if (supplyRatio !== null && supplyRatio < 40) risks.push('Low circulating supply ratio can amplify unlock/dilution risk.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, isInflationary ? 55 : 35),
    confidence: supplyRatio !== null ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      supplyRatioPercent: round(supplyRatio),
      remainingSupply: round(remainingSupply, 0),
      isInflationary: isInflationary === null ? null : Boolean(isInflationary)
    },
    scoreBreakdown
  });
};

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'TUSD', 'USDP', 'PYUSD', 'FDUSD', 'USDE']);

const analyzePortfolio = (toolName, data) => {
  const tokens = asArray(data?.tokens);
  const totalValueUsd = getFirstNumber(data?.totalValueUsd) || tokens.reduce((sum, token) => sum + (getFirstNumber(token.usdValue) || 0), 0);
  const detectedHoldings = tokens.filter((token) => (getFirstNumber(token.balance) || 0) > 0);
  const values = tokens.map((token) => ({
    symbol: String(token.symbol || '').toUpperCase(),
    value: getFirstNumber(token.usdValue) || 0
  })).filter((token) => token.value > 0);
  const unpricedHoldings = detectedHoldings.filter((token) => (getFirstNumber(token.usdValue) || 0) <= 0);

  values.sort((a, b) => b.value - a.value);
  const topValue = values[0]?.value || 0;
  const top3Value = values.slice(0, 3).reduce((sum, token) => sum + token.value, 0);
  const stablecoinValue = values
    .filter((token) => STABLECOIN_SYMBOLS.has(token.symbol))
    .reduce((sum, token) => sum + token.value, 0);

  const topWeight = totalValueUsd > 0 ? (topValue / totalValueUsd) * 100 : null;
  const top3Weight = totalValueUsd > 0 ? (top3Value / totalValueUsd) * 100 : null;
  const stablecoinWeight = totalValueUsd > 0 ? (stablecoinValue / totalValueUsd) * 100 : null;
  const chainSummaries = asArray(data?.chainSummaries);
  const chainsScanned = asArray(data?.chainsScanned);
  const chainCoverage = data?.chainCoverage || {};
  const failedChains = asArray(chainCoverage.failedChains);

  let score = 60;
  const scoreBreakdown = [makeBreakdown('base diversification', 60, 'Portfolio analysis starts from a moderate diversification score.')];
  if (topWeight !== null && topWeight > 60) {
    score -= 20;
    scoreBreakdown.push(makeBreakdown('largest holding concentration', -20, 'Largest holding exceeds 60% of portfolio value.', { topWeightPercent: round(topWeight) }));
  } else if (topWeight !== null && topWeight > 40) {
    score -= 10;
    scoreBreakdown.push(makeBreakdown('largest holding concentration', -10, 'Largest holding exceeds 40% of portfolio value.', { topWeightPercent: round(topWeight) }));
  }
  if (top3Weight !== null && top3Weight > 85) {
    score -= 10;
    scoreBreakdown.push(makeBreakdown('top 3 concentration', -10, 'Top three holdings exceed 85% of portfolio value.', { top3WeightPercent: round(top3Weight) }));
  }
  if (stablecoinWeight !== null && stablecoinWeight < 5) {
    score -= 5;
    scoreBreakdown.push(makeBreakdown('stablecoin buffer', -5, 'Stablecoin/cash-like buffer is below 5%.', { stablecoinWeightPercent: round(stablecoinWeight) }));
  }
  if (values.length >= 8) {
    score += 5;
    scoreBreakdown.push(makeBreakdown('holding count', 5, 'Portfolio has at least 8 valued holdings.', { holdingCount: values.length }));
  }

  const label = score >= 65 ? 'balanced' : score <= 40 ? 'high_risk' : 'moderate_risk';
  const signals = [];
  const risks = [];
  const caveats = [];
  if (detectedHoldings.length) signals.push(`Detected ${detectedHoldings.length} on-chain holding(s); ${values.length} currently have USD pricing.`);
  if (chainsScanned.length) signals.push(`Portfolio scan covered ${chainsScanned.length} chain(s): ${chainsScanned.join(', ')}.`);
  if (topWeight !== null) signals.push(`Largest holding weight is ${formatPercent(topWeight)}.`);
  if (stablecoinWeight !== null) signals.push(`Stablecoin/cash-like weight is ${formatPercent(stablecoinWeight)}.`);
  if (unpricedHoldings.length) caveats.push(`${unpricedHoldings.length} detected holding(s) could not be priced, so total USD value may be incomplete.`);
  if (failedChains.length) caveats.push(`Some configured chains could not be scanned: ${failedChains.join(', ')}.`);
  if (topWeight !== null && topWeight > 40) risks.push('Portfolio is concentrated in the largest holding.');
  if (stablecoinWeight !== null && stablecoinWeight < 5) risks.push('Low stablecoin buffer may reduce flexibility during drawdowns.');

  return buildAnalysis({
    toolName,
    label,
    score,
    riskScore: clamp(100 - score + risks.length * 5, 0, 100),
    scoreMeaning: 'portfolio diversification/risk balance, not a price forecast',
    confidence: totalValueUsd > 0 && values.length >= 3 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      totalValueUsd: round(totalValueUsd, 2),
      holdingCount: detectedHoldings.length,
      pricedHoldingCount: values.length,
      unpricedHoldingCount: unpricedHoldings.length,
      largestHoldingSymbol: values[0]?.symbol || null,
      largestHoldingWeightPercent: round(topWeight),
      top3WeightPercent: round(top3Weight),
      stablecoinWeightPercent: round(stablecoinWeight),
      chainsAttempted: Number(chainCoverage.attempted) || chainSummaries.length || chainsScanned.length,
      chainsScanned: chainsScanned.length,
      chainsFailed: Number(chainCoverage.failed) || failedChains.length,
      scannedChainNames: chainsScanned,
      failedChainNames: failedChains
    },
    caveats,
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

const analyzeMacroEventHistory = (toolName, data) => {
  const history = asArray(data?.history);
  const latest = history.length ? history[history.length - 1] : {};
  const event = String(data?.event || '').toLowerCase();
  const actual = getFirstNumber(latest.actual);
  const forecast = getFirstNumber(latest.forecast);
  const surprise = actual !== null && forecast !== null ? actual - forecast : null;

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral starting score.')];
  const inflationLike = event.includes('cpi') || event.includes('inflation') || event.includes('rate');
  const growthLike = event.includes('gdp') || event.includes('pmi');
  if (surprise !== null && inflationLike) {
    const impact = surprise < 0 ? 10 : surprise > 0 ? -10 : 0;
    score += impact;
    if (impact) scoreBreakdown.push(makeBreakdown('inflation/rate surprise', impact, 'Lower-than-forecast inflation/rate data is supportive for risk assets; hotter data is a headwind.', { surprise: round(surprise) }));
  }
  if (surprise !== null && growthLike) {
    const impact = surprise > 0 ? 8 : surprise < 0 ? -8 : 0;
    score += impact;
    if (impact) scoreBreakdown.push(makeBreakdown('growth surprise', impact, 'Stronger growth data is treated as supportive unless inflation/rate context dominates.', { surprise: round(surprise) }));
  }

  const signals = [];
  const risks = [];
  if (surprise !== null) signals.push(`Latest ${event || 'macro event'} surprise is ${round(surprise, 2)} versus forecast.`);
  if (surprise !== null && inflationLike && surprise > 0) risks.push('Hotter-than-forecast inflation/rate data can pressure risk assets.');
  if (!inflationLike && !growthLike) risks.push('Macro scoring is conservative because event direction is not explicitly mapped.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, surprise !== null ? 42 : 50),
    confidence: surprise !== null && (inflationLike || growthLike) ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      event: data?.event || null,
      dataPoints: history.length,
      latestActual: actual,
      latestForecast: forecast,
      latestSurprise: round(surprise)
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

const analyzeMacroCryptoCalendar = (toolName, data) => {
  const events = asArray(data?.events);
  const from = data?.from || null;
  const to = data?.to || null;

  if (!events.length) {
    return buildAnalysis({
      toolName,
      label: 'neutral',
      score: 50,
      riskScore: 40,
      confidence: 'low',
      signals: ['No macro events fall within the requested forward window.'],
      risks: [],
      metrics: { eventCount: 0, highImpactCount: 0, windowFrom: from, windowTo: to },
      scoreBreakdown: [makeBreakdown('base', 50, 'Empty calendar window.')],
      caveats: ['Macro calendar is filtered by the tool date range; upstream data may omit releases.'],
      scoreMeaning: 'scheduled macro density as near-term volatility context, not a price forecast'
    });
  }

  const now = Date.now();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  const highImpact = events.filter(isHighImpactMacroEvent);
  const imminentHigh = highImpact.filter((ev) => {
    const t = getMacroEventDateMs(ev);
    return t !== null && t >= now && t <= now + twoDaysMs;
  }).length;

  const directional = clamp(50 - Math.min(highImpact.length * 3, 12) - Math.min(imminentHigh * 2, 8), 35, 55);
  const risk = clamp(40 + highImpact.length * 6 + imminentHigh * 5 + Math.min(events.length, 10), 40, 88);

  const topTitles = events
    .slice(0, 4)
    .map((ev) => {
      const label = ev?.title || ev?.name || ev?.event || 'Event';
      const d = ev?.date || ev?.event_date || '';
      return d ? `${label} (${d})` : String(label);
    })
    .filter(Boolean);

  const signals = [
    `${events.length} macro item(s) in window (${from || '?'} → ${to || '?'}); ${highImpact.length} tagged high-impact.`,
    ...topTitles.slice(0, 3).map((line) => `Upcoming: ${line}`)
  ];

  const risks = [];
  if (highImpact.length >= 3) risks.push('Clustered high-impact releases can raise cross-asset volatility.');
  if (imminentHigh > 0) risks.push('At least one high-impact print is within ~48h — event risk is elevated.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(directional),
    score: directional,
    riskScore: risk,
    confidence: events.length >= 5 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      eventCount: events.length,
      highImpactCount: highImpact.length,
      imminentHighImpactCount: imminentHigh,
      windowFrom: from,
      windowTo: to
    },
    scoreBreakdown: [
      makeBreakdown('base', 50, 'Neutral baseline for calendar context.'),
      makeBreakdown('high-impact density', directional - 50, 'More scheduled high-impact prints lean risk-off / cautious.', {
        highImpactCount: highImpact.length
      }),
      imminentHigh
        ? makeBreakdown('imminent high-impact', -Math.min(imminentHigh * 2, 8), 'Very near-term high-impact events increase gap/vol risk.', {
          imminentHighImpactCount: imminentHigh
        })
        : null
    ].filter(Boolean),
    caveats: ['Calendar scoring reflects release density and labels, not forecast outcomes.'],
    scoreMeaning: 'scheduled macro density as near-term volatility context, not a price forecast'
  });
};

const analyzeFundraisingOverview = (toolName, data) => {
  const projects = asArray(data?.projects);
  if (!projects.length) {
    return buildAnalysis({
      toolName,
      label: 'neutral',
      score: 50,
      riskScore: 42,
      confidence: 'low',
      signals: ['No fundraising projects were returned.'],
      risks: [],
      metrics: { projectCount: 0, parsedAmountCount: 0, totalRaiseUsdEstimate: null },
      scoreBreakdown: [makeBreakdown('base', 50, 'No primary-market pipeline in payload.')],
      caveats: ['Raise totals depend on parsed amount strings; missing formats are skipped.'],
      scoreMeaning: 'private-market activity as risk-appetite context, not a token recommendation'
    });
  }

  let totalUsd = 0;
  let parsedAmountCount = 0;
  for (const p of projects) {
    const amt = parseLooseUsdAmount(p?.amount);
    if (amt !== null && amt > 0) {
      totalUsd += amt;
      parsedAmountCount += 1;
    }
  }

  const flowBoost = Math.min(Math.floor(projects.length / 2), 8);
  const capitalBoost = totalUsd > 0 ? Math.min(Math.floor(totalUsd / 5e8), 10) : 0;
  const score = clamp(50 + flowBoost + capitalBoost, 42, 72);

  const signals = [
    `${projects.length} visible fundraising round(s) in the returned set.`,
    parsedAmountCount
      ? `Parsed indicative raise from ${parsedAmountCount} line(s): ~$${round(totalUsd / 1e6, 1)}M (USD, heuristic).`
      : 'Round sizes were not machine-parseable from amount fields.'
  ];

  const risks = [];
  if (projects.length >= 12) risks.push('Very busy VC weeks can correlate with later token unlock / supply pressure.');
  if (parsedAmountCount > 0 && totalUsd >= 2e9) risks.push('Large aggregate raises can precede crowded launches and execution risk.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, projects.length >= 10 ? 48 : 38),
    confidence: projects.length >= 8 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      projectCount: projects.length,
      parsedAmountCount,
      totalRaiseUsdEstimate: totalUsd > 0 ? round(totalUsd, 0) : null
    },
    scoreBreakdown: [
      makeBreakdown('base', 50, 'Neutral baseline.'),
      flowBoost
        ? makeBreakdown('round count', flowBoost, 'More disclosed rounds imply a warmer primary-market tape.', {
          projectCount: projects.length
        })
        : null,
      capitalBoost
        ? makeBreakdown('parsed capital', capitalBoost, 'Larger aggregated raises nudge the risk-on tilt.', {
          totalRaiseUsdEstimate: round(totalUsd, 0)
        })
        : null
    ].filter(Boolean),
    caveats: ['Fundraising labels are noisy; amounts may omit undisclosed tranches.'],
    scoreMeaning: 'private-market activity as risk-appetite context, not a token recommendation'
  });
};

const analyzeBtcTreasuryBrief = (toolName, data) => {
  const companies = asArray(data?.companies);
  if (!companies.length) {
    return buildAnalysis({
      toolName,
      label: 'neutral',
      score: 50,
      riskScore: 38,
      confidence: 'low',
      signals: ['No public corporate BTC treasury filers were returned.'],
      risks: [],
      metrics: { companyCount: 0, jurisdictionCount: 0 },
      scoreBreakdown: [makeBreakdown('base', 50, 'Empty treasury list.')],
      caveats: ['Treasury list is a disclosure snapshot, not an on-chain proof-of-reserves audit.'],
      scoreMeaning: 'corporate adoption breadth as structural context, not a trading signal'
    });
  }

  const jurisdictions = new Set(companies.map((c) => c.list_location).filter(Boolean)).size;
  const score = clamp(50 + Math.min(companies.length, 12), 45, 68);

  const tickers = companies
    .map((c) => c.ticker)
    .filter(Boolean)
    .slice(0, 6)
    .join(', ');

  const signals = [
    `${companies.length} public filer(s) with BTC treasury programs in this list.`,
    jurisdictions ? `${jurisdictions} distinct listing jurisdiction(s) in the sample.` : 'Jurisdiction metadata was sparse.',
    tickers ? `Examples: ${tickers}.` : ''
  ].filter(Boolean);

  const risks = [];
  if (companies.length <= 3) risks.push('Thin filer count can overstate concentration in a single name or region.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, 36),
    confidence: companies.length >= 8 ? 'medium' : 'low',
    signals,
    risks,
    metrics: { companyCount: companies.length, jurisdictionCount: jurisdictions },
    scoreBreakdown: [
      makeBreakdown('base', 50, 'Neutral baseline.'),
      makeBreakdown('adoption breadth', score - 50, 'More tracked corporate treasuries imply deeper structural BTC demand.', {
        companyCount: companies.length
      })
    ],
    caveats: ['Does not value-size holdings; concentration in top names is not modeled here.'],
    scoreMeaning: 'corporate adoption breadth as structural context, not a trading signal'
  });
};

const analyzeBtcPurchaseHistoryBrief = (toolName, data) => {
  const purchases = asArray(data?.purchases);
  const ticker = data?.companyTicker || null;

  if (!purchases.length) {
    return buildAnalysis({
      toolName,
      label: 'neutral',
      score: 50,
      riskScore: 40,
      confidence: 'low',
      signals: [`No BTC purchase records returned for ${ticker || 'the requested ticker'}.`],
      risks: [],
      metrics: { purchaseCount: 0, totalBtcParsed: null, recentPurchaseCount180d: 0 },
      scoreBreakdown: [makeBreakdown('base', 50, 'Empty purchase history.')],
      caveats: ['Purchase rows vary by upstream schema; BTC totals may be incomplete.'],
      scoreMeaning: 'reported treasury accumulation cadence, not investment advice'
    });
  }

  const amounts = purchases.map(getPurchaseBtcAmount).filter((v) => v !== null && v > 0);
  const totalBtc = amounts.length ? amounts.reduce((a, b) => a + b, 0) : null;

  const now = Date.now();
  const windowMs = 180 * 24 * 60 * 60 * 1000;
  const recentCount = purchases.filter((row) => {
    const t = getPurchaseDateMs(row);
    return t !== null && now - t <= windowMs && now - t >= 0;
  }).length;

  let score = 50;
  const scoreBreakdown = [makeBreakdown('base', 50, 'Neutral baseline.')];
  if (totalBtc !== null && totalBtc > 0) {
    const bump = Math.min(Math.round(totalBtc / 800), 12);
    if (bump) {
      score += bump;
      scoreBreakdown.push(
        makeBreakdown('disclosed BTC volume', bump, 'Larger cumulative disclosed purchases tilt constructive.', {
          totalBtcParsed: round(totalBtc, 2)
        })
      );
    }
  }
  if (recentCount > 0) {
    const bump = Math.min(recentCount * 2, 8);
    score += bump;
    scoreBreakdown.push(
      makeBreakdown('recent activity', bump, 'Purchases inside ~180d imply ongoing accumulation cadence.', {
        recentPurchaseCount180d: recentCount
      })
    );
  }
  if (amounts.length === 0 && purchases.length > 0) {
    scoreBreakdown.push(
      makeBreakdown('parse coverage', 0, 'Rows present but BTC amounts were not machine-readable from known fields.')
    );
  }

  score = clamp(score, 42, 72);

  const signals = [
    `${purchases.length} purchase row(s) for ${ticker || 'company'}.`,
    totalBtc !== null ? `Parsed cumulative BTC (heuristic): ~${round(totalBtc, 2)} BTC across ${amounts.length} line(s).` : 'BTC sizes not parsed from payload fields.',
    recentCount ? `${recentCount} row(s) dated within the last ~180 days.` : 'No dated purchases fell in the last ~180 days (or dates were missing).'
  ];

  const risks = [];
  if (purchases.length >= 15) risks.push('Long purchase logs can include restatements or multiple tranches—verify against filings.');
  if (amounts.length === 0) risks.push('Without parsed BTC sizes, cadence analysis is qualitative only.');

  return buildAnalysis({
    toolName,
    label: directionalLabel(score),
    score,
    riskScore: estimateRiskScore(risks, recentCount >= 3 ? 52 : 40),
    confidence: purchases.length >= 6 ? 'medium' : 'low',
    signals,
    risks,
    metrics: {
      purchaseCount: purchases.length,
      totalBtcParsed: totalBtc !== null ? round(totalBtc, 4) : null,
      parsedAmountLineCount: amounts.length,
      recentPurchaseCount180d: recentCount,
      companyTicker: ticker
    },
    scoreBreakdown,
    caveats: ['Uses best-effort field mapping for BTC amounts and dates.'],
    scoreMeaning: 'reported treasury accumulation cadence, not investment advice'
  });
};

const analyzeDefault = (toolName, data) => {
  const itemCount = Array.isArray(data)
    ? data.length
    : asArray(data?.items).length || asArray(data?.sectors).length || asArray(data?.companies).length || asArray(data?.projects).length;

  return buildAnalysis({
    toolName,
    label: 'neutral',
    score: 50,
    confidence: itemCount > 0 ? 'low' : 'low',
    signals: itemCount > 0 ? [`Returned ${itemCount} structured records for review.`] : [],
    metrics: { itemCount },
    scoreBreakdown: [makeBreakdown('base', 50, 'No dedicated deterministic scoring model is configured for this tool.')],
    caveats: ['No dedicated deterministic scoring model is configured for this tool yet.']
  });
};

const analyzeToolResult = (toolName, data, args = {}) => {
  let analysis;
  switch (toolName) {
    case 'get_asset_snapshot':
      analysis = analyzeSnapshot(toolName, data, args);
      break;
    case 'compare_assets':
      analysis = analyzeCompareAssets(toolName, data);
      break;
    case 'get_asset_price_history':
      analysis = analyzePriceHistory(toolName, data, args);
      break;
    case 'get_etf_flow_brief':
      analysis = analyzeEtfFlows(toolName, data, args);
      break;
    case 'get_asset_news_brief':
    case 'get_hot_news_digest':
      analysis = analyzeNews(toolName, data, args);
      break;
    case 'get_token_economics':
      analysis = analyzeTokenomics(toolName, data, args);
      break;
    case 'get_wallet_holdings':
      analysis = analyzePortfolio(toolName, data, args);
      break;
    case 'get_trading_pairs':
      analysis = analyzeTradingPairs(toolName, data, args);
      break;
    case 'get_macro_event_history':
      analysis = analyzeMacroEventHistory(toolName, data, args);
      break;
    case 'get_sector_spotlight':
      analysis = analyzeSectorSpotlight(toolName, data);
      break;
    case 'get_crypto_equities_watchlist':
      analysis = analyzeCryptoEquitiesWatchlist(toolName, data);
      break;
    case 'get_index_overview':
      analysis = analyzeIndexOverview(toolName, data);
      break;
    case 'get_macro_crypto_calendar':
      analysis = analyzeMacroCryptoCalendar(toolName, data);
      break;
    case 'get_fundraising_overview':
      analysis = analyzeFundraisingOverview(toolName, data);
      break;
    case 'get_btc_treasury_brief':
      analysis = analyzeBtcTreasuryBrief(toolName, data);
      break;
    case 'get_btc_purchase_history_brief':
      analysis = analyzeBtcPurchaseHistoryBrief(toolName, data);
      break;
    default:
      analysis = analyzeDefault(toolName, data, args);
  }

  return {
    ...analysis,
    dataFreshness: getDataFreshness(data)
  };
};

module.exports = {
  METHOD_VERSION,
  analyzeToolResult,
  getDataFreshness,
  toNumber
};
