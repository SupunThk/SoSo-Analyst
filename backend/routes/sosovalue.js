const express = require('express');
const axios = require('axios');
const router = express.Router();

const BASE_URL = 'https://openapi.sosovalue.com/openapi/v1';

const sosoRequest = async (path, req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}${path}`, {
      headers: {
        'x-soso-api-key': process.env.SOSO_API_KEY
      },
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const message = error.response ? error.response.data : error.message;
    res.status(status).json({ error: true, message, status });
  }
};

// Currencies
router.get('/currencies', (req, res) => sosoRequest('/currencies', req, res));
router.get('/currencies/sector-spotlight', (req, res) => sosoRequest('/currencies/sector-spotlight', req, res));
router.get('/currencies/:id', (req, res) => sosoRequest(`/currencies/${req.params.id}`, req, res));
router.get('/currencies/:id/market-snapshot', (req, res) => sosoRequest(`/currencies/${req.params.id}/market-snapshot`, req, res));
router.get('/currencies/:id/klines', (req, res) => sosoRequest(`/currencies/${req.params.id}/klines`, req, res));
router.get('/currencies/:id/supply', (req, res) => sosoRequest(`/currencies/${req.params.id}/supply`, req, res));
router.get('/currencies/:id/pairs', (req, res) => sosoRequest(`/currencies/${req.params.id}/pairs`, req, res));

// ETFs
router.get('/etfs/summary-history', (req, res) => sosoRequest('/etfs/summary-history', req, res));
router.get('/etfs', (req, res) => sosoRequest('/etfs', req, res));
router.get('/etfs/:ticker/market-snapshot', (req, res) => sosoRequest(`/etfs/${req.params.ticker}/market-snapshot`, req, res));
router.get('/etfs/:ticker/history', (req, res) => sosoRequest(`/etfs/${req.params.ticker}/history`, req, res));

// Indices
router.get('/indices', (req, res) => sosoRequest('/indices', req, res));
router.get('/indices/:ticker/constituents', (req, res) => sosoRequest(`/indices/${req.params.ticker}/constituents`, req, res));
router.get('/indices/:ticker/market-snapshot', (req, res) => sosoRequest(`/indices/${req.params.ticker}/market-snapshot`, req, res));
router.get('/indices/:ticker/klines', (req, res) => sosoRequest(`/indices/${req.params.ticker}/klines`, req, res));

// Crypto Stocks
router.get('/crypto-stocks', (req, res) => sosoRequest('/crypto-stocks', req, res));
router.get('/crypto-stocks/sector', (req, res) => sosoRequest('/crypto-stocks/sector', req, res));
router.get('/crypto-stocks/:ticker/market-snapshot', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/market-snapshot`, req, res));
router.get('/crypto-stocks/:ticker/market-cap', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/market-cap`, req, res));
router.get('/crypto-stocks/:ticker/klines', (req, res) => sosoRequest(`/crypto-stocks/${req.params.ticker}/klines`, req, res));

// BTC Treasuries
router.get('/btc-treasuries', (req, res) => sosoRequest('/btc-treasuries', req, res));
router.get('/btc-treasuries/:ticker/purchase-history', (req, res) => sosoRequest(`/btc-treasuries/${req.params.ticker}/purchase-history`, req, res));

// News
router.get('/news', (req, res) => sosoRequest('/news', req, res));
router.get('/news/hot', (req, res) => sosoRequest('/news/hot', req, res));
router.get('/news/featured', (req, res) => sosoRequest('/news/featured', req, res));
router.get('/news/search', (req, res) => sosoRequest('/news/search', req, res));

// Fundraising
router.get('/fundraising/projects', (req, res) => sosoRequest('/fundraising/projects', req, res));
router.get('/fundraising/projects/:id', (req, res) => sosoRequest(`/fundraising/projects/${req.params.id}`, req, res));

// Macro
router.get('/macro/events', (req, res) => sosoRequest('/macro/events', req, res));
router.get('/macro/events/:event/history', (req, res) => sosoRequest(`/macro/events/${req.params.event}/history`, req, res));

// Analyses
router.get('/analyses', (req, res) => sosoRequest('/analyses', req, res));
router.get('/analyses/:chart_name', (req, res) => sosoRequest(`/analyses/${req.params.chart_name}`, req, res));

module.exports = router;
