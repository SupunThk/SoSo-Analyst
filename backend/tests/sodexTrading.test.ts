import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import axios from 'axios';
import { ethers } from 'ethers';
import User from '../models/User.ts';
import { hashValue, hashWallet } from '../utils/auth.ts';
import { checkPerpsOrder, getTradingConfig } from '../clients/sodexTrading.ts';
import { assetsFromToolCalls, buildTradeIdea, normalizeAsset } from '../analysis/tradeIdea.ts';

const wallet = ethers.Wallet.createRandom().address;
const otherWallet = ethers.Wallet.createRandom().address;
const TOKEN = 'trading-test-token';
const SIG_01 = `0x01${'ab'.repeat(65)}`;
const SIG_02 = `0x02${'cd'.repeat(65)}`;

const originalFindOne = User.findOne;
const originalRequest = axios.request;
const originalGet = axios.get;

let server;
let baseUrl;
let relayed: any[] = [];

const orderBody = (overrides: Record<string, unknown> = {}) => ({
  accountID: 42,
  symbolID: 1,
  orders: [{
    clOrdID: 'sa-1', modifier: 1, side: 1, type: 2, timeInForce: 3,
    price: '70000', quantity: '0.001', reduceOnly: false, positionSide: 1
  }],
  builder: { id: 777, fee: 50 },
  ...overrides
});

const post = (path, payload, token = TOKEN) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload)
});

beforeAll(async () => {
  process.env.SODEX_BUILDER_ID = '777';
  process.env.SODEX_BUILDER_ADDRESS = ethers.Wallet.createRandom().address;
  process.env.SODEX_BUILDER_FEE = '50';
  process.env.SODEX_MAX_ORDER_NOTIONAL_USD = '1000';

  (User as any).findOne = async (query) => (query.sessionTokenHash === hashValue(TOKEN)
    ? { publicWalletAddress: wallet, walletAddress: hashWallet(wallet) }
    : null);

  (axios as any).request = async (config) => {
    relayed.push(config);
    if (config.url.endsWith('/perps/trade/orders') && config.method === 'POST') {
      return { status: 200, data: { code: 0, data: [{ code: 0, clOrdID: 'sa-1', orderID: 9001 }] } };
    }
    return { status: 200, data: { code: 0, data: null } };
  };

  (axios as any).get = async (url) => {
    if (url.endsWith(`/perps/accounts/${wallet}/state`)) {
      return { data: { code: 0, data: { aid: 42, am: '250', av: '300', P: [{ s: 'BTC-USD', sz: '0.002', ep: '69000', ur: '2', l: 2, lp: '40000' }], O: [] } } };
    }
    if (url.endsWith(`/user/${wallet}/builders`)) {
      return { data: { code: 0, data: { spot: [{ builderID: 777, feeRate: 50 }], perps: [{ builderID: 777, feeRate: 50 }] } } };
    }
    if (url.endsWith(`/user/${wallet}/api-keys`)) {
      const key = { name: 'soso-analyst-abc123', publicKey: '0x1', expiresAt: Date.now() + 60_000 };
      return { data: { code: 0, data: { spot: [key], perps: [key] } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  };

  const router = (await import('../routes/sodex.ts')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/sodex', router);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  (User as any).findOne = originalFindOne;
  (axios as any).request = originalRequest;
  (axios as any).get = originalGet;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => { relayed = []; });

describe('builder config', () => {
  it('reads builder settings from env', () => {
    const config = getTradingConfig();
    expect(config.enabled).toBe(true);
    expect(config.builderId).toBe(777);
    expect(config.builderFee).toBe(50);
  });

  it('exposes public config without the builder address', async () => {
    const body = (await (await fetch(`${baseUrl}/api/sodex/builder/config`)).json()) as any;
    expect(body).toMatchObject({ enabled: true, builderId: 777, builderFee: 50 });
    expect(body.builderAddress).toBeUndefined();
  });
});

describe('checkPerpsOrder', () => {
  it('accepts an order carrying our builder code within limits', () => {
    expect(checkPerpsOrder(orderBody()).ok).toBe(true);
  });

  it('rejects a missing or foreign builder code', () => {
    expect(checkPerpsOrder(orderBody({ builder: undefined })).ok).toBe(false);
    expect(checkPerpsOrder(orderBody({ builder: { id: 1, fee: 50 } })).ok).toBe(false);
    expect(checkPerpsOrder(orderBody({ builder: { id: 777, fee: 200 } })).ok).toBe(false);
  });

  it('rejects orders above the notional cap, but not reduce-only closes', () => {
    const big = orderBody({ orders: [{ ...orderBody().orders[0], quantity: '1' }] });
    expect(checkPerpsOrder(big).ok).toBe(false);
    const close = orderBody({ orders: [{ ...orderBody().orders[0], quantity: '1', reduceOnly: true }] });
    expect(checkPerpsOrder(close).ok).toBe(true);
  });

  it('requires a price bound on the entry order', () => {
    const noPrice = orderBody({ orders: [{ ...orderBody().orders[0], price: undefined }] });
    expect(checkPerpsOrder(noPrice).ok).toBe(false);
  });
});

describe('trading routes', () => {
  const headers = { 'x-api-key': 'soso-analyst-abc123', 'x-api-sign': SIG_01, 'x-api-nonce': '1794790000000' };

  it('requires a session for the wallet being traded', async () => {
    const unauthenticated = await post(`/api/sodex/trading/order/${wallet}`, { symbol: 'BTC-USD', body: orderBody(), headers }, 'nope');
    expect(unauthenticated.status).toBe(401);
    const otherWalletResponse = await post(`/api/sodex/trading/order/${otherWallet}`, { symbol: 'BTC-USD', body: orderBody(), headers });
    expect(otherWalletResponse.status).toBe(403);
    expect(relayed).toHaveLength(0);
  });

  it('relays a valid signed order unchanged with only SoDEX auth headers', async () => {
    const response = await post(`/api/sodex/trading/order/${wallet}`, { symbol: 'BTC-USD', source: 'chat', body: orderBody(), headers });
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(relayed).toHaveLength(1);
    expect(relayed[0].url).toMatch(/\/perps\/trade\/orders$/);
    expect(relayed[0].data).toEqual(orderBody());
    expect(relayed[0].headers['x-api-sign']).toBe(SIG_01);
    expect(relayed[0].headers.Authorization).toBeUndefined();
  });

  it('refuses an order without our builder code', async () => {
    const response = await post(`/api/sodex/trading/order/${wallet}`, { symbol: 'BTC-USD', body: orderBody({ builder: { id: 5, fee: 50 } }), headers });
    expect(response.status).toBe(400);
    expect(relayed).toHaveLength(0);
  });

  it('refuses a builder approval for a different builder or fee', async () => {
    const response = await post(`/api/sodex/trading/register/${wallet}`, {
      kind: 'approveBuilderFee',
      body: { accountID: 42, builderID: 777, maxFeeRate: 2000 },
      headers: { 'x-api-sign': SIG_02, 'x-api-nonce': '1', 'x-api-chain': '1' }
    });
    expect(response.status).toBe(400);
    expect(relayed).toHaveLength(0);
  });

  it('relays API key registration with builder approval', async () => {
    const response = await post(`/api/sodex/trading/register/${wallet}`, {
      kind: 'addApiKeyWithBuilder',
      body: {
        accountID: 42, name: 'soso-analyst-abc123', type: 1,
        publicKey: ethers.Wallet.createRandom().address, expiresAt: Date.now() + 1000,
        builder: { id: 777, fee: 50 }
      },
      headers: { 'x-api-sign': SIG_02, 'x-api-nonce': '1', 'x-api-chain': '1' }
    });
    expect(response.status).toBe(200);
    expect(relayed[0].url).toMatch(new RegExp(`/user/${wallet}/api-keys$`));
    expect(relayed[0].headers['x-api-chain']).toBe('1');
  });

  it('caps leverage server-side', async () => {
    const response = await post(`/api/sodex/trading/leverage/${wallet}`, {
      body: { accountID: 42, symbolID: 1, leverage: 50, marginMode: 2 },
      headers
    });
    expect(response.status).toBe(400);
  });

  it('reports approval, key and positions in trading status', async () => {
    const response = await fetch(`${baseUrl}/api/sodex/trading/status/${wallet}?keyName=soso-analyst-abc123`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const body = (await response.json()) as any;
    expect(body.activated).toBe(true);
    expect(body.accountId).toBe(42);
    expect(body.builder).toMatchObject({ approved: true, perpsFeeRate: 50 });
    expect(body.apiKey.registered).toBe(true);
    expect(body.positions[0]).toMatchObject({ symbol: 'BTC-USD', unrealizedPnl: '2', liquidationPrice: '40000' });
  });
});

describe('trade ideas', () => {
  const perps = new Set(['BTC-USD', 'ETH-USD', 'SOL-USD']);
  const synthesis = (directionalScore, extra = {}) => ({
    directionalScore, riskScore: 30, confidence: 'medium', thesis: ['ETF inflows rising'], riskFlags: [], conflicts: [], ...extra
  });

  it('normalizes asset names and symbols', () => {
    expect(normalizeAsset('bitcoin')).toBe('BTC');
    expect(normalizeAsset('BTC-USD')).toBe('BTC');
    expect(normalizeAsset('vETH_vUSDC')).toBe('ETH');
    expect(normalizeAsset('sol')).toBe('SOL');
    expect([...assetsFromToolCalls([{ input: { asset: 'bitcoin' } }, { input: { symbol: 'BTC-USD' } }])]).toEqual(['BTC']);
  });

  it('emits a long when the synthesis leans bullish on one listed asset', () => {
    const idea = buildTradeIdea({ synthesis: synthesis(72), toolCalls: [{ input: { asset: 'bitcoin' } }], perpsSymbols: perps });
    expect(idea).toMatchObject({ symbol: 'BTC-USD', side: 'long', suggestedStopPct: 3 });
  });

  it('emits a short when bearish, with a wider stop for high risk', () => {
    const idea = buildTradeIdea({ synthesis: synthesis(30, { riskScore: 80 }), toolCalls: [{ input: { asset: 'ETH' } }], perpsSymbols: perps });
    expect(idea).toMatchObject({ side: 'short', suggestedStopPct: 5 });
  });

  it('stays silent when neutral, multi-asset, or not listed on SoDEX', () => {
    expect(buildTradeIdea({ synthesis: synthesis(55), toolCalls: [{ input: { asset: 'BTC' } }], perpsSymbols: perps })).toBeNull();
    expect(buildTradeIdea({ synthesis: synthesis(80), toolCalls: [{ input: { asset: 'BTC' } }, { input: { asset: 'ETH' } }], perpsSymbols: perps })).toBeNull();
    expect(buildTradeIdea({ synthesis: synthesis(80), toolCalls: [{ input: { asset: 'PEPE' } }], perpsSymbols: perps })).toBeNull();
    expect(buildTradeIdea({ synthesis: { directionalScore: null }, toolCalls: [{ input: { asset: 'BTC' } }], perpsSymbols: perps })).toBeNull();
  });
});
