// Deterministic (non-LLM) scoring of tool results. Each tool's analyzer lives in
// analyzers/<domain>.js; this module dispatches by tool name.
const {
  METHOD_VERSION,
  toNumber,
  getDataFreshness,
  analyzeDefault
} = require('./analyzers/shared');
const {
  analyzeSnapshot,
  analyzeCompareAssets,
  analyzePriceHistory,
  analyzeTradingPairs,
  analyzeSectorSpotlight,
  analyzeCryptoEquitiesWatchlist,
  analyzeIndexOverview
} = require('./analyzers/market');
const {
  analyzeEtfFlows,
  analyzeFundraisingOverview,
  analyzeBtcTreasuryBrief,
  analyzeBtcPurchaseHistoryBrief
} = require('./analyzers/flows');
const {
  analyzeNews,
  analyzeMacroEventHistory,
  analyzeMacroCryptoCalendar
} = require('./analyzers/news');
const {
  analyzeTokenomics,
  analyzePortfolio
} = require('./analyzers/holdings');

const analyzeToolResult = (toolName, data, args = {}) => {
  let analysis;
  switch (toolName) {
    case 'get_asset_snapshot':
      analysis = analyzeSnapshot(toolName, data, args);
      break;
    case 'compare_assets':
      analysis = analyzeCompareAssets(toolName, data);
      break;
    case 'get_asset_price_history':
      analysis = analyzePriceHistory(toolName, data, args);
      break;
    case 'get_etf_flow_brief':
      analysis = analyzeEtfFlows(toolName, data, args);
      break;
    case 'get_asset_news_brief':
    case 'get_hot_news_digest':
      analysis = analyzeNews(toolName, data, args);
      break;
    case 'get_token_economics':
      analysis = analyzeTokenomics(toolName, data, args);
      break;
    case 'get_wallet_holdings':
      analysis = analyzePortfolio(toolName, data, args);
      break;
    case 'get_trading_pairs':
      analysis = analyzeTradingPairs(toolName, data, args);
      break;
    case 'get_macro_event_history':
      analysis = analyzeMacroEventHistory(toolName, data, args);
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
      analysis = analyzeDefault(toolName, data, args);
  }

  return {
    ...analysis,
    dataFreshness: getDataFreshness(data)
  };
};

module.exports = {
  METHOD_VERSION,
  analyzeToolResult,
  getDataFreshness,
  toNumber
};
