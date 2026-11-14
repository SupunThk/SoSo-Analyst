import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// toolRouting.js destructures postGeminiGenerateContent at require() time, so patch the
// CommonJS export before loading it.
const gemini = require('../clients/gemini');
const postGemini = vi.fn();
gemini.postGeminiGenerateContent = postGemini;
const { inferToolRouting, classifierCache } = require('../ai/toolRouting');

const llmReturns = (intents) =>
  postGemini.mockResolvedValue({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intents }) }] } }] });

describe('inferToolRouting', () => {
  beforeEach(() => {
    postGemini.mockReset();
    classifierCache.flushAll();
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_INTENT_CLASSIFIER;
  });

  it('uses deterministic rules without calling the LLM when a rule matches', async () => {
    const routing = await inferToolRouting('What is the BTC price right now?');
    expect(routing.tools).toContain('get_asset_snapshot');
    expect(postGemini).not.toHaveBeenCalled();
  });

  it('asks the LLM only for unrecognised queries, capping its budget at standard', async () => {
    llmReturns(['asset_deep_dive']);
    const routing = await inferToolRouting('Should I be worried about stablecoin depegs?');
    expect(postGemini).toHaveBeenCalledOnce();
    expect(routing.intent).toBe('asset_deep_dive');
    expect(routing.budget).toBe('standard');
  });

  it('ignores intents the LLM invents and falls back to the default route', async () => {
    llmReturns(['made_up_intent']);
    const routing = await inferToolRouting('Should I be worried about stablecoin depegs?');
    expect(routing.intent).toBe('general_market');
  });

  it('caches classifier answers per normalised query', async () => {
    llmReturns(['macro']);
    await inferToolRouting('Should I be worried about stablecoin depegs?');
    await inferToolRouting('  should I be WORRIED about stablecoin depegs?  ');
    expect(postGemini).toHaveBeenCalledOnce();
  });

  it('falls back to the default route when the classifier fails', async () => {
    postGemini.mockRejectedValue(new Error('timeout of 3000ms exceeded'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const routing = await inferToolRouting('Should I be worried about stablecoin depegs?');
    expect(routing.intent).toBe('general_market');
    warn.mockRestore();
  });
});
