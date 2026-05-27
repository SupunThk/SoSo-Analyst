const axios = require('axios');
const { asArray } = require('../../normalizers/toolResult');
const { getPositiveInteger, sleep } = require('./shared');

const ETHERSCAN_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.ETHERSCAN_REQUEST_TIMEOUT_MS, 15000);
const OPENOCEAN_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.OPENOCEAN_REQUEST_TIMEOUT_MS, 15000);
const COINGECKO_REQUEST_TIMEOUT_MS = getPositiveInteger(process.env.COINGECKO_REQUEST_TIMEOUT_MS, 10000);
const ETHERSCAN_MIN_INTERVAL_MS = getPositiveInteger(process.env.ETHERSCAN_MIN_INTERVAL_MS, 375);
const ETHERSCAN_RETRY_DELAY_MS = getPositiveInteger(process.env.ETHERSCAN_RETRY_DELAY_MS, 1200);
const ETHERSCAN_API_BASE = 'https://api.etherscan.io/v2/api';
const COINGECKO_SIMPLE_PRICE_BASE = 'https://api.coingecko.com/api/v3/simple/price';

const DEFAULT_ETHERSCAN_CHAINS = [
  { chainId: '1', name: 'Ethereum Mainnet', nativeSymbol: 'ETH', nativeName: 'Ethereum', priceSymbols: ['ETH'], priceIds: ['ethereum'] },
  { chainId: '8453', name: 'Base Mainnet', nativeSymbol: 'ETH', nativeName: 'Ethereum', priceSymbols: ['ETH'], priceIds: ['ethereum'] },
  { chainId: '56', name: 'BNB Smart Chain', nativeSymbol: 'BNB', nativeName: 'BNB', priceSymbols: ['BNB'], priceIds: ['binancecoin'] },
  { chainId: '137', name: 'Polygon Mainnet', nativeSymbol: 'POL', nativeName: 'Polygon', priceSymbols: ['POL', 'MATIC'], priceIds: ['polygon-ecosystem-token', 'matic-network'] },
  { chainId: '42161', name: 'Arbitrum One', nativeSymbol: 'ETH', nativeName: 'Ethereum', priceSymbols: ['ETH'], priceIds: ['ethereum'] },
  { chainId: '10', name: 'OP Mainnet', nativeSymbol: 'ETH', nativeName: 'Ethereum', priceSymbols: ['ETH'], priceIds: ['ethereum'] },
  { chainId: '43114', name: 'Avalanche C-Chain', nativeSymbol: 'AVAX', nativeName: 'Avalanche', priceSymbols: ['AVAX'], priceIds: ['avalanche-2'] }
];

const ETHERSCAN_CHAIN_BY_ID = Object.fromEntries(DEFAULT_ETHERSCAN_CHAINS.map((chain) => [chain.chainId, chain]));
const lastEtherscanRequestAt = new Map();
const etherscanRequestQueue = new Map();
let nativePriceCache = { expiresAt: 0, prices: {} };

const getConfiguredEtherscanChains = () => {
  const configuredIds = String(process.env.ETHERSCAN_CHAIN_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!configuredIds.length) {
    return DEFAULT_ETHERSCAN_CHAINS;
  }

  return configuredIds.map((chainId) =>
    ETHERSCAN_CHAIN_BY_ID[chainId] || {
      chainId,
      name: `Chain ${chainId}`,
      nativeSymbol: chainId === '56' ? 'BNB' : 'ETH',
      nativeName: chainId === '56' ? 'BNB' : 'Native token',
      priceIds: chainId === '56' ? ['binancecoin'] : ['ethereum']
    }
  );
};

const tokenAmountFromRaw = (rawValue, decimals = 18) => {
  const raw = String(rawValue ?? '0').trim();
  if (!/^\d+$/.test(raw)) {
    return 0;
  }

  const decimalCount = Math.max(Number(decimals) || 0, 0);
  if (decimalCount === 0) {
    const integerValue = Number(raw);
    return Number.isFinite(integerValue) ? integerValue : 0;
  }

  const padded = raw.padStart(decimalCount + 1, '0');
  const whole = padded.slice(0, -decimalCount) || '0';
  const fraction = padded.slice(-decimalCount).replace(/0+$/, '');
  const value = Number(`${whole}${fraction ? `.${fraction}` : ''}`);
  return Number.isFinite(value) ? value : 0;
};

const isEtherscanEmptyResult = (payload) =>
  payload?.status === '0' &&
  typeof payload?.result === 'string' &&
  /no .*found/i.test(payload.result);

const getEtherscanResult = (payload) => {
  if (payload?.status === '1') {
    return payload.result;
  }

  if (isEtherscanEmptyResult(payload)) {
    return [];
  }

  throw new Error(payload?.result || payload?.message || 'Etherscan returned an unsuccessful response.');
};

const isEtherscanRateLimitPayload = (payload) =>
  payload?.status === '0' &&
  /rate limit|too many requests|max calls/i.test(String(payload?.result || payload?.message || ''));

const runQueuedEtherscanRequest = (params) => {
  const chainId = params.chainid || 'default';

  const run = async () => {
    const lastAt = lastEtherscanRequestAt.get(chainId) || 0;
    const elapsed = Date.now() - lastAt;
    const waitMs = Math.max(ETHERSCAN_MIN_INTERVAL_MS - elapsed, 0);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastEtherscanRequestAt.set(chainId, Date.now());
    return axios.get(ETHERSCAN_API_BASE, {
      params,
      timeout: ETHERSCAN_REQUEST_TIMEOUT_MS
    });
  };

  const currentQueue = etherscanRequestQueue.get(chainId) || Promise.resolve();
  const scheduled = currentQueue.then(run, run);
  etherscanRequestQueue.set(chainId, scheduled.catch(() => {}));
  return scheduled;
};

const NodeCache = require('node-cache');
const etherscanCache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 500 });

const toCacheableResponse = (response) => ({
  data: response?.data,
  status: response?.status,
  statusText: response?.statusText
});

const getEtherscan = async (params) => {
  const cacheKey = JSON.stringify(params);
  const cached = etherscanCache.get(cacheKey);
  if (cached) return cached;

  let lastRateLimitResponse = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await runQueuedEtherscanRequest(params);
    if (!isEtherscanRateLimitPayload(response.data)) {
      const cacheableResponse = toCacheableResponse(response);
      etherscanCache.set(cacheKey, cacheableResponse);
      return cacheableResponse;
    }

    lastRateLimitResponse = response;
    await sleep(ETHERSCAN_RETRY_DELAY_MS * (attempt + 1));
  }

  return lastRateLimitResponse;
};

const findOpenOceanPrice = (records, symbol, contract) => {
  const normalizedSymbols = (Array.isArray(symbol) ? symbol : [symbol])
    .map((item) => String(item || '').toUpperCase())
    .filter(Boolean);
  const normalizedContract = String(contract || '').toLowerCase();
  const match = records.find((item) =>
    normalizedSymbols.includes(String(item.symbol || '').toUpperCase()) ||
    (normalizedContract && String(item.address || item.tokenAddress || '').toLowerCase() === normalizedContract)
  );

  const price = Number(match?.price || match?.usdPrice || match?.tokenPrice || 0);
  return Number.isFinite(price) ? price : 0;
};

const getNativePriceFromMap = (priceMap, chain) => {
  const priceIds = Array.isArray(chain.priceIds) ? chain.priceIds : [];
  for (const id of priceIds) {
    const price = Number(priceMap[id]?.usd || 0);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }
  return 0;
};

const getNativePriceMap = async (chains) => {
  if (nativePriceCache.expiresAt > Date.now()) {
    return nativePriceCache.prices;
  }

  const ids = [...new Set(chains.flatMap((chain) => chain.priceIds || []))].filter(Boolean);
  if (!ids.length) {
    return {};
  }

  try {
    const response = await axios.get(COINGECKO_SIMPLE_PRICE_BASE, {
      params: {
        ids: ids.join(','),
        vs_currencies: 'usd'
      },
      timeout: COINGECKO_REQUEST_TIMEOUT_MS
    });
    nativePriceCache = {
      expiresAt: Date.now() + 60 * 1000,
      prices: response.data || {}
    };
    return nativePriceCache.prices;
  } catch {
    return nativePriceCache.prices || {};
  }
};

const getOpenOceanBalances = async (chainId, address) => {
  try {
    const response = await axios.get(`https://open-api.openocean.finance/v3/${chainId}/addressBalance`, {
      params: { address },
      timeout: OPENOCEAN_REQUEST_TIMEOUT_MS
    });
    return asArray(response.data?.data);
  } catch {
    return [];
  }
};

module.exports = {
  getConfiguredEtherscanChains,
  tokenAmountFromRaw,
  getEtherscan,
  getEtherscanResult,
  findOpenOceanPrice,
  getNativePriceFromMap,
  getNativePriceMap,
  getOpenOceanBalances
};
