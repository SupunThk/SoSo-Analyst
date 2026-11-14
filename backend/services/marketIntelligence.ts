// Market intelligence entry point. Implementation lives in ./intelligence/:
// sources (data fetching), signals (scoring), market (cached payload), token.
import {
  buildRotationSignals,
  classifyMarketRegime,
  buildOpportunityScanner,
  buildAlertEngine
} from './intelligence/signals.ts';
import { buildTokenIntelligence } from './intelligence/token.ts';
import { buildMarketIntelligence } from './intelligence/market.ts';
import { normalizeChangeToPercent } from './intelligence/shared.ts';

export {
  buildAlertEngine,
  buildMarketIntelligence,
  buildOpportunityScanner,
  buildRotationSignals,
  buildTokenIntelligence,
  classifyMarketRegime,
  normalizeChangeToPercent
};
