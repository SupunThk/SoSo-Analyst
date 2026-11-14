// Conventions of the SoSoValue Open API v1 that the tool executors share.
// Reference: https://sosovalue-1.gitbook.io/sosovalue-api-doc

/** Paginated endpoints return { list, page, page_size, total } under data. */
const getPagedList = (payload): { list: any[]; total: number | null } => {
  const data = payload?.data;
  if (Array.isArray(data)) return { list: data, total: data.length };
  const list = Array.isArray(data?.list) ? data.list : [];
  const total = Number(data?.total);
  return { list, total: Number.isFinite(total) ? total : list.length };
};

/** Snapshot changes/returns are decimal fractions: -0.0506 means -5.06%. */
const fractionToPercent = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * 100 : null;
};

/** Timestamps are millisecond epochs, often sent as strings. */
const msToIsoDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
};

/**
 * Macro values are strings with the unit embedded ("3.5%", "53.6", "165").
 * An unreleased figure is "" and must stay null, not become 0.
 */
const parseMacroValue = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[%,KMB]/gi, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Event history takes the exact event name from GET /macro/events
 * (an unknown name returns an empty array, not a 404).
 */
const MACRO_EVENT_ALIASES: Record<string, string> = {
  cpi: 'CPI (YoY)',
  inflation: 'CPI (YoY)',
  'cpi yoy': 'CPI (YoY)',
  'cpi mom': 'CPI (MoM)',
  'core cpi': 'Core CPI (YoY)',
  'core cpi yoy': 'Core CPI (YoY)',
  'core cpi mom': 'Core CPI (MoM)',
  ppi: 'PPI (MoM)',
  'ppi mom': 'PPI (MoM)',
  pce: 'Core PCE Price Index (YoY)',
  'core pce': 'Core PCE Price Index (YoY)',
  'core pce mom': 'Core PCE Price Index (MoM)',
  nfp: 'Nonfarm Payrolls',
  payrolls: 'Nonfarm Payrolls',
  jobs: 'Nonfarm Payrolls',
  'nonfarm payrolls': 'Nonfarm Payrolls',
  'jobless claims': 'Initial Jobless Claims',
  'initial jobless claims': 'Initial Jobless Claims',
  gdp: 'GDP (QoQ)',
  'retail sales': 'Retail Sales (MoM)',
  pmi: 'S&P Global US Manufacturing PMI',
  'manufacturing pmi': 'S&P Global US Manufacturing PMI',
  'services pmi': 'S&P Global Services PMI',
  'new home sales': 'New Home Sales',
  'existing home sales': 'Existing Home Sales'
};

/** Analysis chart names, with aliases for how people ask about them. */
const CHART_ALIASES: Record<string, string> = {
  'fear and greed': 'fgi_indicator',
  'fear & greed': 'fgi_indicator',
  'fear greed': 'fgi_indicator',
  fgi: 'fgi_indicator',
  sentiment: 'fgi_indicator',
  'stablecoin market cap': 'stablecoin_total_market_cap',
  stablecoins: 'stablecoin_total_market_cap',
  'total market cap': 'total_crypto_market_cap',
  'altcoin market cap': 'altcoin_market_cap_volume',
  'open interest': 'futures_open_interest',
  'funding rate': 'funding_rate',
  'funding rates': 'funding_rate',
  'long short ratio': 'binance_btcusdt_futures_long_short_ratio_1d',
  'long/short ratio': 'binance_btcusdt_futures_long_short_ratio_1d',
  hashrate: 'btc_hashrate',
  'mining difficulty': 'btc_mining_difficulty',
  'miner revenue': 'btc_miner_revenue',
  'active addresses': 'btc_active_addresses',
  'new addresses': 'btc_new_addresses',
  transactions: 'btc_transactions',
  ahr999: 'ahr_999_indicator',
  'eth staking': 'eth_staking_ratio',
  'staking ratio': 'eth_staking_ratio',
  tvl: 'tvl_of_different_type_of_chain',
  'etf flows': 'total_crypto_spot_btc_eth_etf_fund_flow_1d',
  'usd inflows': 'usd_inflows_into_cryptocurrency_markets'
};

/**
 * FOMC probabilities are positional against rate_ranges (basis points, e.g.
 * "350-375" = 3.50%-3.75%); values are percentage strings, null = no data.
 */
const summarizeFomcMeeting = (rateRanges: string[], meeting: Record<string, any>) => {
  const toLabel = (range) => {
    const [low, high] = String(range).split('-').map(Number);
    return Number.isFinite(low) && Number.isFinite(high)
      ? `${(low / 100).toFixed(2)}%-${(high / 100).toFixed(2)}%`
      : String(range);
  };
  const distribution = rateRanges
    .map((range, index) => ({ range: toLabel(range), probabilityPct: parseMacroValue(meeting?.probabilities?.[index]) }))
    .filter((entry) => entry.probabilityPct !== null && entry.probabilityPct > 0)
    .sort((a, b) => b.probabilityPct - a.probabilityPct);

  return {
    meetingDate: meeting?.meeting_date,
    mostLikelyRange: distribution[0]?.range ?? null,
    mostLikelyProbabilityPct: distribution[0]?.probabilityPct ?? null,
    distribution: distribution.slice(0, 4)
  };
};

export {
  CHART_ALIASES,
  MACRO_EVENT_ALIASES,
  fractionToPercent,
  getPagedList,
  msToIsoDate,
  parseMacroValue,
  summarizeFomcMeeting
};
