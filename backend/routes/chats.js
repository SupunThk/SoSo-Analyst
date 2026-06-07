const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { z } = require('zod');
const Chat = require('../models/Chat');
const User = require('../models/User');
const {
  NONCE_TTL_MS,
  SESSION_TTL_MS,
  buildLoginMessage,
  createNonce,
  createSessionToken,
  getWalletAddress,
  hashValue,
  hashWallet,
  requireSession
} = require('../utils/auth');

const router = express.Router();

const walletAddressSchema = z.string().refine((value) => Boolean(getWalletAddress(value)), {
  message: 'walletAddress must be a valid Ethereum address'
});

const nonceSchema = z.object({
  walletAddress: walletAddressSchema
});

const verifySchema = z.object({
  walletAddress: walletAddressSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'signature must be a hex string')
});

const createChatSchema = z.object({
  walletAddress: walletAddressSchema,
  title: z.string().trim().min(1).max(120).optional()
});

const feedbackSchema = z.object({
  messageIndex: z.number().int().min(0),
  rating: z.enum(['up', 'down'])
});

const validate = (schema, value) => {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data };
  }

  return {
    error: parsed.error.issues.map((issue) => issue.message).join(', ')
  };
};

const ensureDatabase = (res) => {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  res.status(503).json({ error: 'Database unavailable. Configure MONGO_URI and ensure MongoDB is connected.' });
  return false;
};

const ensureWalletOwner = (req, res, walletAddress) => {
  if (hashWallet(walletAddress) === req.auth.walletHash) {
    return true;
  }

  res.status(403).json({ error: 'Wallet session does not match requested wallet.' });
  return false;
};

router.post('/auth/nonce', async (req, res) => {
  if (!ensureDatabase(res)) return;

  const { data, error } = validate(nonceSchema, req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const walletAddress = getWalletAddress(data.walletAddress);
    const walletHash = hashWallet(walletAddress);
    const now = new Date();
    const existingUser = await User.findOne({ walletAddress: walletHash });
    let nonce = existingUser?.loginNonce;
    let expiresAt = existingUser?.loginNonceExpiresAt;

    if (!nonce || !expiresAt || expiresAt <= now) {
      nonce = createNonce();
      expiresAt = new Date(Date.now() + NONCE_TTL_MS);

      await User.findOneAndUpdate(
        { walletAddress: walletHash },
        {
          $set: {
            publicWalletAddress: walletAddress,
            loginNonce: nonce,
            loginNonceExpiresAt: expiresAt
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    res.json({
      walletAddress,
      message: buildLoginMessage(walletAddress, nonce),
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('Nonce error:', err);
    res.status(500).json({ error: 'Failed to create wallet nonce.' });
  }
});

router.post('/auth/verify', async (req, res) => {
  if (!ensureDatabase(res)) return;

  const { data, error } = validate(verifySchema, req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const walletAddress = getWalletAddress(data.walletAddress);
    const walletHash = hashWallet(walletAddress);
    const user = await User.findOne({ walletAddress: walletHash });

    if (!user?.loginNonce || !user.loginNonceExpiresAt || user.loginNonceExpiresAt <= new Date()) {
      return res.status(400).json({ error: 'Login nonce is missing or expired.' });
    }

    const message = buildLoginMessage(walletAddress, user.loginNonce);
    const recoveredAddress = ethers.verifyMessage(message, data.signature);

    if (ethers.getAddress(recoveredAddress) !== walletAddress) {
      return res.status(401).json({ error: 'Wallet signature verification failed.' });
    }

    const token = createSessionToken();
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const expectedNonce = user.loginNonce;

    const updatedUser = await User.findOneAndUpdate(
      {
        walletAddress: walletHash,
        loginNonce: expectedNonce,
        loginNonceExpiresAt: { $gt: new Date() }
      },
      {
        $set: {
          publicWalletAddress: walletAddress,
          lastLogin: new Date(),
          sessionTokenHash: hashValue(token),
          sessionExpiresAt
        },
        $unset: {
          loginNonce: '',
          loginNonceExpiresAt: ''
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ error: 'Login nonce is missing, expired, or already used.' });
    }

    res.json({
      success: true,
      walletAddress,
      token,
      expiresAt: sessionExpiresAt.toISOString()
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(401).json({ error: 'Wallet signature verification failed.' });
  }
});

router.get('/session/:chatId', requireSession, async (req, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      walletAddress: req.auth.walletHash
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json(chat);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    console.error('Fetch session error:', err);
    res.status(500).json({ error: 'Failed to fetch chat session' });
  }
});

router.get('/:walletAddress', requireSession, async (req, res) => {
  if (!ensureDatabase(res)) return;

  const walletAddress = getWalletAddress(req.params.walletAddress);
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress must be a valid Ethereum address' });
  }
  if (!ensureWalletOwner(req, res, walletAddress)) {
    return;
  }

  try {
    const chats = await Chat.find({ walletAddress: req.auth.walletHash })
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.json(chats);
  } catch (err) {
    console.error('Fetch chats error:', err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

router.post('/', requireSession, async (req, res) => {
  if (!ensureDatabase(res)) return;

  const { data, error } = validate(createChatSchema, req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const walletAddress = getWalletAddress(data.walletAddress);
  if (!ensureWalletOwner(req, res, walletAddress)) {
    return;
  }

  try {
    const newChat = new Chat({
      walletAddress: req.auth.walletHash,
      title: data.title || 'New Research Terminal',
      messages: []
    });

    await newChat.save();
    res.json(newChat);
  } catch (err) {
    console.error('Create chat error:', err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

router.post('/:chatId/feedback', requireSession, async (req, res) => {
  if (!ensureDatabase(res)) return;

  const { data, error } = validate(feedbackSchema, req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      walletAddress: req.auth.walletHash
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (data.messageIndex >= chat.messages.length) {
      return res.status(400).json({ error: 'messageIndex is out of range.' });
    }

    const message = chat.messages[data.messageIndex];
    if (message.role !== 'assistant') {
      return res.status(400).json({ error: 'Feedback is only supported on assistant messages.' });
    }

    message.feedback = {
      rating: data.rating,
      at: new Date()
    };
    await chat.save();

    res.json({
      success: true,
      chatId: chat._id,
      messageIndex: data.messageIndex,
      feedback: message.feedback
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to save message feedback.' });
  }
});

router.delete('/:chatId', requireSession, async (req, res) => {
  if (!ensureDatabase(res)) return;

  try {
    const chat = await Chat.findOneAndDelete({
      _id: req.params.chatId,
      walletAddress: req.auth.walletHash
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true, _id: chat._id });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    console.error('Delete chat error:', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

module.exports = router;
