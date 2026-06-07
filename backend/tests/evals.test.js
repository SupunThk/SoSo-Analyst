const assert = require('node:assert/strict');
const {
  inferIntentFromQuery,
  evaluateGoldenSuite,
  goldenCases
} = require('../evals/intent');
const { applyGroundingGuard } = require('../ai/grounding');
const { compressToolPayloadForGemini } = require('../ai/compress');
const { buildToolRoutingContext, inferToolRouting, getToolAllowlist, BUDGET_TIERS } = require('../ai/toolRouting');
const { normalizeToolResult } = require('../normalizers/toolResult');
const { filterToolDeclarations } = require('../tools/definitions');

const testIntentRouting = async () => {
  const btcPrice = await inferIntentFromQuery('What is the BTC price right now?');
  assert.ok(btcPrice.suggestedTools.includes('get_asset_snapshot'));

  const portfolio = await inferIntentFromQuery('Analyze my portfolio holdings');
  assert.ok(portfolio.suggestedTools.includes('get_wallet_holdings'));

  const reject = await inferIntentFromQuery('How do I bake a chocolate cake?');
  assert.equal(reject.outOfScope, true);

  // Token intelligence should be self-contained
  const whyMoving = await inferIntentFromQuery('Why is SOL pumping?');
  assert.deepEqual(whyMoving.suggestedTools, ['get_token_intelligence']);
  assert.equal(whyMoving.budget, 'simple');

  // Market intelligence should be single tool when only regime is mentioned
  const regime = await inferIntentFromQuery('What is the market regime?');
  assert.ok(regime.suggestedTools.includes('get_market_intelligence'));
  assert.equal(regime.budget, 'simple');

  // Multi-intent: compound query should merge tools from multiple matching rules
  const compound = await inferIntentFromQuery('What are the hottest crypto news and how do they affect the regime?');
  assert.ok(compound.suggestedTools.includes('get_market_intelligence'), 'compound should include market intelligence');
  assert.ok(compound.suggestedTools.includes('get_hot_news_digest'), 'compound should include hot news');
  assert.ok(compound.suggestedTools.length >= 2, 'compound should have at least 2 tools');

  const standaloneHotNews = await inferIntentFromQuery('What are the hottest crypto news stories right now?');
  assert.deepEqual(standaloneHotNews.suggestedTools, ['get_hot_news_digest']);
  assert.equal(standaloneHotNews.budget, 'simple');
};

const testToolRoutingContext = async () => {
  const routing = await inferToolRouting('Give me a BTC ETF flow brief');
  assert.deepEqual(routing.tools, ['get_etf_flow_brief', 'get_asset_snapshot']);

  const context = await buildToolRoutingContext('Analyze my portfolio holdings', {
    preloadedTools: ['get_wallet_holdings']
  });
  const text = context.content.parts[0].text;
  assert.match(text, /DETERMINISTIC TOOL ROUTING HINT/);
  assert.match(text, /Already available tool results: get_wallet_holdings/);
  // Portfolio has 4 tools; preloading wallet leaves 3 remaining
  assert.match(text, /call these tools if their required arguments/);
  assert.match(text, /Tool budget: max/);

  // Single-tool intent with all preloaded should say "use the already available"
  const singleToolContext = await buildToolRoutingContext('What is BTC price?', {
    preloadedTools: ['get_asset_snapshot']
  });
  const singleText = singleToolContext.content.parts[0].text;
  assert.match(singleText, /use the already available tool result/);

  const hotNewsContext = await buildToolRoutingContext('What are the hottest crypto news stories right now?');
  const hotNewsText = hotNewsContext.content.parts[0].text;
  assert.match(hotNewsText, /REPORT SHAPE/);
  assert.match(hotNewsText, /Headline Tape/);
  assert.match(hotNewsText, /Do not lead with keyword sentiment scores/);

  const sectorContext = await buildToolRoutingContext('What crypto sectors are trending? Show the sector spotlight.');
  const sectorText = sectorContext.content.parts[0].text;
  assert.match(sectorText, /Sector report/);
  assert.match(sectorText, /ranked sectors first/);
  assert.match(sectorText, /fallback scope/);

  const etfContext = await buildToolRoutingContext('Show me the latest US Spot ETF flows for Bitcoin.');
  const etfText = etfContext.content.parts[0].text;
  assert.match(etfText, /ETF flow report/);
  assert.match(etfText, /top fund details/);

  const fundraisingContext = await buildToolRoutingContext('Show me recent crypto fundraising rounds and VC investments.');
  const fundraisingText = fundraisingContext.content.parts[0].text;
  assert.match(fundraisingText, /Fundraising report/);
  assert.match(fundraisingText, /project, amount, investors/);
};

const testToolAllowlist = async () => {
  // Simple price query -> 1 tool
  const price = await getToolAllowlist('What is BTC price?');
  assert.deepEqual(price.allowedFunctionNames, ['get_asset_snapshot']);
  assert.equal(price.budget.max, 1);

  // Token intelligence -> 1 tool (self-contained)
  const tokenIntel = await getToolAllowlist('Why is SOL moving?');
  assert.deepEqual(tokenIntel.allowedFunctionNames, ['get_token_intelligence']);
  assert.equal(tokenIntel.budget.max, 1);

  // Market overview -> 3 tools
  const market = await getToolAllowlist('What is happening in crypto markets today?');
  assert.equal(market.budget.max, 3);

  // Deep dive -> 4 tools
  const deepDive = await getToolAllowlist('Deep dive on ETH');
  assert.equal(deepDive.budget.max, 4);
  assert.ok(deepDive.allowedFunctionNames.includes('get_token_intelligence'));

  // Portfolio -> 6 tools
  const portfolio = await getToolAllowlist('Analyze my portfolio');
  assert.equal(portfolio.budget.max, 6);
  assert.ok(portfolio.allowedFunctionNames.includes('get_wallet_holdings'));

  // Multi-intent compound query -> merged tools + highest budget
  const compound = await getToolAllowlist('What is the regime and show me hot news');
  assert.ok(compound.allowedFunctionNames.includes('get_market_intelligence'));
  assert.ok(compound.allowedFunctionNames.includes('get_hot_news_digest'));
  assert.ok(compound.budget.max >= 3, 'compound budget should be at least market tier');

  const standaloneHotNews = await getToolAllowlist('What are the hottest crypto news stories right now?');
  assert.deepEqual(standaloneHotNews.allowedFunctionNames, ['get_hot_news_digest']);
  assert.equal(standaloneHotNews.budget.max, 1);

  const marketOverviewReport = await getToolAllowlist('Give me a full market overview report - BTC price, top movers, sector trends, news, macro calendar, and strategic outlook.');
  assert.deepEqual(marketOverviewReport.allowedFunctionNames, ['get_market_intelligence', 'get_hot_news_digest', 'get_macro_crypto_calendar']);
  assert.equal(marketOverviewReport.budget.max, 3);

  const hotNewsReport = await getToolAllowlist('Give me a headline-first crypto news report: top stories, why each matters, market readthrough, and what to watch next.');
  assert.deepEqual(hotNewsReport.allowedFunctionNames, ['get_hot_news_digest']);
  assert.equal(hotNewsReport.budget.max, 1);

  const sectorReport = await getToolAllowlist('Give me a ranked crypto sector report: sector leaders, laggards, key evidence, rotation takeaway, and risks.');
  assert.deepEqual(sectorReport.allowedFunctionNames, ['get_market_intelligence', 'get_sector_spotlight', 'get_index_overview']);
  assert.equal(sectorReport.budget.max, 3);

  const indexOverview = await getToolAllowlist('Show me the SoSoValue SSI indices and their recent performance.');
  assert.deepEqual(indexOverview.allowedFunctionNames, ['get_index_overview']);
  assert.equal(indexOverview.budget.max, 2);

  const indexReport = await getToolAllowlist('Give me a SoSoValue SSI index report: index performance, constituents, sector mapping, and rotation takeaway.');
  assert.deepEqual(indexReport.allowedFunctionNames, ['get_index_overview']);
  assert.equal(indexReport.budget.max, 2);

  const cryptoEquities = await getToolAllowlist('Give me a crypto equities watchlist update for MSTR, COIN, MARA, and RIOT.');
  assert.deepEqual(cryptoEquities.allowedFunctionNames, ['get_crypto_equities_watchlist']);
  assert.equal(cryptoEquities.budget.max, 2);

  const fundraising = await getToolAllowlist('Show me recent crypto fundraising rounds and VC investments.');
  assert.deepEqual(fundraising.allowedFunctionNames, ['get_fundraising_overview']);
  assert.equal(fundraising.budget.max, 2);
};

const testFilterToolDeclarations = () => {
  // Filtering to a subset should return only those tools
  const filtered = filterToolDeclarations(['get_asset_snapshot', 'get_hot_news_digest']);
  const names = filtered[0].functionDeclarations.map((d) => d.name);
  assert.equal(names.length, 2);
  assert.ok(names.includes('get_asset_snapshot'));
  assert.ok(names.includes('get_hot_news_digest'));

  // Empty/null returns no tools (prevents allowlist bypass)
  const empty = filterToolDeclarations(null);
  assert.equal(empty[0].functionDeclarations.length, 0);

  const all = filterToolDeclarations(['get_asset_snapshot', 'get_hot_news_digest', 'get_market_intelligence']);
  const allNames = all[0].functionDeclarations.map((d) => d.name);
  assert.ok(!allNames.includes('get_analysis_charts'), 'get_analysis_charts should be parked');
};

const testGoldenSuite = async () => {
  const report = await evaluateGoldenSuite();
  assert.ok(report.total >= goldenCases.length);
  const failures = report.results.filter((item) => !item.pass);
  assert.equal(report.failed, 0, `Golden eval failures:\n${JSON.stringify(failures, null, 2)}`);
};

const testGroundingGuard = () => {
  const guarded = applyGroundingGuard({
    answer: 'BTC looks strong.',
    toolCalls: [{ name: 'get_asset_snapshot', status: 'error', result: 'timeout' }],
    userMessage: 'What is BTC price?'
  });
  assert.match(guarded, /DATA UNAVAILABLE/);

  const hotNewsGuarded = applyGroundingGuard({
    answer: 'The crypto market is experiencing constructive news flow with 5 bullish cues and an importance score of 100/100.',
    toolCalls: [{
      name: 'get_hot_news_digest',
      status: 'success',
      result: 'Returned 3 hot news items. Top titles: Bitcoin ETF inflows hit new record | Ethereum upgrade launches on mainnet | SEC delays crypto rule vote'
    }],
    userMessage: 'What are the hottest crypto news stories right now?'
  });
  assert.match(hotNewsGuarded, /Bitcoin ETF inflows hit new record/);
  assert.match(hotNewsGuarded, /Ethereum upgrade launches on mainnet/);
  assert.doesNotMatch(hotNewsGuarded, /importance score of 100\/100/);

  const substantialHotNews = applyGroundingGuard({
    answer: [
      '**Headline Tape**',
      '1. **Public crypto treasury funding stress**',
      'Why it matters: The story points to refinancing pressure and changing demand for digital-asset treasury vehicles.',
      '2. **TradFi index turnover hits crypto-linked names**',
      'Why it matters: Portfolio rotation can affect liquidity and near-term flows.',
      '',
      '**Market Readthrough**',
      'The feed is mixed: liquidity stories matter more than broad sentiment labels today.',
      '',
      '**Watch Next**',
      'Track follow-up volume and issuer disclosures.'
    ].join('\n'),
    toolCalls: [{
      name: 'get_hot_news_digest',
      status: 'success',
      result: 'Returned 3 hot news items. Top titles: Perpetual preferred shares with weekly dividends keep them afloat—has the DAT era ended? | TradFi index sector turnover accounted for nearly 60%, MU/MRVL led gai... (truncated)'
    }],
    userMessage: 'What are the hottest crypto news stories right now?'
  });
  assert.match(substantialHotNews, /Headline Tape/);
  assert.match(substantialHotNews, /Public crypto treasury funding stress/);
  assert.doesNotMatch(substantialHotNews, /The news feed returned concrete headlines/);
};

const testPayloadCompression = () => {
  const hugePreview = {
    tokens: Array.from({ length: 40 }, (_, index) => ({ symbol: `T${index}`, balance: index }))
  };
  const compressed = compressToolPayloadForGemini({
    source: 'SoSoValue',
    tool: 'get_wallet_holdings',
    summary: 'wallet',
    analysis: { label: 'neutral' },
    dataPreview: hugePreview
  });

  const serialized = JSON.stringify(compressed);
  assert.ok(serialized.length < 20000);
  assert.ok(Array.isArray(compressed.dataPreview.tokens));
  assert.ok(compressed.dataPreview.tokens.length <= 10);
};

const testEvidenceFactsSurviveCompression = () => {
  const payload = normalizeToolResult('get_asset_snapshot', { asset: 'btc' }, {
    data: {
      asset: { name: 'Bitcoin', symbol: 'BTC' },
      snapshot: {
        price: 100000,
        change_pct_24h: 2.5,
        market_cap: 2000000000000,
        volume_24h: 50000000000
      }
    }
  });
  const compressed = compressToolPayloadForGemini(payload);

  assert.ok(payload.evidenceFacts.some((fact) => fact.includes('price:')));
  assert.ok(compressed.evidenceFacts.some((fact) => fact.includes('24h change')));
};

const testSectorFallbackNormalization = () => {
  const payload = normalizeToolResult('get_sector_spotlight', {}, {
    data: {
      count: 2,
      sourceScope: 'Tracked major assets used as sector proxies.',
      fallbackReason: 'Direct SoSoValue sector spotlight returned no sector rows.',
      sectors: [
        { name: 'Layer1', ticker: 'SOL', kind: 'asset-proxy', change_pct_24h: 4.2, volume_24h: 100000 },
        { name: 'BTC', ticker: 'BTC', kind: 'asset-proxy', change_pct_24h: 1.1, volume_24h: 200000 }
      ]
    }
  });

  assert.match(payload.summary, /Returned 2 sector rows/);
  assert.match(payload.summary, /Fallback:/);
  assert.ok(payload.evidenceFacts.some((fact) => fact.includes('sector fallback reason')));
  assert.ok(payload.evidenceFacts.some((fact) => fact.includes('Layer1')));
};

const testBudgetTiers = () => {
  assert.equal(BUDGET_TIERS.simple.max, 1);
  assert.equal(BUDGET_TIERS.standard.max, 2);
  assert.equal(BUDGET_TIERS.market.max, 3);
  assert.equal(BUDGET_TIERS.deep_dive.max, 4);
  assert.equal(BUDGET_TIERS.portfolio.max, 6);
};

const runAllTests = async () => {
  await testIntentRouting();
  await testToolRoutingContext();
  await testToolAllowlist();
  testFilterToolDeclarations();
  await testGoldenSuite();
  testGroundingGuard();
  testPayloadCompression();
  testEvidenceFactsSurviveCompression();
  testSectorFallbackNormalization();
  testBudgetTiers();
  console.log('evals tests passed');
};

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
