// Head-to-head of Gemini model sets through the real agent loop and data tools.
// Usage: node scripts/model-eval.js [outFile]. Needs GEMINI_API_KEY and SOSO_API_KEY.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');

const MODEL_SETS = {
  'gemini-2.5': { GEMINI_MODEL_FLASH: 'gemini-2.5-flash', GEMINI_MODEL_PRO: 'gemini-2.5-pro', GEMINI_MODEL_LIGHT: 'gemini-2.5-flash' },
  'gemini-3': { GEMINI_MODEL_FLASH: 'gemini-3-flash-preview', GEMINI_MODEL_PRO: 'gemini-3.1-pro-preview', GEMINI_MODEL_LIGHT: 'gemini-3.1-flash-lite' }
};

const QUERIES = [
  'What is the BTC price right now?',
  'Compare ETH vs SOL',
  'Show me the latest US Spot ETF flows for Bitcoin.',
  'Why is SOL moving today?',
  'What is the market regime?',
  'What crypto sectors are trending? Show the sector spotlight.',
  'What did regulators say about crypto this week?'
];

const ask = async (query) => {
  const { handleChat } = require('../handlers/agentHandlers');
  const req = { body: { messages: [{ role: 'user', content: query }], conversationHistory: [] }, get: () => undefined, id: 'eval' };
  let status = 200;
  let payload = null;
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  const started = Date.now();
  await handleChat(req, res);
  return { status, ms: Date.now() - started, payload };
};

(async () => {
  const rows = [];
  for (const [setName, env] of Object.entries(MODEL_SETS)) {
    Object.assign(process.env, env);
    for (const query of QUERIES) {
      const { status, ms, payload } = await ask(query);
      const answer = payload?.answer || payload?.message || '';
      const tools = payload?.toolCalls || [];
      const row = {
        set: setName, query, status, ms,
        tools: tools.map((t) => t.name),
        toolErrors: tools.filter((t) => t.status === 'error').length,
        chars: answer.length,
        unavailable: /DATA UNAVAILABLE/.test(answer),
        answer
      };
      rows.push(row);
      console.log(`${setName.padEnd(11)} ${String(status).padEnd(4)} ${String(ms).padStart(6)}ms tools=${row.tools.length} err=${row.toolErrors} chars=${row.chars}${row.unavailable ? ' UNAVAILABLE' : ''}  ${query}`);
    }
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
})();
