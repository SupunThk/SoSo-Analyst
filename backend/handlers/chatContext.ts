// Chat request parsing (zod schemas) and Gemini context building: conversation
// history, verified wallet context and preloaded portfolio holdings.
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  findSessionForRequest,
  getWalletAddress,
  hashWallet
} from '../utils/auth.ts';
import { executeTool } from '../tools/executors/index.ts';
import { buildToolRoutingContext } from '../ai/toolRouting.ts';
import { makeToolRecord } from '../ai/agentLoop.ts';
import type { AgentLoopHooks } from '../ai/agentLoop.ts';

const PORTFOLIO_INTENT_PATTERN = /\b(analy[sz]e|check|review|audit|show|summari[sz]e)\s+my\s+(portfolio|wallet|holdings|bags)\b|\bmy\s+(portfolio|wallet|holdings|bags)\b/i;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(200000)
});

const conversationPartSchema = z.object({
  text: z.string().max(200000)
});

const conversationHistorySchema = z.array(z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(conversationPartSchema).min(1).max(20)
})).max(30);

const sanitizeConversationHistory = (history) => {
  const parsed = conversationHistorySchema.safeParse(history);
  if (!parsed.success) {
    return [];
  }

  return parsed.data;
};

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  conversationHistory: conversationHistorySchema.optional(),
  walletAddress: z.string().optional().nullable()
});

const streamRequestSchema = chatRequestSchema.extend({
  chatId: z.string().optional().nullable()
});

const validatePayload = (schema, value) => {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data };
  }

  return {
    error: parsed.error.issues.map((issue) => issue.message).join(', ')
  };
};

// What Gemini sees for a tool call: the normalised payload, compacted. Error results
// carry no payload and are compacted as-is. (Passing the {args, payload, preview}
// wrapper here sent Gemini an empty object for every tool.)

const buildWalletContextContent = (walletAddress) => ({
  role: 'user',
  parts: [{
    text: [
      'CONNECTED_WALLET_CONTEXT',
      `Verified connected EVM wallet: ${walletAddress}.`,
      'If the user asks about my wallet, my portfolio, my holdings, or similar first-person portfolio language, call get_wallet_holdings with this exact address.'
    ].join('\n')
  }]
});

const isPortfolioIntent = (message) => PORTFOLIO_INTENT_PATTERN.test(String(message || ''));

const buildPreloadedToolContent = (name, resultData) => ({
  role: 'user',
  parts: [{
    text: [
      `PRELOADED_TOOL_RESULT: ${name}`,
      'The backend already executed this tool for the verified connected wallet. Use this as factual tool output and do not call the same wallet holdings tool again unless additional chain coverage is explicitly needed.',
      JSON.stringify(resultData.payload)
    ].join('\n')
  }]
});

const getVerifiedWalletContext = async (req, walletAddress) => {
  const normalizedWalletAddress = getWalletAddress(walletAddress);
  if (!normalizedWalletAddress || !req.get('authorization') || mongoose.connection.readyState !== 1) {
    return {
      normalizedWalletAddress,
      session: null,
      verifiedWalletAddress: null
    };
  }

  try {
    // sessionOrGuest already loaded the session; only look it up if it did not.
    const session = req.auth || await findSessionForRequest(req);
    if (!session || session.walletHash !== hashWallet(normalizedWalletAddress)) {
      return {
        normalizedWalletAddress,
        session: null,
        verifiedWalletAddress: null
      };
    }

    return {
      normalizedWalletAddress,
      session,
      verifiedWalletAddress: normalizedWalletAddress
    };
  } catch (error) {
    console.warn('Wallet context verification failed:', error.message);
    return {
      normalizedWalletAddress,
      session: null,
      verifiedWalletAddress: null
    };
  }
};

const trimConversationHistory = (history, maxTurns = 8) => {
  if (!Array.isArray(history) || history.length <= maxTurns * 2) {
    return history;
  }

  const first = history.slice(0, 2);
  const recent = history.slice(-(maxTurns * 2));

  return [
    ...first,
    ...recent
  ];
};

const buildContents = async (conversationHistory, userMessage, walletAddress, extraContext = [], routingOptions: Record<string, any> = {}) => {
  const trimmedHistory = trimConversationHistory(conversationHistory);
  const routingContext = await buildToolRoutingContext(userMessage, routingOptions);
  return [
    ...(trimmedHistory || []),
    ...(walletAddress ? [buildWalletContextContent(walletAddress)] : []),
    routingContext.content,
    ...extraContext,
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];
};

const preloadPortfolioHoldings = async (payload, walletContext, hooks: AgentLoopHooks = {}) => {
  if (!isPortfolioIntent(payload.userMessage)) {
    return {
      extraContext: [],
      initialToolResults: []
    };
  }

  if (!walletContext.verifiedWalletAddress) {
    throw Object.assign(new Error('Connect and verify an EVM wallet before running portfolio analysis.'), { status: 400 });
  }

  const name = 'get_wallet_holdings';
  const args = { address: walletContext.verifiedWalletAddress };
  hooks.onToolStart?.({ name, args, iteration: 0 });
  const resultData = await executeTool(name, args, { walletAddress: walletContext.verifiedWalletAddress });
  hooks.onToolDone?.(makeToolRecord(name, resultData));

  return {
    extraContext: [buildPreloadedToolContent(name, resultData)],
    initialToolResults: [{ name, resultData }]
  };
};

const parseChatPayload = (schema, req, res, sendError) => {
  const { data, error } = validatePayload(schema, req.body);
  if (error) {
    sendError(error);
    return null;
  }

  const userMessage = data.messages?.[data.messages.length - 1]?.content;
  if (!userMessage || !Array.isArray(data.messages)) {
    sendError('Invalid chat request payload.');
    return null;
  }

  return { ...data, userMessage };
};

export {
  sanitizeConversationHistory,
  chatRequestSchema,
  streamRequestSchema,
  getVerifiedWalletContext,
  buildContents,
  preloadPortfolioHoldings,
  parseChatPayload
};
