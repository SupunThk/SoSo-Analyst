// The market-wide intelligence payload (regime, rotation, opportunities, alerts), cached for 90 s with in-flight dedup.
import {
  fetchTrackedAssets,
  hydrateAssetsWithFallbacks,
  fetchSectorSpotlight,
  fetchIndexRotation,
  fetchSodexContext
} from './sources.ts';
import {
  buildRotationSignals,
  classifyMarketRegime,
  buildOpportunityScanner,
  buildAlertEngine
} from './signals.ts';
import { formatPct } from './shared.ts';

const INTELLIGENCE_CACHE_TTL_MS = 90 * 1000;

let intelligenceCache = {
  expiresAt: 0,
  data: null,
  inflight: null
};

const buildMarketIntelligencePayload = async () => {
  const startedAt = Date.now();
  const [trackedAssets, sectorSpotlight, indexRotation, sodex] = await Promise.all([
    fetchTrackedAssets(),
    fetchSectorSpotlight(),
    fetchIndexRotation(),
    fetchSodexContext()
  ]);

  const sectors = sectorSpotlight.sectors;
  const indices = indexRotation.indices;
  const assets = hydrateAssetsWithFallbacks(trackedAssets.assets, sectors, sodex);

  // If core data is completely missing due to network errors, throw so the executor can retry
  // and we don't cache an empty "Chop" regime.
  if (sectors.length === 0 && assets.every(a => a.price === null)) {
    throw new Error('Upstream API failure: Could not load market intelligence data.');
  }

  const regime = classifyMarketRegime({ assets, sectors, indices });
  const rotation = {
    sectors,
    spotlight: sectorSpotlight.spotlight,
    indices,
    ...buildRotationSignals({ sectors, indices, assets })
  };
  const opportunities = buildOpportunityScanner({ assets, sectors, indices, sodex });
  const alerts = buildAlertEngine({ regime, sectors, assets, rotation, sodex });

  // Rank tracked assets by 24h change for top movers data
  const assetsWithChange = assets.filter(a => a.changePct24h !== null);
  const sortedByGain = [...assetsWithChange].sort((a, b) => (b.changePct24h || 0) - (a.changePct24h || 0));
  const topMovers = {
    gainers: sortedByGain.slice(0, 3).map(a => ({ symbol: a.symbol, name: a.name, changePct24h: a.changePct24h, price: a.price })),
    losers: sortedByGain.slice(-3).reverse().map(a => ({ symbol: a.symbol, name: a.name, changePct24h: a.changePct24h, price: a.price })),
    scope: 'Tracked major assets: BTC, ETH, SOL, XRP, BNB'
  };

  const warnings = [
    ...trackedAssets.warnings,
    ...(indexRotation.warnings || []),
    sectorSpotlight.status.status === 'error' ? `Sector spotlight failed: ${sectorSpotlight.status.error}` : null,
    sodex.status.spot === 'error' ? `SoDEX spot failed: ${sodex.status.spotError}` : null,
    sodex.status.perps === 'error' ? `SoDEX perps failed: ${sodex.status.perpsError}` : null
  ].filter(Boolean);
  const dedupedWarnings = [...new Set(warnings)];

  return {
    source: 'SoSoValue + SoSo SSI + SoDEX',
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    regime,
    tickerAssets: assets,
    rotation,
    topMovers,
    opportunities,
    alerts,
    sodex,
    warnings: dedupedWarnings,
    evidence: [
      `Regime=${regime.label}, confidence=${regime.confidence}, breadth=${formatPct(regime.breadthPct)}, riskScore=${regime.riskScore} (${regime.riskLevel}).`,
      ...regime.drivers.slice(0, 3),
      ...rotation.signals.slice(0, 3).map((signal) => signal.detail),
      topMovers.gainers.length ? `Top gainer (tracked): ${topMovers.gainers[0].symbol} ${formatPct(topMovers.gainers[0].changePct24h)}` : null,
      topMovers.losers.length ? `Top loser (tracked): ${topMovers.losers[0].symbol} ${formatPct(topMovers.losers[0].changePct24h)}` : null
    ].filter(Boolean).slice(0, 10)
  };
};

const buildMarketIntelligence = async (options: Record<string, any> = {}) => {
  const force = Boolean(options.force);
  if (!force && intelligenceCache.data && intelligenceCache.expiresAt > Date.now()) {
    return intelligenceCache.data;
  }

  if (!intelligenceCache.inflight) {
    intelligenceCache.inflight = buildMarketIntelligencePayload()
      .then((data) => {
        intelligenceCache.data = data;
        intelligenceCache.expiresAt = Date.now() + INTELLIGENCE_CACHE_TTL_MS;
        return data;
      })
      .finally(() => {
        intelligenceCache.inflight = null;
      });
  }

  return intelligenceCache.inflight;
};

export { buildMarketIntelligence };
