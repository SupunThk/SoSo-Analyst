import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  buildLoginMessage,
  getWalletAddress,
  hashWallet
} from '../utils/auth.ts';

test('wallet login message signs and verifies', async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = buildLoginMessage(wallet.address, 'nonce-for-test');
  const signature = await wallet.signMessage(message);
  const recovered = ethers.verifyMessage(message, signature);

  assert.equal(ethers.getAddress(recovered), wallet.address);
  assert.equal(getWalletAddress(wallet.address.toLowerCase()), wallet.address);
  assert.equal(hashWallet(wallet.address), hashWallet(wallet.address.toLowerCase()));
  assert.equal(getWalletAddress('not-a-wallet'), null);
});
