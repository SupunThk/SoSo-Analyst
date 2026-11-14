const express = require('express');
const {
  handleChat,
  handleChatStream,
  handleTicker
} = require('../handlers/agentHandlers');
const { requireSession } = require('../utils/auth');

const router = express.Router();

// Chat runs paid Gemini calls, so it needs a signed-in wallet session.
router.post('/chat', requireSession, handleChat);
router.post('/chat/stream', requireSession, handleChatStream);
router.get('/ticker', handleTicker);

module.exports = router;
