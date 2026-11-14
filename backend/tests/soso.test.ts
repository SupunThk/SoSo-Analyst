// SoSoValue client and tool executors, against the documented Open API v1
// response shapes (https://sosovalue-1.gitbook.io/sosovalue-api-doc).
import assert from 'node:assert/strict';
import axios from 'axios';

const originalAxiosGet = axios.get;
const BTC_ID = '1673723677362319866';
const ETH_ID = '1673723677362319867';

const ok = (data) => ({ data: { code: 0, message: 'success', data } });

const CURRENCIES = [
  { currency_id: BTC_ID, symbol: 'btc', name: 'Bitcoin' },
  { currency_id: ETH_ID, symbol: 'eth', name: 'Ethereum' }
];

// Routes GET requests by path (relative to /openapi/v1); unknown paths fail the test.
const mockSoso = (routes: Record<string, (params: any) => any>) => {
  const calls: { path: string; params: any }[] = [];
  (axios as any).get = async (url, options: Record<string, any> = {}) => {
    const path = url.replace('https://openapi.sosovalue.com/openapi/v1', '');
    calls.push({ path, params: options.params });
    if (path === '/currencies' && !routes['/currencies']) return ok(CURRENCIES);
    const handler = routes[path];
    if (!handler) throw new Error(`Unexpected GET ${path}`);
    return handler(options.params || {});
  };
  return calls;
};

const loadExecutor = async () => {
  vi.resetModules();
  process.env.SOSO_API_KEY = 'test-soso-key';
  return (await import('../tools/executors/index.ts')).executeTool;
};

const testCurrencyCatalogUsesDocumentedList = async () => {
  const calls = mockSoso({});
  vi.resetModules();
  process.env.SOSO_API_KEY = 'test-soso-key';
  const { resolveCurrencyId } = await import('../clients/soso.ts');
  const btc = await resolveCurrencyId('btc');

  assert.equal(btc.currency_id, BTC_ID);
  assert.equal(btc.name, 'Bitcoin');
  assert.equal(btc.symbol, 'BTC');
  assert.deepEqual(calls.map((c) => c.path), ['/currencies']);
};

const testLargeCurrencyIdsArePreservedAsStrings = async () => {
  vi.resetModules();
  const { parseSosoJsonPreservingLargeIds } = await import('../clients/soso.ts');
  const parsed = parseSosoJsonPreservingLargeIds(
    '{"code":0,"data":[{"currencyName":"btc","currencyId":1673723677362319866},{"currencyName":"eth","currencyId":1673723677362319867}]}'
  );

  assert.equal(parsed.data[0].currencyId, BTC_ID);
  assert.equal(parsed.data[1].currencyId, ETH_ID);
  assert.notEqual(parsed.data[0].currencyId, parsed.data[1].currencyId);
};

const testEtfFlowBriefUsesSummaryHistoryLimit = async () => {
  const calls = mockSoso({
    '/etfs': () => ok([{ ticker: 'IBIT', name: 'iShares Bitcoin Trust', exchange: 'NASDAQ' }]),
    // Newest first, as the API returns it.
    '/etfs/summary-history': () => ok([
      { date: '2024-01-03', total_net_inflow: 75, total_value_traded: 1200, total_net_assets: 9200, cum_net_inflow: 125 },
      { date: '2024-01-02', total_net_inflow: -50, total_value_traded: 1100, total_net_assets: 9100, cum_net_inflow: 50 },
      { date: '2024-01-01', total_net_inflow: 100, total_value_traded: 1000, total_net_assets: 9000, cum_net_inflow: 100 }
    ]),
    '/etfs/IBIT/market-snapshot': () => ok({ date: '2024-01-03', ticker: 'IBIT', net_inflow: 50, cum_inflow: 100, net_assets: 5000, mkt_price: 38.9, prem_dsc: -0.0016, value_traded: 700, sponsor_fee: 0.0025 })
  });

  const executeTool = await loadExecutor();
  const result = await executeTool('get_etf_flow_brief', { assetSymbol: 'BTC', days: 2 });

  assert.equal(result.status, 'success');
  const history = calls.find((c) => c.path === '/etfs/summary-history');
  assert.equal(history.params.limit, 3);
  assert.equal(history.params.days, undefined);
  const preview = result.payload.dataPreview;
  assert.equal(preview.sourceEndpoint, 'openapi/v1/etfs');
  assert.equal(preview.aggregate.date, '2024-01-03');
  assert.equal(preview.aggregate.totalNetAssets, 9200);
  assert.equal(result.payload.analysis.metrics.sampleDays, 2);
  assert.equal(result.payload.analysis.metrics.totalNetFlow, 25);
  assert.equal(result.payload.analysis.metrics.latestDirection, 'inflow');
};

const testSnapshotFractionsBecomePercents = async () => {
  mockSoso({
    [`/currencies/${BTC_ID}/market-snapshot`]: () => ok({
      price: 65421.56, change_pct_24h: -0.0506, turnover_24h: 36864679541, marketcap: 1315754293161,
      max_supply: '21000000', circulating_supply: '20111937', ath: 126199.63, down_from_ath: 0.48, marketcap_rank: 1
    })
  });

  const executeTool = await loadExecutor();
  const result = await executeTool('get_asset_snapshot', { asset: 'btc' });
  const snapshot = result.payload.dataPreview.snapshot;

  assert.equal(snapshot.change_pct_24h, -5.06);
  assert.equal(snapshot.ath_change_pct, -48);
  assert.equal(snapshot.volume_24h, 36864679541);
  assert.equal(snapshot.circulating_supply, 20111937);
  assert.ok(result.payload.analysis.signals.some((signal) => signal.includes('-5.06%')));
};

const testTradingPairsReadPaginatedList = async () => {
  mockSoso({
    [`/currencies/${BTC_ID}/pairs`]: () => ok({
      list: [{ base: 'BTC', target: 'USDT', market: 'Binance', price: 65412.72, turnover_24h: 1704684936, cost_to_move_up_usd: 25762068, cost_to_move_down_usd: 38224689 }],
      page: 1,
      page_size: 1,
      total: 1239
    })
  });

  const executeTool = await loadExecutor();
  const result = await executeTool('get_trading_pairs', { asset: 'btc', limit: 1 });
  const preview = result.payload.dataPreview;

  assert.equal(preview.totalPairs, 1239);
  assert.equal(preview.pairs[0].exchange, 'Binance');
  assert.equal(preview.pairs[0].pair, 'BTC/USDT');
  assert.equal(preview.pairs[0].cost_to_move_down_usd, 38224689);
};

const testMacroHistoryResolvesAliasAndScoresLatestRelease = async () => {
  const calls = mockSoso({
    [`/macro/events/${encodeURIComponent('CPI (YoY)')}/history`]: () => ok([
      { date: '2026-11-13', actual: '', forecast: '3.5%', previous: '3.7%' },
      { date: '2026-10-14', actual: '3.7%', forecast: '3.6%', previous: '3.4%' },
      { date: '2026-09-11', actual: '3.4%', forecast: '3.5%', previous: '3.3%' }
    ])
  });

  const executeTool = await loadExecutor();
  const result = await executeTool('get_macro_event_history', { event: 'cpi', limit: 3 });
  const preview = result.payload.dataPreview;

  assert.equal(calls[0].params.limit, 3);
  assert.equal(preview.event, 'CPI (YoY)');
  assert.equal(preview.history[0].actual, null);
  assert.equal(preview.history[0].released, false);
  assert.equal(preview.history[1].surprise, 0.1);
  // The scheduled (unreleased) row is skipped; October's hot print is scored.
  assert.equal(result.payload.analysis.metrics.latestDate, '2026-10-14');
  assert.equal(result.payload.analysis.metrics.latestSurprise, 0.1);
};

const testFedOutlookReadsPositionalProbabilities = async () => {
  mockSoso({
    '/macro/fomc-probabilities': () => ok({
      rate_ranges: ['350-375', '375-400', '400-425'],
      meetings: [{ meeting_date: '2026-12-09', probabilities: ['41.1', '58.9', null] }],
      as_of: 1794688505844
    }),
    '/macro/rates': () => ok([{ code: 'sofr', name: 'SOFR', unit: '%', latest_date: '2026-11-12', latest_value: '3.9' }])
  });

  const executeTool = await loadExecutor();
  const result = await executeTool('get_fed_rate_outlook', {});
  const meeting = result.payload.dataPreview.upcomingMeetings[0];

  assert.equal(meeting.mostLikelyRange, '3.75%-4.00%');
  assert.equal(meeting.mostLikelyProbabilityPct, 58.9);
  assert.equal(meeting.distribution.length, 2);
  assert.equal(result.payload.dataPreview.moneyMarketRates[0].latestValue, 3.9);
};

const testLongRateLimitWaitFailsFast = async () => {
  let attempts = 0;
  (axios as any).get = async () => {
    attempts += 1;
    throw Object.assign(new Error('Too many requests'), {
      response: { status: 429, headers: {}, data: { code: 42901, message: 'Rate limit exceeded', details: { retry_after: 45 } } }
    });
  };

  vi.resetModules();
  process.env.SOSO_API_KEY = 'test-soso-key';
  const { sosoGet } = await import('../clients/soso.ts');
  const started = Date.now();
  await assert.rejects(() => sosoGet('/market/overview'), (error: any) => error.response?.status === 429);

  assert.equal(attempts, 1);
  assert.ok(Date.now() - started < 1000, 'a 45s retry-after must not stall the request');
};

test('SoSoValue client and tools', async () => {
  try {
    await testCurrencyCatalogUsesDocumentedList();
    await testLargeCurrencyIdsArePreservedAsStrings();
    await testEtfFlowBriefUsesSummaryHistoryLimit();
    await testSnapshotFractionsBecomePercents();
    await testTradingPairsReadPaginatedList();
    await testMacroHistoryResolvesAliasAndScoresLatestRelease();
    await testFedOutlookReadsPositionalProbabilities();
    await testLongRateLimitWaitFailsFast();
  } finally {
    (axios as any).get = originalAxiosGet;
  }
});
