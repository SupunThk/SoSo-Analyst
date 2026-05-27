const crypto = require('crypto');
const { ethers } = require('ethers');
const User = require('../models/User');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

const getWalletAddress = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (!ethers.isAddress(trimmed)) {
    return null;
  }

  return ethers.getAddress(trimmed);
};

const hashValue = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

const hashWallet = (address) => {
  const normalized = getWalletAddress(address);
  if (!normalized) throw new Error('Invalid wallet address for hashing.');
  return hashValue(normalized.toLowerCase());
};

const createNonce = () => crypto.randomBytes(16).toString('hex');

const createSessionToken = () => crypto.randomBytes(32).toString('base64url');

const buildLoginMessage = (walletAddress, nonce) =>
  [
    'Sign in to SoSo Analyst.',
    '',
    `Wallet: ${getWalletAddress(walletAddress)}`,
    `Nonce: ${nonce}`,
    '',
    'This signature proves wallet ownership and does not authorize a blockchain transaction.'
  ].join('\n');

const getBearerToken = (req) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim();
};

const findSessionForRequest = async (req) => {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const now = new Date();
  const user = await User.findOne({
    sessionTokenHash: hashValue(token),
    sessionExpiresAt: { $gt: now }
  });

  if (!user) {
    return null;
  }

  return {
    user,
    walletAddress: user.publicWalletAddress,
    walletHash: user.walletAddress
  };
};

const requireSession = async (req, res, next) => {
  try {
    const session = await findSessionForRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Valid wallet session is required.' });
    }

    req.auth = session;
    next();
  } catch (error) {
    console.error('Session auth error:', error);
    res.status(500).json({ error: 'Failed to authenticate session.' });
  }
};

module.exports = {
  NONCE_TTL_MS,
  SESSION_TTL_MS,
  buildLoginMessage,
  createNonce,
  createSessionToken,
  findSessionForRequest,
  getWalletAddress,
  hashValue,
  hashWallet,
  requireSession
};
