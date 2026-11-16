// The app's SoDEX trading key. It is generated and kept in this browser only;
// the backend never sees the private key. SoDEX limits it to trading actions
// (it cannot withdraw), and it expires after KEY_TTL_MS.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex, LocalAccount } from 'viem';
import type { SodexNetwork } from './signing';

export const KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'soso_sodex_key';

export interface StoredTradingKey {
  name: string;
  privateKey: Hex;
  address: Hex;
  accountId: number;
  expiresAt: number;
}

const storageKey = (wallet: string, network: SodexNetwork) => `${STORAGE_PREFIX}:${network}:${wallet.toLowerCase()}`;

const isStoredKey = (value: unknown): value is StoredTradingKey => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StoredTradingKey>;
  return typeof v.name === 'string'
    && typeof v.privateKey === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v.privateKey)
    && typeof v.address === 'string'
    && typeof v.accountId === 'number'
    && typeof v.expiresAt === 'number';
};

export function loadTradingKey(wallet: string, network: SodexNetwork): StoredTradingKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(wallet, network)) || 'null');
    if (isStoredKey(parsed) && parsed.expiresAt > Date.now() + 60_000) return parsed;
    window.localStorage.removeItem(storageKey(wallet, network));
  } catch {
    // Storage blocked or corrupt: behave as if no key exists.
  }
  return null;
}

export function saveTradingKey(wallet: string, network: SodexNetwork, key: StoredTradingKey) {
  try {
    window.localStorage.setItem(storageKey(wallet, network), JSON.stringify(key));
  } catch {
    // Without storage the key lives for this page only.
  }
}

export function clearTradingKey(wallet: string, network: SodexNetwork) {
  try {
    window.localStorage.removeItem(storageKey(wallet, network));
  } catch {
    // ignore
  }
}

export function createTradingKey(accountId: number): StoredTradingKey {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    name: `soso-analyst-${suffix}`,
    privateKey,
    address: account.address,
    accountId,
    expiresAt: Date.now() + KEY_TTL_MS,
  };
}

export const tradingKeyAccount = (key: StoredTradingKey): LocalAccount => privateKeyToAccount(key.privateKey);
