const goldenCases = require('./golden.json');
const { DATA_INTENT_PATTERN } = require('../ai/grounding');
const { getToolAllowlist, inferToolRouting } = require('../ai/toolRouting');

const OUT_OF_SCOPE_PATTERN = /\b(bake|recipe|cook|python script|write me a poem|dating advice)\b/i;

const normalizeQuery = (query) => String(query || '').trim().toLowerCase();

const inferIntentFromQuery = (query) => {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return { intent: 'unknown', suggestedTools: [], budget: 'simple', outOfScope: false };
  }

  if (OUT_OF_SCOPE_PATTERN.test(normalized) && !DATA_INTENT_PATTERN.test(normalized)) {
    return { intent: 'reject', suggestedTools: [], budget: 'simple', outOfScope: true };
  }

  // Use the real routing from toolRouting.js for consistency
  const allowlist = getToolAllowlist(query);
  if (allowlist.allowedFunctionNames.length) {
    return {
      intent: allowlist.intent,
      suggestedTools: allowlist.allowedFunctionNames,
      budget: allowlist.routing.budget,
      outOfScope: false
    };
  }

  if (DATA_INTENT_PATTERN.test(normalized)) {
    return { intent: 'general_market', suggestedTools: ['get_asset_snapshot'], budget: 'simple', outOfScope: false };
  }

  return { intent: 'unknown', suggestedTools: [], budget: 'simple', outOfScope: false };
};

const matchesGoldenExpectation = (goldenCase, inference) => {
  if (goldenCase.outOfScope) {
    return inference.outOfScope === true;
  }

  const expected = goldenCase.expectedTools || [];
  const suggested = inference.suggestedTools || [];
  const matchMode = goldenCase.matchMode || 'primary';

  if (!expected.length) {
    return suggested.length === 0;
  }

  if (matchMode === 'any') {
    return expected.some((tool) => suggested.includes(tool));
  }

  return expected[0] === suggested[0] || expected.every((tool) => suggested.includes(tool));
};

const matchesBudgetExpectation = (goldenCase, inference) => {
  if (goldenCase.outOfScope || !goldenCase.expectedBudget) {
    return true; // No budget check for out-of-scope or unspecified
  }

  return inference.budget === goldenCase.expectedBudget;
};

const evaluateGoldenSuite = () => {
  const results = goldenCases.map((goldenCase) => {
    const inference = inferIntentFromQuery(goldenCase.query);
    const toolPass = matchesGoldenExpectation(goldenCase, inference);
    const budgetPass = matchesBudgetExpectation(goldenCase, inference);
    return {
      id: goldenCase.id,
      query: goldenCase.query,
      pass: toolPass && budgetPass,
      toolPass,
      budgetPass,
      expectedTools: goldenCase.expectedTools,
      suggestedTools: inference.suggestedTools,
      expectedBudget: goldenCase.expectedBudget,
      actualBudget: inference.budget,
      intent: inference.intent,
      outOfScope: inference.outOfScope
    };
  });

  const passed = results.filter((item) => item.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
};

module.exports = {
  goldenCases,
  inferIntentFromQuery,
  matchesBudgetExpectation,
  matchesGoldenExpectation,
  evaluateGoldenSuite
};
