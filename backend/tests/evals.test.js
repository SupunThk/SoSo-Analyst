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

const testIntentRouting = () => {
  const btcPrice = inferIntentFromQuery('What is the BTC price right now?');
  assert.ok(btcPrice.suggestedTools.includes('get_asset_snapshot'));

  const portfolio = inferIntentFromQuery('Analyze my portfolio holdings');
  assert.ok(portfolio.suggestedTools.includes('get_wallet_holdings'));

  const reject = inferIntentFromQuery('How do I bake a chocolate cake?');
  assert.equal(reject.outOfScope, true);

  // Token intelligence should be self-contained
  const whyMoving = inferIntentFromQuery('Why is SOL pumping?');
  assert.deepEqual(whyMoving.suggestedTools, ['get_token_intelligence']);
  assert.equal(whyMoving.budget, 'simple');

  // Market intelligence should be single tool
  const regime = inferIntentFromQuery('What is the market regime?');
  assert.deepEqual(regime.suggestedTools, ['get_market_intelligence']);
  assert.equal(regime.budget, 'simple');
};

const testToolRoutingContext = () => {
  const routing = inferToolRouting('Give me a BTC ETF flow brief');
  assert.deepEqual(routing.tools, ['get_etf_flow_brief', 'get_asset_snapshot']);

  const context = buildToolRoutingContext('Analyze my portfolio holdings', {
    preloadedTools: ['get_wallet_holdings']
  });
  const text = context.content.parts[0].text;
  assert.match(text, /DETERMINISTIC TOOL ROUTING HINT/);
  assert.match(text, /Already available tool results: get_wallet_holdings/);
  // Portfolio has 4 tools; preloading wallet leaves 3 remaining
  assert.match(text, /call these tools if their required arguments/);
  assert.match(text, /Tool budget: max/);

  // Single-tool intent with all preloaded should say "use the already available"
  const singleToolContext = buildToolRoutingContext('What is BTC price?', {
    preloadedTools: ['get_asset_snapshot']
  });
  const singleText = singleToolContext.content.parts[0].text;
  assert.match(singleText, /use the already available tool result/);
};

const testToolAllowlist = () => {
  // Simple price query -> 1 tool
  const price = getToolAllowlist('What is BTC price?');
  assert.deepEqual(price.allowedFunctionNames, ['get_asset_snapshot']);
  assert.equal(price.budget.max, 1);

  // Token intelligence -> 1 tool (self-contained)
  const tokenIntel = getToolAllowlist('Why is SOL moving?');
  assert.deepEqual(tokenIntel.allowedFunctionNames, ['get_token_intelligence']);
  assert.equal(tokenIntel.budget.max, 1);

  // Market overview -> 3 tools
  const market = getToolAllowlist('What is happening in crypto markets today?');
  assert.equal(market.budget.max, 3);

  // Deep dive -> 4 tools
  const deepDive = getToolAllowlist('Deep dive on ETH');
  assert.equal(deepDive.budget.max, 4);
  assert.ok(deepDive.allowedFunctionNames.includes('get_token_intelligence'));

  // Portfolio -> 6 tools
  const portfolio = getToolAllowlist('Analyze my portfolio');
  assert.equal(portfolio.budget.max, 6);
  assert.ok(portfolio.allowedFunctionNames.includes('get_wallet_holdings'));
};

const testFilterToolDeclarations = () => {
  // Filtering to a subset should return only those tools
  const filtered = filterToolDeclarations(['get_asset_snapshot', 'get_hot_news_digest']);
  const names = filtered[0].functionDeclarations.map((d) => d.name);
  assert.equal(names.length, 2);
  assert.ok(names.includes('get_asset_snapshot'));
  assert.ok(names.includes('get_hot_news_digest'));

  // Empty/null returns full list
  const full = filterToolDeclarations(null);
  assert.ok(full[0].functionDeclarations.length > 2);

  // get_analysis_charts should NOT be in the full list (parked)
  const allNames = full[0].functionDeclarations.map((d) => d.name);
  assert.ok(!allNames.includes('get_analysis_charts'), 'get_analysis_charts should be parked');
};

const testGoldenSuite = () => {
  const report = evaluateGoldenSuite();
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

const testBudgetTiers = () => {
  assert.equal(BUDGET_TIERS.simple.max, 1);
  assert.equal(BUDGET_TIERS.standard.max, 2);
  assert.equal(BUDGET_TIERS.market.max, 3);
  assert.equal(BUDGET_TIERS.deep_dive.max, 4);
  assert.equal(BUDGET_TIERS.portfolio.max, 6);
};

testIntentRouting();
testToolRoutingContext();
testToolAllowlist();
testFilterToolDeclarations();
testGoldenSuite();
testGroundingGuard();
testPayloadCompression();
testEvidenceFactsSurviveCompression();
testBudgetTiers();
console.log('evals tests passed');
