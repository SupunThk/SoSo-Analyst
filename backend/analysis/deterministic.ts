// Deterministic (non-LLM) scoring of tool results. Each tool's analyzer lives in
// analyzers/<domain>.js; this module dispatches by tool name.
import {
  METHOD_VERSION,
  toNumber,
  getDataFreshness,
  analyzeDefault
} from './analyzers/shared.ts';
import {
  analyzeSnapshot,
  analyzeCompareAssets,
  analyzePriceHistory,
  analyzeTradingPairs,
  analyzeSectorSpotlight,
  analyzeCryptoEquitiesWatchlist,
  analyzeIndexOverview
} from './analyzers/market.ts';
import {
  analyzeEtfFlows,
  analyzeFundraisingOverview,
  analyzeBtcTreasuryBrief,
  analyzeBtcPurchaseHistoryBrief
} from './analyzers/flows.ts';
import {
  analyzeNews,
  analyzeMacroEventHistory,
  analyzeMacroCryptoCalendar
} from './analyzers/news.ts';
import {
  analyzeTokenomics,
  analyzePortfolio
} from './analyzers/holdings.ts';

/**
 * Scores a tool's normalised data. The tool's args are accepted for callers'
 * convenience; no analyzer uses them yet.
 */
const analyzeToolResult = (toolName: string, data: any, _args: Record<string, any> = {}) => {
  let analysis;
  switch (toolName) {
    case 'get_asset_snapshot':
      analysis = analyzeSnapshot(toolName, data);
      break;
    case 'compare_assets':
      analysis = analyzeCompareAssets(toolName, data);
      break;
    case 'get_asset_price_history':
      analysis = analyzePriceHistory(toolName, data);
      break;
    case 'get_etf_flow_brief':
      analysis = analyzeEtfFlows(toolName, data);
      break;
    case 'get_asset_news_brief':
    case 'get_hot_news_digest':
    case 'search_crypto_news':
      analysis = analyzeNews(toolName, data);
      break;
    case 'get_token_economics':
      analysis = analyzeTokenomics(toolName, data);
      break;
    case 'get_wallet_holdings':
      analysis = analyzePortfolio(toolName, data);
      break;
    case 'get_trading_pairs':
      analysis = analyzeTradingPairs(toolName, data);
      break;
    case 'get_macro_event_history':
      analysis = analyzeMacroEventHistory(toolName, data);
      break;
    case 'get_sector_spotlight':
      analysis = analyzeSectorSpotlight(toolName, data);
      break;
    case 'get_crypto_equities_watchlist':
      analysis = analyzeCryptoEquitiesWatchlist(toolName, data);
      break;
    case 'get_index_overview':
      analysis = analyzeIndexOverview(toolName, data);
      break;
    case 'get_macro_crypto_calendar':
      analysis = analyzeMacroCryptoCalendar(toolName, data);
      break;
    case 'get_fundraising_overview':
      analysis = analyzeFundraisingOverview(toolName, data);
      break;
    case 'get_btc_treasury_brief':
      analysis = analyzeBtcTreasuryBrief(toolName, data);
      break;
    case 'get_btc_purchase_history_brief':
      analysis = analyzeBtcPurchaseHistoryBrief(toolName, data);
      break;
    default:
      analysis = analyzeDefault(toolName, data);
  }

  return {
    ...analysis,
    dataFreshness: getDataFreshness(data)
  };
};

export {
  METHOD_VERSION,
  analyzeToolResult,
  getDataFreshness,
  toNumber
};
