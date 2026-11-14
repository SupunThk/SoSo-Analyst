import { asArray } from '../../normalizers/toolResult.ts';

const normalizeEtfHistory = (records, days) => {
  const normalized = asArray(records).map((item) => ({
    date: item.date,
    total_net_flow: item.totalNetInflow ?? item.total_net_inflow ?? item.total_net_flow ?? item.totalNetFlow ?? item.netFlow,
    total_value_traded: item.totalValueTraded ?? item.total_value_traded,
    total_net_assets: item.totalNetAssets ?? item.total_net_assets,
    cum_net_inflow: item.cumNetInflow ?? item.cum_net_inflow
  }));

  normalized.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // If a row lacks the daily flow, derive it from the day-over-day change in
  // cumulative inflow; the oldest record has no baseline.
  const toNumber = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  normalized.forEach((item, index) => {
    if (toNumber(item.total_net_flow) !== null) return;
    const current = toNumber(item.cum_net_inflow);
    const previous = index > 0 ? toNumber(normalized[index - 1].cum_net_inflow) : null;
    item.total_net_flow = current !== null && previous !== null ? current - previous : null;
  });

  return normalized.slice(-days);
};


const buildEtfFlowAnalytics = (historyData) => {
  const flows = historyData
    .map((item) => item.total_net_flow)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const totalNetFlow = flows.reduce((sum, value) => sum + value, 0);
  const avgDailyFlow = flows.length ? totalNetFlow / flows.length : 0;
  let streak = 0;
  const streakDirection = flows.length && flows[flows.length - 1] >= 0 ? 'inflow' : 'outflow';

  for (let i = flows.length - 1; i >= 0; i--) {
    if ((streakDirection === 'inflow' && flows[i] >= 0) || (streakDirection === 'outflow' && flows[i] < 0)) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalNetFlow,
    avgDailyFlow: Math.round(avgDailyFlow),
    flowTrend: totalNetFlow > 0 ? 'net_inflow' : totalNetFlow < 0 ? 'net_outflow' : 'flat',
    consecutiveStreak: `${streak} days of ${streakDirection}`,
    dataPoints: flows.length
  };
};

export { normalizeEtfHistory, buildEtfFlowAnalytics };
