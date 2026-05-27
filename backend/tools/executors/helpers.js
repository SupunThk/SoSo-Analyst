const { asArray } = require('../../normalizers/toolResult');

const mapNewsItems = (items, limit = 5) =>
  asArray(items).slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title || item.multilanguageContent?.find((entry) => entry.language === 'en')?.title || null,
    content: item.content || item.multilanguageContent?.find((entry) => entry.language === 'en')?.content || null,
    sourceLink: item.source_link || item.sourceLink,
    releaseTime: item.release_time || item.releaseTime,
    category: item.category,
    author: item.author,
    tags: asArray(item.tags).slice(0, 5)
  }));

const mapCryptoStockSnapshot = (ticker, snapshot) => ({
  ticker,
  price: snapshot?.price,
  change_pct_24h: snapshot?.change_pct_24h,
  marketcap: snapshot?.marketcap,
  turnover_24h: snapshot?.turnover_24h,
  marketcap_rank: snapshot?.marketcap_rank
});

module.exports = { mapNewsItems, mapCryptoStockSnapshot };
