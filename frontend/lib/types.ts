export type ToolInputValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export type MessageFeedbackRating = 'up' | 'down';

export interface MessageFeedback {
  rating: MessageFeedbackRating;
  at: string | Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  feedback?: MessageFeedback | null;
  persistedIndex?: number;
  timestamp: Date;
}

export interface ToolCall {
  name: string;
  input?: Record<string, ToolInputValue> | null;
  result: string;
  status: 'success' | 'error';
}

export interface ConversationHistoryMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface ChatResponse {
  answer: string;
  toolCalls: ToolCall[];
  analysisSynthesis?: AnalysisSynthesis | null;
}

export interface AnalysisSynthesis {
  overallLabel: string;
  directionalScore: number | null;
  riskScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  analyzedTools: number;
  thesis?: string[];
  conflicts?: string[];
  riskFlags?: string[];
}

export interface TickerAsset {
  symbol: string;
  name: string;
  price: number | null;
  change_pct_24h: number | null;
}

export interface IntelligenceAsset {
  id?: string;
  symbol: string;
  name: string;
  sector?: string | null;
  price: number | null;
  changePct24h: number | null;
  changePct7d?: number | null;
  changePct30d?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  marketCapRank?: number | null;
}

export interface RotationRow {
  name: string;
  ticker?: string;
  kind?: string;
  source?: string;
  price?: number | null;
  changePct24h: number | null;
  marketcapDomPct?: number | null;
  roi7d?: number | null;
  roi1m?: number | null;
  roi3m?: number | null;
  ytd?: number | null;
}

export interface RotationSignal {
  label: string;
  severity: 'positive' | 'negative' | 'watch' | string;
  detail: string;
  evidence: string[];
}

export interface MarketRegime {
  label: string;
  score: number;
  confidence: number;
  breadthPct: number;
  broadAveragePct: number;
  dispersionPct: number;
  majorsAveragePct: number;
  altAveragePct: number;
  drivers: string[];
  risks: string[];
  watch: string[];
}

export interface SodexTickerContext {
  symbol: string;
  lastPrice: number | null;
  markPrice?: number | null;
  indexPrice?: number | null;
  changePct24h: number | null;
  quoteVolume24h: number | null;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  fundingRatePct?: number | null;
  openInterest?: number | null;
}

export interface SodexTrackedMarket {
  symbol: string;
  spot: SodexTickerContext | null;
  perps: SodexTickerContext | null;
  tradable: boolean;
}

export interface IntelligenceOpportunity {
  id: string;
  type: string;
  symbol: string;
  title: string;
  score: number;
  bias: string;
  evidence: string[];
  risk: string;
  nextStep: string;
}

export interface AlertTemplate {
  id: string;
  title: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | string;
}

export interface TriggeredAlert {
  templateId: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | string;
  evidence: string[];
}

export interface MarketIntelligence {
  source: string;
  fetchedAt: string;
  latencyMs: number;
  regime: MarketRegime;
  tickerAssets: IntelligenceAsset[];
  rotation: {
    sectors: RotationRow[];
    spotlight: RotationRow[];
    indices: RotationRow[];
    leaders: RotationRow[];
    laggards: RotationRow[];
    signals: RotationSignal[];
  };
  opportunities: IntelligenceOpportunity[];
  alerts: {
    templates: AlertTemplate[];
    triggered: TriggeredAlert[];
    rotationSignals: RotationSignal[];
  };
  sodex: {
    status: {
      spot: string;
      perps: string;
      spotError?: string;
      perpsError?: string;
    };
    counts: {
      spotTickers: number;
      perpsTickers: number;
    };
    tracked: SodexTrackedMarket[];
    liquidPerps: SodexTickerContext[];
  };
  warnings: string[];
  evidence: string[];
}

export interface TokenIntelligence {
  source: string;
  fetchedAt: string;
  asset: {
    id: string;
    symbol: string;
    name: string;
  };
  snapshot: IntelligenceAsset;
  relative: {
    toBtcPct: number | null;
    toEthPct: number | null;
    toSectorPct: number | null;
    sector: RotationRow | null;
  };
  trend: {
    count: number;
    firstDate: string | number | null;
    lastDate: string | number | null;
    periodChangePct: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    lastClose: number | null;
    trend: string | null;
  };
  sodex: SodexTrackedMarket;
  news: Array<{
    id?: string | number;
    title: string | null;
    content?: string | null;
    sourceLink?: string | null;
    releaseTime?: string | number | null;
    category?: string | null;
    author?: string | null;
    tags?: string[];
  }>;
  whyMoving: string[];
  evidence: string[];
  warnings: string[];
}

export interface ChatSessionSummary {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  feedback?: MessageFeedback | null;
  timestamp: string | Date;
}

export interface ChatSession extends ChatSessionSummary {
  walletAddress: string;
  messages: PersistedChatMessage[];
}

export interface AuthNonceResponse {
  walletAddress: string;
  message: string;
  expiresAt: string;
}

export interface AuthSession {
  success: boolean;
  walletAddress: string;
  token: string;
  expiresAt: string;
}

export interface WalletConnection {
  address: string;
  signMessage: (message: string) => Promise<string>;
}

export interface SodexBalance {
  asset: string;
  total: number;
  available: number | null;
  locked: number | null;
  usdPrice: number | null;
  valueUsd: number | null;
}

export interface SodexPosition {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'FLAT' | string;
  size: number;
  entryPrice: number | null;
  markPrice: number | null;
  liquidationPrice: number | null;
  unrealizedPnl: number | null;
  notionalUsd: number | null;
}

export interface SodexTrade {
  id: string;
  market: 'spot' | 'perps' | string;
  symbol: string;
  side: string | null;
  price: number | null;
  amount: number | null;
  valueUsd: number | null;
  fee: number | null;
  status: string;
  timestamp: string | number | null;
}

export interface SodexOrder {
  id: string;
  market: 'spot' | 'perps' | string;
  symbol: string;
  side: string | null;
  price: number | null;
  amount: number | null;
  filled: number | null;
  status: string;
  timestamp: string | number | null;
}

export interface SodexProfile {
  walletAddress: string;
  source: string;
  fetchedAt: string;
  summary: {
    netValueUsd: number | null;
    spotBalanceValueUsd: number | null;
    perpsAccountValueUsd: number | null;
    availableMarginUsd: number | null;
    activeOrders: number;
    activePositions: number;
    recentTrades: number;
    tradeVolume24hUsd: number | null;
    spotBalanceCount: number;
    warnings: string[];
  };
  spot: {
    status: string;
    balances: SodexBalance[];
    openOrders: SodexOrder[];
    recentTrades: SodexTrade[];
  };
  perps: {
    status: string;
    accountValueUsd: number | null;
    availableMarginUsd: number | null;
    balances: SodexBalance[];
    positions: SodexPosition[];
    openOrders: SodexOrder[];
    recentTrades: SodexTrade[];
  };
  openOrders: SodexOrder[];
  orderHistory: SodexOrder[];
  recentTrades: SodexTrade[];
}
