const {
  getSodexAccountState,
  getSodexOpenOrders,
  getSodexOrderHistory,
  getSodexTickers,
  getSodexTrades
} = require('./sodex');
const { asArray } = require('../utils/common');

const compactValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const number = toNumber(value);
    if (number !== null) return number;
  }
  return null;
};

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const normalizeAsset = (value) => String(value || '').trim().toUpperCase();

const stripVirtualPrefix = (asset) => asset.replace(/^V(?=[A-Z0-9])/, '');

const getTickerArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tickers)) return payload.tickers;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const buildSpotPriceMap = (tickersPayload) => {
  const prices = new Map();
  for (const item of getTickerArray(tickersPayload)) {
    const symbol = String(compactValue(item.symbol, item.s, item.market, item.name) || '');
    const price = firstNumber(item.lastPrice, item.lastPx, item.last, item.price, item.c, item.close);
    if (!symbol || !price || price <= 0) continue;

    const [base, quote] = symbol.split(/[_/:-]/).map(normalizeAsset);
    const normalizedQuote = stripVirtualPrefix(quote || '');
    if (['USD', 'USDC', 'USDT'].includes(normalizedQuote)) {
      prices.set(normalizeAsset(base), price);
      prices.set(stripVirtualPrefix(normalizeAsset(base)), price);
    }
  }

  ['USD', 'USDC', 'USDT', 'VUSDC', 'VUSDT'].forEach((asset) => prices.set(asset, 1));
  return prices;
};

const pickNested = (payload, ...keys) => {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return payload;
};

const getBalances = (state) => asArray(
  state?.balances ||
  state?.B ||
  state?.b ||
  state?.walletBalances ||
  state?.state?.balances ||
  state?.state?.B
);

const normalizeBalance = (item, priceMap = new Map()) => {
  const asset = normalizeAsset(compactValue(item.asset, item.a, item.coin, item.token, item.symbol, item.currency));
  const total = firstNumber(
    item.total,
    item.t,
    item.balance,
    item.b,
    item.amount,
    (firstNumber(item.available, item.free, item.f) || 0) + (firstNumber(item.locked, item.l, item.hold) || 0)
  ) || 0;
  const available = firstNumber(item.available, item.free, item.f, item.withdrawable, item.w) ?? null;
  const locked = firstNumber(item.locked, item.l, item.hold, item.reserved) ?? null;
  const price = firstNumber(item.usdPrice, item.price, item.markPrice) ?? priceMap.get(asset) ?? priceMap.get(stripVirtualPrefix(asset)) ?? null;
  const valueUsd = firstNumber(item.usdValue, item.valueUsd, item.notional, item.value) ?? (price ? total * price : null);

  return {
    asset: asset || 'UNKNOWN',
    total,
    available,
    locked,
    usdPrice: price,
    valueUsd: valueUsd === null ? null : round(valueUsd),
    rawAvailable: available,
    rawLocked: locked
  };
};

const getOrders = (payload) => asArray(
  payload?.orders ||
  payload?.O ||
  payload?.o ||
  payload?.list ||
  payload?.data ||
  payload
);

const normalizeOrder = (item, market) => {
  const symbol = String(compactValue(item.symbol, item.s, item.market, item.pair) || 'UNKNOWN');
  const side = String(compactValue(item.side, item.S, item.orderSide) || '').toUpperCase() || null;
  const price = firstNumber(item.price, item.p, item.limitPrice, item.limitPx);
  const amount = firstNumber(item.amount, item.quantity, item.qty, item.q, item.origQty, item.size, item.sz);
  const filled = firstNumber(item.filled, item.executedQty, item.executedQuantity, item.z, item.filledSize);
  const status = String(compactValue(item.status, item.X, item.orderStatus, item.state) || 'OPEN').toUpperCase();
  const timestamp = compactValue(item.timestamp, item.time, item.createdAt, item.created_at, item.T, item.t);

  return {
    id: String(compactValue(item.id, item.orderId, item.i, item.clientOrderId, item.c) || `${market}-${symbol}-${timestamp || 'order'}`),
    market,
    symbol,
    side,
    price,
    amount,
    filled,
    status,
    timestamp
  };
};

const getTrades = (payload) => asArray(
  payload?.trades ||
  payload?.fills ||
  payload?.list ||
  payload?.data ||
  payload
);

const normalizeTrade = (item, market) => {
  const symbol = String(compactValue(item.symbol, item.s, item.market, item.pair) || 'UNKNOWN');
  const side = String(compactValue(item.side, item.S, item.takerSide) || '').toUpperCase() || null;
  const price = firstNumber(item.price, item.p, item.fillPrice);
  const amount = firstNumber(item.amount, item.quantity, item.qty, item.q, item.size, item.sz);
  const fee = firstNumber(item.fee, item.f, item.commission);
  const timestamp = compactValue(item.timestamp, item.time, item.createdAt, item.created_at, item.T, item.t);
  const valueUsd = price !== null && amount !== null ? Math.abs(price * amount) : firstNumber(item.valueUsd, item.notional);

  return {
    id: String(compactValue(item.id, item.tradeId, item.i, item.fillId, item.clientOrderId, item.c) || `${market}-${symbol}-${timestamp || 'trade'}`),
    market,
    symbol,
    side,
    price,
    amount,
    valueUsd: valueUsd === null ? null : round(valueUsd),
    fee,
    status: String(compactValue(item.status, item.X, item.tradeStatus) || 'FILLED').toUpperCase(),
    timestamp
  };
};

const getPerpsAccount = (state) => pickNested(state, 'account', 'A', 'a', 'accountState');

const getPerpsPositions = (state) => asArray(
  state?.positions ||
  state?.P ||
  state?.p ||
  state?.account?.positions ||
  state?.account?.P ||
  state?.state?.positions ||
  state?.state?.P
);

const normalizePosition = (item) => {
  const symbol = String(compactValue(item.symbol, item.s, item.market) || 'UNKNOWN');
  const size = firstNumber(item.size, item.sz, item.positionSize, item.positionAmt, item.q) || 0;
  const entryPrice = firstNumber(item.entryPrice, item.entryPx, item.ep, item.avgEntryPrice);
  const markPrice = firstNumber(item.markPrice, item.markPx, item.mp, item.price);
  const liquidationPrice = firstNumber(item.liquidationPrice, item.liqPx, item.lp);
  const unrealizedPnl = firstNumber(item.unrealizedPnl, item.uPnl, item.upnl, item.pnl);
  const notionalUsd = firstNumber(item.notionalUsd, item.notional, item.positionValue) ??
    (markPrice !== null ? Math.abs(size * markPrice) : null);

  return {
    symbol,
    side: size > 0 ? 'LONG' : size < 0 ? 'SHORT' : 'FLAT',
    size,
    entryPrice,
    markPrice,
    liquidationPrice,
    unrealizedPnl,
    notionalUsd: notionalUsd === null ? null : round(notionalUsd)
  };
};

const safeRequest = async (label, fn) => {
  try {
    return { label, status: 'success', data: await fn() };
  } catch (error) {
    return {
      label,
      status: 'error',
      error: error.response?.data?.error || error.response?.data?.message || error.message
    };
  }
};

const parseTimestampMs = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber > 1e12 ? asNumber : asNumber * 1000;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const sortByTimestampDesc = (items) => [...items].sort((a, b) =>
  (parseTimestampMs(b.timestamp) || 0) - (parseTimestampMs(a.timestamp) || 0)
);

const sumRecentVolume = (trades, now = Date.now()) => trades.reduce((sum, trade) => {
  const timestampMs = parseTimestampMs(trade.timestamp);
  if (!timestampMs || now - timestampMs > 24 * 60 * 60 * 1000) {
    return sum;
  }
  return sum + (Number(trade.valueUsd) || 0);
}, 0);

const buildSodexProfile = async (walletAddress) => {
  const [
    spotState,
    spotOrders,
    spotOrderHistory,
    spotTrades,
    spotTickers,
    perpsState,
    perpsOrders,
    perpsOrderHistory,
    perpsTrades,
    perpsTickers
  ] = await Promise.all([
    safeRequest('spotState', () => getSodexAccountState('spot', walletAddress)),
    safeRequest('spotOpenOrders', () => getSodexOpenOrders('spot', walletAddress, { limit: 25 })),
    safeRequest('spotOrderHistory', () => getSodexOrderHistory('spot', walletAddress, { limit: 25 })),
    safeRequest('spotTrades', () => getSodexTrades('spot', walletAddress, { limit: 50 })),
    safeRequest('spotTickers', () => getSodexTickers('spot')),
    safeRequest('perpsState', () => getSodexAccountState('perps', walletAddress)),
    safeRequest('perpsOpenOrders', () => getSodexOpenOrders('perps', walletAddress, { limit: 25 })),
    safeRequest('perpsOrderHistory', () => getSodexOrderHistory('perps', walletAddress, { limit: 25 })),
    safeRequest('perpsTrades', () => getSodexTrades('perps', walletAddress, { limit: 50 })),
    safeRequest('perpsTickers', () => getSodexTickers('perps'))
  ]);

  const spotPriceMap = spotTickers.status === 'success' ? buildSpotPriceMap(spotTickers.data) : new Map();
  const normalizedSpotState = pickNested(spotState.data, 'state', 'account', 'spotState');
  const spotBalances = spotState.status === 'success'
    ? getBalances(normalizedSpotState).map((item) => normalizeBalance(item, spotPriceMap))
    : [];
  const spotBalanceValueUsd = spotBalances.reduce((sum, item) => sum + (Number(item.valueUsd) || 0), 0);

  const normalizedPerpsState = pickNested(perpsState.data, 'state', 'perpsState');
  const perpsAccount = perpsState.status === 'success' ? getPerpsAccount(normalizedPerpsState) : {};
  const perpsAccountValueUsd = firstNumber(
    perpsAccount?.accountValue,
    perpsAccount?.av,
    perpsAccount?.equity,
    normalizedPerpsState?.accountValue,
    normalizedPerpsState?.av
  );
  const perpsAvailableMarginUsd = firstNumber(
    perpsAccount?.availableMargin,
    perpsAccount?.am,
    perpsAccount?.freeCollateral,
    normalizedPerpsState?.availableMargin,
    normalizedPerpsState?.am
  );
  const perpsBalances = perpsState.status === 'success'
    ? getBalances(normalizedPerpsState).map((item) => normalizeBalance(item))
    : [];
  const perpsPositions = perpsState.status === 'success'
    ? getPerpsPositions(normalizedPerpsState).map(normalizePosition).filter((position) => position.size !== 0)
    : [];

  const openOrders = [
    ...(spotOrders.status === 'success' ? getOrders(spotOrders.data).map((item) => normalizeOrder(item, 'spot')) : []),
    ...(perpsOrders.status === 'success' ? getOrders(perpsOrders.data).map((item) => normalizeOrder(item, 'perps')) : [])
  ];
  const orderHistory = sortByTimestampDesc([
    ...(spotOrderHistory.status === 'success' ? getOrders(spotOrderHistory.data).map((item) => normalizeOrder(item, 'spot')) : []),
    ...(perpsOrderHistory.status === 'success' ? getOrders(perpsOrderHistory.data).map((item) => normalizeOrder(item, 'perps')) : [])
  ]).slice(0, 25);
  const recentTrades = sortByTimestampDesc([
    ...(spotTrades.status === 'success' ? getTrades(spotTrades.data).map((item) => normalizeTrade(item, 'spot')) : []),
    ...(perpsTrades.status === 'success' ? getTrades(perpsTrades.data).map((item) => normalizeTrade(item, 'perps')) : [])
  ]).slice(0, 25);

  const warnings = [
    spotState,
    spotOrders,
    spotOrderHistory,
    spotTrades,
    spotTickers,
    perpsState,
    perpsOrders,
    perpsOrderHistory,
    perpsTrades,
    perpsTickers
  ]
    .filter((result) => result.status === 'error')
    .map((result) => `${result.label}: ${result.error}`);

  return {
    walletAddress,
    source: 'SoDEX REST API',
    fetchedAt: new Date().toISOString(),
    summary: {
      netValueUsd: round(spotBalanceValueUsd + (perpsAccountValueUsd || 0)),
      spotBalanceValueUsd: round(spotBalanceValueUsd),
      perpsAccountValueUsd: perpsAccountValueUsd === null ? null : round(perpsAccountValueUsd),
      availableMarginUsd: perpsAvailableMarginUsd === null ? null : round(perpsAvailableMarginUsd),
      activeOrders: openOrders.length,
      activePositions: perpsPositions.length,
      recentTrades: recentTrades.length,
      tradeVolume24hUsd: round(sumRecentVolume(recentTrades)),
      spotBalanceCount: spotBalances.length,
      warnings
    },
    spot: {
      status: spotState.status,
      balances: spotBalances
        .filter((item) => item.total !== 0 || Number(item.valueUsd) > 0)
        .sort((a, b) => (Number(b.valueUsd) || 0) - (Number(a.valueUsd) || 0)),
      openOrders: openOrders.filter((item) => item.market === 'spot'),
      recentTrades: recentTrades.filter((item) => item.market === 'spot')
    },
    perps: {
      status: perpsState.status,
      accountValueUsd: perpsAccountValueUsd === null ? null : round(perpsAccountValueUsd),
      availableMarginUsd: perpsAvailableMarginUsd === null ? null : round(perpsAvailableMarginUsd),
      balances: perpsBalances.filter((item) => item.total !== 0 || Number(item.valueUsd) > 0),
      positions: perpsPositions,
      openOrders: openOrders.filter((item) => item.market === 'perps'),
      recentTrades: recentTrades.filter((item) => item.market === 'perps')
    },
    openOrders,
    orderHistory,
    recentTrades
  };
};

module.exports = {
  buildSodexProfile,
  buildSpotPriceMap,
  normalizeBalance,
  normalizeOrder,
  normalizePosition,
  normalizeTrade
};
