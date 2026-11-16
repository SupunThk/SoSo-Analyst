import express from 'express';
import { z } from 'zod';
import { buildSodexProfile } from '../clients/sodexProfile.ts';
import {
  getSodexOrderbook,
  getSodexSymbols,
  getSodexTickers
} from '../clients/sodex.ts';
import { getWalletAddress, requireSession, hashWallet } from '../utils/auth.ts';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';
import {
  checkPerpsOrder,
  getBuilderDailyChart,
  getBuilderSummary,
  getPerpsAccountState,
  getTradingConfig,
  getUserApiKeys,
  getUserBuilders,
  relaySigned
} from '../clients/sodexTrading.ts';
import { getTradeEventModel } from '../models/TradeEvent.ts';

const router = express.Router();
const statsCache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 10 });

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

// ── Trading with the SoSo Analyst builder code ──────────────────────────────

const publicConfig = () => {
  const config = getTradingConfig();
  return {
    enabled: config.enabled,
    network: config.network,
    chainId: config.chainId,
    builderId: config.builderId,
    builderFee: config.builderFee,
    maxOrderNotionalUsd: config.maxOrderNotionalUsd,
    maxLeverage: config.maxLeverage
  };
};

// The session wallet must be the wallet whose SoDEX account is touched.
const sessionWallet = (req, res) => {
  const walletAddress = getWalletAddress(req.params.walletAddress);
  if (!walletAddress) {
    res.status(400).json({ error: true, message: 'walletAddress must be a valid Ethereum address.' });
    return null;
  }
  if (hashWallet(walletAddress) !== req.auth.walletHash) {
    res.status(403).json({ error: true, message: 'Wallet session does not match requested wallet.' });
    return null;
  }
  return walletAddress;
};

const requireTradingEnabled = (req, res, next) => {
  if (!getTradingConfig().enabled) {
    return res.status(503).json({ error: true, message: 'In-app trading is not configured on this server yet.' });
  }
  next();
};

const sendUpstreamError = (res, error) => {
  if (error?.sodexCode !== undefined || error?.statusCode === 502) {
    return res.status(502).json({ error: true, message: error.message, sodexCode: error.sodexCode ?? null });
  }
  return null;
};

const findBuilderApproval = (builders, builderId) => {
  const pick = (list) => (Array.isArray(list) ? list : []).find((row) => Number(row?.builderID) === builderId);
  const perps = pick(builders?.perps);
  const spot = pick(builders?.spot);
  return {
    approved: Boolean(perps && Number(perps.feeRate) > 0),
    perpsFeeRate: perps ? Number(perps.feeRate) : 0,
    spotFeeRate: spot ? Number(spot.feeRate) : 0
  };
};

const findApiKey = (keys, name) => {
  const now = Date.now();
  const live = (list) => (Array.isArray(list) ? list : [])
    .find((key) => key?.name === name && (!Number(key.expiresAt) || Number(key.expiresAt) > now));
  const perps = live(keys?.perps);
  const spot = live(keys?.spot);
  return {
    registered: Boolean(perps && spot),
    publicKey: perps?.publicKey || null,
    expiresAt: perps ? Number(perps.expiresAt) : null
  };
};

router.get('/builder/config', (req, res) => {
  res.json(publicConfig());
});

const keyNameSchema = z.string().regex(/^[0-9a-zA-Z_-]{1,36}$/).refine((value) => value !== 'default');

router.get('/trading/status/:walletAddress', requireSession, requireTradingEnabled, async (req, res, next) => {
  const walletAddress = sessionWallet(req, res);
  if (!walletAddress) return;

  const keyName = keyNameSchema.safeParse(req.query.keyName);
  const config = getTradingConfig();

  try {
    const state = await getPerpsAccountState(walletAddress);
    const accountId = Number(state?.aid) || 0;
    if (!accountId) {
      return res.json({ config: publicConfig(), activated: false, accountId: null });
    }

    const [builders, keys] = await Promise.all([
      getUserBuilders(walletAddress),
      keyName.success ? getUserApiKeys(walletAddress, accountId, keyName.data) : Promise.resolve(null)
    ]);

    res.json({
      config: publicConfig(),
      activated: true,
      accountId,
      availableMarginUsd: Number(state?.am) || 0,
      accountValueUsd: Number(state?.av) || 0,
      builder: findBuilderApproval(builders, config.builderId),
      apiKey: keyName.success ? findApiKey(keys, keyName.data) : null,
      positions: (Array.isArray(state?.P) ? state.P : [])
        .filter((p) => Number(p?.sz) !== 0)
        .map((p) => ({
          symbol: p.s,
          size: p.sz,
          entryPrice: p.ep,
          unrealizedPnl: p.ur ?? null,
          leverage: p.l ?? null,
          liquidationPrice: p.lp ?? null
        })),
      openOrders: (Array.isArray(state?.O) ? state.O : []).slice(0, 50).map((o) => ({
        orderId: o.i,
        clientOrderId: o.c,
        symbol: o.s,
        side: o.S,
        type: o.o,
        price: o.p,
        quantity: o.q,
        filled: o.z,
        reduceOnly: o.R ?? false,
        stopPrice: o.sp ?? null,
        viaBuilder: Number(o.b?.i) === config.builderId
      }))
    });
  } catch (error) {
    if (!sendUpstreamError(res, error)) next(error);
  }
});

const builderParamsSchema = z.object({ id: z.number().int().positive(), fee: z.number().int().min(0).max(2000) });
const registerSchema = z.object({
  kind: z.enum(['addApiKeyWithBuilder', 'approveBuilderFee']),
  body: z.union([
    z.object({
      accountID: z.number().int().positive(),
      name: keyNameSchema,
      type: z.literal(1),
      publicKey: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      expiresAt: z.number().int().nonnegative(),
      builder: builderParamsSchema
    }).strict(),
    z.object({
      accountID: z.number().int().positive(),
      builderID: z.number().int().positive(),
      maxFeeRate: z.number().int().min(0).max(2000)
    }).strict()
  ]),
  headers: z.object({
    'x-api-sign': z.string().regex(/^0x02[0-9a-fA-F]{130}$/),
    'x-api-nonce': z.string().regex(/^\d{1,20}$/),
    'x-api-chain': z.string().regex(/^\d{1,20}$/)
  })
});

router.post('/trading/register/:walletAddress', requireSession, requireTradingEnabled, async (req, res, next) => {
  const walletAddress = sessionWallet(req, res);
  if (!walletAddress) return;

  const { data, error } = validate(registerSchema, req.body);
  if (error) return res.status(400).json({ error: true, message: error });

  const config = getTradingConfig();
  const body: any = data.body;
  const builderId = data.kind === 'addApiKeyWithBuilder' ? body.builder?.id : body.builderID;
  const fee = data.kind === 'addApiKeyWithBuilder' ? body.builder?.fee : body.maxFeeRate;
  if (builderId !== config.builderId || fee !== config.builderFee) {
    return res.status(400).json({ error: true, message: 'Approval must be for the SoSo Analyst builder code at the published fee.' });
  }

  try {
    const path = data.kind === 'addApiKeyWithBuilder'
      ? `/user/${walletAddress}/api-keys`
      : `/user/${walletAddress}/builders`;
    const result = await relaySigned(path, body, data.headers);
    res.json({ ok: true, result: result ?? null });
  } catch (err) {
    if (!sendUpstreamError(res, err)) next(err);
  }
});

const tradingHeadersSchema = z.object({
  'x-api-key': keyNameSchema,
  'x-api-sign': z.string().regex(/^0x01[0-9a-fA-F]{130}$/),
  'x-api-nonce': z.string().regex(/^\d{1,20}$/)
});

const orderSchema = z.object({
  symbol: z.string().min(1).max(40),
  source: z.enum(['chat', 'radar', 'charts', 'positions']).default('charts'),
  body: z.object({
    accountID: z.number().int().positive(),
    symbolID: z.number().int().positive(),
    orders: z.array(z.record(z.string(), z.unknown())).min(1).max(3),
    builder: builderParamsSchema.optional()
  }).strict(),
  headers: tradingHeadersSchema
});

const recordTradeEvent = async (walletAddress, data, notionalUsd, orderIds) => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const entry = data.body.orders[0] || {};
    await getTradeEventModel().create({
      walletHash: hashWallet(walletAddress),
      network: getTradingConfig().network,
      symbol: data.symbol,
      side: Number(entry.side) === 2 ? 'sell' : 'buy',
      notionalUsd,
      reduceOnly: entry.reduceOnly === true,
      source: data.source,
      orderIds
    });
  } catch (error) {
    console.warn('TradeEvent write failed:', error.message);
  }
};

router.post('/trading/order/:walletAddress', requireSession, requireTradingEnabled, async (req, res, next) => {
  const walletAddress = sessionWallet(req, res);
  if (!walletAddress) return;

  const { data, error } = validate(orderSchema, req.body);
  if (error) return res.status(400).json({ error: true, message: error });

  const check = checkPerpsOrder(data.body);
  if (!check.ok) return res.status(400).json({ error: true, message: check.reason });

  try {
    const result = await relaySigned('/perps/trade/orders', data.body, data.headers);
    const results = Array.isArray(result) ? result : [];
    const accepted = results.filter((row) => Number(row?.code) === 0);
    if (accepted.length) {
      await recordTradeEvent(walletAddress, data, check.notionalUsd, accepted.map((row) => String(row.orderID ?? row.clOrdID)));
    }
    res.json({ ok: accepted.length > 0, results });
  } catch (err) {
    if (!sendUpstreamError(res, err)) next(err);
  }
});

const leverageSchema = z.object({
  body: z.object({
    accountID: z.number().int().positive(),
    symbolID: z.number().int().positive(),
    leverage: z.number().int().min(1),
    marginMode: z.union([z.literal(1), z.literal(2)])
  }).strict(),
  headers: tradingHeadersSchema
});

router.post('/trading/leverage/:walletAddress', requireSession, requireTradingEnabled, async (req, res, next) => {
  const walletAddress = sessionWallet(req, res);
  if (!walletAddress) return;

  const { data, error } = validate(leverageSchema, req.body);
  if (error) return res.status(400).json({ error: true, message: error });
  if (data.body.leverage > getTradingConfig().maxLeverage) {
    return res.status(400).json({ error: true, message: `Leverage above ${getTradingConfig().maxLeverage}x is disabled in this app.` });
  }

  try {
    const result = await relaySigned('/perps/trade/leverage', data.body, data.headers);
    res.json({ ok: true, result: result ?? null });
  } catch (err) {
    if (!sendUpstreamError(res, err)) next(err);
  }
});

const cancelSchema = z.object({
  body: z.object({
    accountID: z.number().int().positive(),
    cancels: z.array(z.object({
      symbolID: z.number().int().positive(),
      orderID: z.number().int().positive().optional(),
      clOrdID: z.string().regex(/^[0-9a-zA-Z_-]{1,36}$/).optional()
    }).strict()).min(1).max(20)
  }).strict(),
  headers: tradingHeadersSchema
});

router.post('/trading/cancel/:walletAddress', requireSession, requireTradingEnabled, async (req, res, next) => {
  const walletAddress = sessionWallet(req, res);
  if (!walletAddress) return;

  const { data, error } = validate(cancelSchema, req.body);
  if (error) return res.status(400).json({ error: true, message: error });

  try {
    const result = await relaySigned('/perps/trade/orders', data.body, data.headers, 'DELETE');
    res.json({ ok: true, result: result ?? null });
  } catch (err) {
    if (!sendUpstreamError(res, err)) next(err);
  }
});

router.get('/builder/stats', async (req, res, next) => {
  const config = getTradingConfig();
  if (!config.builderAddress) {
    return res.json({ config: publicConfig(), summary: null, daily: [], appTrades: null });
  }

  const cached = statsCache.get('stats');
  if (cached) return res.json(cached);

  try {
    const [summary, daily, appTrades] = await Promise.all([
      getBuilderSummary(config.builderAddress).catch(() => null),
      getBuilderDailyChart(config.builderAddress, 90).catch(() => []),
      mongoose.connection.readyState === 1
        ? getTradeEventModel().aggregate([
          { $match: { network: config.network } },
          { $group: { _id: '$source', trades: { $sum: 1 }, notionalUsd: { $sum: '$notionalUsd' }, wallets: { $addToSet: '$walletHash' } } },
          { $project: { _id: 0, source: '$_id', trades: 1, notionalUsd: 1, wallets: { $size: '$wallets' } } }
        ])
        : Promise.resolve(null)
    ]);

    const payload = {
      config: publicConfig(),
      summary,
      daily: Array.isArray(daily) ? daily : [],
      appTrades,
      asOf: new Date().toISOString()
    };
    statsCache.set('stats', payload);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
