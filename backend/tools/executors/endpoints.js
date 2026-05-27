const TOOL_ENDPOINTS = {
  get_btc_treasuries: {
    buildUrl: () => '/btc-treasuries'
  },
  get_btc_purchase_history: {
    buildUrl: (args) => `/btc-treasuries/${args.ticker}/purchase-history`
  },
  get_etf_list: {
    buildUrl: () => '/etfs'
  },
  get_etf_summary_history: {
    buildUrl: () => '/etfs/summary-history',
    defaultParams: { days: 30 }
  },
  get_etf_snapshot: {
    buildUrl: (args) => `/etfs/${args.ticker}/market-snapshot`
  },
  get_macro_events: {
    buildUrl: () => '/macro/events'
  },
  get_hot_news: {
    buildUrl: () => '/news/hot'
  },
  get_featured_news: {
    buildUrl: () => '/news/featured'
  },
  search_news: {
    buildUrl: () => '/news/search'
  },
  get_currency_market_snapshot: {
    buildUrl: (args) => `/currencies/${args.currencyId}/market-snapshot`
  },
  get_currency_klines: {
    buildUrl: (args) => `/currencies/${args.currencyId}/klines`,
    defaultParams: { interval: '1d', limit: 30 }
  },
  get_crypto_stocks: {
    buildUrl: () => '/crypto-stocks'
  },
  get_crypto_stock_snapshot: {
    buildUrl: (args) => `/crypto-stocks/${args.ticker}/market-snapshot`
  },
  // get_sector_spotlight and get_fundraising_projects are handled by custom executors in custom.js
};

module.exports = { TOOL_ENDPOINTS };
