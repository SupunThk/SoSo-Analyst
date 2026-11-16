import express from 'express';
import {
  handleChat,
  handleChatStream,
  handleTicker
} from '../handlers/agentHandlers.ts';
import { sessionOrGuest } from '../utils/guestAccess.ts';

const router = express.Router();

// Chat runs paid Gemini calls: signed-in wallets use the normal rate limits,
// and signed-out guests get a small daily allowance (GUEST_CHAT_DAILY_LIMIT).
router.post('/chat', sessionOrGuest, handleChat);
router.post('/chat/stream', sessionOrGuest, handleChatStream);
router.get('/ticker', handleTicker);

export default router;
