// Market intelligence entry point. Implementation lives in ./intelligence/:
// sources (data fetching), signals (scoring), market (cached payload), token.
const {
  buildRotationSignals,
  classifyMarketRegime,
  buildOpportunityScanner,
  buildAlertEngine
} = require('./intelligence/signals');
const { buildTokenIntelligence } = require('./intelligence/token');
const { buildMarketIntelligence } = require('./intelligence/market');
const { normalizeChangeToPercent } = require('./intelligence/shared');

module.exports = {
  buildAlertEngine,
  buildMarketIntelligence,
  buildOpportunityScanner,
  buildRotationSignals,
  buildTokenIntelligence,
  classifyMarketRegime,
  normalizeChangeToPercent
};
