// SoDEX perps market rules and order sizing.
import { apiUrl, readJson } from '../api/core';
import { toStepDecimal } from './signing';

export interface PerpsSymbol {
  id: number;
  name: string;
  baseCoin: string;
  tickSize: string;
  stepSize: string;
  minQuantity: string;
  marketMinQuantity?: string;
  minNotional: string;
  maxNotional?: string;
  maxLeverage: number;
  buyLimitUpRatio?: string;
  sellLimitDownRatio?: string;
  marketDeviationRatio?: string;
}

export interface PerpsTicker {
  symbol: string;
  lastPx?: string;
  markPrice?: string;
  indexPrice?: string;
  fundingRate?: string;
}

export interface PerpsMarkets {
  symbols: PerpsSymbol[];
  tickers: PerpsTicker[];
}

let marketsCache: { at: number; promise: Promise<PerpsMarkets> } | null = null;
const MARKETS_TTL_MS = 30_000;

export function fetchPerpsMarkets(force = false): Promise<PerpsMarkets> {
  if (!force && marketsCache && Date.now() - marketsCache.at < MARKETS_TTL_MS) return marketsCache.promise;
  const promise = fetch(apiUrl('/api/sodex/markets?market=perps'))
    .then((res) => readJson<{ symbols: unknown; tickers: unknown }>(res))
    .then((data) => ({
      symbols: Array.isArray(data.symbols) ? (data.symbols as PerpsSymbol[]) : [],
      tickers: Array.isArray(data.tickers) ? (data.tickers as PerpsTicker[]) : [],
    }));
  marketsCache = { at: Date.now(), promise };
  promise.catch(() => { marketsCache = null; });
  return promise;
}

export const findSymbol = (markets: PerpsMarkets, name: string) =>
  markets.symbols.find((s) => s.name.toUpperCase() === name.toUpperCase()) || null;

// Perp market for a plain asset ticker such as "BTC" (BTC-USD).
export const perpSymbolForAsset = (markets: PerpsMarkets, asset: string) =>
  findSymbol(markets, `${asset.toUpperCase()}-USD`);

export const markPriceFor = (markets: PerpsMarkets, name: string): number | null => {
  const ticker = markets.tickers.find((t) => t.symbol?.toUpperCase() === name.toUpperCase());
  const price = Number(ticker?.markPrice ?? ticker?.lastPx);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export interface SizedOrder {
  quantity: string;
  price: string; // limit price, or the slippage bound for a market order
  notionalUsd: number;
  errors: string[];
}

// Turn a USD size into a valid quantity and price for the symbol's filters.
export function sizeOrder(input: {
  symbol: PerpsSymbol;
  side: 'long' | 'short';
  sizeUsd: number;
  referencePrice: number;
  limitPrice?: number | null;
  slippagePct?: number;
}): SizedOrder {
  const { symbol, side, sizeUsd, referencePrice } = input;
  const errors: string[] = [];
  const isMarket = !input.limitPrice;
  const slippage = (input.slippagePct ?? 1) / 100;

  const rawPrice = isMarket
    ? referencePrice * (side === 'long' ? 1 + slippage : 1 - slippage)
    : (input.limitPrice as number);
  const price = toStepDecimal(rawPrice, symbol.tickSize, isMarket ? (side === 'long' ? 'ceil' : 'floor') : 'round');

  const quantity = toStepDecimal(sizeUsd / referencePrice, symbol.stepSize, 'floor');
  const qty = Number(quantity);
  const minQty = Number(isMarket ? symbol.marketMinQuantity || symbol.minQuantity : symbol.minQuantity);
  const notionalUsd = qty * (isMarket ? referencePrice : Number(price));

  if (qty <= 0 || (minQty && qty < minQty)) errors.push(`Minimum size is ${symbol.minQuantity} ${symbol.baseCoin}.`);
  const minNotional = Number(symbol.minNotional);
  if (minNotional && notionalUsd < minNotional) errors.push(`Minimum order value is $${minNotional}.`);
  const maxNotional = Number(symbol.maxNotional);
  if (maxNotional && notionalUsd > maxNotional) errors.push(`Maximum order value is $${maxNotional}.`);

  return { quantity, price, notionalUsd, errors };
}

export const roundToTick = (value: number, symbol: PerpsSymbol) => toStepDecimal(value, symbol.tickSize, 'round');
