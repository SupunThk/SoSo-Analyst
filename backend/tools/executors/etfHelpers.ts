import { asArray } from '../../normalizers/toolResult.ts';
import { normalizeEtfAssetSymbol } from '../../clients/soso.ts';

const getEtfType = (assetSymbol) => {
  const symbol = normalizeEtfAssetSymbol(assetSymbol);
  return symbol === 'ETH' ? 'us-eth-spot' : 'us-btc-spot';
};

const getEtfMetricValue = (metric) =>
  metric && typeof metric === 'object' && Object.prototype.hasOwnProperty.call(metric, 'value')
    ? metric.value
    : metric;

const getSosoList = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.list)) return payload.list;
  return [];
};

const normalizeEtfHistory = (records, days) => {
  const normalized = asArray(records).map((item) => ({
    date: item.date,
    total_net_flow: item.totalNetInflow ?? item.total_net_inflow ?? item.total_net_flow ?? item.totalNetFlow ?? item.netFlow,
    total_value_traded: item.totalValueTraded ?? item.total_value_traded,
    total_net_assets: item.totalNetAssets ?? item.total_net_assets,
    cum_net_inflow: item.cumNetInflow ?? item.cum_net_inflow
  }));

  normalized.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // The legacy ETF endpoint (used when v2 fails) only returns the cumulative inflow.
  // Daily flow is then the day-over-day change; the oldest record has no baseline.
  const toNumber = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  normalized.forEach((item, index) => {
    if (toNumber(item.total_net_flow) !== null) return;
    const current = toNumber(item.cum_net_inflow);
    const previous = index > 0 ? toNumber(normalized[index - 1].cum_net_inflow) : null;
    item.total_net_flow = current !== null && previous !== null ? current - previous : null;
  });

  return normalized.slice(-days);
};

const normalizeEtfMetricItem = (item) => ({
  ticker: item.ticker,
  institute: item.institute,
  net_assets: getEtfMetricValue(item.netAssets),
  net_assets_percentage: getEtfMetricValue(item.netAssetsPercentage),
  daily_net_inflow: getEtfMetricValue(item.dailyNetInflow),
  cumulative_net_inflow: getEtfMetricValue(item.cumNetInflow),
  daily_value_traded: getEtfMetricValue(item.dailyValueTraded),
  fee: getEtfMetricValue(item.fee),
  discount_premium_rate: getEtfMetricValue(item.discountPremiumRate),
  status: {
    net_assets: item.netAssets?.status,
    daily_net_inflow: item.dailyNetInflow?.status,
    cumulative_net_inflow: item.cumNetInflow?.status,
    daily_value_traded: item.dailyValueTraded?.status
  },
  lastUpdateDate: item.dailyNetInflow?.lastUpdateDate || item.netAssets?.lastUpdateDate || item.cumNetInflow?.lastUpdateDate
});

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

export {
  getEtfType,
  getEtfMetricValue,
  getSosoList,
  normalizeEtfHistory,
  normalizeEtfMetricItem,
  buildEtfFlowAnalytics
};
