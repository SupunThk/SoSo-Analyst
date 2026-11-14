// Pure scoring: market regime, sector rotation, opportunity scanner, alert engine.
import { asArray, normalizeLookupValue } from '../../normalizers/toolResult.ts';
import {
  clamp,
  toNumber,
  round,
  mean,
  formatPct
} from './shared.ts';

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

  // ── Risk Score (0 = low risk, 100 = extreme risk) ──
  const breadthRisk = clamp((1 - breadthPct / 100) * 40, 0, 40);
  const dispersionRisk = clamp((dispersion / 10) * 20, 0, 20);
  const btcDrawdownRisk = btc?.high24h && btc?.price
    ? clamp(((btc.high24h - btc.price) / btc.high24h) * 100 * 3, 0, 20)
    : 0;
  const defensiveRisk = (stable?.marketcapDomPct >= 10 && broadAverage < 0) ? 15 : 0;
  const negativeAvgRisk = broadAverage < 0 ? clamp(Math.abs(broadAverage) * 3, 0, 15) : 0;
  const riskScore = Math.round(clamp(breadthRisk + dispersionRisk + btcDrawdownRisk + defensiveRisk + negativeAvgRisk, 0, 100));
  const riskLevel = riskScore <= 30 ? 'low' : riskScore <= 60 ? 'moderate' : riskScore <= 80 ? 'elevated' : 'high';

  return {
    label,
    score: Math.round(score),
    confidence: Math.round(confidence),
    riskScore,
    riskLevel,
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

const buildOpportunityScanner = ({
  assets = [],
  sectors = [],
  indices = [],
  sodex = {}
}: { assets?: any[]; sectors?: any[]; indices?: any[]; sodex?: Record<string, any> }) => {
  const opportunities = [];
  const btc = assets.find((asset) => asset.symbol === 'BTC');
  const btcChange = getRowChange(btc);
  const sectorLookup = new Map(sectors.map((row) => [normalizeLookupValue(row.name), row]));
  const sodexLookup = new Map<string, any>((sodex.tracked || []).map((row) => [row.symbol, row]));

  assets.forEach((asset) => {
    const change = getRowChange(asset);
    if (change === null) return;
    const benchmark = asset.symbol === 'BTC' ? null : btcChange;
    const relative = benchmark === null || benchmark === undefined ? null : change - benchmark;
    const sodexRow = sodexLookup.get(asset.symbol);
    const perps = sodexRow?.perps;
    const spread = perps?.spreadPct ?? sodexRow?.spot?.spreadPct;
    const liquidity = perps?.quoteVolume24h ?? sodexRow?.spot?.quoteVolume24h;

    // Risk context fields
    const high24h = toNumber(asset.high24h);
    const low24h = toNumber(asset.low24h);
    const range24h = high24h !== null && low24h !== null && low24h > 0
      ? ((high24h - low24h) / low24h) * 100
      : null;
    const volatilityContext = range24h !== null
      ? (range24h >= 5 ? 'high 24h range' : range24h >= 2 ? 'moderate range' : 'tight range')
      : null;
    const liquidityRisk = spread !== null
      ? (spread >= 0.1 ? 'wide spread — low liquidity' : spread >= 0.05 ? 'moderate liquidity' : 'tight spread — good liquidity')
      : (liquidity !== null ? (liquidity < 50000 ? 'low volume' : 'adequate volume') : null);
    const correlationNote = relative !== null
      ? (Math.abs(relative) < 0.5 ? 'moving with BTC' : relative > 0 ? 'decoupling bullish vs BTC' : 'decoupling bearish vs BTC')
      : null;

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
        nextStep: `Monitor ${asset.symbol} versus BTC and confirm SoDEX depth before sizing.`,
        volatilityContext,
        liquidityRisk,
        correlationNote
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
        nextStep: `Do not treat weakness as a short setup unless trend and order-book pressure agree.`,
        volatilityContext,
        liquidityRisk,
        correlationNote
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

const buildAlertEngine = ({
  regime,
  sectors = [],
  assets = [],
  rotation = {},
  sodex = {}
}: {
  regime: any;
  sectors?: any[];
  assets?: any[];
  rotation?: Record<string, any>;
  sodex?: Record<string, any>;
}) => {
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

export {
  buildRotationSignals,
  classifyMarketRegime,
  buildOpportunityScanner,
  buildAlertEngine
};
