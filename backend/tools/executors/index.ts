import { getWalletAddress } from '../../utils/auth.ts';
import {
  formatEtfCountryCode,
  normalizeEtfAssetSymbol,
  resolveCurrencyId,
  resolveCurrencyMatches,
  sosoGet
} from '../../clients/soso.ts';
import { normalizeToolResult } from '../../normalizers/toolResult.ts';
import { formatToolErrorMessage } from './shared.ts';
import { TOOL_ENDPOINTS } from './endpoints.ts';
import { customToolExecutors } from './custom.ts';
import { getWalletHoldings } from './wallet.ts';
import { getSodexMarkets, getSodexOrderbook, getSodexAnalytics } from './sodex.ts';
import { searchWeb } from './webSearch.ts';
import { sleep } from '../../utils/common.ts';
import type { ToolArgs, ToolExecutionResult } from '../../types/tools.ts';

const allCustomExecutors = {
  ...customToolExecutors,
  get_wallet_holdings: getWalletHoldings,
  get_sodex_markets: getSodexMarkets,
  get_sodex_orderbook: getSodexOrderbook,
  get_sodex_analytics: getSodexAnalytics,
  search_web: searchWeb
};

const resolveToolArgs = (name, args: ToolArgs = {}, context: Record<string, any> = {}) => {
  const resolvedArgs: ToolArgs = args ? { ...args } : {};

  if (name === 'get_wallet_holdings') {
    if (context.walletAddress) {
      resolvedArgs.address = context.walletAddress;
    } else if (!getWalletAddress(resolvedArgs.address)) {
      throw Object.assign(new Error('Connect and verify a wallet before requesting holdings.'), { code: 'wallet_required' });
    }
  }

  return resolvedArgs;
};

const isRetryable = (error) => {
  const status = error.response?.status;
  return status === 429 || status >= 500 || error.code === 'ECONNABORTED';
};

const executeTool = async (name: string, args: ToolArgs, context: Record<string, any> = {}): Promise<ToolExecutionResult> => {
  const effectiveArgs = resolveToolArgs(name, args, context);

  if (allCustomExecutors[name]) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
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
        lastError = error;
        if (!isRetryable(error) || attempt === 2) break;
        await sleep(500 * Math.pow(2, attempt)); // 500ms, 1000ms
      }
    }
    const source = name === 'get_wallet_holdings' ? 'Etherscan' : (name.includes('sodex') ? 'SoDEX' : 'SoSoValue');
    const message = formatToolErrorMessage(lastError, source);
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

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      lastError = error;
      if (!isRetryable(error) || attempt === 2) break;
      await sleep(500 * Math.pow(2, attempt));
    }
  }

  const message = formatToolErrorMessage(lastError, 'SoSoValue');
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
};

export { executeTool, formatToolErrorMessage, resolveToolArgs };
