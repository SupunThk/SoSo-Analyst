import assert from 'node:assert/strict';
import { buildSystemPrompt, resolvePromptVersion } from '../prompt/system.ts';

const testPromptVersioning = () => {
  const defaultPrompt = buildSystemPrompt({ version: 'v3', date: new Date('2026-05-18T00:00:00.000Z') });
  assert.match(defaultPrompt, /2026-05-18/);
  assert.match(defaultPrompt, /evidenceFacts/);
  assert.match(defaultPrompt, /Every analytical claim must be traceable/);
  assert.doesNotMatch(defaultPrompt, /VERSION NOTE \(v3\.1\)/);

  const v31 = buildSystemPrompt({ version: 'v3_1', date: new Date('2026-05-18T00:00:00.000Z') });
  assert.match(v31, /VERSION NOTE \(v3\.1\)/);
  assert.equal(resolvePromptVersion('unknown'), 'v3');
};

test('prompt versioning', testPromptVersioning);
