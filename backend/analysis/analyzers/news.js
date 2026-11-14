// News and macro calendar / event history.
const { asArray } = require('../../utils/common');
const {
  clamp,
  round,
  getFirstNumber,
  getMacroEventDateMs,
  isHighImpactMacroEvent,
  directionalLabel,
  makeBreakdown,
  estimateRiskScore,
  buildAnalysis,
  BULLISH_NEWS_TERMS,
  BEARISH_NEWS_TERMS,
  HIGH_IMPORTANCE_NEWS_TERMS,
  SEVERE_BEARISH_NEWS_TERMS
} = require('./shared');

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

module.exports = {
  analyzeNews,
  analyzeMacroEventHistory,
  analyzeMacroCryptoCalendar
};
