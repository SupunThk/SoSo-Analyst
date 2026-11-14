// Constants and numeric helpers shared by the market-intelligence modules.

const SOSO_RATE_LIMIT_WARNING = 'SoSoValue rate limit reached; using cached and fallback data for delayed snapshots.';

const TRACKED_ASSETS = [
  { query: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', sector: 'BTC' },
  { query: 'ethereum', symbol: 'ETH', name: 'Ethereum', sector: 'ETH' },
  { query: 'solana', symbol: 'SOL', name: 'Solana', sector: 'Layer1' },
  { query: 'xrp', symbol: 'XRP', name: 'XRP', sector: 'PayFi' },
  { query: 'bnb', symbol: 'BNB', name: 'BNB', sector: 'CeFi' }
];

const INDEX_LABELS = {
  ssiSocialFi: 'SocialFi',
  ssiRWA: 'RWA',
  ssiDeFi: 'DeFi',
  ssiAI: 'AI',
  ssiMeme: 'Meme',
  ssiDePIN: 'DePIN',
  ssiNFT: 'NFT',
  ssiMAG7: 'MAG7',
  ssiCeFi: 'CeFi',
  ssiLayer1: 'Layer 1',
  ssiGameFi: 'GameFi',
  ssiPayFi: 'PayFi',
  ssiLayer2: 'Layer 2'
};

const DEFAULT_INDEX_TICKERS = [
  'ssiAI',
  'ssiMeme',
  'ssiDeFi',
  'ssiLayer1',
  'ssiLayer2',
  'ssiDePIN',
  'ssiRWA',
  'ssiCeFi'
];

const TOKEN_SECTOR_HINTS = {
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'Layer1',
  XRP: 'PayFi',
  BNB: 'CeFi',
  DOGE: 'Meme',
  SHIB: 'Meme',
  PEPE: 'Meme',
  LINK: 'DeFi',
  UNI: 'DeFi',
  AAVE: 'DeFi',
  NEAR: 'AI',
  FET: 'AI',
  TAO: 'AI',
  AR: 'DePIN',
  RNDR: 'DePIN',
  OP: 'Layer2',
  ARB: 'Layer2'
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeChangeToPercent = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
};

const round = (value, digits = 2) => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const mean = (values) => {
  const clean = values.map(toNumber).filter((value) => value !== null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const formatPct = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return 'N/A';
  return `${parsed >= 0 ? '+' : ''}${round(parsed, 2)}%`;
};

const formatAbsPct = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return 'N/A';
  return `${round(Math.abs(parsed), 2)}%`;
};

const getPayloadData = (payload) => (
  payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
);

const extractList = (value) => {
  const data = getPayloadData(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.tickers)) return data.tickers;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const safeRequest = async (name, fn) => {
  try {
    return {
      name,
      status: 'success',
      data: await fn()
    };
  } catch (error) {
    const statusCode = error.response?.status || null;
    return {
      name,
      status: 'error',
      error: statusCode === 429 ? 'SoSoValue rate limit reached.' : (error.message || String(error)),
      statusCode,
      rateLimited: statusCode === 429
    };
  }
};

const addWarning = (warnings, warning) => {
  if (warning && !warnings.includes(warning)) {
    warnings.push(warning);
  }
};

export {
  SOSO_RATE_LIMIT_WARNING,
  TRACKED_ASSETS,
  INDEX_LABELS,
  DEFAULT_INDEX_TICKERS,
  TOKEN_SECTOR_HINTS,
  clamp,
  toNumber,
  normalizeChangeToPercent,
  round,
  mean,
  formatPct,
  formatAbsPct,
  getPayloadData,
  extractList,
  safeRequest,
  addWarning
};
