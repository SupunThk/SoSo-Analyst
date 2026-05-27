const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../tools/executors.js');
const outDir = path.join(__dirname, '../tools/executors');
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

const slice = (start, end) => lines.slice(start - 1, end).join('\n');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(
  path.join(outDir, 'shared.js'),
  `${slice(20, 23)}\n\n${slice(262, 276)}\n\nmodule.exports = {\n  getPositiveInteger,\n  sleep,\n  formatToolErrorMessage\n};\n`
);

fs.writeFileSync(
  path.join(outDir, 'etherscanClient.js'),
  [
    "const axios = require('axios');",
    "const { asArray } = require('../../normalizers/toolResult');",
    "const { getPositiveInteger, sleep } = require('./shared');",
    '',
    slice(25, 210),
    '',
    'module.exports = {',
    '  getConfiguredEtherscanChains,',
    '  tokenAmountFromRaw,',
    '  getEtherscan,',
    '  findOpenOceanPrice,',
    '  getNativePriceFromMap,',
    '  getNativePriceMap,',
    '  getOpenOceanBalances',
    '};',
    ''
  ].join('\n')
);

fs.writeFileSync(
  path.join(outDir, 'etfHelpers.js'),
  [
    "const { asArray } = require('../../normalizers/toolResult');",
    "const { normalizeEtfAssetSymbol } = require('../../clients/soso');",
    '',
    slice(299, 370),
    '',
    'module.exports = {',
    '  getEtfType,',
    '  getEtfMetricValue,',
    '  getSosoList,',
    '  normalizeEtfHistory,',
    '  normalizeEtfMetricItem,',
    '  buildEtfFlowAnalytics',
    '};',
    ''
  ].join('\n')
);

fs.writeFileSync(
  path.join(outDir, 'helpers.js'),
  [
    "const { asArray } = require('../../normalizers/toolResult');",
    '',
    slice(278, 297),
    '',
    'module.exports = { mapNewsItems, mapCryptoStockSnapshot };',
    ''
  ].join('\n')
);

fs.writeFileSync(
  path.join(outDir, 'endpoints.js'),
  `${slice(212, 260)}\n\nmodule.exports = { TOOL_ENDPOINTS };\n`
);

const walletInner = slice(776, 946);
fs.writeFileSync(
  path.join(outDir, 'wallet.js'),
  [
    "const { asArray } = require('../../normalizers/toolResult');",
    "const { formatToolErrorMessage } = require('./shared');",
    "const {",
    '  getConfiguredEtherscanChains,',
    '  tokenAmountFromRaw,',
    '  getEtherscan,',
    '  findOpenOceanPrice,',
    '  getNativePriceFromMap,',
    '  getNativePriceMap,',
    '  getOpenOceanBalances',
    "} = require('./etherscanClient');",
    '',
    'async function getWalletHoldings(args = {}) {',
    walletInner,
    '}',
    '',
    'module.exports = { getWalletHoldings };',
    ''
  ].join('\n')
);

const customBlock = slice(372, 774);
const customBody = customBlock
  .replace(/^const customToolExecutors = \{\n/, '')
  .replace(/\n\};?\s*$/, '');

fs.writeFileSync(
  path.join(outDir, 'custom.js'),
  [
    "const {",
    '  SOSO_API_BASE,',
    '  SOSO_OPENAPI_V2_BASE,',
    '  formatEtfCountryCode,',
    '  normalizeEtfAssetSymbol,',
    '  resolveCurrencyId,',
    '  sosoGet,',
    '  sosoPost',
    "} = require('../../clients/soso');",
    "const { DEFAULT_WATCHLIST_TICKERS, asArray, sanitizeForGemini } = require('../../normalizers/toolResult');",
    "const { formatToolErrorMessage } = require('./shared');",
    "const { mapNewsItems } = require('./helpers');",
    "const {",
    '  getEtfType,',
    '  getSosoList,',
    '  normalizeEtfHistory,',
    '  normalizeEtfMetricItem,',
    '  buildEtfFlowAnalytics,',
    '  getEtfMetricValue',
    "} = require('./etfHelpers');",
    '',
    'const customToolExecutors = {',
    customBody,
    '};',
    '',
    'module.exports = { customToolExecutors };',
    ''
  ].join('\n')
);

const indexBody = slice(950, 1091);
fs.writeFileSync(
  path.join(outDir, 'index.js'),
  [
    "const { getWalletAddress } = require('../../utils/auth');",
    "const {",
    '  formatEtfCountryCode,',
    '  normalizeEtfAssetSymbol,',
    '  resolveCurrencyId,',
    '  resolveCurrencyMatches,',
    '  sosoGet',
    "} = require('../../clients/soso');",
    "const { normalizeToolResult } = require('../../normalizers/toolResult');",
    "const { formatToolErrorMessage } = require('./shared');",
    "const { TOOL_ENDPOINTS } = require('./endpoints');",
    "const { customToolExecutors } = require('./custom');",
    "const { getWalletHoldings } = require('./wallet');",
    '',
    'const allCustomExecutors = {',
    '  ...customToolExecutors,',
    '  get_wallet_holdings: getWalletHoldings',
    '};',
    '',
    indexBody.replace(/^const resolveToolArgs/, 'const resolveToolArgs')
      .replace(/customToolExecutors/g, 'allCustomExecutors'),
    ''
  ].join('\n')
);

console.log('Split complete:', outDir);
