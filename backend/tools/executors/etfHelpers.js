const { asArray } = require('../../normalizers/toolResult');
const { normalizeEtfAssetSymbol } = require('../../clients/soso');

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
    total_net_flow: item.totalNetInflow ?? item.total_net_flow ?? item.totalNetFlow ?? item.netFlow,
    total_value_traded: item.totalValueTraded ?? item.total_value_traded,
    total_net_assets: item.totalNetAssets ?? item.total_net_assets,
    cum_net_inflow: item.cumNetInflow ?? item.cum_net_inflow
  }));

  normalized.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  const flows = historyData.map((item) => Number(item.total_net_flow ?? 0));
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

module.exports = {
  getEtfType,
  getEtfMetricValue,
  getSosoList,
  normalizeEtfHistory,
  normalizeEtfMetricItem,
  buildEtfFlowAnalytics
};
