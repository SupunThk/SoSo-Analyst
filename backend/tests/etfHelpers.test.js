const { normalizeEtfHistory, buildEtfFlowAnalytics } = require('../tools/executors/etfHelpers');

describe('ETF flow history', () => {
  it('derives daily flow from cumulative inflow when the endpoint omits it (legacy v1)', () => {
    const history = normalizeEtfHistory([
      { date: '2026-11-11', cum_net_inflow: 1000 },
      { date: '2026-11-09', cum_net_inflow: 1200 },
      { date: '2026-11-10', cum_net_inflow: 1100 },
      { date: '2026-11-12', cum_net_inflow: 1050 }
    ], 3);

    expect(history.map((row) => row.total_net_flow)).toEqual([-100, -100, 50]);

    const analytics = buildEtfFlowAnalytics(history);
    expect(analytics.totalNetFlow).toBe(-150);
    expect(analytics.flowTrend).toBe('net_outflow');
    expect(analytics.consecutiveStreak).toBe('1 days of inflow');
  });

  it('keeps reported daily flows and skips days with no data instead of counting them as zero', () => {
    const history = normalizeEtfHistory([
      { date: '2026-11-09', totalNetInflow: -40 },
      { date: '2026-11-10', cum_net_inflow: 500 }
    ], 5);

    expect(history.map((row) => row.total_net_flow)).toEqual([-40, null]);
    const analytics = buildEtfFlowAnalytics(history);
    expect(analytics.dataPoints).toBe(1);
    expect(analytics.consecutiveStreak).toBe('1 days of outflow');
  });

  it('reads the legacy endpoint snake_case total_net_inflow', () => {
    const history = normalizeEtfHistory([
      { date: '2026-11-12', total_net_inflow: -283997508, cum_net_inflow: 54818561082 },
      { date: '2026-11-13', total_net_inflow: -185450233, cum_net_inflow: 54633110848 }
    ], 5);
    const analytics = buildEtfFlowAnalytics(history);
    expect(analytics.totalNetFlow).toBe(-469447741);
    expect(analytics.consecutiveStreak).toBe('2 days of outflow');
  });
});
