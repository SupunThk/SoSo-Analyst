const assert = require('node:assert/strict');
const path = require('node:path');
const { Readable } = require('node:stream');
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { buildLoginMessage, hashWallet, hashValue } = require('../utils/auth');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;
const originalReadyState = mongoose.connection.readyState;
const originalUserFindOne = User.findOne;
const originalUserFindOneAndUpdate = User.findOneAndUpdate;
const originalChatFindOneAndUpdate = Chat.findOneAndUpdate;
const originalChatSave = Chat.prototype.save;

const startServer = (mountPath, router) => {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
};

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const urlFor = (server, path) => `http://127.0.0.1:${server.address().port}${path}`;

const parseSse = (text) => text
  .trim()
  .split(/\r?\n\r?\n/)
  .filter(Boolean)
  .map((block) => {
    const eventLine = block.split(/\r?\n/).find((line) => line.startsWith('event: '));
    const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data: '));
    return {
      event: eventLine?.slice(7),
      data: dataLine ? JSON.parse(dataLine.slice(6)) : null
    };
  });

const geminiStreamResponse = (text) => ({
  data: Readable.from([
    `data: ${JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text }]
        }
      }]
    })}\n\n`
  ])
});

const resetAgentModules = () => {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}routes${path.sep}agent`) ||
      key.includes(`${path.sep}handlers${path.sep}agentHandlers`) ||
      key.includes(`${path.sep}clients${path.sep}gemini`) ||
      key.includes(`${path.sep}clients${path.sep}soso`) ||
      key.includes(`${path.sep}tools${path.sep}executors`) ||
      key.includes(`${path.sep}normalizers${path.sep}toolResult`) ||
      key.includes(`${path.sep}prompt${path.sep}system`)
    ) {
      delete require.cache[key];
    }
  }
};

const testAgentStreamInjectsVerifiedWallet = async () => {
  const wallet = ethers.Wallet.createRandom().address;
  const postedBodies = [];

  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.SOSO_API_KEY = 'test-soso-key';
  process.env.ETHERSCAN_API_KEY = 'test-etherscan-key';
  process.env.ETHERSCAN_CHAIN_IDS = '1,137';
  mongoose.connection.readyState = 1;

  User.findOne = async (query) => {
    assert.equal(query.sessionTokenHash, hashValue('route-test-token'));
    return {
      publicWalletAddress: wallet,
      walletAddress: hashWallet(wallet)
    };
  };

  axios.post = async (url, body) => {
    postedBodies.push(body);
    if (url.includes(':streamGenerateContent')) {
      return geminiStreamResponse('Portfolio analysis ready.');
    }

    return {
      data: {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: 'Portfolio analysis ready.' }]
          }
        }]
      }
    };
  };

  axios.get = async (url, options = {}) => {
    if (url.includes('api.coingecko.com')) {
      return { data: { ethereum: { usd: 2500 }, 'matic-network': { usd: 1 }, 'polygon-ecosystem-token': { usd: 1 } } };
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'balance') {
      return {
        data: {
          status: '1',
          message: 'OK',
          result: options.params.chainid === '1' ? '1000000000000000000' : '0'
        }
      };
    }

    if (url.includes('api.etherscan.io') && options.params?.action === 'tokentx') {
      return { data: { status: '1', message: 'OK', result: [] } };
    }

    if (url.includes('open-api.openocean.finance')) {
      return { data: { data: [{ symbol: 'ETH', price: 2500 }] } };
    }

    throw new Error(`Unexpected GET ${url}`);
  };

  resetAgentModules();
  const server = await startServer('/api/agent', require('../routes/agent'));
  try {
    const response = await fetch(urlFor(server, '/api/agent/chat/stream'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer route-test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: wallet,
        messages: [{ role: 'user', content: 'Analyze my portfolio' }],
        conversationHistory: []
      })
    });
    const events = parseSse(await response.text());
    const toolStart = events.find((item) => item.event === 'tool_start');
    const toolDone = events.find((item) => item.event === 'tool_done');
    const done = events.find((item) => item.event === 'done');

    assert.equal(response.status, 200);
    assert.equal(toolStart.data.name, 'get_wallet_holdings');
    assert.equal(toolStart.data.args.address, wallet);
    assert.equal(toolDone.data.input.address, wallet);
    assert.equal(toolDone.data.status, 'success');
    assert.match(toolDone.data.result, /Ethereum Mainnet/);
    assert.match(toolDone.data.result, /Polygon Mainnet/);
    assert.equal(done.data.answer, 'Portfolio analysis ready.');
    assert.equal(done.data.toolCalls.length, 1);
    assert.equal(done.data.toolCalls[0].name, 'get_wallet_holdings');
    assert.equal(done.data.toolCalls[0].input.address, wallet);
    assert.ok(postedBodies[0].contents.some((item) =>
      item.parts?.some((part) => String(part.text || '').includes('CONNECTED_WALLET_CONTEXT'))
    ));
    assert.ok(postedBodies[0].contents.some((item) =>
      item.parts?.some((part) => String(part.text || '').includes('DETERMINISTIC TOOL ROUTING HINT'))
    ));
    assert.ok(postedBodies[0].contents.some((item) =>
      item.parts?.some((part) => String(part.text || '').includes('PRELOADED_TOOL_RESULT: get_wallet_holdings'))
    ));
  } finally {
    await closeServer(server);
  }
};

const testAgentStreamRequiresVerifiedWalletForPortfolio = async () => {
  const originalConsoleError = console.error;
  axios.post = async () => {
    throw new Error('Gemini should not be called without a verified wallet');
  };
  axios.get = async () => {
    throw new Error('Wallet holdings should not be fetched without a verified wallet');
  };
  mongoose.connection.readyState = 0;
  console.error = () => {};

  resetAgentModules();
  const server = await startServer('/api/agent', require('../routes/agent'));
  try {
    const response = await fetch(urlFor(server, '/api/agent/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Analyze my portfolio' }],
        conversationHistory: []
      })
    });
    const events = parseSse(await response.text());
    const error = events.find((item) => item.event === 'error');

    assert.equal(response.status, 200);
    assert.equal(error.data.message, 'Connect and verify an EVM wallet before running portfolio analysis.');
  } finally {
    console.error = originalConsoleError;
    await closeServer(server);
  }
};

const testChatRoutesWithMockedDatabase = async () => {
  const wallet = ethers.Wallet.createRandom().address;
  let nonceUpdate = null;
  let savedChat = null;

  mongoose.connection.readyState = 1;
  User.findOneAndUpdate = async (query, update, options) => {
    nonceUpdate = { query, update, options };
    return {};
  };
  User.findOne = async (query) => {
    if (query.walletAddress) {
      assert.equal(query.walletAddress, hashWallet(wallet));
      return null;
    }

    assert.equal(query.sessionTokenHash, hashValue('chat-route-token'));
    return {
      publicWalletAddress: wallet,
      walletAddress: hashWallet(wallet),
      sessionExpiresAt: new Date(Date.now() + 60000)
    };
  };
  Chat.prototype.save = async function save() {
    savedChat = this;
    return this;
  };

  const server = await startServer('/api/chats', require('../routes/chats'));
  try {
    const nonceResponse = await fetch(urlFor(server, '/api/chats/auth/nonce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: wallet.toLowerCase() })
    });
    const nonce = await nonceResponse.json();

    assert.equal(nonceResponse.status, 200);
    assert.equal(nonce.walletAddress, wallet);
    assert.ok(nonce.message.includes(wallet));
    assert.equal(nonceUpdate.query.walletAddress, hashWallet(wallet));
    assert.equal(nonceUpdate.options.upsert, true);

    const createResponse = await fetch(urlFor(server, '/api/chats'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer chat-route-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ walletAddress: wallet, title: 'Route Test Chat' })
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 200);
    assert.equal(savedChat.walletAddress, hashWallet(wallet));
    assert.equal(savedChat.title, 'Route Test Chat');
    assert.equal(created.title, 'Route Test Chat');
  } finally {
    await closeServer(server);
  }
};

const testChatNonceReusesUnexpiredNonce = async () => {
  const wallet = ethers.Wallet.createRandom().address;
  const nonce = 'existing-nonce';
  const expiresAt = new Date(Date.now() + 60000);

  mongoose.connection.readyState = 1;
  User.findOne = async (query) => {
    assert.equal(query.walletAddress, hashWallet(wallet));
    return {
      publicWalletAddress: wallet,
      walletAddress: hashWallet(wallet),
      loginNonce: nonce,
      loginNonceExpiresAt: expiresAt
    };
  };
  User.findOneAndUpdate = async () => {
    throw new Error('Existing unexpired nonce should be reused');
  };

  const server = await startServer('/api/chats', require('../routes/chats'));
  try {
    const response = await fetch(urlFor(server, '/api/chats/auth/nonce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: wallet.toLowerCase() })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.walletAddress, wallet);
    assert.equal(body.message, buildLoginMessage(wallet, nonce));
    assert.equal(body.expiresAt, expiresAt.toISOString());
  } finally {
    await closeServer(server);
  }
};

const testSosoUpstreamErrorHandling = async () => {
  process.env.SOSO_API_KEY = 'test-soso-key';
  const originalConsoleError = console.error;
  axios.get = async () => {
    const error = new Error('timeout');
    error.code = 'ECONNABORTED';
    throw error;
  };
  console.error = () => {};

  const server = await startServer('/api/soso', require('../routes/sosovalue'));
  try {
    const response = await fetch(urlFor(server, '/api/soso/currencies'));
    const body = await response.json();

    assert.equal(response.status, 504);
    assert.equal(body.error, true);
    assert.equal(body.message, 'SoSoValue request timed out.');
    assert.equal(body.requestId, undefined);
  } finally {
    console.error = originalConsoleError;
    await closeServer(server);
  }
};

const testSodexProfileRouteBuildsRealDashboard = async () => {
  const wallet = ethers.Wallet.createRandom().address;
  process.env.SODEX_REST_BASE_URL = 'https://mainnet-gw.sodex.dev/api/v1';

  axios.get = async (url) => {
    if (url.endsWith(`/spot/accounts/${wallet}/state`)) {
      return {
        data: {
          code: 0,
          data: {
            B: [
              { a: 'vUSDC', t: '100' },
              { a: 'vBTC', t: '0.5' }
            ]
          }
        }
      };
    }

    if (url.endsWith('/spot/markets/tickers')) {
      return {
        data: {
          code: 0,
          data: {
            list: [
              { s: 'vBTC_vUSDC', lastPx: '60000' }
            ]
          }
        }
      };
    }

    if (url.endsWith(`/perps/accounts/${wallet}/state`)) {
      return {
        data: {
          code: 0,
          data: {
            A: { av: '1000', am: '800' },
            P: [
              { s: 'BTC-USD', sz: '0.1', ep: '65000', mp: '70000', upnl: '500' }
            ]
          }
        }
      };
    }

    if (url.endsWith('/perps/markets/tickers')) {
      return { data: { code: 0, data: { list: [{ s: 'BTC-USD', lastPx: '70000' }] } } };
    }

    if (url.includes('/trades')) {
      return {
        data: {
          code: 0,
          data: [
            { s: url.includes('/perps/') ? 'BTC-USD' : 'vBTC_vUSDC', S: 'BUY', p: '60000', q: '0.01', T: Date.now() }
          ]
        }
      };
    }

    if (url.includes('/orders/history')) {
      return { data: { code: 0, data: [] } };
    }

    if (url.includes('/orders')) {
      return { data: { code: 0, data: [{ s: 'BTC-USD', S: 'SELL', p: '71000', q: '0.01' }] } };
    }

    throw new Error(`Unexpected SoDEX GET ${url}`);
  };

  const server = await startServer('/api/sodex', require('../routes/sodex'));
  try {
    const response = await fetch(urlFor(server, `/api/sodex/profile/${wallet}`));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.walletAddress, wallet);
    assert.equal(body.summary.netValueUsd, 31100);
    assert.equal(body.summary.activePositions, 1);
    assert.equal(body.summary.recentTrades, 2);
    assert.equal(body.spot.balances[0].asset, 'VBTC');
    assert.equal(body.perps.positions[0].symbol, 'BTC-USD');
  } finally {
    await closeServer(server);
  }
};

(async () => {
  try {
    await testAgentStreamInjectsVerifiedWallet();
    await testAgentStreamRequiresVerifiedWalletForPortfolio();
    await testChatRoutesWithMockedDatabase();
    await testChatNonceReusesUnexpiredNonce();
    await testSodexProfileRouteBuildsRealDashboard();
    await testSosoUpstreamErrorHandling();
    console.log('route integration tests passed');
  } finally {
    axios.get = originalAxiosGet;
    axios.post = originalAxiosPost;
    mongoose.connection.readyState = originalReadyState;
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    Chat.findOneAndUpdate = originalChatFindOneAndUpdate;
    Chat.prototype.save = originalChatSave;
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
