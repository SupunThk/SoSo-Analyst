const express = require('express');
const { z } = require('zod');
const { buildSodexProfile } = require('../clients/sodexProfile');
const {
  getSodexOrderbook,
  getSodexSymbols,
  getSodexTickers
} = require('../clients/sodex');
const { getWalletAddress, requireSession, hashWallet } = require('../utils/auth');

const router = express.Router();

const marketSchema = z.enum(['spot', 'perps']).default('spot');
const limitSchema = z.coerce.number().int().min(1).max(100).optional();
const orderbookSchema = z.object({
  market: marketSchema.optional(),
  limit: limitSchema
});

const validate = (schema, value) => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { data: parsed.data };
  return { error: parsed.error.issues.map((issue) => issue.message).join(', ') };
};

const resolveMarket = (value, symbol = '') => {
  const parsed = marketSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return String(symbol).includes('-') ? 'perps' : 'spot';
};

router.get('/profile/:walletAddress', requireSession, async (req, res, next) => {
  try {
    const walletAddress = getWalletAddress(req.params.walletAddress);
    if (!walletAddress) {
      return res.status(400).json({ error: true, message: 'walletAddress must be a valid Ethereum address.' });
    }

    if (hashWallet(walletAddress) !== req.auth.walletHash) {
      return res.status(403).json({ error: true, message: 'Wallet session does not match requested wallet.' });
    }

    const profile = await buildSodexProfile(walletAddress);
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/markets', async (req, res, next) => {
  try {
    const market = resolveMarket(req.query.market);
    const [symbols, tickers] = await Promise.all([
      getSodexSymbols(market),
      getSodexTickers(market)
    ]);

    res.json({ market, symbols, tickers });
  } catch (error) {
    next(error);
  }
});

router.get('/markets/:symbol/orderbook', async (req, res, next) => {
  const { data, error } = validate(orderbookSchema, req.query);
  if (error) {
    return res.status(400).json({ error: true, message: error });
  }

  try {
    const market = resolveMarket(data.market, req.params.symbol);
    const orderbook = await getSodexOrderbook(market, req.params.symbol, {
      ...(data.limit ? { limit: data.limit } : {})
    });

    res.json({ market, symbol: req.params.symbol, orderbook });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
