const {
  getSodexOrderbook: getSodexOrderbookClient,
  getSodexSymbols,
  getSodexTickers
} = require('../../clients/sodex');
const { formatToolErrorMessage } = require('./shared');

const getSodexMarkets = async () => {
  try {
    const [spotSymbols, spotTickers, perpsSymbols, perpsTickers] = await Promise.all([
      getSodexSymbols('spot'),
      getSodexTickers('spot'),
      getSodexSymbols('perps'),
      getSodexTickers('perps')
    ]);

    return {
      code: 0,
      data: {
        spot: {
          symbols: spotSymbols?.symbols || spotSymbols?.list || spotSymbols || [],
          tickers: spotTickers?.tickers || spotTickers?.list || spotTickers || []
        },
        perps: {
          symbols: perpsSymbols?.symbols || perpsSymbols?.list || perpsSymbols || [],
          tickers: perpsTickers?.tickers || perpsTickers?.list || perpsTickers || []
        }
      }
    };
  } catch (error) {
    return {
      code: error.response?.status || 500,
      error: true,
      message: formatToolErrorMessage(error, 'SoDEX API')
    };
  }
};

const getSodexOrderbook = async (args) => {
  try {
    const { symbol, limit = 50 } = args;
    const market = args.market === 'perps' || String(symbol || '').includes('-') ? 'perps' : 'spot';
    const response = await getSodexOrderbookClient(market, symbol, { limit });
    return {
      code: 0,
      data: {
        market,
        symbol,
        bids: response.bids || response.data?.bids || [],
        asks: response.asks || response.data?.asks || []
      }
    };
  } catch (error) {
    return {
      code: error.response?.status || 500,
      error: true,
      message: formatToolErrorMessage(error, 'SoDEX API')
    };
  }
};

module.exports = {
  getSodexMarkets,
  getSodexOrderbook
};
