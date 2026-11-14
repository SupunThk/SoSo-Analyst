import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const executorsMocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  resolveToolArgs: vi.fn()
}));

const authMocks = vi.hoisted(() => ({
  getWalletAddress: vi.fn((addr) => addr),
  findSessionForRequest: vi.fn(),
  hashWallet: vi.fn()
}));

const geminiMocks = vi.hoisted(() => ({
  postGeminiGenerateContent: vi.fn(),
  streamGeminiGenerateContent: vi.fn(),
  formatGeminiErrorMessage: vi.fn()
}));

const routingMocks = vi.hoisted(() => ({
  getToolAllowlist: vi.fn(),
  buildToolRoutingContext: vi.fn()
}));

// Replace the handler's collaborators; everything else keeps its real implementation.
const withMocks = vi.hoisted(() => (mocks) => async (importOriginal) => ({ ...(await importOriginal()), ...mocks }));
vi.mock('../tools/executors/index.ts', withMocks(executorsMocks));
vi.mock('../utils/auth.ts', withMocks(authMocks));
vi.mock('../clients/gemini.ts', withMocks(geminiMocks));
vi.mock('../ai/toolRouting.ts', withMocks(routingMocks));

import { handleChat } from '../handlers/agentHandlers.ts';

describe('agentHandlers', () => {
  let req, res;
  
  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      body: {
        messages: [{ role: 'user', content: 'test msg' }],
      },
      get: vi.fn()
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };
    
    routingMocks.getToolAllowlist.mockResolvedValue({
      allowedFunctionNames: ['test_tool', 'good_tool', 'bad_tool'],
      budget: { max: 3 },
      intent: 'general',
      routing: { intent: 'general', tools: ['test_tool'] }
    });
    
    routingMocks.buildToolRoutingContext.mockReturnValue({
      content: { role: 'user', parts: [{ text: 'context' }] }
    });
  });

  it('enforces budget limits', async () => {
    geminiMocks.postGeminiGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [
            // distinct args so deduplication doesn't collapse them
            { functionCall: { name: 'test_tool', args: { i: 1 } } },
            { functionCall: { name: 'test_tool', args: { i: 2 } } },
            { functionCall: { name: 'test_tool', args: { i: 3 } } },
            { functionCall: { name: 'test_tool', args: { i: 4 } } } // 4th should be ignored due to budget 3
          ]
        }
      }]
    });
    
    executorsMocks.executeTool.mockResolvedValue({ preview: 'result' });
    
    await handleChat(req, res);
    
    // Check if tools were executed only budget times (3)
    expect(executorsMocks.executeTool).toHaveBeenCalledTimes(3);
  });

  it('deduplicates identical tool calls', async () => {
    geminiMocks.postGeminiGenerateContent.mockResolvedValueOnce({
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: 'test_tool', args: { a: 1 } } },
            { functionCall: { name: 'test_tool', args: { a: 1 } } } // identical
          ]
        }
      }]
    }).mockResolvedValueOnce({
       candidates: [{ content: { parts: [{ text: 'answer' }] } }]
    });
    
    executorsMocks.executeTool.mockResolvedValue({ preview: 'result' });
    
    await handleChat(req, res);
    
    // Only 1 execution despite 2 calls
    expect(executorsMocks.executeTool).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
       toolCalls: expect.arrayContaining([expect.objectContaining({ name: 'test_tool' })])
    }));
  });

  it('handles partial tool failures gracefully', async () => {
    geminiMocks.postGeminiGenerateContent.mockResolvedValueOnce({
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: 'good_tool', args: {} } },
            { functionCall: { name: 'bad_tool', args: {} } }
          ]
        }
      }]
    }).mockResolvedValueOnce({
       candidates: [{ content: { parts: [{ text: 'answer' }] } }]
    });
    
    executorsMocks.executeTool.mockImplementation((name) => {
       if (name === 'good_tool') return Promise.resolve({ preview: 'success' });
       return Promise.reject(new Error('fail'));
    });
    
    await handleChat(req, res);
    
    // Ensure the error didn't crash the loop
    const jsonCall = res.json.mock.calls[0][0];
    const toolResults = jsonCall.toolCalls;
    expect(toolResults).toHaveLength(2);
    expect(toolResults.find(t => t.name === 'good_tool').status).toBeUndefined();
    expect(toolResults.find(t => t.name === 'bad_tool').status).toBe('error');
  });

  it('never executes tools the router did not allow', async () => {
    geminiMocks.postGeminiGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [
        { functionCall: { name: 'google_search:search', args: { queries: ['x'] } } },
        { functionCall: { name: 'test_tool', args: { a: 1 } } }
      ] } }]
    }).mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'answer from data' }] } }]
    });
    executorsMocks.executeTool.mockResolvedValue({ preview: 'result' });

    await handleChat(req, res);

    expect(executorsMocks.executeTool).toHaveBeenCalledTimes(1);
    expect(executorsMocks.executeTool.mock.calls[0][0]).toBe('test_tool');
  });

  it('asks for a final answer with tools off when the budget runs out mid-plan', async () => {
    const wantsMore = (i) => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'test_tool', args: { i } } }] } }] });
    geminiMocks.postGeminiGenerateContent
      .mockResolvedValueOnce(wantsMore(1))
      .mockResolvedValueOnce(wantsMore(2))
      .mockResolvedValueOnce(wantsMore(3))
      .mockResolvedValueOnce(wantsMore(4))
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'final synthesis' }] } }] });
    executorsMocks.executeTool.mockResolvedValue({ preview: 'result', status: 'success', payload: { summary: 'result' } });

    await handleChat(req, res);

    const lastCall = geminiMocks.postGeminiGenerateContent.mock.calls.at(-1);
    expect(lastCall[1].finalAnswer).toBe(true);
    expect(executorsMocks.executeTool).toHaveBeenCalledTimes(3);
    expect(res.json.mock.calls[0][0].answer).toContain('final synthesis');
  });
  it('sends Gemini the tool payload, not the result wrapper', async () => {
    geminiMocks.postGeminiGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ functionCall: { name: 'test_tool', args: {} } }] } }]
    }).mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'answer from data' }] } }]
    });
    executorsMocks.executeTool.mockResolvedValue({
      args: {},
      status: 'success',
      preview: 'result',
      payload: { source: 'SoSoValue', tool: 'test_tool', summary: 'BTC ETF inflows +$120M', evidence: [{ label: 'net', value: 120 }] }
    });

    await handleChat(req, res);

    const followUp = geminiMocks.postGeminiGenerateContent.mock.calls[1][0];
    const responsePart = followUp.flatMap((c) => c.parts || []).find((part) => part.functionResponse);
    const sent = JSON.stringify(responsePart.functionResponse.response);
    expect(sent).toContain('BTC ETF inflows');
  });
});
