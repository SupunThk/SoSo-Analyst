// SoDEX trading through the backend relay, plus builder statistics.
import { apiUrl, authHeaders, readJson } from './core';
import type { SodexNetwork } from '../sodex/signing';

export interface TradingConfig {
  enabled: boolean;
  network: SodexNetwork;
  chainId: number;
  builderId: number | null;
  builderFee: number;
  maxOrderNotionalUsd: number;
  maxLeverage: number;
}

export interface TradingPosition {
  symbol: string;
  size: string;
  entryPrice: string;
  unrealizedPnl: string | null;
  leverage: number | null;
  liquidationPrice: string | null;
}

export interface TradingOpenOrder {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: string | number;
  type: string | number;
  price: string;
  quantity: string;
  filled: string;
  reduceOnly: boolean;
  stopPrice: string | null;
  viaBuilder: boolean;
}

export interface TradingStatus {
  config: TradingConfig;
  activated: boolean;
  accountId: number | null;
  availableMarginUsd?: number;
  accountValueUsd?: number;
  builder?: { approved: boolean; perpsFeeRate: number; spotFeeRate: number };
  apiKey?: { registered: boolean; publicKey: string | null; expiresAt: number | null } | null;
  positions?: TradingPosition[];
  openOrders?: TradingOpenOrder[];
}

export interface OrderResult {
  code: number;
  clOrdID: string;
  orderID?: number;
  error?: string;
}

export type TradeSource = 'chat' | 'radar' | 'charts' | 'positions';

interface SignedRequest {
  body: unknown;
  headers: Record<string, string>;
}

const postJson = async <T>(path: string, token: string, payload: unknown): Promise<T> => {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return readJson<T>(res);
};

export async function fetchTradingConfig(signal?: AbortSignal): Promise<TradingConfig> {
  const res = await fetch(apiUrl('/api/sodex/builder/config'), { signal });
  return readJson<TradingConfig>(res);
}

export async function fetchTradingStatus(wallet: string, token: string, keyName?: string, signal?: AbortSignal): Promise<TradingStatus> {
  const query = keyName ? `?keyName=${encodeURIComponent(keyName)}` : '';
  const res = await fetch(apiUrl(`/api/sodex/trading/status/${wallet}${query}`), { headers: authHeaders(token), signal });
  return readJson<TradingStatus>(res);
}

export const registerTrading = (
  wallet: string,
  token: string,
  kind: 'addApiKey' | 'addApiKeyWithBuilder' | 'approveBuilderFee',
  request: SignedRequest,
) => postJson<{ ok: boolean }>(`/api/sodex/trading/register/${wallet}`, token, { kind, ...request });

export const submitOrder = (wallet: string, token: string, symbol: string, source: TradeSource, request: SignedRequest) =>
  postJson<{ ok: boolean; results: OrderResult[] }>(`/api/sodex/trading/order/${wallet}`, token, { symbol, source, ...request });

export const submitLeverage = (wallet: string, token: string, request: SignedRequest) =>
  postJson<{ ok: boolean }>(`/api/sodex/trading/leverage/${wallet}`, token, request);

export const submitCancel = (wallet: string, token: string, request: SignedRequest) =>
  postJson<{ ok: boolean }>(`/api/sodex/trading/cancel/${wallet}`, token, request);

export interface BuilderSummary {
  builderCode: string;
  userCount: string;
  builderFee: string;
  tradeCount: string;
  tradeVolume: string;
}

export interface BuilderDaily {
  date: string;
  userCount: string;
  builderFee: string;
  tradeCount: string;
  tradeVolume: string;
}

export interface BuilderStats {
  config: TradingConfig;
  summary: BuilderSummary | null;
  daily: BuilderDaily[];
  appTrades: Array<{ source: TradeSource; trades: number; notionalUsd: number; wallets: number }> | null;
  asOf?: string;
}

export async function fetchBuilderStats(signal?: AbortSignal): Promise<BuilderStats> {
  const res = await fetch(apiUrl('/api/sodex/builder/stats'), { signal });
  return readJson<BuilderStats>(res);
}
