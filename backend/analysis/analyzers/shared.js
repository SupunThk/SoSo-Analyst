// Scoring primitives shared by every analyzer: number parsing, score/label/confidence
// helpers, data-freshness detection and the common analysis envelope.
const METHOD_VERSION = 'deterministic-analysis-v1';
const { asArray } = require('../../utils/common');

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

/**
 * @typedef {object} AnalysisInput
 * @property {string} toolName
 * @property {string} [label]
 * @property {number} [score]
 * @property {number} [signalScore]
 * @property {number} [riskScore]
 * @property {string} [confidence]
 * @property {string[]} [signals]
 * @property {string[]} [risks]
 * @property {Record<string, any>} [metrics]
 * @property {string[]} [caveats]
 * @property {Array<{ factor: string, impact: number, reason: string, metrics?: Record<string, any> }>} [scoreBreakdown]
 * @property {{ latestTimestamp: string | null, ageMinutes: number | null, status: string }} [dataFreshness]
 * @property {string} [scoreMeaning]
 */

/** @param {AnalysisInput} input */
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

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'TUSD', 'USDP', 'PYUSD', 'FDUSD', 'USDE']);

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

module.exports = {
  METHOD_VERSION,
  clamp,
  round,
  toNumber,
  getFirstNumber,
  parseLooseUsdAmount,
  getPurchaseBtcAmount,
  getPurchaseDateMs,
  getMacroEventDateMs,
  MACRO_HIGH_IMPACT_RE,
  isHighImpactMacroEvent,
  directionalLabel,
  confidenceFromCoverage,
  SCORE_BANDS,
  makeBreakdown,
  estimateRiskScore,
  TIMESTAMP_KEYS,
  collectTimestamps,
  getDataFreshness,
  buildAnalysis,
  scorePriceChange,
  formatPercent,
  BULLISH_NEWS_TERMS,
  BEARISH_NEWS_TERMS,
  HIGH_IMPORTANCE_NEWS_TERMS,
  SEVERE_BEARISH_NEWS_TERMS,
  STABLECOIN_SYMBOLS,
  analyzeDefault
};
