// Runs the golden routing suite twice: regex-only, then with the live Gemini
// intent classifier. Needs GEMINI_API_KEY in backend/.env. Reports only; CI
// runs the offline (regex) suite via `npm test`.
import 'dotenv/config';

import { evaluateGoldenSuite } from '../evals/intent.ts';
import { classifierCache } from '../ai/toolRouting.ts';

const runMode = async (label, classifier) => {
  process.env.LLM_INTENT_CLASSIFIER = classifier;
  classifierCache.flushAll();
  const started = Date.now();
  const report = await evaluateGoldenSuite();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${label}: ${report.passed}/${report.total} passed (${seconds}s)`);
  for (const item of report.results.filter((result) => !result.pass)) {
    console.log(`  FAIL ${item.id.padEnd(28)} got ${item.intent} [${item.actualBudget}] -> ${item.suggestedTools.join(', ')}`);
  }
  return report;
};

(async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set; the live eval needs it.');
    process.exit(1);
  }
  await runMode('Regex only', 'off');
  await runMode('With LLM classifier', 'on');
})();
