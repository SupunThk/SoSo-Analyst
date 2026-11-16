import { describe, expect, it } from 'vitest';
import { keccak256, recoverTypedDataAddress, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  addApiKeyWithBuilderTypedData,
  buildNewOrderParams,
  canonicalDecimal,
  exchangeActionTypedData,
  nextNonce,
  normalizeSignature,
  payloadHash,
  payloadJson,
  signTradingAction,
  toStepDecimal,
  withPrefix,
} from '@/lib/sodex/signing';
import { sizeOrder, type PerpsSymbol } from '@/lib/sodex/market';

const API_KEY = privateKeyToAccount('0x2222222222222222222222222222222222222222222222222222222222222222');
const WALLET = privateKeyToAccount('0x1111111111111111111111111111111111111111111111111111111111111111');

const marketBuy = {
  clOrdID: 'my-order-1', modifier: 1, side: 1, type: 2, timeInForce: 3,
  price: '70000.0', quantity: '0.0010', reduceOnly: false, positionSide: 1,
};

describe('decimals', () => {
  it('prints the shortest decimal form, like shopspring/decimal', () => {
    expect(canonicalDecimal('0.0010')).toBe('0.001');
    expect(canonicalDecimal('70000.0')).toBe('70000');
    expect(canonicalDecimal('007.50')).toBe('7.5');
    expect(() => canonicalDecimal('1e-3')).toThrow();
  });

  it('snaps amounts to the market step without float noise', () => {
    expect(toStepDecimal(0.30000000000000004, '0.1')).toBe('0.3');
    expect(toStepDecimal(1.23456, '0.001')).toBe('1.234');
    expect(toStepDecimal(1.2341, '0.001', 'ceil')).toBe('1.235');
    expect(toStepDecimal(70123.4, '0.5', 'round')).toBe('70123.5');
    expect(toStepDecimal(5, '1')).toBe('5');
  });
});

describe('order payload', () => {
  it('keeps Go struct field order, drops unset optionals and puts builder last', () => {
    const params = buildNewOrderParams({ accountID: 12345, symbolID: 1, orders: [marketBuy], builder: { id: 777, fee: 50 } });
    expect(payloadJson('newOrder', params)).toBe(
      '{"type":"newOrder","params":{"accountID":12345,"symbolID":1,"orders":[{"clOrdID":"my-order-1","modifier":1,"side":1,"type":2,"timeInForce":3,"price":"70000","quantity":"0.001","reduceOnly":false,"positionSide":1}],"builder":{"id":777,"fee":50}}}',
    );
  });

  it('omits builder entirely when none is given', () => {
    const params = buildNewOrderParams({ accountID: 1, symbolID: 1, orders: [marketBuy] });
    expect(payloadJson('newOrder', params)).not.toContain('builder');
  });

  it('hashes the compact JSON with keccak256', () => {
    const params = buildNewOrderParams({ accountID: 1, symbolID: 1, orders: [marketBuy] });
    expect(payloadHash('newOrder', params)).toBe(keccak256(toHex(payloadJson('newOrder', params))));
  });
});

describe('signatures', () => {
  it('normalizes v from 27/28 to 0/1', () => {
    const sig = `0x${'aa'.repeat(64)}1c` as Hex;
    expect(normalizeSignature(sig).slice(-2)).toBe('01');
    expect(withPrefix('0x01', sig).slice(0, 4)).toBe('0x01');
    expect(withPrefix('0x01', sig)).toHaveLength(2 + 66 * 2);
  });

  it('signs orders with the API key on the futures domain', async () => {
    const params = buildNewOrderParams({ accountID: 1, symbolID: 1, orders: [marketBuy], builder: { id: 777, fee: 50 } });
    const nonce = BigInt(1760373925001);
    const signed = await signTradingAction(API_KEY, 'soso-analyst-abc123', 'testnet', 'newOrder', params, nonce);

    expect(signed.headers['x-api-key']).toBe('soso-analyst-abc123');
    expect(signed.headers['x-api-nonce']).toBe('1760373925001');
    expect(signed.headers['x-api-sign'].slice(0, 4)).toBe('0x01');

    const raw = signed.headers['x-api-sign'];
    const v = Number.parseInt(raw.slice(-2), 16) + 27;
    const signature = `0x${raw.slice(4, -2)}${v.toString(16)}` as Hex;
    const typed = exchangeActionTypedData('testnet', payloadHash('newOrder', params), nonce);
    expect(typed.domain).toMatchObject({ name: 'futures', chainId: 138565 });
    const recovered = await recoverTypedDataAddress({ ...typed, signature });
    expect(recovered).toBe(API_KEY.address);
  });

  it('builds the wallet-signed key registration on the wallet chain with the SoDEX chainID inside', async () => {
    const typed = addApiKeyWithBuilderTypedData({
      walletChainId: 8453,
      network: 'mainnet',
      nonce: BigInt(1),
      accountID: 42,
      name: 'soso-analyst-abc123',
      publicKey: API_KEY.address,
      expiresAt: 1_800_000_000_000,
      builderID: 777,
      maxFeeRate: 50,
    });
    expect(typed.domain).toMatchObject({ name: 'universal', chainId: 8453 });
    expect(typed.message.chainID).toBe(BigInt(286623));
    const signature = await WALLET.signTypedData(typed);
    expect(await recoverTypedDataAddress({ ...typed, signature })).toBe(WALLET.address);
  });

  it('issues strictly increasing nonces per signer', () => {
    const a = nextNonce('0xabc');
    const b = nextNonce('0xABC');
    expect(b > a).toBe(true);
  });
});

describe('sizeOrder', () => {
  const btc: PerpsSymbol = {
    id: 1, name: 'BTC-USD', baseCoin: 'BTC', tickSize: '0.1', stepSize: '0.0001',
    minQuantity: '0.0001', minNotional: '10', maxLeverage: 20,
  };

  it('converts USD size to quantity and adds a slippage bound for market orders', () => {
    const long = sizeOrder({ symbol: btc, side: 'long', sizeUsd: 100, referencePrice: 70000 });
    expect(long.quantity).toBe('0.0014');
    expect(long.price).toBe('70700');
    expect(long.errors).toEqual([]);
    const short = sizeOrder({ symbol: btc, side: 'short', sizeUsd: 100, referencePrice: 70000 });
    expect(short.price).toBe('69300');
  });

  it('sizes a limit order at its limit price, whatever the mark price', () => {
    const limit = sizeOrder({ symbol: btc, side: 'long', sizeUsd: 500, referencePrice: 100000, limitPrice: 50000 });
    expect(limit.quantity).toBe('0.01');
    expect(limit.price).toBe('50000');
    expect(limit.notionalUsd).toBe(500);
    expect(limit.boundNotionalUsd).toBe(500);
  });

  it('reports the slippage-bound value the server checks for market orders', () => {
    const market = sizeOrder({ symbol: btc, side: 'long', sizeUsd: 1000, referencePrice: 70000 });
    expect(market.boundNotionalUsd).toBeGreaterThan(market.notionalUsd);
    expect(market.boundNotionalUsd).toBeCloseTo(Number(market.quantity) * 70700, 6);
  });

  it('flags orders below the minimum value', () => {
    const tiny = sizeOrder({ symbol: btc, side: 'long', sizeUsd: 5, referencePrice: 70000 });
    expect(tiny.errors.join(' ')).toMatch(/Minimum order value/);
  });
});
