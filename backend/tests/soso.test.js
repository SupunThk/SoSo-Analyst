const assert = require('node:assert/strict');
const path = require('node:path');
const axios = require('axios');

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

const resetSosoModules = () => {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}clients${path.sep}soso`) ||
      key.includes(`${path.sep}tools${path.sep}executors`) ||
      key.includes(`${path.sep}normalizers${path.sep}toolResult`)
    ) {
      delete require.cache[key];
    }
  }
};

const testDocumentedCoinListCatalog = async () => {
  process.env.SOSO_API_KEY = 'test-soso-key';
  axios.post = async (url, body) => {
    assert.match(url, /\/openapi\/v1\/data\/default\/coin\/list$/);
    assert.deepEqual(body, {});
    return {
      data: {
        code: 0,
        msg: null,
        traceId: 'coin-list-trace',
        data: [
          { id: '1673723677362319866', fullName: 'Bitcoin', name: 'btc' },
          { id: '1673723677362319867', fullName: 'Ethereum', name: 'eth' }
        ]
      }
    };
  };

  resetSosoModules();
  const { resolveCurrencyId } = require('../clients/soso');
  const btc = await resolveCurrencyId('btc');

  assert.equal(btc.currency_id, '1673723677362319866');
  assert.equal(btc.name, 'Bitcoin');
  assert.equal(btc.symbol, 'BTC');
};

const testLargeCurrencyIdsArePreservedAsStrings = () => {
  resetSosoModules();
  const { parseSosoJsonPreservingLargeIds } = require('../clients/soso');
  const parsed = parseSosoJsonPreservingLargeIds(
    '{"code":0,"data":[{"currencyName":"btc","currencyId":1673723677362319866},{"currencyName":"eth","currencyId":1673723677362319867}]}'
  );

  assert.equal(parsed.data[0].currencyId, '1673723677362319866');
  assert.equal(parsed.data[1].currencyId, '1673723677362319867');
  assert.notEqual(parsed.data[0].currencyId, parsed.data[1].currencyId);
};

const testDocumentedEtfV2FlowTool = async () => {
  process.env.SOSO_API_KEY = 'test-soso-key';
  axios.post = async (url, body) => {
    if (url.endsWith('/openapi/v2/etf/historicalInflowChart')) {
      assert.deepEqual(body, { type: 'us-btc-spot' });
      return {
        data: {
          code: 0,
          data: {
            list: [
              { date: '2024-01-01', totalNetInflow: 100, totalValueTraded: 1000, totalNetAssets: 9000, cumNetInflow: 100 },
              { date: '2024-01-02', totalNetInflow: -50, totalValueTraded: 1100, totalNetAssets: 9100, cumNetInflow: 50 },
              { date: '2024-01-03', totalNetInflow: 75, totalValueTraded: 1200, totalNetAssets: 9200, cumNetInflow: 125 }
            ]
          }
        }
      };
    }

    if (url.endsWith('/openapi/v2/etf/currentEtfDataMetrics')) {
      assert.deepEqual(body, { type: 'us-btc-spot' });
      return {
        data: {
          code: 0,
          data: {
            totalNetAssets: { value: 9200, lastUpdateDate: '2024-01-03' },
            totalTokenHoldings: { value: 300, lastUpdateDate: '2024-01-03' },
            dailyNetInflow: { value: 75, lastUpdateDate: '2024-01-03' },
            cumNetInflow: { value: 125, lastUpdateDate: '2024-01-03' },
            dailyTotalValueTraded: { value: 1200, lastUpdateDate: '2024-01-03' },
            list: [
              {
                ticker: 'IBIT',
                institute: 'BlackRock',
                netAssets: { value: 5000, status: 1, lastUpdateDate: '2024-01-03' },
                dailyNetInflow: { value: 50, status: 1, lastUpdateDate: '2024-01-03' },
                cumNetInflow: { value: 100, status: 1, lastUpdateDate: '2024-01-03' },
                dailyValueTraded: { value: 700, status: 1, lastUpdateDate: '2024-01-03' },
                fee: { value: 0.0025, status: 1, lastUpdateDate: '2024-01-03' },
                discountPremiumRate: { value: 0.0001, status: 1, lastUpdateDate: '2024-01-03' }
              }
            ]
          }
        }
      };
    }

    throw new Error(`Unexpected POST ${url}`);
  };

  resetSosoModules();
  const { executeTool } = require('../tools/executors');
  const result = await executeTool('get_etf_flow_brief', { assetSymbol: 'BTC', days: 2 });

  assert.equal(result.status, 'success');
  assert.equal(result.payload.dataPreview.sourceEndpoint, 'openapi/v2/etf');
  assert.equal(result.payload.analysis.metrics.sampleDays, 2);
  assert.equal(result.payload.analysis.metrics.totalNetFlow, 25);
  assert.equal(result.payload.analysis.metrics.latestDirection, 'inflow');
};

(async () => {
  try {
    testLargeCurrencyIdsArePreservedAsStrings();
    await testDocumentedCoinListCatalog();
    await testDocumentedEtfV2FlowTool();
    console.log('soso tests passed');
  } finally {
    axios.get = originalAxiosGet;
    axios.post = originalAxiosPost;
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
