import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendMessageStream } from '@/lib/api';

const sseResponse = (pieces: string[]) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

const run = async () => {
  const calls = { chunks: [] as string[], tools: [] as string[], done: [] as unknown[], errors: [] as string[] };
  await sendMessageStream([{ id: 'u1', role: 'user', content: 'hi', timestamp: new Date() }], [], {
    onChunk: (text) => calls.chunks.push(text),
    onToolDone: (tool) => calls.tools.push(tool.name),
    onDone: (response) => calls.done.push(response),
    onError: (message) => calls.errors.push(message),
  }, '0xabc', 'chat-1', 'token');
  return calls;
};

describe('sendMessageStream', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses events split across network chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: chunk\ndata: {"text":"Bull"}\n\n',
      'event: chunk\nda',
      'ta: {"text":" market"}\n\nevent: tool_done\ndata: {"name":"get_market_intelligence","status":"success"}\n\n',
      'event: done\ndata: {"answer":"Bull market.","toolCalls":[]}\n\n',
    ])));

    const calls = await run();
    expect(calls.chunks).toEqual(['Bull', ' market']);
    expect(calls.tools).toEqual(['get_market_intelligence']);
    expect(calls.done).toHaveLength(1);
    expect(calls.errors).toEqual([]);
  });

  it('sends the bearer token and chat id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['event: done\ndata: {"answer":"ok","toolCalls":[]}\n\n']));
    vi.stubGlobal('fetch', fetchMock);

    await run();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body).chatId).toBe('chat-1');
  });

  it('reports server error events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['event: error\ndata: {"message":"Analysis engine timed out."}\n\n'])));
    const calls = await run();
    expect(calls.errors).toEqual(['Analysis engine timed out.']);
  });

  it('reports a stream that closes before finishing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['event: chunk\ndata: {"text":"partial"}\n\n'])));
    const calls = await run();
    expect(calls.errors).toEqual(['Connection closed before the analysis completed.']);
  });

  it('surfaces a 401 as the session-required message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Valid wallet session is required."}', { status: 401 })));
    const calls = await run();
    expect(calls.errors).toEqual(['Valid wallet session is required.']);
  });
});
