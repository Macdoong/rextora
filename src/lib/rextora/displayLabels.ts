import type { SettingsCategory } from "./settings/settingsTypes";

const LABEL_MAP: Record<string, string> = {
  defaultMode: "기본 거래 모드",
  liveTradingEnabled: "실전 거래 활성화",
  manualLiveConfirmationRequired: "실전 시작 전 수동 확인",
  liveConfirmationText: "실전 확인 문구",
  testnetMode: "테스트넷 사용",
  positionMode: "포지션 방식",
  oneWayMode: "단방향 모드",
  hedgeMode: "양방향 모드",
  marginType: "증거금 방식",
  ISOLATED: "격리",
  CROSSED: "교차",
  defaultLeverage: "기본 레버리지",
  maxLeverage: "최대 레버리지",

  PAPER: "PAPER 모의 거래",
  LIVE: "LIVE 실전 거래",
  BACKTEST: "백테스트",
  LIVE_BLOCKED: "실전 거래 차단됨",
  LIVE_READY: "실전 거래 준비 완료",
  LIVE_EXECUTING: "실전 주문 실행 중",
  LIVE_ERROR: "실전 오류",
  LIVE_EMERGENCY_STOPPED: "긴급 중단됨",

  "read-only/mock": "읽기 전용 / 모의 데이터",
  "read-only": "읽기 전용",
  mock: "모의 데이터",
  real: "실데이터",
  stale: "지연 데이터",
  cached: "저장된 데이터",
  configured: "설정됨",
  missing: "미설정",
  "not connected": "미연결",
  connected: "연결됨",
  simulated: "모의 실행",
  "live-blocked": "실전 차단",
  "bot-runtime": "봇 실행 상태",
  "system-status": "시스템 상태",

  Long: "롱",
  Short: "숏",
  long: "롱",
  short: "숏",
  breakout: "돌파",
  pullback: "눌림",
  volume_spike: "거래량 급증",
  trend_reversal: "추세 전환",
  overheated_zone: "과열 구간",
  weak_signal: "신호 약함",
  long_candidate: "롱 후보",
  short_candidate: "숏 후보",

  "SERVER REQUIRED": "서버 TP/SL 필요",
  "server tp/sl required": "서버 TP/SL 필요",
  "order permission blocked": "주문 권한 차단",
  "futures permission blocked": "Futures 권한 차단",

  open: "진행 중",
  success: "성공",
  failure: "실패",
  inactive: "비활성화됨",
  active: "활성",
  ON: "켜짐",
  OFF: "꺼짐",

  "in-progress": "진행 중",
  idle: "대기",
  paper: "PAPER 모의 거래",
  normal: "정상",
  waiting: "대기",
  blocked: "차단",
  error: "오류",
  disconnected: "미연결",

  MARKET: "시장가",
  LIMIT: "지정가",
  FIXED_USDT: "고정 USDT",
  BALANCE_PERCENT: "잔고 비율",

  "Settings Store": "설정 저장소",
  "User Data Stream": "Binance 실시간 계정 동기화"
};

const ENGINE_LABEL_MAP: Record<string, string> = {
  marketWatcher: "시장 감시 엔진",
  signalEngine: "신호 탐지 엔진",
  costEngine: "비용 계산 엔진",
  aiRanker: "AI 후보 선정 엔진",
  riskEngine: "리스크 관리 엔진",
  executionEngine: "주문 실행 엔진",
  telegramAssistant: "텔레그램 알림",
  learningLogger: "학습 기록 저장",
  "Market Watcher": "시장 감시 엔진",
  "Signal Engine": "신호 탐지 엔진",
  "Cost Engine": "비용 계산 엔진",
  "AI Ranker": "AI 후보 선정 엔진",
  "Risk Engine": "리스크 관리 엔진",
  "Execution Engine": "주문 실행 엔진",
  "Telegram Assistant": "텔레그램 알림",
  "Learning Logger": "학습 기록 저장"
};

export const SETTINGS_FIELD_HELPERS: Record<SettingsCategory, Record<string, string>> = {
  trading: {
    defaultMode: "처음 실행할 때 사용할 거래 모드입니다. PAPER는 실제 주문 없이 모의로 실행됩니다.",
    liveTradingEnabled: "실전 주문을 허용할지 선택합니다. 모든 안전 조건을 통과해야만 실제 주문이 가능합니다.",
    manualLiveConfirmationRequired: "실전 시작 전에 확인 문구를 직접 입력해야 하는지 설정합니다.",
    liveConfirmationText: "실전 거래 시작 시 입력해야 하는 확인 문구입니다.",
    testnetMode: "Binance 테스트 환경을 사용할지 선택합니다. 실제 돈이 움직이지 않습니다.",
    positionMode: "단방향은 한 코인에 롱 또는 숏 하나만 유지합니다. 초보 운영에는 단방향을 권장합니다.",
    marginType: "격리는 코인별로 손실 범위를 제한하고, 교차는 계정 잔고를 함께 사용합니다.",
    defaultLeverage: "기본으로 사용할 레버리지 배율입니다.",
    maxLeverage: "시스템이 사용할 수 있는 최대 레버리지입니다. 낮을수록 안전합니다."
  },
  market: {
    watchedSymbolCount: "동시에 감시할 코인 개수입니다.",
    allowedSymbols: "감시 대상으로 허용할 코인 목록입니다.",
    excludedSymbols: "감시에서 제외할 코인 목록입니다.",
    minQuoteVolume: "거래량이 너무 적은 코인을 제외하는 기준입니다.",
    scanIntervalMs: "시장 데이터를 다시 스캔하는 간격(밀리초)입니다.",
    marketCacheTtlMs: "시장 데이터를 잠시 저장해 두는 시간입니다.",
    staleDataThresholdMs: "이 시간보다 오래되면 데이터를 지연으로 표시합니다.",
    maxKlineSymbolsPerScan: "한 번에 조회할 캔들 차트 코인 수입니다.",
    klineInterval: "캔들 차트 시간 간격입니다.",
    candidateRefreshIntervalMs: "AI 후보 목록을 다시 계산하는 간격입니다."
  },
  signal: {
    enableLong: "롱(상승) 신호 탐지를 사용할지 설정합니다.",
    enableShort: "숏(하락) 신호 탐지를 사용할지 설정합니다.",
    enableBreakout: "가격 돌파 신호를 사용할지 설정합니다.",
    enablePullback: "눌림 후 반등 신호를 사용할지 설정합니다.",
    enableVolumeSpike: "거래량 급증 신호를 사용할지 설정합니다.",
    enableTrendReversal: "추세 전환 신호를 사용할지 설정합니다.",
    enableOverheatedFilter: "과열 구간 진입을 차단할지 설정합니다.",
    rsiPeriod: "RSI 지표 계산 기간입니다.",
    emaFast: "빠른 이동평균선 기간입니다.",
    emaSlow: "느린 이동평균선 기간입니다.",
    atrPeriod: "변동성(ATR) 계산 기간입니다.",
    breakoutLookback: "돌파 판단에 사용할 과거 봉 개수입니다.",
    volumeSpikeMultiplier: "평소 대비 거래량 급증 기준 배수입니다.",
    maxSpreadPct: "허용할 최대 스프레드(%)입니다.",
    minVolatilityPct: "최소 변동성 기준(%)입니다.",
    maxVolatilityPct: "최대 변동성 기준(%)입니다."
  },
  cost: {
    makerFeePct: "지정가 주문 수수료율(%)입니다.",
    takerFeePct: "시장가 주문 수수료율(%)입니다.",
    useTakerFeeForMarketOrders: "시장가 주문 시 테이커 수수료를 적용할지 설정합니다.",
    slippageBasePct: "기본 슬리피지(%) 추정치입니다.",
    slippageVolatilityMultiplier: "변동성에 따른 슬리피지 보정 배수입니다.",
    safetyMarginPct: "예상 수익에서 빼는 안전 마진(%)입니다.",
    minExpectedEdgePct: "진입에 필요한 최소 기대 수익(%)입니다.",
    includeFundingFee: "펀딩비를 비용 계산에 포함할지 설정합니다.",
    maxFundingFeePct: "허용할 최대 펀딩비(%)입니다.",
    maxSpreadPct: "비용 계산에 사용할 최대 스프레드(%)입니다."
  },
  risk: {
    maxDailyLossPct: "하루에 허용할 최대 손실(%)입니다.",
    maxTotalLossPct: "전체 계정 기준 최대 손실(%)입니다.",
    maxConsecutiveLosses: "연속으로 손실이 발생하면 봇을 멈춥니다.",
    maxPositions: "동시에 열 수 있는 최대 거래 수입니다.",
    maxPositionSizePct: "한 포지션에 사용할 최대 잔고 비율(%)입니다.",
    maxPositionNotionalUsdt: "한 포지션 최대 금액(USDT)입니다.",
    maxTradesPerDay: "과매매를 막기 위한 하루 최대 거래 횟수입니다.",
    maxTradesPerSymbolPerDay: "코인별 하루 최대 거래 횟수입니다.",
    cooldownMs: "거래 후 다음 거래까지 대기 시간(밀리초)입니다.",
    emergencyStopOnDailyLoss: "일일 손실 한도 도달 시 긴급 중단할지 설정합니다.",
    emergencyStopOnConsecutiveLosses: "연속 손실 한도 도달 시 긴급 중단할지 설정합니다.",
    requireServerTpSl: "실전 거래 시 서버 TP/SL이 필수인지 설정합니다.",
    requireTelegramForLive: "실전 거래 시 텔레그램 알림이 필수인지 설정합니다.",
    blockWhenMarketDataStale: "시장 데이터가 지연되면 진입을 차단할지 설정합니다.",
    riskSettingsConfirmed: "리스크 설정을 확인했는지 표시합니다."
  },
  execution: {
    orderType: "진입 주문 유형(시장가/지정가)입니다.",
    entryPriceProtectionPct: "진입 가격 보호 한도(%)입니다.",
    positionSizeMode: "포지션 크기 계산 방식입니다.",
    fixedOrderUsdt: "고정 주문 금액(USDT)입니다.",
    balancePositionPct: "잔고 대비 포지션 비율(%)입니다.",
    reduceOnlyForExit: "청산 시 reduce-only 주문을 사용할지 설정합니다.",
    closePositionOnTpSlFailure: "TP/SL 실패 시 포지션을 닫을지 설정합니다.",
    cancelOpenOrdersBeforeEntry: "진입 전 미체결 주문을 취소할지 설정합니다.",
    preventDuplicateSymbolPosition: "같은 코인 중복 포지션을 막을지 설정합니다.",
    allowPartialTakeProfit: "부분 익절을 허용할지 설정합니다.",
    partialTakeProfitPct: "부분 익절 목표 수익(%)입니다.",
    partialTakeProfitSizePct: "부분 익절 시 청산 비율(%)입니다."
  },
  tpSl: {
    takeProfitPct: "익절 목표 수익(%)입니다.",
    stopLossPct: "손절 허용 손실(%)입니다.",
    useAtrBasedTpSl: "ATR 기반 TP/SL을 사용할지 설정합니다.",
    atrTpMultiplier: "ATR 익절 배수입니다.",
    atrSlMultiplier: "ATR 손절 배수입니다.",
    serverTpSlRequired: "서버 TP/SL 보호 사용",
    verifyTpSlAfterEntry: "진입 후 TP/SL 주문 확인 필수",
    cancelTpSlOnPositionClose: "포지션 청산 시 TP/SL 주문을 취소할지 설정합니다.",
    fallbackCloseIfTpSlFails: "TP/SL 실패 시 포지션 즉시 청산"
  },
  telegram: {
    telegramEnabled: "텔레그램 알림을 사용할지 설정합니다.",
    alertOnBotStart: "봇 시작 시 알림을 보낼지 설정합니다.",
    alertOnBotStop: "봇 중지 시 알림을 보낼지 설정합니다.",
    alertOnCandidate: "진입 후보 발견 시 알림을 보낼지 설정합니다.",
    alertOnEntry: "진입 시 알림을 보낼지 설정합니다.",
    alertOnExit: "청산 시 알림을 보낼지 설정합니다.",
    alertOnTpSlPlaced: "TP/SL 주문 등록 시 알림을 보낼지 설정합니다.",
    alertOnRiskBlock: "리스크 차단 시 알림을 보낼지 설정합니다.",
    alertOnEmergency: "긴급 상황 시 알림을 보낼지 설정합니다.",
    alertOnDailyReport: "일일 리포트 알림을 보낼지 설정합니다.",
    minCandidateScoreForAlert: "알림을 보낼 최소 AI 점수입니다.",
    alertRateLimitMs: "알림 전송 간격 제한(밀리초)입니다."
  },
  ui: {
    dashboardRefreshMs: "대시보드 자동 새로고침 간격(밀리초)입니다.",
    marketWatchRefreshMs: "시장 감시 화면 새로고침 간격(밀리초)입니다.",
    systemStatusRefreshMs: "시스템 상태 새로고침 간격(밀리초)입니다.",
    showAdvancedSettings: "고급 설정 항목을 표시할지 설정합니다.",
    compactMode: "화면을 더 촘촘하게 표시할지 설정합니다."
  }
};

export const LIVE_READINESS_NEXT_ACTIONS = [
  ".env.local에 Binance API 키와 Secret을 입력하세요.",
  "Telegram Token과 Chat ID를 입력하세요.",
  "서버를 재시작한 뒤 시스템 상태에서 연결을 확인하세요.",
  "Binance 읽기·잔고 조회·Telegram 테스트를 점검하세요.",
  "모든 LIVE 체크리스트가 통과해야 실전 거래가 가능합니다."
];

const BLOCK_REASON_MAP: Record<string, string> = {
  "REXTORA_LIVE_APPROVED=false — LIVE 승인이 필요합니다.": "실전 거래 승인 환경변수가 꺼져 있습니다.",
  "거래소 연결이 read-only/mock 상태입니다.": "읽기 전용 / 모의 데이터 상태입니다.",
  "Binance API 키/시크릿이 설정되지 않았습니다.": "Binance API 키가 설정되지 않았습니다.",
  "설정에서 LIVE 거래가 비활성화되어 있습니다.": "LIVE 거래 설정이 꺼져 있습니다.",
  "서버 TP/SL 보호가 활성화되지 않았습니다.": "서버 TP/SL 보호가 아직 준비되지 않았습니다.",
  "서버 TP/SL 보호 주문이 필요합니다.": "서버 TP/SL 보호가 아직 준비되지 않았습니다.",
  "실전 사용 승인된 전략이 아닙니다.": "전략 실전 승인이 필요합니다.",
  "API order permission blocked": "API 주문 권한이 차단되어 있습니다.",
  "Futures permission blocked": "Futures 거래 권한이 차단되어 있습니다.",
  "Binance API key missing": "Binance API 키가 설정되지 않았습니다.",
  "Server TP/SL required": "서버 TP/SL 보호가 아직 준비되지 않았습니다.",
  "Manual confirmation mismatch": "실전 확인 문구가 일치하지 않습니다.",
  "Risk settings not confirmed": "리스크 설정 확인이 필요합니다.",
  "Telegram not configured": "Telegram 알림 설정이 필요합니다.",
  "Strategy verifiedForLive=false": "전략 실전 승인이 필요합니다."
};

export function displayBlockReason(reason: string): string {
  if (BLOCK_REASON_MAP[reason]) return BLOCK_REASON_MAP[reason];
  if (reason.includes("REXTORA_LIVE_APPROVED")) return "실전 거래 승인 환경변수가 꺼져 있습니다.";
  if (reason.includes("read-only/mock")) return "읽기 전용 / 모의 데이터 상태입니다.";
  if (reason.includes("verifiedForLive")) return "전략 실전 승인이 필요합니다.";
  return reason;
}

export function displayLabel(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "켜짐" : "꺼짐";
  const key = String(value);
  return LABEL_MAP[key] ?? key;
}

export function displayEngineLabel(nameOrLabel: string): string {
  return ENGINE_LABEL_MAP[nameOrLabel] ?? nameOrLabel;
}

export function displaySettingsFieldLabel(fieldKey: string): string {
  return LABEL_MAP[fieldKey] ?? fieldKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function displaySettingsFieldHelper(category: SettingsCategory, fieldKey: string): string {
  return SETTINGS_FIELD_HELPERS[category]?.[fieldKey] ?? "";
}

export function formatDataSourceMeta(source: string, cached: boolean, durationMs: number): string {
  const sourceLabel = displayLabel(source);
  const cacheLabel = cached ? displayLabel("cached") : displayLabel("real");
  return `데이터 출처: ${sourceLabel} · ${cacheLabel} · 응답 ${durationMs}ms`;
}

export function formatScanStatus(inProgress: boolean): string {
  return inProgress ? "현재 시장 감시 중" : "시장 감시 대기 중";
}

export function formatRuntimeMeta(meta: {
  scanInProgress?: boolean;
  lastScanDurationMs?: number;
  marketSnapshotAgeMs?: number;
  lastHeartbeat?: string;
}): string {
  const parts = [
    formatScanStatus(Boolean(meta.scanInProgress)),
    `마지막 감시 ${formatDurationMs(meta.lastScanDurationMs)}`,
    `시장 데이터 경과 ${formatDurationMs(meta.marketSnapshotAgeMs)}`
  ];
  return parts.join(" · ");
}

export function formatLastCheckTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR");
}

export function formatDurationMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}초`;
}

export function displayDiagnosticStatus(status: string): string {
  switch (status) {
    case "normal":
      return "정상";
    case "warning":
      return "주의";
    case "blocked":
      return "차단";
    case "unknown":
      return "미확인";
    default:
      return displayLabel(status);
  }
}
