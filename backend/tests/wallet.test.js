const assert = require('node:assert/strict');
const path = require('node:path');
const axios = require('axios');

const originalAxiosGet = axios.get;

const resetWalletModules = () => {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}tools${path.sep}executors`) ||
      key.includes(`${path.sep}normalizers${path.sep}toolResult`) ||
      key.includes(`${path.sep}analysis${path.sep}deterministic`)
    ) {
      delete require.cache[key];
    }
  }
};

const makeAxiosLikeResponse = (data) => {
  const outgoingMessageBase = {};
  Object.defineProperty(outgoingMessageBase, 'headersSent', {
    enumerable: true,
    get: () => false
  });
  const responsePrototype = Object.create(outgoingMessageBase);
  const request = Object.create(responsePrototype);

  return {
    data,
    status: 200,
    statusText: 'OK',
    request
  };
};

const testWalletRetriesRateLimitAndPricesNativeEth = async () => {
  process.env.ETHERSCAN_API_KEY = 'test-etherscan-key';
  process.env.ETHERSCAN_CHAIN_IDS = '1';
  process.env.ETHERSCAN_MIN_INTERVAL_MS = '1';
  process.env.ETHERSCAN_RETRY_DELAY_MS = '1';

  let balanceCalls = 0;
  axios.get = async (url, options = {}) => {
    if (url.includes('api.coingecko.com')) {
      return { data: { ethereum: { usd: 3200 } } };
    }

    if (url.includes('open-api.openocean.finance')) {
      return { data: { data: [] } };
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'balance') {
      balanceCalls++;
      if (balanceCalls === 1) {
        return {
          data: {
            status: '0',
            message: 'NOTOK',
            result: 'Max calls per sec rate limit reached (3/sec)'
          }
        };
      }

      return makeAxiosLikeResponse({
        status: '1',
        message: 'OK',
        result: '1000000000000000000'
      });
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'tokentx') {
      return makeAxiosLikeResponse({ status: '1', message: 'OK', result: [] });
    }

    throw new Error(`Unexpected GET ${url}`);
  };

  resetWalletModules();
  const { executeTool } = require('../tools/executors');
  const result = await executeTool('get_wallet_holdings', {
    address: '0x2068e859eBB10970eB77a2fa665f40Bd38594F44'
  });

  const preview = result.payload.dataPreview;
  assert.equal(result.status, 'success');
  assert.equal(balanceCalls, 2);
  assert.equal(preview.totalValueUsd, '3200.00');
  assert.equal(preview.tokens[0].symbol, 'ETH');
  assert.equal(preview.tokens[0].balance, 1);
  assert.equal(preview.tokens[0].usdPrice, 3200);
  assert.equal(preview.tokens[0].priceSource, 'CoinGecko');
  assert.equal(result.payload.analysis.metrics.holdingCount, 1);
  assert.equal(result.payload.analysis.metrics.pricedHoldingCount, 1);
};

const testWalletReturnsPartialCoverageWhenErc20DiscoveryFails = async () => {
  process.env.ETHERSCAN_API_KEY = 'test-etherscan-key';
  process.env.ETHERSCAN_CHAIN_IDS = '1';
  process.env.ETHERSCAN_MIN_INTERVAL_MS = '1';
  process.env.ETHERSCAN_RETRY_DELAY_MS = '1';

  axios.get = async (url, options = {}) => {
    if (url.includes('api.coingecko.com')) {
      return { data: { ethereum: { usd: 3200 } } };
    }

    if (url.includes('open-api.openocean.finance')) {
      return { data: { data: [] } };
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'balance') {
      return {
        data: {
          status: '1',
          message: 'OK',
          result: '0'
        }
      };
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'tokentx') {
      return {
        data: {
          status: '0',
          message: 'NOTOK',
          result: 'Etherscan request failed.'
        }
      };
    }

    throw new Error(`Unexpected GET ${url}`);
  };

  resetWalletModules();
  const { executeTool } = require('../tools/executors');
  const result = await executeTool('get_wallet_holdings', {
    address: '0x2068e859eBB10970eB77a2fa665f40Bd38594F44'
  });

  const preview = result.payload.dataPreview;
  assert.equal(result.status, 'success');
  assert.equal(preview.totalValueUsd, '0.00');
  assert.equal(preview.chainCoverage.successful, 1);
  assert.equal(preview.chainCoverage.failed, 0);
  assert.equal(preview.chainSummaries[0].status, 'partial');
  assert.match(preview.chainSummaries[0].errors[0], /ERC-20 discovery failed/);
};

(async () => {
  try {
    await testWalletRetriesRateLimitAndPricesNativeEth();
    await testWalletReturnsPartialCoverageWhenErc20DiscoveryFails();
    console.log('wallet tests passed');
  } finally {
    axios.get = originalAxiosGet;
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
