const assert = require('node:assert/strict');

const {
  buildAlertEngine,
  buildOpportunityScanner,
  buildRotationSignals,
  classifyMarketRegime,
  normalizeChangeToPercent
} = require('../services/marketIntelligence');

const testPercentNormalization = () => {
  assert.equal(normalizeChangeToPercent(-0.0222), -2.22);
  assert.equal(normalizeChangeToPercent(3.5), 3.5);
  assert.equal(normalizeChangeToPercent('0.015'), 1.5);
  assert.equal(normalizeChangeToPercent('bad'), null);
};

const testRegimeClassificationUsesBreadthAndDispersion = () => {
  const assets = [
    { symbol: 'BTC', changePct24h: -2.2 },
    { symbol: 'ETH', changePct24h: -3.1 },
    { symbol: 'SOL', changePct24h: -2.8 }
  ];
  const sectors = [
    { name: 'Layer1', changePct24h: -2.5, marketcapDomPct: 8.5 },
    { name: 'AI', changePct24h: -4.2, marketcapDomPct: 0.4 },
    { name: 'StableCoin', changePct24h: 0, marketcapDomPct: 10.7 }
  ];
  const indices = [
    { name: 'Meme', changePct24h: -3.2 },
    { name: 'DeFi', changePct24h: -2.7 }
  ];

  const regime = classifyMarketRegime({ assets, sectors, indices });

  assert.equal(regime.label, 'Risk-Off');
  assert.ok(regime.confidence >= 45);
  assert.ok(regime.drivers.some((driver) => driver.includes('BTC')));
  assert.ok(regime.risks.length > 0);
};

const testRotationSignalsAndAlerts = () => {
  const assets = [
    { symbol: 'BTC', changePct24h: -2 },
    { symbol: 'ETH', changePct24h: -3.2 },
    { symbol: 'SOL', changePct24h: -0.4 }
  ];
  const sectors = [
    { name: 'AI', changePct24h: 1.2, marketcapDomPct: 0.4 },
    { name: 'Meme', changePct24h: -5.1, marketcapDomPct: 1 },
    { name: 'StableCoin', changePct24h: 0, marketcapDomPct: 11.2 }
  ];
  const indices = [{ name: 'DeFi', changePct24h: -1.1 }];
  const rotation = buildRotationSignals({ sectors, indices, assets });
  const regime = classifyMarketRegime({ assets, sectors, indices });
  const alerts = buildAlertEngine({
    regime,
    sectors,
    assets,
    rotation,
    sodex: {
      tracked: [
        {
          symbol: 'BTC',
          perps: { symbol: 'BTC-USD', spreadPct: 0.02 }
        }
      ]
    }
  });

  assert.ok(rotation.signals.some((signal) => signal.label.includes('AI')));
  assert.ok(alerts.triggered.some((alert) => alert.templateId === 'sector-relative-strength'));
  assert.ok(alerts.triggered.some((alert) => alert.templateId === 'sodex-tight-spread'));
};

const testOpportunityScannerRanksActionableRows = () => {
  const opportunities = buildOpportunityScanner({
    assets: [
      { symbol: 'BTC', changePct24h: -2 },
      { symbol: 'SOL', changePct24h: -0.5 },
      { symbol: 'ETH', changePct24h: -3.1 }
    ],
    sectors: [
      { name: 'AI', changePct24h: 1.5, marketcapDomPct: 0.4 },
      { name: 'Meme', changePct24h: -4, marketcapDomPct: 1 }
    ],
    indices: [],
    sodex: {
      tracked: [
        {
          symbol: 'SOL',
          perps: {
            symbol: 'SOL-USD',
            spreadPct: 0.03,
            quoteVolume24h: 100000
          }
        }
      ]
    }
  });

  assert.ok(opportunities.length > 0);
  assert.ok(opportunities[0].score >= opportunities[opportunities.length - 1].score);
  assert.ok(opportunities.some((item) => item.symbol === 'SOL'));
};

try {
  testPercentNormalization();
  testRegimeClassificationUsesBreadthAndDispersion();
  testRotationSignalsAndAlerts();
  testOpportunityScannerRanksActionableRows();
  console.log('market intelligence tests passed');
} catch (err) {
  console.error(err);
  process.exit(1);
}
