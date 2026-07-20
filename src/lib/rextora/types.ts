export type TradingMode = "LIVE" | "PAPER" | "BACKTEST";
export type ServiceState = "mock" | "simulated" | "read-only" | "paper" | "live-blocked" | "live-ready" | "live-error";
export type StrategyType = "안정형" | "공격형 후보" | "탐색 중";
export type StrategyStatus = "실전 가능 후보" | "검증 필요" | "탐색 중" | "LIVE 차단";
export type PermissionStatus = "정상" | "오류" | "차단" | "미확인";
export type RiskLevel = "낮음" | "중간" | "높음" | "위험";

export type CoinState = "정상" | "급등" | "급락" | "돌파" | "과열" | "관찰";
export type TradeDirection = "롱" | "숏";
export type SignalType =
  | "long_candidate"
  | "short_candidate"
  | "breakout"
  | "pullback"
  | "volume_spike"
  | "trend_reversal"
  | "overheated_zone"
  | "weak_signal";

export type CandidateStatus =
  | "진입 가능"
  | "관찰 필요"
  | "비용 초과로 차단"
  | "리스크 초과로 차단"
  | "과열 구간 차단"
  | "신호 약함";

export type CostDecision = "비용 통과" | "비용 부족" | "진입 금지";
export type RiskState = "정상" | "주의" | "위험" | "자동 중단";
export type BotRunState = "실행 중" | "중지" | "오류";

export interface MarketCoin {
  symbol: string;
  price: number;
  change24hPct: number;
  volumeChangePct: number;
  volatility: number;
  spread: number;
  fundingFee: number;
  /** Binance 24h quote volume (USDT). */
  quoteVolume: number;
  state: CoinState;
  aiScore: number;
  directionHint?: TradeDirection;
  serviceState: ServiceState;
}

export interface CostBreakdown {
  symbol: string;
  expectedProfitPct: number;
  roundTripFeePct: number;
  estimatedSlippagePct: number;
  spreadPct: number;
  fundingFeePct: number;
  safetyMarginPct: number;
  finalExpectedValuePct: number;
  decision: CostDecision;
  passed: boolean;
  serviceState: ServiceState;
}

export interface AiCandidate {
  rank: number;
  symbol: string;
  direction: TradeDirection;
  signalType: SignalType;
  aiScore: number;
  expectedProfitPct: number;
  expectedCostPct: number;
  stopLossDistancePct: number;
  riskGrade: RiskLevel;
  status: CandidateStatus;
  entryReason?: string;
  signalReason?: string;
  costPassed?: boolean;
  riskPassed?: boolean;
  blockReason?: string;
  serviceState: ServiceState;
  /** 큐/실행 경로에서 결정된 레버리지 */
  leverage?: number;
  /** 학습 보정 후 최종 점수 */
  finalScore?: number;
}

export type LearningEventCategory = "후보 기록" | "거래 기록" | "학습 반영" | "시스템 이벤트";

export interface LearningLogItem {
  id: string;
  time: string;
  symbol: string;
  direction: TradeDirection;
  entryReason: string;
  exitReason: string;
  result: "성공" | "실패" | "대기" | "보합";
  pnlPct: number | null;
  signalType: SignalType;
  eventCategory?: LearningEventCategory;
  eventType?: string;
  candidateStatus?: "대기" | "보류" | "제외";
  holdReason?: string;
  aiScore?: number;
  finalScore?: number;
  leverage?: number;
  entryPrice?: number;
  exitPrice?: number;
  scoreDelta?: number;
  leverageAdjustment?: number;
  learningSummary?: string;
  learningReason?: string;
  successPattern?: string;
  failurePattern?: string;
  blockedReason?: string;
  serviceState: ServiceState;
}

export interface EngineStatus {
  name: string;
  label: string;
  status: "정상" | "대기" | "오류" | "차단";
  message: string;
  serviceState: ServiceState;
}

export interface SystemStatus {
  engines: EngineStatus[];
  binance: {
    apiConnected: boolean;
    readPermission: PermissionStatus;
    orderPermission: PermissionStatus;
    balanceFetch: PermissionStatus;
    marketData: PermissionStatus;
    serverTpSlActive: boolean;
  };
  serviceState: ServiceState;
}

export interface TodayPnlSummary {
  todayPnlPct: number;
  dailyLossLimitUsagePct: number;
  openPositionCount: number;
  todayTradeCount: number;
  riskState: RiskState;
  /** Extended fields from unified metrics (optional for backward compat). */
  todayRealizedPnlUsdt?: number;
  todayUnrealizedPnlUsdt?: number;
  todayFeeUsdt?: number;
  todayFundingUsdt?: number;
  todaySlippageUsdt?: number;
  accountEquity?: number;
  accountReturnPct?: number;
}

export interface MarketWatcherSummary {
  watchedCoinCount: number;
  pumpDetected: number;
  dumpDetected: number;
  volumeSpikeDetected: number;
  breakoutDetected: number;
  volatilityExpanded: number;
}

export interface AlertItem {
  id: string;
  time: string;
  symbol: string;
  content: string;
  riskLevel: RiskLevel;
  status: "전송됨" | "대기" | "실패" | "mock";
  serviceState: ServiceState;
}

export interface TelegramAlertSettings {
  entryCandidate: boolean;
  entry: boolean;
  exit: boolean;
  pnl: boolean;
  risk: boolean;
  dailyReport: boolean;
  topCandidateBriefing: boolean;
}

// Legacy strategy/backtest types (preserved for internal reference)
export interface StrategyBacktestSummary {
  trades: number;
  totalReturn: number;
  maxDrawdown: number;
  negMonths: number;
  sharpe: number;
  cagr: number;
  winRate: number;
  score: number;
}

export interface BacktestValidation {
  recent3m: StrategyBacktestSummary;
  prev3m: StrategyBacktestSummary;
  full10m: StrategyBacktestSummary;
  costStress: CostStressResult;
  jitter: JitterResult;
  jitterPassRate: number;
  overfittingRisk: RiskLevel;
  monthlyReturns: Array<{ month: string; returnPct: number }>;
  dataSource: "seeded_from_preserved_snapshot";
  warningKo: string;
}

export type CostStressResult = {
  cost1x: "pass" | "fail";
  cost15x: "pass" | "fail";
  cost2x: "pass" | "fail";
};

export interface JitterResult {
  passRate: number;
  samples: number;
  status: "pass" | "warning" | "fail";
}

export interface Strategy {
  id: string;
  name: string;
  paramsHash: string;
  type: StrategyType;
  status: StrategyStatus;
  interpretation: string;
  entryCondition: string;
  exitCondition: string;
  riskCondition: string;
  symbol: string;
  timeframe: string;
  liveEligible: boolean;
  liveEligibleCandidate: boolean;
  verifiedForLive: boolean;
  serviceState: ServiceState;
  validation: BacktestValidation;
  params: Record<string, boolean | number | string>;
}

export interface RiskSettings {
  dailyLossLimitPct: number;
  totalLossLimitPct: number;
  consecutiveLossLimit: number;
  maxDailyTrades: number;
  maxLeverage: number;
  maxSimultaneousPositions: number;
  maxPositionSizePerCoinPct: number;
  overtradingCooldownMinutes: number;
}

export interface RiskStatus {
  settings: RiskSettings;
  dailyLossPct: number;
  totalLossPct: number;
  consecutiveLosses: number;
  dailyTrades: number;
  openPositions: number;
  currentLeverage: number;
  riskSettingsConfirmed: boolean;
  riskState: RiskState;
  serviceState: ServiceState;
}

export interface ApiStatus {
  binanceFuturesConnected: boolean;
  futuresPermission: PermissionStatus;
  orderPermission: PermissionStatus;
  readPermission: PermissionStatus;
  ipRestriction: PermissionStatus;
  lastBalanceFetchTime: string;
  lastOrderFetchTime: string;
  apiKeyExpirationDate: string;
  strategyFileLoaded: boolean;
  strategyHashValid: boolean;
  realOrderEngineConnected: boolean;
  dummyLoopDetected: boolean;
  serverTpSlActive: boolean;
  configured: {
    binanceApiKey: boolean;
    binanceApiSecret: boolean;
    binanceTestnet: boolean;
    telegramToken: boolean;
    telegramChatId: boolean;
  };
  serviceState: ServiceState;
}

export interface BotStatus {
  running: boolean;
  mode: TradingMode;
  strategyId: string;
  lastHeartbeat: string;
  state: BotRunState | "대기" | "감시 중" | "거래 차단" | "백테스트";
  serverTpSlActive: boolean;
  serviceState: ServiceState;
  blockReasons: string[];
  selectedCandidate?: string;
  binanceConnected: boolean;
  telegramConnected: boolean;
}

export interface Position {
  id: string;
  symbol: string;
  side: "Long" | "Short" | "Flat";
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  unrealizedPnl: number;
  margin: number;
  stopLoss: number;
  takeProfit: number;
  mode: TradingMode;
  serviceState: ServiceState;
  aiScore?: number;
  finalScore?: number;
  entrySignalType?: SignalType;
  openedAt?: string;
  entryReason?: string;
  paramsHash?: string;
  strategyName?: string;
  trailingDistance?: number;
  maxHoldBars?: number;
  barsHeld?: number;
}

export interface OrderRecord {
  id: string;
  time: string;
  symbol: string;
  side: "Long" | "Short";
  type: "시장가" | "지정가" | "TP/SL" | "청산" | "취소";
  price: number;
  status: "체결됨" | "취소됨" | "대기" | "mock" | "paper";
  mode: TradingMode;
  serviceState: ServiceState;
}

export interface AlertRule {
  id: string;
  asset: string;
  timeframe: string;
  type: "캔들 패턴" | "RSI 조건" | "EMA 돌파" | "거래량 조건" | "추세 전환" | "다중 조건";
  condition: string;
  enabled: boolean;
  serviceState: ServiceState;
}

export interface AlertHistoryItem {
  id: string;
  time: string;
  asset: string;
  type: string;
  message: string;
  riskLevel: RiskLevel;
  status: "전송됨" | "대기" | "실패" | "mock";
  serviceState: ServiceState;
}

export interface AiBriefing {
  asset: string;
  timeframe: string;
  detectedCondition: string;
  currentPrice: number;
  volumeContext: string;
  indicatorContext: string;
  riskLevel: RiskLevel;
  explanation: string;
  disclaimer: string;
  serviceState: ServiceState;
}

export interface LiveSafetyChecklist {
  exchangeConnectionNormal: boolean;
  balanceFetchNormal: boolean;
  accountReadNormal: boolean;
  orderPermissionNormal: boolean;
  futuresPermissionNormal: boolean;
  serverTpSlEnabled: boolean;
  liveSettingEnabled: boolean;
  emergencyStopActive: boolean;
  candidateReady: boolean;
}

export interface EmergencyAction {
  id: string;
  time?: string;
  label: string;
  severity: "warning" | "danger";
  requiresConfirmation: boolean;
  mode?: TradingMode;
  result?: "logged" | "blocked" | "simulated";
  message?: string;
  serviceState?: ServiceState;
}

export interface ScalpingDashboardData {
  bot: BotStatus;
  todayPnl: TodayPnlSummary;
  topCandidates: AiCandidate[];
  positions: Position[];
  marketSummary: MarketWatcherSummary;
  risk: RiskStatus;
  api: ApiStatus;
}

export interface DashboardData {
  bot: BotStatus;
  risk: RiskStatus;
  api: ApiStatus;
  position: Position;
  strategies: Strategy[];
  alertRules: AlertRule[];
  alertHistory: AlertHistoryItem[];
  briefing: AiBriefing;
  equityCurve: Array<{ label: string; value: number }>;
  marketCandles: Array<{ label: string; open: number; high: number; low: number; close: number }>;
}

export interface EngineResult {
  ok: boolean;
  mode: TradingMode;
  message: string;
  serviceState: ServiceState;
  blockedReasons?: string[];
}
