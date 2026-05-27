const assert = require('node:assert/strict');
const { analyzeToolResult, toNumber } = require('../analysis/deterministic');
const { combineToolAnalyses } = require('../analysis/synthesis');
const { normalizeToolResult } = require('../normalizers/toolResult');

try {
  assert.equal(toNumber('$1,234.56'), 1234.56);
  assert.equal(toNumber('12.5%'), 12.5);

  const comparePreview = normalizeToolResult('compare_assets', { assetA: 'btc', assetB: 'eth' }, {
    data: {
      assetA: { name: 'Bitcoin', symbol: 'BTC', id: 1, snapshot: { price: 100000, change_pct_24h: 1.5 } },
      assetB: { name: 'Ethereum', symbol: 'ETH', id: 2, snapshot: { price: 3000, change_pct_24h: -0.5 } }
    }
  });
  assert.equal(comparePreview.dataPreview.assetA.price, 100000);
  assert.equal(comparePreview.analysis.tool, 'compare_assets');
  assert.ok(['neutral', 'bullish', 'bearish'].includes(comparePreview.analysis.label));

  const tradingPreview = normalizeToolResult('get_trading_pairs', { asset: 'sol' }, {
    data: {
      asset: { id: 1, name: 'Solana', symbol: 'SOL' },
      totalPairs: 1,
      pairs: [{ exchange: 'Binance', pair: 'SOL/USDT', price: 150, volume_24h: 1e9 }]
    }
  });
  assert.equal(typeof tradingPreview.dataPreview.pairs[0], 'object');
  assert.notEqual(tradingPreview.dataPreview.pairs[0], '[object]');
  assert.equal(tradingPreview.dataPreview.pairs[0].price, 150);

  const klinesPreview = normalizeToolResult('get_asset_price_history', { asset: 'btc' }, {
    data: {
      asset: { id: 1, name: 'Bitcoin', symbol: 'BTC' },
      count: 1,
      klines: [{ date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 1000 }],
      analytics: { trend: 'flat' }
    }
  });
  assert.ok(klinesPreview.dataPreview.klines[0] && typeof klinesPreview.dataPreview.klines[0] === 'object');
  assert.equal(klinesPreview.dataPreview.klines[0].close, 1.5);

  const sectorAnalysis = analyzeToolResult('get_sector_spotlight', {
    sectors: [
      { name: 'DeFi', change_pct_24h: 5 },
      { name: 'L2', change_pct_24h: 3 }
    ]
  });
  assert.ok(sectorAnalysis.score > 50);
  assert.equal(sectorAnalysis.tool, 'get_sector_spotlight');

  const indexAnalysis = analyzeToolResult('get_index_overview', {
    snapshot: { price: 100, change_pct_24h: 2.5 }
  });
  assert.ok(indexAnalysis.score >= 50);
  assert.equal(indexAnalysis.tool, 'get_index_overview');

  const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const macroCal = analyzeToolResult('get_macro_crypto_calendar', {
    from: '2026-01-01',
    to: '2026-12-31',
    events: [
      { title: 'FOMC rate decision', date: soonIso },
      { title: 'CPI release', date: soonIso },
      { title: 'Industry summit', date: '2030-06-01T00:00:00.000Z' }
    ]
  });
  assert.ok(macroCal.metrics.highImpactCount >= 2);
  assert.ok(macroCal.riskScore >= 52);
  assert.ok(String(macroCal.scoreMeaning || '').includes('volatility'));

  const fundraising = analyzeToolResult('get_fundraising_overview', {
    projects: [
      { name: 'Project A', amount: '$10M' },
      { name: 'Project B', amount: '25m' }
    ]
  });
  assert.ok(Number(fundraising.metrics.totalRaiseUsdEstimate) > 30e5);
  assert.ok(fundraising.score >= 51);

  const treasuries = analyzeToolResult('get_btc_treasury_brief', {
    companies: [
      { ticker: 'MSTR', name: 'MicroStrategy', list_location: 'US' },
      { ticker: 'MARA', name: 'Marathon', list_location: 'US' }
    ]
  });
  assert.equal(treasuries.metrics.companyCount, 2);
  assert.ok(treasuries.score >= 52);

  const purchases = analyzeToolResult('get_btc_purchase_history_brief', {
    companyTicker: 'MSTR',
    purchases: [
      { date: new Date().toISOString().slice(0, 10), btc: 100 },
      { date: '2020-01-01', btc: 50 }
    ]
  });
  assert.ok(purchases.metrics.purchaseCount === 2);
  assert.ok(Number(purchases.metrics.totalBtcParsed) >= 149);

  const priceHistory = analyzeToolResult('get_asset_price_history', {
    count: 5,
    klines: [
      { high: 100, close: 80 },
      { high: 104, close: 88 },
      { high: 110, close: 100 },
      { high: 116, close: 112 },
      { high: 120, close: 118 }
    ],
    analytics: {
      periodChangePercent: '47.50%',
      volatility: '50.00%',
      trend: 'bullish'
    }
  });
  assert.equal(priceHistory.label, 'bullish');
  assert.ok(priceHistory.score > 60);
  assert.ok(priceHistory.riskScore > 50);
  assert.ok(priceHistory.scoreBreakdown.some((item) => item.factor === 'period price change'));
  assert.equal(priceHistory.metrics.periodChangePercent, 47.5);

  const etfFlows = analyzeToolResult('get_etf_flow_brief', {
    history: [
      { total_net_flow: 100 },
      { total_net_flow: 150 },
      { total_net_flow: -25 },
      { total_net_flow: 200 },
      { total_net_flow: 300 },
      { total_net_flow: 250 }
    ]
  });
  assert.equal(etfFlows.label, 'bullish');
  assert.equal(etfFlows.metrics.streak, 3);
  assert.equal(etfFlows.metrics.positiveDays, 5);
  assert.ok(etfFlows.scoreBreakdown.some((item) => item.factor === 'ETF flow streak'));

  const tokenomics = analyzeToolResult('get_token_economics', {
    tokenomics: {
      supply_ratio: '25.0%',
      is_inflationary: true,
      remaining_supply: 75000000
    }
  });
  assert.equal(tokenomics.label, 'bearish');
  assert.ok(tokenomics.risks.some((risk) => risk.includes('dilution')));

  const portfolio = analyzeToolResult('get_wallet_holdings', {
    totalValueUsd: '10000',
    tokens: [
      { symbol: 'ETH', usdValue: 7200 },
      { symbol: 'UNI', usdValue: 900 },
      { symbol: 'AAVE', usdValue: 700 },
      { symbol: 'USDC', usdValue: 200 }
    ]
  });
  assert.equal(portfolio.label, 'high_risk');
  assert.ok(portfolio.riskScore >= 70);
  assert.equal(portfolio.metrics.largestHoldingWeightPercent, 72);

  const news = analyzeToolResult('get_asset_news_brief', {
    items: [
      { title: 'Bitcoin ETF inflow hits record as price rally continues' },
      { title: 'Analysts warn liquidation risk remains elevated' }
    ]
  });
  assert.equal(news.metrics.bullishKeywordHits, 3);
  assert.equal(news.metrics.bearishKeywordHits, 2);
  assert.ok(news.metrics.importanceScore > 0);
  assert.equal(news.dataFreshness.status, 'unknown');

  const synthesis = combineToolAnalyses([priceHistory, etfFlows, tokenomics, news]);
  assert.equal(synthesis.analyzedTools, 4);
  assert.ok(synthesis.directionalScore >= 50);
  assert.ok(Array.isArray(synthesis.scoreBreakdown));
  assert.ok(synthesis.conflicts.length >= 1);

  console.log('analysis tests passed');
} catch (err) {
  console.error(err);
  process.exit(1);
}
