const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const {
  buildLoginMessage,
  getWalletAddress,
  hashWallet
} = require('../utils/auth');

(async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = buildLoginMessage(wallet.address, 'nonce-for-test');
  const signature = await wallet.signMessage(message);
  const recovered = ethers.verifyMessage(message, signature);

  assert.equal(ethers.getAddress(recovered), wallet.address);
  assert.equal(getWalletAddress(wallet.address.toLowerCase()), wallet.address);
  assert.equal(hashWallet(wallet.address), hashWallet(wallet.address.toLowerCase()));
  assert.equal(getWalletAddress('not-a-wallet'), null);

  console.log('auth tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
