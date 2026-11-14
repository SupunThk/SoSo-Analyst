import express from 'express';
import { z } from 'zod';
import {
  buildMarketIntelligence,
  buildTokenIntelligence
} from '../services/marketIntelligence.ts';
import { getPerpAsset, getPerpBoard } from '../services/perps.ts';

const router = express.Router();

const forceSchema = z.object({
  force: z.enum(['0', '1', 'true', 'false']).optional()
});

const tokenParamsSchema = z.object({
  asset: z.string().trim().min(1).max(32)
});

const shouldForce = (value) => value === '1' || value === 'true';

router.get('/intelligence', async (req, res, next) => {
  try {
    const parsed = forceSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: true, message: 'Invalid market intelligence query parameters.' });
    }

    const data = await buildMarketIntelligence({ force: shouldForce(parsed.data.force) });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/token/:asset', async (req, res, next) => {
  try {
    const parsedParams = tokenParamsSchema.safeParse(req.params);
    const parsedQuery = forceSchema.safeParse(req.query);
    if (!parsedParams.success || !parsedQuery.success) {
      return res.status(400).json({ error: true, message: 'Invalid token intelligence request.' });
    }

    const data = await buildTokenIntelligence(parsedParams.data.asset, {
      force: shouldForce(parsedQuery.data.force)
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Cross-venue crypto perpetuals (SoSoValue v3). Both routes share one cached
// upstream catalog call, so they are cheap to poll.
const perpAssetSchema = z.object({
  asset: z.string().trim().regex(/^[A-Za-z0-9]{1,20}$/)
});
const perpBoardSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});

const sendPerpError = (error, res, next) => {
  if (error.response?.status === 429) {
    return res.status(429).json({ error: true, message: 'SoSoValue rate limit reached. Try again in a minute.' });
  }
  if (error.response || error.sosoCode !== undefined || error.code === 'ECONNABORTED') {
    return res.status(502).json({ error: true, message: 'SoSoValue perpetuals data is unavailable right now.' });
  }
  return next(error);
};

router.get('/perps', async (req, res, next) => {
  const parsed = perpBoardSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: true, message: 'Invalid perps query parameters.' });
  }
  try {
    res.json(await getPerpBoard({ limit: parsed.data.limit ?? 30 }));
  } catch (error) {
    sendPerpError(error, res, next);
  }
});

router.get('/perps/:asset', async (req, res, next) => {
  const parsed = perpAssetSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: true, message: 'Invalid asset symbol.' });
  }
  try {
    const data = await getPerpAsset(parsed.data.asset);
    res.status(data.found ? 200 : 404).json(data);
  } catch (error) {
    sendPerpError(error, res, next);
  }
});

export default router;
