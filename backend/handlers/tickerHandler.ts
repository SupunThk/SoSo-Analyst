// GET /api/agent/ticker: a 60 s cached price strip for the header ticker.
import { getCurrencyCatalog, sosoGet } from '../clients/soso.ts';
import { normalizeLookupValue } from '../normalizers/toolResult.ts';
import { sleep } from '../utils/common.ts';

const TICKER_ASSETS = ['bitcoin', 'ethereum', 'solana', 'xrp', 'bnb'];

let tickerCache = { expiresAt: 0, data: [] };

let tickerInflight = null;

const fetchTickerSnapshot = async (asset) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await sosoGet(`/currencies/${asset.currency_id}/market-snapshot`);
      const price = Number(response.data?.price);
      const change = Number(response.data?.change_pct_24h ?? response.data?.changePct24h);
      return {
        symbol: asset.symbol,
        name: asset.name,
        price: Number.isFinite(price) ? price : null,
        change_pct_24h: Number.isFinite(change) ? change : null
      };
    } catch (error) {
      if (attempt === 1) {
        console.warn(`Ticker snapshot failed for ${asset.symbol || asset.name}: ${error.message}`);
        break;
      }
      await sleep(300);
    }
  }

  return {
    symbol: asset.symbol,
    name: asset.name,
    price: null,
    change_pct_24h: null
  };
};

const handleTicker = async (req, res) => {
  try {
    if (tickerCache.expiresAt > Date.now() && tickerCache.data.length > 0) {
      return res.json({ data: tickerCache.data });
    }

    if (!tickerInflight) {
      tickerInflight = (async () => {
        const catalog = await getCurrencyCatalog();
        const tickerAssets = TICKER_ASSETS.map((name) => {
          const normalized = normalizeLookupValue(name);
          return catalog.find((record) =>
            normalizeLookupValue(record.name) === normalized ||
            normalizeLookupValue(record.symbol) === normalized
          );
        }).filter(Boolean);

        const snapshots = await Promise.all(tickerAssets.map(async (asset, index) => {
          await sleep(index * 150);
          return fetchTickerSnapshot(asset);
        }));

        tickerCache = { data: snapshots, expiresAt: Date.now() + 60000 };
        return snapshots;
      })().finally(() => { tickerInflight = null; });
    }

    const snapshots = await tickerInflight;
    res.json({ data: snapshots });
  } catch (error) {
    res.status(500).json({ error: true, message: 'Failed to load ticker data.' });
  }
};

export { handleTicker };
