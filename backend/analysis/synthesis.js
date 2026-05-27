const SYNTHESIS_METHOD_VERSION = 'cross-tool-synthesis-v1';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const confidenceWeight = (confidence) => {
  if (confidence === 'high') return 1;
  if (confidence === 'medium') return 0.7;
  return 0.4;
};

const toolWeight = (tool) => {
  switch (tool) {
    case 'get_asset_price_history':
    case 'get_asset_snapshot':
    case 'compare_assets':
      return 1;
    case 'get_index_overview':
    case 'get_crypto_equities_watchlist':
      return 0.9;
    case 'get_sector_spotlight':
      return 0.75;
    case 'get_macro_crypto_calendar':
      return 0.7;
    case 'get_btc_treasury_brief':
    case 'get_btc_purchase_history_brief':
      return 0.6;
    case 'get_fundraising_overview':
      return 0.55;
    case 'get_etf_flow_brief':
      return 0.95;
    case 'get_token_economics':
    case 'get_trading_pairs':
      return 0.75;
    case 'get_asset_news_brief':
    case 'get_hot_news_digest':
      return 0.55;
    case 'get_macro_event_history':
      return 0.65;
    case 'get_wallet_holdings':
      return 0.8;
    default:
      return 0.45;
  }
};

const average = (items) => {
  if (!items.length) return null;
  return items.reduce((sum, item) => sum + item, 0) / items.length;
};

const getOverallLabel = (directionalScore, riskScore, conflictCount) => {
  if (directionalScore >= 65 && riskScore >= 70) return 'bullish_high_risk';
  if (directionalScore >= 65 && conflictCount > 0) return 'mixed_bullish';
  if (directionalScore >= 65) return 'bullish';
  if (directionalScore <= 40 && conflictCount > 0) return 'mixed_bearish';
  if (directionalScore <= 40) return 'bearish';
  if (riskScore >= 70) return 'neutral_high_risk';
  return 'mixed_neutral';
};

const getOverallConfidence = (analyses, totalWeight) => {
  if (analyses.length >= 3 && totalWeight >= 2.2) return 'high';
  if (analyses.length >= 2 && totalWeight >= 1.1) return 'medium';
  return 'low';
};

const collectFreshness = (analyses) => {
  const known = analyses
    .map((analysis) => analysis.dataFreshness)
    .filter((freshness) => freshness && freshness.status !== 'unknown');

  if (!known.length) {
    return {
      status: 'unknown',
      staleTools: [],
      oldestAgeMinutes: null
    };
  }

  const staleTools = analyses
    .filter((analysis) => ['stale'].includes(analysis.dataFreshness?.status))
    .map((analysis) => analysis.tool);
  const oldestAgeMinutes = Math.max(...known.map((freshness) => freshness.ageMinutes || 0));

  return {
    status: staleTools.length ? 'stale' : known.some((freshness) => freshness.status === 'recent') ? 'recent' : 'fresh',
    staleTools,
    oldestAgeMinutes
  };
};

const combineToolAnalyses = (analyses = []) => {
  const validAnalyses = analyses
    .filter((analysis) => analysis && !analysis.error)
    .filter((analysis) => Number.isFinite(Number(analysis.directionalScore ?? analysis.score)));

  if (!validAnalyses.length) {
    return {
      method: SYNTHESIS_METHOD_VERSION,
      overallLabel: 'insufficient_data',
      directionalScore: null,
      riskScore: null,
      confidence: 'low',
      analyzedTools: 0,
      thesis: [],
      conflicts: ['No successful deterministic tool analyses were available.'],
      riskFlags: [],
      scoreBreakdown: []
    };
  }

  let weightedDirectionalSum = 0;
  let totalDirectionalWeight = 0;
  let weightedRiskSum = 0;
  let totalRiskWeight = 0;

  const scoreBreakdown = [];
  for (const analysis of validAnalyses) {
    const weight = confidenceWeight(analysis.confidence) * toolWeight(analysis.tool);
    const directionalScore = Number(analysis.directionalScore ?? analysis.score);
    const riskScore = Number(analysis.riskScore ?? 50);

    weightedDirectionalSum += directionalScore * weight;
    totalDirectionalWeight += weight;
    weightedRiskSum += riskScore * weight;
    totalRiskWeight += weight;

    scoreBreakdown.push({
      tool: analysis.tool,
      label: analysis.label,
      confidence: analysis.confidence,
      weight: round(weight),
      directionalScore: round(directionalScore),
      riskScore: round(riskScore)
    });
  }

  const directionalScore = clamp(Math.round(weightedDirectionalSum / totalDirectionalWeight), 0, 100);
  const riskScore = clamp(Math.round(weightedRiskSum / totalRiskWeight), 0, 100);
  const bullishTools = validAnalyses.filter((analysis) => Number(analysis.directionalScore ?? analysis.score) >= 65);
  const bearishTools = validAnalyses.filter((analysis) => Number(analysis.directionalScore ?? analysis.score) <= 40);
  const highRiskTools = validAnalyses.filter((analysis) => Number(analysis.riskScore ?? 0) >= 70);
  const conflicts = [];

  if (bullishTools.length && bearishTools.length) {
    conflicts.push(`Directional conflict: ${bullishTools.map((item) => item.tool).join(', ')} supportive while ${bearishTools.map((item) => item.tool).join(', ')} bearish.`);
  }
  if (directionalScore >= 65 && highRiskTools.length) {
    conflicts.push(`Supportive signal is paired with elevated risk from ${highRiskTools.map((item) => item.tool).join(', ')}.`);
  }

  const freshness = collectFreshness(validAnalyses);
  if (freshness.status === 'stale') {
    conflicts.push(`Some data is stale: ${freshness.staleTools.join(', ')}.`);
  }

  const topSignals = validAnalyses
    .flatMap((analysis) => analysis.signals.map((signal) => ({ signal, score: Number(analysis.directionalScore ?? analysis.score), tool: analysis.tool })))
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 5)
    .map((item) => `${item.tool}: ${item.signal}`);

  const riskFlags = validAnalyses
    .flatMap((analysis) => analysis.risks.map((risk) => ({ risk, riskScore: Number(analysis.riskScore ?? 0), tool: analysis.tool })))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6)
    .map((item) => `${item.tool}: ${item.risk}`);

  return {
    method: SYNTHESIS_METHOD_VERSION,
    overallLabel: getOverallLabel(directionalScore, riskScore, conflicts.length),
    directionalScore,
    riskScore,
    confidence: getOverallConfidence(validAnalyses, totalDirectionalWeight),
    analyzedTools: validAnalyses.length,
    toolLabels: Object.fromEntries(validAnalyses.map((analysis) => [analysis.tool, analysis.label])),
    thesis: topSignals,
    conflicts,
    riskFlags,
    freshness,
    scoreBreakdown,
    metrics: {
      averageToolDirectionalScore: round(average(validAnalyses.map((analysis) => Number(analysis.directionalScore ?? analysis.score)))),
      averageToolRiskScore: round(average(validAnalyses.map((analysis) => Number(analysis.riskScore ?? 50)))),
      bullishToolCount: bullishTools.length,
      bearishToolCount: bearishTools.length,
      highRiskToolCount: highRiskTools.length
    }
  };
};

module.exports = {
  SYNTHESIS_METHOD_VERSION,
  combineToolAnalyses
};
