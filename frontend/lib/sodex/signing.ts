// SoDEX request signing (EIP-712), mirroring the official Go SDK.
//
// Two kinds of signatures:
// - Universal actions (register API key + approve builder) are signed by the
//   user's wallet. Domain `universal`, domain.chainId = whatever is sent in
//   X-API-Chain (we use the wallet's current chain so no network switch is
//   needed); message.chainID = the SoDEX network. Wire prefix 0x02.
// - Trading actions are signed by the browser-held API key. Domain `futures`,
//   chainId = SoDEX network. The message is keccak256 of the compact JSON
//   {type, params}, with params in Go struct field order. Wire prefix 0x01.
import { concatHex, keccak256, toHex, type Hex, type LocalAccount } from 'viem';

export const SODEX_CHAIN_IDS = { mainnet: 286623, testnet: 138565 } as const;
export type SodexNetwork = keyof typeof SODEX_CHAIN_IDS;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export const OrderSide = { BUY: 1, SELL: 2 } as const;
export const OrderType = { LIMIT: 1, MARKET: 2 } as const;
export const TimeInForce = { GTC: 1, IOC: 3, GTX: 4 } as const;
export const OrderModifier = { NORMAL: 1, STOP: 2, BRACKET: 3, ATTACHED_STOP: 4 } as const;
export const PositionSide = { BOTH: 1 } as const;
export const StopType = { STOP_LOSS: 1, TAKE_PROFIT: 2 } as const;
export const TriggerType = { MARK_PRICE: 2 } as const;
export const MarginMode = { ISOLATED: 1, CROSS: 2 } as const;

// ── Decimals ────────────────────────────────────────────────────────────────

// SoDEX re-marshals decimals with shopspring/decimal, which prints the
// shortest form ("0.001", never "0.0010" or "1e-3"). Signed strings must match.
export function canonicalDecimal(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid decimal: ${value}`);
  const [intPartRaw, fracRaw = ''] = trimmed.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '');
  const frac = fracRaw.replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : intPart;
}

const decimalsOf = (step: string) => {
  const canonical = canonicalDecimal(step);
  const dot = canonical.indexOf('.');
  return dot === -1 ? 0 : canonical.length - dot - 1;
};

// Floor (or round) a number to a multiple of `step` and print it canonically.
export function toStepDecimal(value: number, step: string, mode: 'floor' | 'round' | 'ceil' = 'floor'): string {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid amount: ${value}`);
  const decimals = decimalsOf(step);
  const scale = 10 ** decimals;
  const stepUnits = Math.round(Number(step) * scale);
  if (stepUnits <= 0) throw new Error(`Invalid step: ${step}`);
  const units = value * scale / stepUnits;
  const steps = mode === 'ceil' ? Math.ceil(units - 1e-9) : mode === 'round' ? Math.round(units) : Math.floor(units + 1e-9);
  const scaled = steps * stepUnits;
  const intPart = Math.floor(scaled / scale);
  const fracPart = String(scaled - intPart * scale).padStart(decimals, '0');
  return canonicalDecimal(decimals ? `${intPart}.${fracPart}` : String(intPart));
}

// ── Payloads (field order = Go struct order) ────────────────────────────────

export interface BuilderParams { id: number; fee: number }

export interface PerpsOrderItemInput {
  clOrdID: string;
  modifier: number;
  side: number;
  type: number;
  timeInForce: number;
  price?: string;
  quantity?: string;
  funds?: string;
  stopPrice?: string;
  stopType?: number;
  triggerType?: number;
  reduceOnly: boolean;
  positionSide: number;
}

export function buildOrderItem(input: PerpsOrderItemInput): Record<string, unknown> {
  const item: Record<string, unknown> = {
    clOrdID: input.clOrdID,
    modifier: input.modifier,
    side: input.side,
    type: input.type,
    timeInForce: input.timeInForce,
  };
  if (input.price !== undefined) item.price = canonicalDecimal(input.price);
  if (input.quantity !== undefined) item.quantity = canonicalDecimal(input.quantity);
  if (input.funds !== undefined) item.funds = canonicalDecimal(input.funds);
  if (input.stopPrice !== undefined) item.stopPrice = canonicalDecimal(input.stopPrice);
  if (input.stopType !== undefined) item.stopType = input.stopType;
  if (input.triggerType !== undefined) item.triggerType = input.triggerType;
  item.reduceOnly = input.reduceOnly;
  item.positionSide = input.positionSide;
  return item;
}

export interface NewOrderParams {
  accountID: number;
  symbolID: number;
  orders: Record<string, unknown>[];
  builder?: BuilderParams;
}

export function buildNewOrderParams(input: {
  accountID: number;
  symbolID: number;
  orders: PerpsOrderItemInput[];
  builder?: BuilderParams;
}): NewOrderParams {
  const params: NewOrderParams = {
    accountID: input.accountID,
    symbolID: input.symbolID,
    orders: input.orders.map(buildOrderItem),
  };
  if (input.builder) params.builder = { id: input.builder.id, fee: input.builder.fee };
  return params;
}

export function buildUpdateLeverageParams(input: { accountID: number; symbolID: number; leverage: number; marginMode: number }) {
  return { accountID: input.accountID, symbolID: input.symbolID, leverage: input.leverage, marginMode: input.marginMode };
}

export function buildCancelParams(input: { accountID: number; cancels: Array<{ symbolID: number; orderID?: number; clOrdID?: string }> }) {
  return {
    accountID: input.accountID,
    cancels: input.cancels.map((cancel) => {
      const item: Record<string, unknown> = { symbolID: cancel.symbolID };
      if (cancel.orderID !== undefined) item.orderID = cancel.orderID;
      if (cancel.clOrdID !== undefined) item.clOrdID = cancel.clOrdID;
      return item;
    }),
  };
}

export type TradingActionType = 'newOrder' | 'cancelOrder' | 'updateLeverage';

export function payloadJson(type: TradingActionType, params: unknown): string {
  return JSON.stringify({ type, params });
}

export function payloadHash(type: TradingActionType, params: unknown): Hex {
  return keccak256(toHex(payloadJson(type, params)));
}

// ── Signatures ──────────────────────────────────────────────────────────────

// Wallets return v as 27/28; SoDEX expects 0/1.
export function normalizeSignature(signature: Hex): Hex {
  if (signature.length !== 132) throw new Error('Expected a 65-byte signature.');
  const v = Number.parseInt(signature.slice(-2), 16);
  const normalized = v >= 27 ? v - 27 : v;
  return `${signature.slice(0, -2)}${normalized.toString(16).padStart(2, '0')}` as Hex;
}

export const withPrefix = (prefix: '0x01' | '0x02', signature: Hex): Hex =>
  concatHex([prefix, normalizeSignature(signature)]);

export const exchangeActionTypes = {
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' },
  ],
} as const;

export function exchangeActionTypedData(network: SodexNetwork, hash: Hex, nonce: bigint) {
  return {
    domain: { name: 'futures', version: '1', chainId: SODEX_CHAIN_IDS[network], verifyingContract: ZERO_ADDRESS },
    types: exchangeActionTypes,
    primaryType: 'ExchangeAction' as const,
    message: { payloadHash: hash, nonce },
  };
}

export interface SignedTradingRequest<P> {
  body: P;
  headers: { 'x-api-key': string; 'x-api-sign': Hex; 'x-api-nonce': string };
}

export async function signTradingAction<P>(
  apiKey: LocalAccount,
  keyName: string,
  network: SodexNetwork,
  type: TradingActionType,
  params: P,
  nonce: bigint,
): Promise<SignedTradingRequest<P>> {
  const signature = await apiKey.signTypedData(exchangeActionTypedData(network, payloadHash(type, params), nonce));
  return {
    body: params,
    headers: { 'x-api-key': keyName, 'x-api-sign': withPrefix('0x01', signature), 'x-api-nonce': nonce.toString() },
  };
}

// Universal (wallet-signed) actions.
const universalDomain = (walletChainId: number) => ({
  name: 'universal',
  version: '1',
  chainId: walletChainId,
  verifyingContract: ZERO_ADDRESS,
});

// A trading key without a builder approval (used while no builder code is
// configured). Matches the Go SDK's UserSignedAddAPIKeyAction, the variant
// used when a signature chain ID (X-API-Chain) is sent.
export function addApiKeyTypedData(input: {
  walletChainId: number;
  network: SodexNetwork;
  nonce: bigint;
  accountID: number;
  name: string;
  publicKey: Hex;
  expiresAt: number;
}) {
  return {
    domain: universalDomain(input.walletChainId),
    types: {
      UserSignedAddAPIKeyAction: [
        { name: 'chainID', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'accountID', type: 'uint64' },
        { name: 'name', type: 'string' },
        { name: 'keyType', type: 'uint8' },
        { name: 'publicKey', type: 'bytes' },
        { name: 'expiresAt', type: 'uint64' },
      ],
    },
    primaryType: 'UserSignedAddAPIKeyAction' as const,
    message: {
      chainID: BigInt(SODEX_CHAIN_IDS[input.network]),
      nonce: input.nonce,
      accountID: BigInt(input.accountID),
      name: input.name,
      keyType: 1,
      publicKey: input.publicKey,
      expiresAt: BigInt(input.expiresAt),
    },
  };
}

export function addApiKeyWithBuilderTypedData(input: {
  walletChainId: number;
  network: SodexNetwork;
  nonce: bigint;
  accountID: number;
  name: string;
  publicKey: Hex;
  expiresAt: number;
  builderID: number;
  maxFeeRate: number;
}) {
  return {
    domain: universalDomain(input.walletChainId),
    types: {
      AddAPIKeyWithBuilder: [
        { name: 'chainID', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'accountID', type: 'uint64' },
        { name: 'name', type: 'string' },
        { name: 'keyType', type: 'uint8' },
        { name: 'publicKey', type: 'bytes' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'builderID', type: 'uint64' },
        { name: 'maxFeeRate', type: 'uint64' },
      ],
    },
    primaryType: 'AddAPIKeyWithBuilder' as const,
    message: {
      chainID: BigInt(SODEX_CHAIN_IDS[input.network]),
      nonce: input.nonce,
      accountID: BigInt(input.accountID),
      name: input.name,
      keyType: 1,
      publicKey: input.publicKey,
      expiresAt: BigInt(input.expiresAt),
      builderID: BigInt(input.builderID),
      maxFeeRate: BigInt(input.maxFeeRate),
    },
  };
}

export function approveBuilderFeeTypedData(input: {
  walletChainId: number;
  network: SodexNetwork;
  nonce: bigint;
  accountID: number;
  builderID: number;
  maxFeeRate: number;
}) {
  return {
    domain: universalDomain(input.walletChainId),
    types: {
      ApproveBuilderFeeAction: [
        { name: 'chainID', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'accountID', type: 'uint64' },
        { name: 'builderID', type: 'uint64' },
        { name: 'maxFeeRate', type: 'uint64' },
      ],
    },
    primaryType: 'ApproveBuilderFeeAction' as const,
    message: {
      chainID: BigInt(SODEX_CHAIN_IDS[input.network]),
      nonce: input.nonce,
      accountID: BigInt(input.accountID),
      builderID: BigInt(input.builderID),
      maxFeeRate: BigInt(input.maxFeeRate),
    },
  };
}

// Monotonic millisecond nonces per signing address (SoDEX keeps the 100
// highest nonces per signer and rejects reuse).
const lastNonce = new Map<string, bigint>();
export function nextNonce(signer: string): bigint {
  const key = signer.toLowerCase();
  const now = BigInt(Date.now());
  const previous = lastNonce.get(key) ?? BigInt(0);
  const nonce = now > previous ? now : previous + BigInt(1);
  lastNonce.set(key, nonce);
  return nonce;
}

export const newClientOrderId = (prefix = 'sa') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
