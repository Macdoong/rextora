/**
 * Operator UI terminology authority.
 * Presentation labels only — backend status strings stay unchanged.
 */

export const OPERATOR_NAV = {
  dashboard: "운영센터",
  research: "전략 탐색",
  strategy: "전략",
  results: "탐색 결과",
  backtest: "백테스트",
  paper: "모의매매",
  liveGate: "실전 진입",
  risk: "위험 관리",
  settings: "시스템 설정",
} as const;

export const OPERATOR_NAV_GROUP = {
  pipeline: "거래 파이프라인",
  workspace: "운영 도구",
} as const;

export const OPERATOR_PIPELINE = {
  research: "전략 탐색",
  strategy: "전략",
  backtest: "백테스트",
  paper: "모의매매",
  approval: "실전 승인",
  live: "실전 진입",
} as const;

export const OPERATOR_STAGE = {
  HOME: "운영센터",
  RESEARCH: "전략 탐색",
  STRATEGY: "전략",
  BACKTEST: "백테스트",
  PAPER: "모의매매",
  LIVE_GATE: "실전 진입",
  SETTINGS: "시스템 설정",
  UNMAPPED: "매핑되지 않은 화면",
} as const;

export const OPERATOR_STATUS = {
  completed: "완료",
  inProgress: "진행 중",
  waiting: "대기",
  blocked: "차단",
  needsReview: "확인 필요",
  operatingNormal: "운영 정상",
  paperMode: "모의거래",
  liveInactive: "실전 매매 비활성",
  realOrdersBlocked: "실제 주문 차단",
  liveReady: "실전 준비됨",
  liveBlocked: "실전 차단",
  emergency: "긴급 정지",
  none: "없음",
  unavailable: "선택 없음",
  loading: "불러오는 중",
  hydrating: "준비 중",
  thinking: "분석 중",
  approvalPending: "승인 대기",
  resumeAvailable: "재개 가능",
  ready: "대기",
} as const;

export const OPERATOR_ACTION_GROUP = {
  immediate: "즉시 확인",
  approval: "승인 필요",
  validation: "검증 필요",
  reference: "참고",
} as const;

export const OPERATOR_ROLE = {
  ceo: "대표",
  admin: "관리자",
  operator: "운영자",
  viewer: "회원",
} as const;

export const OPERATOR_EMPTY = {
  actions: "지금 확인할 항목이 없습니다.",
  actionsHint: "승인·검증·중단된 작업이 생기면 여기에 표시됩니다.",
  positions: "열린 포지션이 없습니다.",
  trades: "완료된 거래가 없습니다.",
  strategy: "선택된 전략이 없습니다.",
  loading: "운영 상태를 확인하고 있습니다.",
  loadError: "최신 운영 상태를 불러오지 못했습니다. 기존 화면은 유지됩니다.",
} as const;

export const OPERATOR_LABEL = {
  currentStage: "현재 단계",
  selectedStrategy: "선택 전략",
  symbolTimeframe: "종목 / 주기",
  executionState: "실행 상태",
  riskState: "위험 상태",
  liveState: "실전 상태",
  currentMode: "현재 모드",
  systemState: "시스템 상태",
  technicalDetail: "기술 정보",
  actionQueue: "지금 해야 할 일",
  currentStrategy: "현재 전략",
  tradingOps: "거래 운영",
  aiEmployee: "AI 트레이딩 직원",
  systemHealth: "시스템 상태",
  brandRole: "AI 트레이딩 직원",
  currentWork: "현재 작업",
  selectedWork: "선택된 작업",
  aiState: "AI 상태",
  researchJob: "탐색 작업",
  run: "실행 결과",
  paperSession: "모의 세션",
  agentPaperSession: "AI가 고른 모의 세션",
  agentSession: "AI 세션",
  route: "현재 화면",
  pattern: "경로 패턴",
} as const;

export const SETTINGS_GROUPS: ReadonlyArray<{
  id: "trading" | "risk" | "market" | "ai" | "api" | "system";
  label: string;
  tabs: readonly string[];
}> = [
  { id: "trading", label: "거래", tabs: ["cost", "research"] },
  { id: "risk", label: "위험 관리", tabs: ["risk"] },
  { id: "market", label: "종목", tabs: ["data"] },
  { id: "ai", label: "AI 공급자", tabs: ["ai"] },
  { id: "api", label: "API 연결", tabs: ["exchange"] },
  { id: "system", label: "시스템", tabs: ["alerts", "system", "expert"] },
];

/** Visible English labels that must not appear in operator UI. */
export const PROHIBITED_VISIBLE_ENGLISH_LABELS = [
  "CURRENT OPERATION",
  "Current operation",
  "SELECTED CONTEXT",
  "Selected context",
  "AGENT STATE",
  "Agent state",
  "Resume available",
  "Research job",
  "WORKSPACE",
  "Workspace",
  "PIPELINE",
  "Pipeline",
  "AI TRADING EMPLOYEE",
  "AI status",
  "Trading mode",
  "Symbol / timeframe",
] as const;

/** Intentional English that may remain in technical or identifier contexts. */
export const INTENTIONAL_ENGLISH_ALLOWLIST = [
  "API",
  "AI",
  "BTCUSDT",
  "USDT",
  "SAFE_v44_i4060",
  "JSON",
  "Binance",
  "OHLCV",
] as const;

export const OPERATOR_UI_SOURCE_FILES = [
  "components/rextora/shell/ContextBar.tsx",
  "components/rextora/Sidebar.tsx",
  "components/rextora/shell/navigationModel.ts",
  "components/rextora/shell/LifecycleNavigation.tsx",
  "app/dashboard/page.tsx",
  "components/rextora/dashboard/LifecycleDashboard.tsx",
  "components/rextora/dashboard/DashboardLifecycleOverview.tsx",
  "components/rextora/dashboard/OperatorCenter.tsx",
] as const;
