// Capital flows: ETF flows, fundraising, BTC treasuries and purchases.
const { asArray } = require('../../utils/common');
const {
  clamp,
  round,
  getFirstNumber,
  parseLooseUsdAmount,
  getPurchaseBtcAmount,
  getPurchaseDateMs,
  directionalLabel,
  makeBreakdown,
  estimateRiskScore,
  buildAnalysis
} = require('./shared');

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

module.exports = {
  analyzeEtfFlows,
  analyzeFundraisingOverview,
  analyzeBtcTreasuryBrief,
  analyzeBtcPurchaseHistoryBrief
};
