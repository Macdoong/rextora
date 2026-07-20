import type {
  AiBriefing,
  AiCandidate,
  AlertHistoryItem,
  AlertItem,
  AlertRule,
  ApiStatus,
  BacktestValidation,
  BotStatus,
  CostBreakdown,
  CostStressResult,
  DashboardData,
  EmergencyAction,
  EngineStatus,
  JitterResult,
  LearningLogItem,
  MarketCoin,
  MarketWatcherSummary,
  OrderRecord,
  Position,
  RiskSettings,
  RiskStatus,
  ScalpingDashboardData,
  Strategy,
  SystemStatus,
  TelegramAlertSettings,
  TodayPnlSummary
} from "./types";

export const REXTORA_DISCLAIMER = "투자 조언이 아니며, 모든 투자 결정에 대한 책임은 사용자 본인에게 있습니다.";
export const BACKTEST_SNAPSHOT_WARNING = "현재 결과는 보존된 전략 스냅샷 기반입니다. 실제 엔진 연결 전입니다.";
export const COST_RULE_KO = "예상 수익 > 수수료 + 슬리피지 + 펀딩비 + 안전마진";

const safeParams = {
  ema_fast: 20,
  ema_mid: 60,
  ema_slow: 200,
  rsi_period: 14,
  atr_period: 14,
  sl_atr_mult: 1.8814680172969074,
  tp_atr_mult: 4.475374424448608,
  max_hold_bars: 5,
  use_trailing: true,
  use_dynamic_leverage: true,
  lev_min: 1.2,
  lev_base: 1.667409360218415,
  lev_max: 2.5
};

export const costStressSeed: CostStressResult = {
  cost1x: "pass",
  cost15x: "pass",
  cost2x: "pass"
};

export const jitterSeed: JitterResult = {
  passRate: 100,
  samples: 30,
  status: "pass"
};

export const backtestValidationSeed: BacktestValidation = {
  full10m: {
    trades: 201,
    totalReturn: 22.28,
    maxDrawdown: -17.0,
    negMonths: 5,
    sharpe: 1.85,
    cagr: 22.28,
    winRate: 61.89,
    score: 92.4
  },
  recent3m: {
    trades: 89,
    totalReturn: 38.22,
    maxDrawdown: -9.46,
    negMonths: 0,
    sharpe: 2.22,
    cagr: 38.22,
    winRate: 64.04,
    score: 96.7
  },
  prev3m: {
    trades: 59,
    totalReturn: 4.69,
    maxDrawdown: -7.65,
    negMonths: 1,
    sharpe: 1.04,
    cagr: 4.69,
    winRate: 58.3,
    score: 82.1
  },
  costStress: costStressSeed,
  jitter: jitterSeed,
  jitterPassRate: jitterSeed.passRate,
  overfittingRisk: "낮음",
  monthlyReturns: [
    { month: "2025-08", returnPct: 2.8 },
    { month: "2025-09", returnPct: -1.1 },
    { month: "2025-10", returnPct: 6.4 },
    { month: "2025-11", returnPct: 4.2 },
    { month: "2025-12", returnPct: 9.8 },
    { month: "2026-01", returnPct: 3.9 },
    { month: "2026-02", returnPct: -2.0 },
    { month: "2026-03", returnPct: 12.4 },
    { month: "2026-04", returnPct: 13.1 },
    { month: "2026-05", returnPct: 12.7 }
  ],
  dataSource: "seeded_from_preserved_snapshot",
  warningKo: BACKTEST_SNAPSHOT_WARNING
};

export const preservedStrategies: Strategy[] = [
  {
    id: "SAFE_v44_i4060",
    name: "SAFE_v44_i4060",
    paramsHash: "7893ca3f0e30",
    type: "안정형",
    status: "실전 가능 후보",
    interpretation: "preserved safe baseline strategy/not explosive",
    entryCondition: "EMA20 > EMA60, RSI 35~62, 거래량 평균 대비 상승",
    exitCondition: "서버 TP/SL 우선, EMA 재하향 또는 리스크 제한 접근 시 청산",
    riskCondition: "일 손실 한도, 총 손실 한도, 연속 손실 제한, 서버 TP/SL 필수",
    symbol: "BTCUSDT",
    timeframe: "1H",
    liveEligible: false,
    liveEligibleCandidate: true,
    verifiedForLive: false,
    serviceState: "live-blocked",
    validation: backtestValidationSeed,
    params: safeParams
  },
  {
    id: "STR_v8_aggressive_003",
    name: "STR_v8_aggressive_003",
    paramsHash: "a91b20ef0187",
    type: "공격형 후보",
    status: "LIVE 차단",
    interpretation: "v8 스타일 공격형 후보입니다. 검증 전 LIVE 거래가 차단됩니다.",
    entryCondition: "고변동 돌파 조건",
    exitCondition: "단기 TP/SL 후보",
    riskCondition: "검증 전 사용 금지",
    symbol: "BTCUSDT",
    timeframe: "15M",
    liveEligible: false,
    liveEligibleCandidate: false,
    verifiedForLive: false,
    serviceState: "live-blocked",
    validation: {
      ...backtestValidationSeed,
      full10m: { ...backtestValidationSeed.full10m, sharpe: 1.62, totalReturn: 104.5, maxDrawdown: -31.23, score: 68.7 },
      recent3m: { ...backtestValidationSeed.recent3m, totalReturn: 61.4, maxDrawdown: -22.4 },
      jitter: { passRate: 62, samples: 30, status: "warning" },
      jitterPassRate: 62,
      overfittingRisk: "높음"
    },
    params: { ...safeParams, lev_max: 5, tp_atr_mult: 6.4 }
  },
  {
    id: "DISC_random_042",
    name: "DISC_random_042",
    paramsHash: "f12c9099bd20",
    type: "탐색 중",
    status: "탐색 중",
    interpretation: "Random Search 탐색 중인 전략입니다. 검증 전까지 거래에 사용할 수 없습니다.",
    entryCondition: "탐색 후보 조건",
    exitCondition: "탐색 후보 청산",
    riskCondition: "검증 전 사용 금지",
    symbol: "ETHUSDT",
    timeframe: "1H",
    liveEligible: false,
    liveEligibleCandidate: false,
    verifiedForLive: false,
    serviceState: "live-blocked",
    validation: {
      ...backtestValidationSeed,
      full10m: { ...backtestValidationSeed.full10m, trades: 74, sharpe: 0.88, totalReturn: 7.65, maxDrawdown: -8.55, score: 61.3 },
      jitter: { passRate: 71, samples: 30, status: "warning" },
      jitterPassRate: 71,
      overfittingRisk: "중간"
    },
    params: { ...safeParams, ema_fast: 12 }
  }
];

export const strategyRankingSeed = preservedStrategies;

export const FUTURES_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT",
  "LINKUSDT", "DOTUSDT", "MATICUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT",
  "OPUSDT", "SUIUSDT", "FILUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "WIFUSDT", "PEPEUSDT",
  "FETUSDT", "RNDRUSDT", "IMXUSDT", "STXUSDT", "RUNEUSDT", "AAVEUSDT", "UNIUSDT", "ETCUSDT",
  "XLMUSDT", "ALGOUSDT", "SANDUSDT", "MANAUSDT", "GALAUSDT", "AXSUSDT", "FLOWUSDT", "EGLDUSDT"
];

export const aiCandidatesSeed: AiCandidate[] = [
  {
    rank: 1,
    symbol: "SOLUSDT",
    direction: "롱",
    signalType: "breakout",
    aiScore: 92.4,
    expectedProfitPct: 1.85,
    expectedCostPct: 0.42,
    stopLossDistancePct: 0.65,
    riskGrade: "낮음",
    status: "진입 가능",
    entryReason: "거래량 동반 상단 돌파, 비용 통과",
    signalReason: "15m 돌파 + 거래량 1.8배",
    costPassed: true,
    riskPassed: true,
    serviceState: "mock"
  },
  {
    rank: 2,
    symbol: "WIFUSDT",
    direction: "숏",
    signalType: "overheated_zone",
    aiScore: 88.1,
    expectedProfitPct: 1.42,
    expectedCostPct: 0.51,
    stopLossDistancePct: 0.72,
    riskGrade: "중간",
    status: "관찰 필요",
    entryReason: "과열 구간 되돌림 숏 후보",
    signalReason: "RSI 과매수 + 펀딩비 상승",
    costPassed: true,
    riskPassed: true,
    serviceState: "mock"
  },
  {
    rank: 3,
    symbol: "PEPEUSDT",
    direction: "롱",
    signalType: "volume_spike",
    aiScore: 84.6,
    expectedProfitPct: 1.12,
    expectedCostPct: 0.68,
    stopLossDistancePct: 0.88,
    riskGrade: "중간",
    status: "비용 초과로 차단",
    entryReason: "거래량 급증 롱 신호",
    signalReason: "거래량 2.4배 급증",
    costPassed: false,
    riskPassed: true,
    blockReason: "예상 비용이 기대 수익 대비 과다",
    serviceState: "mock"
  },
  {
    rank: 4,
    symbol: "ARBUSDT",
    direction: "숏",
    signalType: "trend_reversal",
    aiScore: 79.3,
    expectedProfitPct: 0.95,
    expectedCostPct: 0.38,
    stopLossDistancePct: 0.55,
    riskGrade: "높음",
    status: "리스크 초과로 차단",
    entryReason: "단기 추세 반전 숏",
    signalReason: "EMA 하향 + 거래량 감소",
    costPassed: true,
    riskPassed: false,
    blockReason: "변동성 과다로 리스크 등급 높음",
    serviceState: "mock"
  },
  {
    rank: 5,
    symbol: "SUIUSDT",
    direction: "롱",
    signalType: "weak_signal",
    aiScore: 71.8,
    expectedProfitPct: 0.62,
    expectedCostPct: 0.35,
    stopLossDistancePct: 0.48,
    riskGrade: "중간",
    status: "신호 약함",
    entryReason: "약한 반등 신호",
    signalReason: "거래량 미확인",
    costPassed: true,
    riskPassed: true,
    blockReason: "신호 강도 미달",
    serviceState: "mock"
  }
];

export const marketCoinsSeed: MarketCoin[] = FUTURES_SYMBOLS.map((symbol, index) => {
  const states: MarketCoin["state"][] = ["정상", "급등", "급락", "돌파", "과열", "관찰"];
  const state = states[index % states.length];
  const change = state === "급등" ? 8.2 + index * 0.1 : state === "급락" ? -6.4 - index * 0.05 : (index % 7) - 3;
  return {
    symbol,
    price: 100 + index * 47.3,
    change24hPct: Number(change.toFixed(2)),
    volumeChangePct: 80 + (index * 17) % 220,
    volatility: 1.2 + (index % 10) * 0.35,
    spread: 0.01 + (index % 5) * 0.004,
    fundingFee: 0.0001 + (index % 8) * 0.00005,
    quoteVolume: 5_000_000 + index * 1_250_000,
    state,
    aiScore: 55 + (index * 3) % 45,
    directionHint: index % 2 === 0 ? "롱" : "숏",
    serviceState: "mock" as const
  };
});

export const costBreakdownSeed: CostBreakdown = {
  symbol: "SOLUSDT",
  expectedProfitPct: 1.85,
  roundTripFeePct: 0.08,
  estimatedSlippagePct: 0.12,
  spreadPct: 0.05,
  fundingFeePct: 0.03,
  safetyMarginPct: 0.14,
  finalExpectedValuePct: 1.43,
  decision: "비용 통과",
  passed: true,
  serviceState: "mock"
};

export const learningLogsSeed: LearningLogItem[] = [
  {
    id: "log-001",
    time: "07-06 14:20",
    symbol: "SOLUSDT",
    direction: "롱",
    entryReason: "breakout",
    exitReason: "익절",
    result: "성공",
    pnlPct: 1.62,
    signalType: "breakout",
    eventCategory: "거래 기록",
    eventType: "모의 진입",
    leverage: 2,
    entryPrice: 142.35,
    exitPrice: 144.66,
    successPattern: "거래량 동반 돌파",
    serviceState: "mock"
  },
  {
    id: "log-002",
    time: "07-06 11:05",
    symbol: "WIFUSDT",
    direction: "숏",
    entryReason: "pullback",
    exitReason: "손절",
    result: "실패",
    pnlPct: -0.58,
    signalType: "overheated_zone",
    eventCategory: "거래 기록",
    eventType: "모의 진입",
    leverage: 1.5,
    entryPrice: 2.84,
    exitPrice: 2.8565,
    failurePattern: "급반등으로 손절",
    serviceState: "mock"
  },
  {
    id: "log-003",
    time: "07-06 09:15",
    symbol: "BTCUSDT",
    direction: "롱",
    entryReason: "breakout",
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "breakout",
    eventCategory: "후보 기록",
    eventType: "후보 감지",
    candidateStatus: "대기",
    holdReason: "큐 대기 중",
    aiScore: 72.4,
    finalScore: 74.1,
    serviceState: "mock"
  },
  {
    id: "log-004",
    time: "07-05 22:40",
    symbol: "PEPEUSDT",
    direction: "롱",
    entryReason: "volume_spike",
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "volume_spike",
    eventCategory: "후보 기록",
    eventType: "후보 제외",
    candidateStatus: "제외",
    holdReason: "비용 초과로 진입 차단",
    blockedReason: "비용 초과로 차단",
    aiScore: 61.2,
    finalScore: 58.4,
    serviceState: "mock"
  },
  {
    id: "log-005",
    time: "07-05 18:10",
    symbol: "ETHUSDT",
    direction: "롱",
    entryReason: "학습 보정 반영",
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "weak_signal",
    eventCategory: "학습 반영",
    eventType: "학습 보정 반영",
    learningSummary: "학습 보정 반영",
    scoreDelta: 2.5,
    leverageAdjustment: 2,
    learningReason: "최근 돌파 신호 승률 상승",
    serviceState: "mock"
  },
  {
    id: "log-006",
    time: "07-05 09:00",
    symbol: "SYSTEM",
    direction: "롱",
    entryReason: "모의 자동매매가 시작되었습니다.",
    exitReason: "",
    result: "대기",
    pnlPct: null,
    signalType: "weak_signal",
    eventCategory: "시스템 이벤트",
    eventType: "자동매매 시작",
    serviceState: "mock"
  }
];

export const riskSettingsSeed: RiskSettings = {
  dailyLossLimitPct: -5,
  totalLossLimitPct: -10,
  consecutiveLossLimit: 3,
  maxDailyTrades: 20,
  maxLeverage: 2.5,
  maxSimultaneousPositions: 3,
  maxPositionSizePerCoinPct: 3,
  overtradingCooldownMinutes: 15
};

export const riskStatusSeed: RiskStatus = {
  settings: riskSettingsSeed,
  dailyLossPct: -1.28,
  totalLossPct: -2.31,
  consecutiveLosses: 0,
  dailyTrades: 6,
  openPositions: 0,
  currentLeverage: 2,
  riskSettingsConfirmed: true,
  riskState: "정상",
  serviceState: "simulated"
};

export const apiStatusSeed: ApiStatus = {
  binanceFuturesConnected: false,
  futuresPermission: "미확인",
  orderPermission: "차단",
  readPermission: "미확인",
  ipRestriction: "미확인",
  lastBalanceFetchTime: "mock-read-only",
  lastOrderFetchTime: "mock-read-only",
  apiKeyExpirationDate: "not-stored",
  strategyFileLoaded: true,
  strategyHashValid: true,
  realOrderEngineConnected: false,
  dummyLoopDetected: false,
  serverTpSlActive: false,
  configured: {
    binanceApiKey: false,
    binanceApiSecret: false,
    binanceTestnet: true,
    telegramToken: false,
    telegramChatId: false
  },
  serviceState: "read-only"
};

export const botStatusSeed: BotStatus = {
  running: true,
  mode: "PAPER",
  strategyId: "scalping-pipeline",
  lastHeartbeat: "07-06 19:38",
  state: "실행 중",
  serverTpSlActive: false,
  serviceState: "paper",
  blockReasons: ["LIVE 주문 실행은 아직 비활성화되어 있습니다."],
  selectedCandidate: "SOLUSDT",
  binanceConnected: false,
  telegramConnected: false
};

export const todayPnlSeed: TodayPnlSummary = {
  todayPnlPct: 0.84,
  dailyLossLimitUsagePct: 25.6,
  openPositionCount: 1,
  todayTradeCount: 6,
  riskState: "정상"
};

export const marketWatcherSummarySeed: MarketWatcherSummary = {
  watchedCoinCount: FUTURES_SYMBOLS.length,
  pumpDetected: 4,
  dumpDetected: 3,
  volumeSpikeDetected: 7,
  breakoutDetected: 5,
  volatilityExpanded: 6
};

export const positionsSeed: Position[] = [
  {
    id: "paper-position-001",
    symbol: "SOLUSDT",
    side: "Long",
    entryPrice: 142.35,
    currentPrice: 143.82,
    quantity: 2.5,
    leverage: 2,
    unrealizedPnl: 3.68,
    margin: 178.2,
    stopLoss: 141.42,
    takeProfit: 144.98,
    mode: "PAPER",
    serviceState: "paper"
  }
];

export const positionSeed = positionsSeed[0];

export const orderHistorySeed: OrderRecord[] = [
  { id: "paper-001", time: "07-06 14:20", symbol: "SOLUSDT", side: "Long", type: "시장가", price: 142.35, status: "paper", mode: "PAPER", serviceState: "paper" },
  { id: "paper-002", time: "07-06 11:05", symbol: "WIFUSDT", side: "Short", type: "지정가", price: 2.84, status: "취소됨", mode: "PAPER", serviceState: "paper" },
  { id: "paper-003", time: "07-05 22:40", symbol: "PEPEUSDT", side: "Long", type: "TP/SL", price: 0.0000121, status: "mock", mode: "PAPER", serviceState: "simulated" }
];

export const alertRulesSeed: AlertRule[] = [
  { id: "rule-candle", asset: "BTCUSDT", timeframe: "15M", type: "캔들 패턴", condition: "장대 양봉 + 거래량 증가", enabled: true, serviceState: "mock" },
  { id: "rule-rsi", asset: "ETHUSDT", timeframe: "15M", type: "RSI 조건", condition: "RSI 30 이하 반등", enabled: true, serviceState: "mock" },
  { id: "rule-ema", asset: "SOLUSDT", timeframe: "5M", type: "EMA 돌파", condition: "EMA20 상향 돌파", enabled: true, serviceState: "mock" },
  { id: "rule-volume", asset: "WIFUSDT", timeframe: "15M", type: "거래량 조건", condition: "거래량 2배 이상", enabled: false, serviceState: "mock" }
];

export const alertHistorySeed: AlertHistoryItem[] = [
  { id: "alert-1", time: "07-06 19:30", asset: "SOLUSDT", type: "진입 후보", message: "TOP 1 롱 후보 감지", riskLevel: "낮음", status: "mock", serviceState: "mock" },
  { id: "alert-2", time: "07-06 18:15", asset: "WIFUSDT", type: "관찰", message: "과열 구간 숏 후보", riskLevel: "중간", status: "mock", serviceState: "mock" },
  { id: "alert-3", time: "07-06 16:40", asset: "PEPEUSDT", type: "비용 차단", message: "비용 초과로 진입 차단", riskLevel: "중간", status: "mock", serviceState: "mock" },
  { id: "alert-4", time: "07-06 14:20", asset: "SOLUSDT", type: "진입", message: "PAPER 모의 진입 기록", riskLevel: "낮음", status: "mock", serviceState: "mock" }
];

export const recentAlertsSeed: AlertItem[] = alertHistorySeed.map((item) => ({
  id: item.id,
  time: item.time,
  symbol: item.asset,
  content: item.message,
  riskLevel: item.riskLevel,
  status: item.status,
  serviceState: item.serviceState
}));

export const telegramAlertSettingsSeed: TelegramAlertSettings = {
  entryCandidate: true,
  entry: true,
  exit: true,
  pnl: true,
  risk: true,
  dailyReport: true,
  topCandidateBriefing: true
};

export const aiBriefingSeed: AiBriefing = {
  asset: "SOLUSDT",
  timeframe: "15m",
  detectedCondition: "거래량 동반 상단 돌파",
  currentPrice: 143.82,
  volumeContext: "최근 20봉 평균 대비 1.8배",
  indicatorContext: "RSI 58.2, EMA20 > EMA60",
  riskLevel: "낮음",
  explanation: "단기 스캘핑 롱 후보입니다. LIVE 모드는 서버 TP/SL과 주문 권한 확인 전까지 차단됩니다.",
  disclaimer: REXTORA_DISCLAIMER,
  serviceState: "mock"
};

export const emergencyActionsSeed: EmergencyAction[] = [
  { id: "close-position", label: "포지션 청산", severity: "warning", requiresConfirmation: true, serviceState: "simulated" },
  { id: "cancel-all", label: "모든 주문 취소", severity: "warning", requiresConfirmation: true, serviceState: "simulated" },
  { id: "emergency-stop-all", label: "모든 자동매매 중지", severity: "danger", requiresConfirmation: true, serviceState: "simulated" }
];

export const engineStatusSeed: EngineStatus[] = [
  { name: "marketWatcher", label: "Market Watcher", status: "정상", message: "40개 코인 감시 중", serviceState: "mock" },
  { name: "signalEngine", label: "Signal Engine", status: "정상", message: "신호 감지 활성", serviceState: "mock" },
  { name: "costEngine", label: "Cost Engine", status: "정상", message: "비용 필터 활성", serviceState: "mock" },
  { name: "aiRanker", label: "AI Ranker", status: "정상", message: "TOP 5 랭킹 갱신", serviceState: "mock" },
  { name: "riskEngine", label: "Risk Engine", status: "정상", message: "리스크 한도 적용", serviceState: "simulated" },
  { name: "executionEngine", label: "Execution Engine", status: "차단", message: "LIVE 주문 실행은 아직 비활성화되어 있습니다.", serviceState: "live-blocked" },
  { name: "telegramAssistant", label: "Telegram Assistant", status: "대기", message: "mock 또는 configured", serviceState: "mock" },
  { name: "learningLogger", label: "Learning Logger", status: "정상", message: "학습 기록 저장 중", serviceState: "mock" }
];

export const systemStatusSeed: SystemStatus = {
  engines: engineStatusSeed,
  binance: {
    apiConnected: false,
    readPermission: "미확인",
    orderPermission: "차단",
    balanceFetch: "미확인",
    marketData: "정상",
    serverTpSlActive: false
  },
  serviceState: "read-only"
};

export const scalpingDashboardSeed: ScalpingDashboardData = {
  bot: botStatusSeed,
  todayPnl: todayPnlSeed,
  topCandidates: aiCandidatesSeed,
  positions: positionsSeed,
  marketSummary: marketWatcherSummarySeed,
  risk: riskStatusSeed,
  api: apiStatusSeed
};

export const dashboardDataSeed: DashboardData = {
  bot: botStatusSeed,
  risk: riskStatusSeed,
  api: apiStatusSeed,
  position: positionSeed,
  strategies: preservedStrategies,
  alertRules: alertRulesSeed,
  alertHistory: alertHistorySeed,
  briefing: aiBriefingSeed,
  equityCurve: [
    { label: "08", value: 100 },
    { label: "09", value: 104 },
    { label: "10", value: 102 },
    { label: "11", value: 111 },
    { label: "12", value: 117 },
    { label: "01", value: 121 },
    { label: "02", value: 116 },
    { label: "03", value: 132 },
    { label: "04", value: 141 },
    { label: "05", value: 150 }
  ],
  marketCandles: [
    { label: "05-25", open: 67000, high: 68200, low: 66350, close: 67800 },
    { label: "05-26", open: 67800, high: 68950, low: 67120, close: 68450 },
    { label: "05-27", open: 68450, high: 68640, low: 66980, close: 67210 },
    { label: "05-28", open: 67210, high: 68120, low: 66580, close: 67990 },
    { label: "05-29", open: 67990, high: 69020, low: 67400, close: 68700 },
    { label: "05-30", open: 68700, high: 69100, low: 67100, close: 67542 }
  ]
};
