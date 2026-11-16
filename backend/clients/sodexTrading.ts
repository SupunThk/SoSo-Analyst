// SoDEX trading support: builder-code config, approval/key lookups, builder
// statistics, and a relay for requests the user's browser already signed.
//
// The backend never holds a user's keys. Account-level actions (API key
// registration + builder approval) are signed by the user's wallet, and orders
// are signed by a trading key that lives only in the user's browser. This module
// forwards those signed requests unchanged after checking that they carry our
// builder code and stay inside the app's risk limits.
import axios from 'axios';
import { getPositiveInteger } from '../utils/common.ts';
import { SODEX_NETWORK, SODEX_REST_BASE } from './sodex.ts';

const SODEX_CHAIN_IDS = { mainnet: 286623, testnet: 138565 } as const;
const MAX_PERPS_BUILDER_FEE = 200; // 0.2%, the engine cap for perps
const DEFAULT_BUILDER_FEE = 50; // 5 bp
const DEFAULT_MAX_ORDER_NOTIONAL_USD = 1000;
const DEFAULT_MAX_LEVERAGE = 10;
const RELAYED_HEADERS = ['x-api-key', 'x-api-sign', 'x-api-nonce', 'x-api-chain'];

const toInt = (value: unknown, fallback: number | null, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

export interface TradingConfig {
  enabled: boolean;
  network: 'mainnet' | 'testnet';
  chainId: number;
  builderId: number | null;
  builderAddress: string | null;
  builderFee: number;
  maxOrderNotionalUsd: number;
  maxLeverage: number;
}

// Read lazily so tests and runtime env changes are picked up.
export const getTradingConfig = (): TradingConfig => {
  const network = SODEX_NETWORK as 'mainnet' | 'testnet';
  const builderId = toInt(process.env.SODEX_BUILDER_ID, null, 1, Number.MAX_SAFE_INTEGER);
  const builderAddress = /^0x[0-9a-fA-F]{40}$/.test(String(process.env.SODEX_BUILDER_ADDRESS || '').trim())
    ? String(process.env.SODEX_BUILDER_ADDRESS).trim()
    : null;

  return {
    enabled: builderId !== null,
    network,
    chainId: SODEX_CHAIN_IDS[network],
    builderId,
    builderAddress,
    builderFee: toInt(process.env.SODEX_BUILDER_FEE, DEFAULT_BUILDER_FEE, 0, MAX_PERPS_BUILDER_FEE) as number,
    maxOrderNotionalUsd: getPositiveInteger(process.env.SODEX_MAX_ORDER_NOTIONAL_USD, DEFAULT_MAX_ORDER_NOTIONAL_USD),
    maxLeverage: toInt(process.env.SODEX_MAX_LEVERAGE, DEFAULT_MAX_LEVERAGE, 1, 50) as number
  };
};

const timeout = () => getPositiveInteger(process.env.SODEX_REQUEST_TIMEOUT_MS, 15000);

export class SodexUpstreamError extends Error {
  statusCode: number;
  sodexCode: unknown;
  constructor(message: string, sodexCode: unknown, statusCode = 502) {
    super(message);
    this.sodexCode = sodexCode;
    this.statusCode = statusCode;
  }
}

const unwrap = (payload: any) => {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'code') && Number(payload.code) !== 0) {
    throw new SodexUpstreamError(payload.error || payload.message || `SoDEX returned code ${payload.code}`, payload.code);
  }
  return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
};

const publicGet = async (path: string, params: Record<string, unknown> = {}) => {
  const response = await axios.get(`${SODEX_REST_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    params,
    timeout: timeout()
  });
  return unwrap(response.data);
};

export const getUserBuilders = (address: string) =>
  publicGet(`/user/${encodeURIComponent(address)}/builders`);

export const getUserApiKeys = (address: string, accountID: number, name?: string) =>
  publicGet(`/user/${encodeURIComponent(address)}/api-keys`, { accountID, ...(name ? { name } : {}) });

export const getPerpsAccountState = (address: string) =>
  publicGet(`/perps/accounts/${encodeURIComponent(address)}/state`);

export const getBuilderSummary = (builderAddress: string) =>
  publicGet(`/user/${encodeURIComponent(builderAddress)}/builder/summary`);

export const getBuilderDailyChart = (builderAddress: string, limit = 90) =>
  publicGet(`/user/${encodeURIComponent(builderAddress)}/builder/daily-chart`, { limit });

// Forward a request the client already signed. Only SoDEX auth headers pass
// through; nothing is added, so the server's own SODEX_API_KEY never leaks
// into a user's request.
export const relaySigned = async (
  path: string,
  body: unknown,
  incomingHeaders: Record<string, unknown>,
  method: 'POST' | 'DELETE' = 'POST'
) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  for (const name of RELAYED_HEADERS) {
    const value = incomingHeaders[name];
    if (typeof value === 'string' && value) headers[name] = value;
  }

  const response = await axios.request({
    url: `${SODEX_REST_BASE}${path}`,
    method,
    data: body,
    headers,
    timeout: timeout(),
    validateStatus: () => true
  });

  const payload = response.data;
  if (response.status >= 400) {
    // Prefer SoDEX's own error text; never report an HTTP failure as success.
    if (payload && typeof payload === 'object' && payload.code !== undefined && Number(payload.code) !== 0) {
      return unwrap(payload);
    }
    const detail = payload && typeof payload === 'object' ? (payload.error || payload.message || payload.msg) : null;
    throw new SodexUpstreamError(detail ? String(detail) : `SoDEX HTTP ${response.status}`, null);
  }
  return unwrap(payload);
};

// ── Order checks ─────────────────────────────────────────────────────────────

export interface OrderCheckResult {
  ok: boolean;
  reason?: string;
  notionalUsd?: number;
}

const BRACKET_MODIFIER = 3;
const ATTACHED_STOP_MODIFIER = 4;

// Validate a signed perps newOrder body before relaying it. The server cannot
// change signed bytes, so it either forwards the request as-is or refuses it.
export const checkPerpsOrder = (body: any, config = getTradingConfig()): OrderCheckResult => {
  if (!config.enabled) return { ok: false, reason: 'Trading is not configured on this server.' };
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Order body is required.' };

  const { builder, orders } = body;
  if (!builder || Number(builder.id) !== config.builderId || Number(builder.fee) !== config.builderFee) {
    return { ok: false, reason: 'Order must carry the SoSo Analyst builder code.' };
  }
  if (!Array.isArray(orders) || orders.length < 1 || orders.length > 3) {
    return { ok: false, reason: 'Submit one entry order, optionally with a take-profit and stop-loss.' };
  }

  // orders[0] is the entry. Anything after it must be a take-profit or
  // stop-loss attached to that entry: reduce-only and no larger than it.
  const entry = orders[0];
  const isReduceOnly = entry?.reduceOnly === true;
  const price = Number(entry?.price);
  const quantity = Number(entry?.quantity);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: 'Entry order needs a price (or slippage bound) and quantity.' };
  }
  if (entry?.modifier === ATTACHED_STOP_MODIFIER) {
    return { ok: false, reason: 'The first order must be the entry order.' };
  }

  const attached = orders.slice(1);
  if (attached.length && entry?.modifier !== BRACKET_MODIFIER) {
    return { ok: false, reason: 'Take-profit and stop-loss orders must be attached to a bracket entry.' };
  }
  for (const order of attached) {
    const attachedQuantity = Number(order?.quantity);
    if (
      order?.modifier !== ATTACHED_STOP_MODIFIER ||
      order?.reduceOnly !== true ||
      !Number.isFinite(attachedQuantity) ||
      attachedQuantity <= 0 ||
      attachedQuantity > quantity
    ) {
      return { ok: false, reason: 'Take-profit and stop-loss orders must be reduce-only and no larger than the entry.' };
    }
  }

  const notionalUsd = price * quantity;
  if (!isReduceOnly && notionalUsd > config.maxOrderNotionalUsd) {
    return {
      ok: false,
      reason: `Order size $${notionalUsd.toFixed(2)} exceeds the app limit of $${config.maxOrderNotionalUsd}.`,
      notionalUsd
    };
  }

  return { ok: true, notionalUsd };
};
