// The /api/soso proxy interpolates path params into the upstream URL, so each
// param must be validated before any request goes out with the API key.
import assert from 'node:assert/strict';
import axios from 'axios';
import express from 'express';

const originalAxiosGet = axios.get;

test('SoSoValue proxy validates path params before calling upstream', async () => {
  const upstream: string[] = [];
  (axios as any).get = async (url) => {
    upstream.push(url);
    return { data: { code: 0, message: 'success', data: [] } };
  };

  vi.resetModules();
  process.env.SOSO_API_KEY = 'test-soso-key';
  const { default: sosoRoutes } = await import('../routes/sosovalue.ts');
  const app = express();
  app.use('/api/soso', sosoRoutes);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const get = (path) => fetch(`http://127.0.0.1:${port}/api/soso${path}`);

  try {
    // Encoded traversal decodes to "../../x" inside req.params.
    assert.equal((await get('/currencies/..%2F..%2Fx/market-snapshot')).status, 400);
    assert.equal((await get('/etfs/IB%3FIT/history')).status, 400);
    assert.equal(upstream.length, 0);

    assert.equal((await get('/etfs/IBIT/history?limit=2&bogus=1')).status, 200);
    assert.equal(upstream.length, 1);

    // Macro event names are free text; they are URL-encoded upstream.
    assert.equal((await get(`/macro/events/${encodeURIComponent('CPI (YoY)')}/history`)).status, 200);
    assert.match(upstream[1], /\/macro\/events\/CPI%20\(YoY\)\/history$/);
  } finally {
    server.close();
    (axios as any).get = originalAxiosGet;
  }
});
