import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

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

// agentHandlers.js is CommonJS and destructures its dependencies at require() time,
// which vi.mock() cannot intercept. Patch the real module exports first, then load it.
Object.assign(require('../tools/executors'), executorsMocks);
Object.assign(require('../utils/auth'), authMocks);
Object.assign(require('../clients/gemini'), geminiMocks);
Object.assign(require('../ai/toolRouting'), routingMocks);
const { handleChat } = require('../handlers/agentHandlers');

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
      allowedFunctionNames: ['test_tool'],
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
});
