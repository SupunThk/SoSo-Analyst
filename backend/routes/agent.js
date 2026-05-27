const express = require('express');
const {
  handleChat,
  handleChatStream,
  handleTicker
} = require('../handlers/agentHandlers');

const router = express.Router();

router.post('/chat', handleChat);
router.post('/chat/stream', handleChatStream);
router.get('/ticker', handleTicker);

module.exports = router;
