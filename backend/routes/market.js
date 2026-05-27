const express = require('express');
const { z } = require('zod');
const {
  buildMarketIntelligence,
  buildTokenIntelligence
} = require('../services/marketIntelligence');

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

module.exports = router;
