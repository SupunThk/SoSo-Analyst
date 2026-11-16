'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import type { Hex } from 'viem';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchTradingConfig,
  fetchTradingStatus,
  registerTrading,
  submitCancel,
  submitLeverage,
  submitOrder,
  type OrderResult,
  type TradeSource,
  type TradingConfig,
  type TradingStatus,
} from '@/lib/api/trading';
import {
  MarginMode,
  OrderModifier,
  OrderSide,
  OrderType,
  PositionSide,
  StopType,
  TimeInForce,
  TriggerType,
  addApiKeyTypedData,
  addApiKeyWithBuilderTypedData,
  approveBuilderFeeTypedData,
  buildCancelParams,
  buildNewOrderParams,
  buildUpdateLeverageParams,
  newClientOrderId,
  nextNonce,
  signTradingAction,
  toStepDecimal,
  withPrefix,
  type PerpsOrderItemInput,
} from '@/lib/sodex/signing';
import { fetchPerpsMarkets, findSymbol, markPriceFor, roundToTick, sizeOrder } from '@/lib/sodex/market';
import {
  createTradingKey,
  loadTradingKey,
  saveTradingKey,
  tradingKeyAccount,
  type StoredTradingKey,
} from '@/lib/sodex/tradingKey';
import OrderTicket from './OrderTicket';

export type TradingPhase =
  | 'loading'
  | 'unavailable'
  | 'needs_signin'
  | 'not_activated'
  | 'needs_enable'
  | 'needs_approval'
  | 'ready'
  | 'error';

export interface TicketRequest {
  symbol: string; // SoDEX perps symbol, e.g. BTC-USD
  side?: 'long' | 'short';
  source: TradeSource;
  rationale?: string[];
  suggestedStopPct?: number | null;
  context?: string;
}

export interface PlaceOrderInput {
  symbol: string;
  side: 'long' | 'short';
  sizeUsd: number;
  leverage: number;
  limitPrice?: number | null;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  source: TradeSource;
}

export interface PlaceOrderResult {
  ok: boolean;
  results: OrderResult[];
  message?: string;
}

interface SodexTradingContextValue {
  config: TradingConfig | null;
  status: TradingStatus | null;
  phase: TradingPhase;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  enableTrading: () => Promise<void>;
  placeOrder: (input: PlaceOrderInput) => Promise<PlaceOrderResult>;
  closePosition: (symbol: string, size: string) => Promise<PlaceOrderResult>;
  cancelOrder: (symbol: string, orderID: number) => Promise<void>;
  ticket: TicketRequest | null;
  openTicket: (request: TicketRequest) => void;
  closeTicket: () => void;
}

const SodexTradingContext = createContext<SodexTradingContextValue | undefined>(undefined);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const describe = (error: unknown) => (error instanceof Error ? error.message : 'Unexpected error.');

export function SodexTradingProvider({ children }: { children: React.ReactNode }) {
  const { walletAddress, authSession } = useAuth();
  const { chainId: walletChainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const token = authSession?.token ?? null;

  const [config, setConfig] = useState<TradingConfig | null>(null);
  // Status and keys are stored with the wallet they belong to, so switching
  // wallets never shows another wallet's state.
  const [statusEntry, setStatusEntry] = useState<{ wallet: string; status: TradingStatus } | null>(null);
  const [createdKey, setCreatedKey] = useState<{ id: string; key: StoredTradingKey } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<TicketRequest | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const keyScope = walletAddress && config ? `${config.network}:${walletAddress.toLowerCase()}` : null;
  const status = statusEntry && statusEntry.wallet === walletAddress ? statusEntry.status : null;

  // The stored key for this wallet: one created this session, else localStorage.
  const storedKey = useMemo(() => {
    if (!keyScope || !walletAddress || !config) return null;
    if (createdKey?.id === keyScope) return createdKey.key;
    return loadTradingKey(walletAddress, config.network);
  }, [keyScope, walletAddress, config, createdKey]);

  // A stored key SoDEX no longer lists (expired, revoked, other account) is
  // ignored; enabling again replaces it. A key created this session gets time
  // to be indexed.
  const key = useMemo(() => {
    if (!storedKey) return null;
    const justCreated = createdKey?.key.name === storedKey.name;
    const gone = status?.activated && status.apiKey && !status.apiKey.registered;
    return gone && !justCreated ? null : storedKey;
  }, [storedKey, createdKey, status]);

  const keyRef = useRef<StoredTradingKey | null>(null);
  useEffect(() => { keyRef.current = key; }, [key]);

  // Retry a failed config fetch (rate limit, cold start) with backoff, so a
  // brief backend hiccup does not hide trading for the whole session.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetchTradingConfig(controller.signal)
        .then(setConfig)
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (attempt < 4) {
            timer = setTimeout(() => load(attempt + 1), 2000 * 2 ** attempt);
          } else {
            setError(describe(err));
          }
        });
    };
    load(0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const loadStatus = useCallback(async (keyName?: string) => {
    if (!walletAddress || !token || !config?.enabled) return null;
    const next = await fetchTradingStatus(walletAddress, token, keyName);
    setStatusEntry({ wallet: walletAddress, status: next });
    return next;
  }, [walletAddress, token, config]);

  const refresh = useCallback(async () => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  const storedKeyName = storedKey?.name;
  useEffect(() => {
    if (!walletAddress || !token || !config?.enabled) return;
    let active = true;
    fetchTradingStatus(walletAddress, token, storedKeyName)
      .then((next) => {
        if (!active) return;
        setStatusEntry({ wallet: walletAddress, status: next });
        setError(null);
      })
      .catch((err) => {
        if (active) setError(describe(err));
      });
    return () => { active = false; };
  }, [walletAddress, token, config, storedKeyName, refreshTick]);

  const phase: TradingPhase = useMemo(() => {
    if (!config) return error ? 'error' : 'loading';
    if (!config.enabled) return 'unavailable';
    if (!walletAddress || !token) return 'needs_signin';
    if (!status) return error ? 'error' : 'loading';
    if (!status.activated) return 'not_activated';
    const keyReady = Boolean(key && status.apiKey?.registered && key.accountId === status.accountId);
    // With no builder configured yet, a registered key is enough to trade.
    const approved = config.builderId === null
      || Boolean(status.builder?.approved && (status.builder.perpsFeeRate ?? 0) >= config.builderFee);
    if (keyReady && approved) return 'ready';
    if (keyReady && !approved) return 'needs_approval';
    return 'needs_enable';
  }, [config, walletAddress, token, status, key, error]);

  // Universal actions are signed on the wallet's current chain (sent as
  // X-API-Chain), so no network switch is needed.
  const signChainId = walletChainId ?? 1;

  const enableTrading = useCallback(async () => {
    if (!walletAddress || !token || !config?.enabled || !status?.accountId) return;
    const builderId = config.builderId;
    setBusy(true);
    setError(null);
    try {
      const accountID = status.accountId;
      const nonce = nextNonce(walletAddress);

      if (phase === 'needs_approval' && builderId !== null) {
        const typed = approveBuilderFeeTypedData({
          walletChainId: signChainId,
          network: config.network,
          nonce,
          accountID,
          builderID: builderId,
          maxFeeRate: config.builderFee,
        });
        const signature = await signTypedDataAsync({ ...typed, account: walletAddress as Hex });
        await registerTrading(walletAddress, token, 'approveBuilderFee', {
          body: { accountID, builderID: builderId, maxFeeRate: config.builderFee },
          headers: { 'x-api-sign': withPrefix('0x02', signature), 'x-api-nonce': nonce.toString(), 'x-api-chain': String(signChainId) },
        });
      } else {
        const newKey = createTradingKey(accountID);
        const keyFields = {
          accountID,
          name: newKey.name,
          publicKey: newKey.address,
          expiresAt: newKey.expiresAt,
        };
        const headersFor = (signature: Hex) => ({
          'x-api-sign': withPrefix('0x02', signature),
          'x-api-nonce': nonce.toString(),
          'x-api-chain': String(signChainId),
        });
        if (builderId !== null) {
          // One signature: register the key and approve the builder fee.
          const typed = addApiKeyWithBuilderTypedData({
            walletChainId: signChainId,
            network: config.network,
            nonce,
            ...keyFields,
            builderID: builderId,
            maxFeeRate: config.builderFee,
          });
          const signature = await signTypedDataAsync({ ...typed, account: walletAddress as Hex });
          await registerTrading(walletAddress, token, 'addApiKeyWithBuilder', {
            body: { ...keyFields, type: 1, builder: { id: builderId, fee: config.builderFee } },
            headers: headersFor(signature),
          });
        } else {
          // No builder code yet: a plain trading key. Approving the builder
          // later is one more signature.
          const typed = addApiKeyTypedData({ walletChainId: signChainId, network: config.network, nonce, ...keyFields });
          const signature = await signTypedDataAsync({ ...typed, account: walletAddress as Hex });
          await registerTrading(walletAddress, token, 'addApiKey', {
            body: { ...keyFields, type: 1 },
            headers: headersFor(signature),
          });
        }
        saveTradingKey(walletAddress, config.network, newKey);
        setCreatedKey({ id: `${config.network}:${walletAddress.toLowerCase()}`, key: newKey });
        keyRef.current = newKey;
      }

      // SoDEX indexes both engines asynchronously; poll until visible.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const next = await loadStatus(keyRef.current?.name);
        if (next?.apiKey?.registered && (builderId === null || next.builder?.approved)) return;
        await sleep(1500);
      }
      setError('SoDEX accepted the request but it is not visible yet. Refresh in a few seconds.');
    } catch (err) {
      const message = describe(err);
      setError(/rejected|denied/i.test(message)
        ? 'Signature was cancelled in your wallet.'
        : /limit|maximum|too many/i.test(message)
          ? `${message} Your SoDEX account may already have 5 API keys; remove one on sodex.com and try again.`
          : message);
    } finally {
      setBusy(false);
    }
  }, [walletAddress, token, config, status, phase, signChainId, signTypedDataAsync, loadStatus]);

  const requireReady = useCallback(() => {
    const currentKey = keyRef.current;
    if (phase !== 'ready' || !currentKey || !walletAddress || !token || !config?.enabled || !status?.accountId) {
      throw new Error('Enable trading first.');
    }
    return { currentKey, wallet: walletAddress, authToken: token, cfg: config, accountID: status.accountId };
  }, [phase, walletAddress, token, config, status]);

  const placeOrder = useCallback(async (input: PlaceOrderInput): Promise<PlaceOrderResult> => {
    const { currentKey, wallet, authToken, cfg, accountID } = requireReady();
    const markets = await fetchPerpsMarkets(true);
    const symbol = findSymbol(markets, input.symbol);
    const mark = markPriceFor(markets, input.symbol);
    if (!symbol || !mark) throw new Error(`${input.symbol} is not available on SoDEX.`);

    const leverage = Math.min(Math.max(Math.round(input.leverage), 1), Math.min(cfg.maxLeverage, symbol.maxLeverage));
    const sized = sizeOrder({ symbol, side: input.side, sizeUsd: input.sizeUsd, referencePrice: mark, limitPrice: input.limitPrice });
    if (sized.errors.length) throw new Error(sized.errors.join(' '));
    // Same bound the server checks (price incl. slippage x quantity), checked
    // before leverage is changed so a refused order leaves nothing behind.
    if (sized.boundNotionalUsd > cfg.maxOrderNotionalUsd) {
      throw new Error(`Order size exceeds the app limit of $${cfg.maxOrderNotionalUsd}.`);
    }

    const apiKey = tradingKeyAccount(currentKey);
    const leverageParams = buildUpdateLeverageParams({ accountID, symbolID: symbol.id, leverage, marginMode: MarginMode.CROSS });
    const leverageRequest = await signTradingAction(apiKey, currentKey.name, cfg.network, 'updateLeverage', leverageParams, nextNonce(currentKey.address));
    await submitLeverage(wallet, authToken, leverageRequest);

    const isLong = input.side === 'long';
    const entrySide = isLong ? OrderSide.BUY : OrderSide.SELL;
    const exitSide = isLong ? OrderSide.SELL : OrderSide.BUY;
    const isMarket = !input.limitPrice;
    const entryRef = isMarket ? mark : (input.limitPrice as number);
    const hasBracket = Boolean(input.stopLossPct || input.takeProfitPct);

    const orders: PerpsOrderItemInput[] = [{
      clOrdID: newClientOrderId(),
      modifier: hasBracket ? OrderModifier.BRACKET : OrderModifier.NORMAL,
      side: entrySide,
      type: isMarket ? OrderType.MARKET : OrderType.LIMIT,
      timeInForce: isMarket ? TimeInForce.IOC : TimeInForce.GTC,
      price: sized.price,
      quantity: sized.quantity,
      reduceOnly: false,
      positionSide: PositionSide.BOTH,
    }];

    const attachedStop = (pct: number, stopType: number) => {
      const direction = (stopType === StopType.STOP_LOSS) === isLong ? -1 : 1;
      const stopPrice = roundToTick(entryRef * (1 + direction * pct / 100), symbol);
      orders.push({
        clOrdID: newClientOrderId(stopType === StopType.STOP_LOSS ? 'sl' : 'tp'),
        modifier: OrderModifier.ATTACHED_STOP,
        side: exitSide,
        type: OrderType.MARKET,
        timeInForce: TimeInForce.IOC,
        quantity: sized.quantity,
        stopPrice,
        stopType,
        triggerType: TriggerType.MARK_PRICE,
        reduceOnly: true,
        positionSide: PositionSide.BOTH,
      });
    };
    if (input.takeProfitPct) attachedStop(input.takeProfitPct, StopType.TAKE_PROFIT);
    if (input.stopLossPct) attachedStop(input.stopLossPct, StopType.STOP_LOSS);

    const params = buildNewOrderParams({
      accountID,
      symbolID: symbol.id,
      orders,
      builder: cfg.builderId !== null ? { id: cfg.builderId, fee: cfg.builderFee } : undefined,
    });
    const request = await signTradingAction(apiKey, currentKey.name, cfg.network, 'newOrder', params, nextNonce(currentKey.address));
    const response = await submitOrder(wallet, authToken, symbol.name, input.source, request);
    void loadStatus(currentKey.name).catch(() => undefined);
    const failed = response.results.find((row) => row.code !== 0);
    return { ok: response.ok, results: response.results, message: failed?.error };
  }, [requireReady, loadStatus]);

  const closePosition = useCallback(async (symbolName: string, size: string): Promise<PlaceOrderResult> => {
    const { currentKey, wallet, authToken, cfg, accountID } = requireReady();
    const markets = await fetchPerpsMarkets(true);
    const symbol = findSymbol(markets, symbolName);
    const mark = markPriceFor(markets, symbolName);
    if (!symbol || !mark) throw new Error(`${symbolName} is not available on SoDEX.`);

    const qty = Math.abs(Number(size));
    const isLong = Number(size) > 0;
    const price = roundToTick(mark * (isLong ? 0.98 : 1.02), symbol);
    const params = buildNewOrderParams({
      accountID,
      symbolID: symbol.id,
      orders: [{
        clOrdID: newClientOrderId('close'),
        modifier: OrderModifier.NORMAL,
        side: isLong ? OrderSide.SELL : OrderSide.BUY,
        type: OrderType.MARKET,
        timeInForce: TimeInForce.IOC,
        price,
        quantity: toStepDecimal(qty, symbol.stepSize, 'round'),
        reduceOnly: true,
        positionSide: PositionSide.BOTH,
      }],
      builder: cfg.builderId !== null ? { id: cfg.builderId, fee: cfg.builderFee } : undefined,
    });
    const request = await signTradingAction(apiKey(currentKey), currentKey.name, cfg.network, 'newOrder', params, nextNonce(currentKey.address));
    const response = await submitOrder(wallet, authToken, symbol.name, 'positions', request);
    void loadStatus(currentKey.name).catch(() => undefined);
    const failed = response.results.find((row) => row.code !== 0);
    return { ok: response.ok, results: response.results, message: failed?.error };
  }, [requireReady, loadStatus]);

  const cancelOrder = useCallback(async (symbolName: string, orderID: number) => {
    const { currentKey, wallet, authToken, cfg, accountID } = requireReady();
    const markets = await fetchPerpsMarkets();
    const symbol = findSymbol(markets, symbolName);
    if (!symbol) throw new Error(`${symbolName} is not available on SoDEX.`);
    const params = buildCancelParams({ accountID, cancels: [{ symbolID: symbol.id, orderID }] });
    const request = await signTradingAction(apiKey(currentKey), currentKey.name, cfg.network, 'cancelOrder', params, nextNonce(currentKey.address));
    await submitCancel(wallet, authToken, request);
    await loadStatus(currentKey.name);
  }, [requireReady, loadStatus]);


  const value = useMemo<SodexTradingContextValue>(() => ({
    config,
    status,
    phase,
    error,
    busy,
    refresh,
    enableTrading,
    placeOrder,
    closePosition,
    cancelOrder,
    ticket,
    openTicket: (request) => setTicket(request),
    closeTicket: () => setTicket(null),
  }), [config, status, phase, error, busy, refresh, enableTrading, placeOrder, closePosition, cancelOrder, ticket]);

  return (
    <SodexTradingContext.Provider value={value}>
      {children}
      {ticket && <OrderTicket request={ticket} onClose={() => setTicket(null)} />}
    </SodexTradingContext.Provider>
  );
}

const apiKey = (key: StoredTradingKey) => tradingKeyAccount(key);

export function useSodexTrading() {
  const context = useContext(SodexTradingContext);
  if (!context) throw new Error('useSodexTrading must be used within SodexTradingProvider');
  return context;
}
