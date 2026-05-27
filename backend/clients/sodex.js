const axios = require('axios');
const { getPositiveInteger } = require('../utils/common');

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const SODEX_NETWORK = String(process.env.SODEX_NETWORK || 'mainnet').toLowerCase() === 'testnet'
  ? 'testnet'
  : 'mainnet';
const DEFAULT_REST_BASE = SODEX_NETWORK === 'testnet'
  ? 'https://testnet-gw.sodex.dev/api/v1'
  : 'https://mainnet-gw.sodex.dev/api/v1';
const SODEX_REST_BASE = trimTrailingSlash(process.env.SODEX_REST_BASE_URL || process.env.SODEX_API_URL || DEFAULT_REST_BASE);
const SODEX_SPOT_API_BASE = trimTrailingSlash(process.env.SODEX_SPOT_API_BASE || `${SODEX_REST_BASE}/spot`);
const SODEX_PERPS_API_BASE = trimTrailingSlash(process.env.SODEX_PERPS_API_BASE || `${SODEX_REST_BASE}/perps`);
const SODEX_API_KEY_NAME = process.env.SODEX_API_KEY_NAME || process.env.SODEX_API_KEY || '';
const SODEX_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.SODEX_REQUEST_TIMEOUT_MS, 15000);

const assertSodexSuccess = (payload) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'code') && Number(payload.code) !== 0) {
    const error = new Error(payload.error || payload.message || `SoDEX API returned code ${payload.code}`);
    error.sodexCode = payload.code;
    throw error;
  }

  if (payload && payload.success === false) {
    const error = new Error(payload.message || 'SoDEX API returned an error');
    error.sodexCode = payload.code;
    throw error;
  }
  return payload;
};

const getMarketBase = (market = 'spot') => {
  if (market === 'perps') return SODEX_PERPS_API_BASE;
  return SODEX_SPOT_API_BASE;
};

const sodexPublicGet = async (market, path, params = {}) => {
  const response = await axios.get(`${getMarketBase(market)}${path}`, {
    headers: {
      Accept: 'application/json'
    },
    params,
    timeout: SODEX_REQUEST_TIMEOUT_MS
  });

  return assertSodexSuccess(response.data);
};

const sodexSignedPost = async (market, path, body = {}, headers = {}) => {
  const requestHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...headers
  };

  if (SODEX_API_KEY_NAME && !requestHeaders['X-API-Key']) {
    requestHeaders['X-API-Key'] = SODEX_API_KEY_NAME;
  }

  const response = await axios.post(`${getMarketBase(market)}${path}`, body, {
    headers: requestHeaders,
    timeout: SODEX_REQUEST_TIMEOUT_MS
  });

  return assertSodexSuccess(response.data);
};

const sodexGet = async (path, params = {}, market = 'spot') => sodexPublicGet(market, path, params);

const sodexPost = async (path, body = {}, headers = {}, market = 'spot') =>
  sodexSignedPost(market, path, body, headers);

const getSodexData = (payload) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }

  return payload;
};

const getSodexAccountState = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/state`, params);
  return getSodexData(response);
};

const getSodexOpenOrders = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/orders`, params);
  return getSodexData(response);
};

const getSodexOrderHistory = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/orders/history`, params);
  return getSodexData(response);
};

const getSodexTrades = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/trades`, params);
  return getSodexData(response);
};

const getSodexTickers = async (market, params = {}) => {
  const response = await sodexPublicGet(market, '/markets/tickers', params);
  return getSodexData(response);
};

const getSodexSymbols = async (market, params = {}) => {
  const response = await sodexPublicGet(market, '/markets/symbols', params);
  return getSodexData(response);
};

const getSodexOrderbook = async (market, symbol, params = {}) => {
  const response = await sodexPublicGet(market, `/markets/${encodeURIComponent(symbol)}/orderbook`, params);
  return getSodexData(response);
};

const getSodexFeeRate = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/fee-rate`, params);
  return getSodexData(response);
};

const getSodexApiKeys = async (market, walletAddress, params = {}) => {
  const response = await sodexPublicGet(market, `/accounts/${encodeURIComponent(walletAddress)}/api-keys`, params);
  return getSodexData(response);
};

const getSodexFundingHistory = async (walletAddress, params = {}) => {
  const response = await sodexPublicGet('perps', `/accounts/${encodeURIComponent(walletAddress)}/fundings`, params);
  return getSodexData(response);
};

const getSodexPositionHistory = async (walletAddress, params = {}) => {
  const response = await sodexPublicGet('perps', `/accounts/${encodeURIComponent(walletAddress)}/positions/history`, params);
  return getSodexData(response);
};

const postSodexTransfer = async (market, body = {}, headers = {}) => {
  const response = await axios.post(`${getMarketBase(market)}/accounts/transfers`, body, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(SODEX_API_KEY_NAME ? { 'X-API-Key': SODEX_API_KEY_NAME } : {}),
      ...headers
    },
    timeout: SODEX_REQUEST_TIMEOUT_MS
  });

  return assertSodexSuccess(response.data);
};

module.exports = {
  getSodexAccountState,
  getSodexApiKeys,
  getSodexData,
  getSodexFeeRate,
  getSodexFundingHistory,
  getSodexOpenOrders,
  getSodexOrderHistory,
  getSodexOrderbook,
  getSodexPositionHistory,
  getSodexSymbols,
  getSodexTickers,
  getSodexTrades,
  postSodexTransfer,
  sodexGet,
  sodexPost,
  sodexPublicGet,
  sodexSignedPost,
  SODEX_NETWORK,
  SODEX_PERPS_API_BASE,
  SODEX_REST_BASE,
  SODEX_SPOT_API_BASE
};
