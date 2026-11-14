// Token economics and wallet portfolios.
import { asArray } from '../../utils/common.ts';
import {
  clamp,
  round,
  getFirstNumber,
  directionalLabel,
  makeBreakdown,
  estimateRiskScore,
  buildAnalysis,
  formatPercent,
  STABLECOIN_SYMBOLS
} from './shared.ts';

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

export { analyzeTokenomics, analyzePortfolio };
