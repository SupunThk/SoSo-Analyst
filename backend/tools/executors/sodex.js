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

const getSodexAnalytics = async () => {
  try {
    const [spotTickers, perpsTickers] = await Promise.all([
      getSodexTickers('spot'),
      getSodexTickers('perps')
    ]);

    const normalize = (list) => {
      const raw = list?.tickers || list?.list || list || [];
      return (Array.isArray(raw) ? raw : []).map((t) => {
        const symbol = t.symbol || t.s || '';
        const lastPrice = Number(t.lastPrice || t.c || 0);
        const quoteVolume24h = Number(t.quoteVolume24h || t.q || 0);
        const baseVolume24h = Number(t.baseVolume24h || t.v || 0);
        const changePct24h = Number(t.changePct24h ?? t.P ?? 0);
        const bestBid = Number(t.bestBid || t.b || 0);
        const bestAsk = Number(t.bestAsk || t.a || 0);
        const spreadPct = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 0;
        const high24h = Number(t.high24h || t.h || 0);
        const low24h = Number(t.low24h || t.l || 0);
        return { symbol, lastPrice, quoteVolume24h, baseVolume24h, changePct24h, bestBid, bestAsk, spreadPct, high24h, low24h };
      }).filter((t) => t.symbol && t.quoteVolume24h > 0);
    };

    const spot = normalize(spotTickers);
    const perps = normalize(perpsTickers);
    const all = [...perps, ...spot];

    const byVolume = [...all].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
    const byGainers = [...all].sort((a, b) => b.changePct24h - a.changePct24h);
    const byLosers = [...all].sort((a, b) => a.changePct24h - b.changePct24h);
    const bySpread = [...all].sort((a, b) => a.spreadPct - b.spreadPct);

    const totalVolumeUsd = all.reduce((sum, t) => sum + t.quoteVolume24h, 0);
    const totalPerpVolumeUsd = perps.reduce((sum, t) => sum + t.quoteVolume24h, 0);
    const totalSpotVolumeUsd = spot.reduce((sum, t) => sum + t.quoteVolume24h, 0);

    return {
      code: 0,
      data: {
        summary: {
          totalPairs: all.length,
          perpPairs: perps.length,
          spotPairs: spot.length,
          totalVolumeUsd,
          totalPerpVolumeUsd,
          totalSpotVolumeUsd
        },
        mostTraded: byVolume.slice(0, 10),
        topGainers: byGainers.slice(0, 5),
        topLosers: byLosers.slice(0, 5),
        tightestSpreads: bySpread.slice(0, 5),
        allTickers: byVolume.slice(0, 25)
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
  getSodexOrderbook,
  getSodexAnalytics
};
