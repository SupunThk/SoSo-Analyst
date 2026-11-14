import express from 'express';
import {
  handleChat,
  handleChatStream,
  handleTicker
} from '../handlers/agentHandlers.ts';
import { requireSession } from '../utils/auth.ts';

const router = express.Router();

// Chat runs paid Gemini calls, so it needs a signed-in wallet session.
router.post('/chat', requireSession, handleChat);
router.post('/chat/stream', requireSession, handleChatStream);
router.get('/ticker', handleTicker);

export default router;
