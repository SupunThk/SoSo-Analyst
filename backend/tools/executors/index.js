const { getWalletAddress } = require('../../utils/auth');
const {
  formatEtfCountryCode,
  normalizeEtfAssetSymbol,
  resolveCurrencyId,
  resolveCurrencyMatches,
  sosoGet
} = require('../../clients/soso');
const { normalizeToolResult } = require('../../normalizers/toolResult');
const { formatToolErrorMessage } = require('./shared');
const { TOOL_ENDPOINTS } = require('./endpoints');
const { customToolExecutors } = require('./custom');
const { getWalletHoldings } = require('./wallet');
const { getSodexMarkets, getSodexOrderbook } = require('./sodex');

const allCustomExecutors = {
  ...customToolExecutors,
  get_wallet_holdings: getWalletHoldings,
  get_sodex_markets: getSodexMarkets,
  get_sodex_orderbook: getSodexOrderbook
};

const resolveToolArgs = (name, args = {}, context = {}) => {
  const resolvedArgs = args ? { ...args } : {};

  if (name === 'get_wallet_holdings' && !getWalletAddress(resolvedArgs.address) && context.walletAddress) {
    resolvedArgs.address = context.walletAddress;
  }

  return resolvedArgs;
};

const executeTool = async (name, args, context = {}) => {
  const effectiveArgs = resolveToolArgs(name, args, context);

  if (allCustomExecutors[name]) {
    try {
      const payloadData = await allCustomExecutors[name](effectiveArgs);
      const payload = normalizeToolResult(name, effectiveArgs, { data: payloadData }, { endpoint: `custom:${name}`, params: effectiveArgs });
      return {
        args: effectiveArgs,
        payload,
        preview: payload.summary,
        status: 'success'
      };
    } catch (error) {
      const source = name === 'get_wallet_holdings' ? 'Etherscan' : (name.includes('sodex') ? 'SoDEX' : 'SoSoValue');
      const message = formatToolErrorMessage(error, source);
      return {
        payload: {
          error: true,
          source,
          tool: name,
          args: effectiveArgs,
          message
        },
        args: effectiveArgs,
        preview: `Tool error: ${message}`,
        status: 'error'
      };
    }
  }

  const config = TOOL_ENDPOINTS[name];
  const resolvedArgs = effectiveArgs;
  const params = {
    ...(config?.defaultParams || {}),
    ...resolvedArgs
  };

  if (name === 'find_currency') {
    try {
      const matches = await resolveCurrencyMatches(resolvedArgs.query);
      const payload = normalizeToolResult(name, resolvedArgs, { data: matches }, { endpoint: '/currencies', params: { query: resolvedArgs.query } });
      return {
        args: resolvedArgs,
        payload,
        preview: payload.summary,
        status: matches.length ? 'success' : 'error'
      };
    } catch (error) {
      const message = formatToolErrorMessage(error, 'SoSoValue');
      return {
        payload: {
          error: true,
          source: 'SoSoValue',
          tool: name,
          args: resolvedArgs,
          message
        },
        args: resolvedArgs,
        preview: `Tool error: ${message}`,
        status: 'error'
      };
    }
  }

  if (!config) {
    return {
      payload: { error: true, message: 'Tool not found', tool: name },
      args: resolvedArgs,
      preview: 'Tool not found',
      status: 'error'
    };
  }

  try {
    const requestParams = { ...params };

    if (name === 'get_etf_list') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || resolvedArgs.etfType);
      requestParams.country_code = formatEtfCountryCode(resolvedArgs.countryCode);
    }

    if (name === 'get_etf_summary_history') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || resolvedArgs.etfType);
      requestParams.country_code = formatEtfCountryCode(resolvedArgs.countryCode);
      delete requestParams.etfType;
    }

    if (name === 'get_etf_snapshot') {
      requestParams.symbol = normalizeEtfAssetSymbol(resolvedArgs.assetSymbol || (String(resolvedArgs.ticker || '').startsWith('ETH') ? 'ETH' : 'BTC'));
    }

    if (name === 'get_currency_market_snapshot' || name === 'get_currency_klines') {
      const currencyRecord = await resolveCurrencyId(resolvedArgs.currencyId);
      resolvedArgs.currencyId = currencyRecord.currency_id;
      requestParams.resolvedSymbol = currencyRecord.symbol;
      requestParams.resolvedName = currencyRecord.name;
    }

    const endpoint = config.buildUrl(resolvedArgs);
    const res = await sosoGet(endpoint, requestParams);
    const payload = normalizeToolResult(name, resolvedArgs, res, { endpoint, params: requestParams });

    return {
      args: resolvedArgs,
      payload,
      preview: payload.summary,
      status: 'success'
    };
  } catch (error) {
    const message = formatToolErrorMessage(error, 'SoSoValue');
    return {
      payload: {
        error: true,
        source: 'SoSoValue',
        tool: name,
        args: resolvedArgs,
        message
      },
      args: resolvedArgs,
      preview: `Tool error: ${message}`,
      status: 'error'
    };
  }
};

module.exports = {
  executeTool,
  formatToolErrorMessage,
  resolveToolArgs
};
