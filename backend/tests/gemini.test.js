import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import { buildRequestBody, mergeStreamChunk, selectModel, streamGeminiGenerateContent } from '../clients/gemini';
import { EventEmitter } from 'events';

const axios = createRequire(import.meta.url)('axios');
const postSpy = vi.spyOn(axios, 'post');
// streamGeminiGenerateContent attaches stream listeners only after awaiting axios.post.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('streamGeminiGenerateContent', () => {
  it('parses SSE correctly including chunk boundaries, multiple function calls, and error handling', async () => {
    const mockDataStream = new EventEmitter();
    
    postSpy.mockResolvedValueOnce({ data: mockDataStream });
    
    const chunks = [];
    const onChunk = (text) => chunks.push(text);
    
    const streamPromise = streamGeminiGenerateContent([{ role: 'user', parts: [{ text: 'hi' }] }], onChunk, { allowedFunctionNames: [] });
    
    await flush();
    // Simulate chunked SSE events
    // 1. Partial chunk
    mockDataStream.emit('data', Buffer.from('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n'));
    // 2. Fragmented chunk
    mockDataStream.emit('data', Buffer.from('data: {"candidates":[{"content":{"parts":[{"text":" World"}]}}'));
    mockDataStream.emit('data', Buffer.from(']}\n\n'));
    // 3. Multiple function calls
    mockDataStream.emit('data', Buffer.from('data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"tool1","args":{}}},{"functionCall":{"name":"tool2","args":{}}}]}}]}\n\n'));
    // 4. Malformed JSON (should be caught and logged but not crash)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataStream.emit('data', Buffer.from('data: {malformed json}\n\n'));
    // 5. Done event
    mockDataStream.emit('data', Buffer.from('data: [DONE]\n\n'));
    
    mockDataStream.emit('end');
    
    const response = await streamPromise;
    
    expect(chunks).toEqual(['Hello', ' World']);
    expect(response.candidates[0].content.parts).toHaveLength(3);
    expect(response.candidates[0].content.parts[0]).toEqual({ text: 'Hello World' });
    expect(response.candidates[0].content.parts[1].functionCall.name).toBe('tool1');
    expect(response.candidates[0].content.parts[2].functionCall.name).toBe('tool2');
    expect(consoleSpy).toHaveBeenCalledWith('SSE JSON parse error:', expect.any(String), 'Raw string:', '{malformed json}');
    
    consoleSpy.mockRestore();
  });
  
  it('handles stream errors', async () => {
    const mockDataStream = new EventEmitter();
    postSpy.mockResolvedValueOnce({ data: mockDataStream });
    
    const streamPromise = streamGeminiGenerateContent([], () => {});
    await flush();
    const err = new Error('Stream disconnected');
    mockDataStream.emit('error', err);
    
    await expect(streamPromise).rejects.toThrow('Stream disconnected');
  });
});

describe('buildRequestBody', () => {
  const contents = [{ role: 'user', parts: [{ text: 'hi' }] }];

  it('sends function tools without googleSearch (Gemini rejects mixing them)', () => {
    const body = buildRequestBody(contents, { allowedFunctionNames: ['get_asset_snapshot'] });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].functionDeclarations.map((d) => d.name)).toEqual(['get_asset_snapshot']);
    expect(body.tools.some((t) => t.googleSearch)).toBe(false);
    expect(body.toolConfig).toBeDefined();
  });

  it('falls back to googleSearch grounding when no function tools are allowed', () => {
    const body = buildRequestBody(contents, { allowedFunctionNames: [] });
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.toolConfig).toBeUndefined();
  });

  it('sends no tools in JSON mode (Gemini rejects tool use with application/json)', () => {
    const body = buildRequestBody(contents, { responseMimeType: 'application/json' });
    expect(body.tools).toBeUndefined();
    expect(body.toolConfig).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('lightweight calls skip the system prompt and thinking budget', () => {
    const body = buildRequestBody(contents, { responseMimeType: 'application/json', lightweight: true });
    expect(body.systemInstruction).toBeUndefined();
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });
});

describe('Gemini 3 request shape', () => {
  const contents = [{ role: 'user', parts: [{ text: 'hi' }] }];
  const g3 = 'gemini-3-flash-preview';

  afterEach(() => { delete process.env.GEMINI_GOOGLE_SEARCH; });

  it('sends data tools without built-in search (web search is the search_web tool)', () => {
    const body = buildRequestBody(contents, { allowedFunctionNames: ['get_asset_snapshot', 'search_web'] }, g3);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].functionDeclarations.map((d) => d.name)).toEqual(['search_web', 'get_asset_snapshot']);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
  });

  it('turns function calling off for the final-answer call', () => {
    const body = buildRequestBody(contents, { allowedFunctionNames: ['get_asset_snapshot'], finalAnswer: true }, g3);
    expect(body.toolConfig.functionCallingConfig.mode).toBe('NONE');
  });

  it('uses thinking levels and the default temperature', () => {
    const body = buildRequestBody(contents, {}, g3);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' });
    expect(body.generationConfig.temperature).toBeUndefined();
  });

  it('can switch Google Search off', () => {
    process.env.GEMINI_GOOGLE_SEARCH = 'off';
    const body = buildRequestBody(contents, { allowedFunctionNames: [] }, g3);
    expect(body.tools).toBeUndefined();
  });

  it('picks models from env, with the light model for classifier calls', () => {
    process.env.GEMINI_MODEL_FLASH = 'gemini-3-flash-preview';
    process.env.GEMINI_MODEL_LIGHT = 'gemini-3.1-flash-lite';
    expect(selectModel(1, 0)).toBe('gemini-3-flash-preview');
    expect(selectModel(1, 0, { lightweight: true })).toBe('gemini-3.1-flash-lite');
    expect(selectModel(1, 0, { model: 'x' })).toBe('x');
    delete process.env.GEMINI_MODEL_FLASH;
    delete process.env.GEMINI_MODEL_LIGHT;
  });
});

describe('mergeStreamChunk', () => {
  const chunk = (parts, extra = {}) => ({ candidates: [{ content: { role: 'model', parts }, ...extra }] });

  it('keeps parallel calls to the same tool with different args', () => {
    let full = mergeStreamChunk(null, chunk([{ functionCall: { name: 'get_asset_snapshot', args: { asset: 'BTC' } } }]));
    full = mergeStreamChunk(full, chunk([{ functionCall: { name: 'get_asset_snapshot', args: { asset: 'ETH' } } }]));
    expect(full.candidates[0].content.parts.map((p) => p.functionCall.args.asset)).toEqual(['BTC', 'ETH']);
  });

  it('keeps Gemini 3 server-side search parts and thought signatures', () => {
    let full = mergeStreamChunk(null, chunk([{ toolCall: { id: 's1' }, thoughtSignature: 'sig-a' }]));
    full = mergeStreamChunk(full, chunk([{ toolResponse: { id: 's1' }, thoughtSignature: 'sig-b' }]));
    full = mergeStreamChunk(full, chunk([{ functionCall: { name: 'get_asset_snapshot', args: {} }, thoughtSignature: 'sig-c' }], { finishReason: 'STOP' }));
    const parts = full.candidates[0].content.parts;
    expect(parts.map((p) => p.thoughtSignature)).toEqual(['sig-a', 'sig-b', 'sig-c']);
    expect(full.candidates[0].finishReason).toBe('STOP');
  });

  it('joins streamed text and skips thought text when emitting chunks', () => {
    const seen = [];
    let full = mergeStreamChunk(null, chunk([{ text: 'planning', thought: true }, { text: 'BTC ' }]), (t) => seen.push(t));
    full = mergeStreamChunk(full, chunk([{ text: 'is up.' }]), (t) => seen.push(t));
    expect(seen).toEqual(['BTC ', 'is up.']);
    expect(full.candidates[0].content.parts.at(-1).text).toBe('BTC is up.');
  });
});
