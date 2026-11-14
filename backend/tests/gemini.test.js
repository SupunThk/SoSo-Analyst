import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import { buildRequestBody, streamGeminiGenerateContent } from '../clients/gemini';
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
