import type { TradingMode } from "../types";

export const TELEGRAM_BANNED_LABELS = [
  "PAPER",
  "LIVE",
  "Start LIVE",
  "Stop bot",
  "Emergency stop",
  "Close all positions",
  "Cancel all orders",
  "Server TP/SL",
  "TP/SL",
  "Candidate",
  "Position",
  "Execution Engine",
  "Risk Engine",
  "Cost Engine"
] as const;

export const TELEGRAM_TEST_MESSAGE = `[렉스토라 테스트]
텔레그램 알림 연결이 정상입니다.
이 메시지는 테스트 알림입니다.`;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTelegramTimestamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatTelegramMode(mode: TradingMode | "PAPER" | "LIVE"): string {
  return mode === "LIVE" ? "실전 거래" : "모의 거래";
}

export function formatTelegramDirection(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "LONG" || value === "롱") return "롱";
  if (normalized === "SHORT" || value === "숏") return "숏";
  if (normalized === "BUY" || value === "매수") return "매수";
  if (normalized === "SELL" || value === "매도") return "매도";
  return value;
}

export function formatTelegramPrice(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

export function formatTelegramQuantity(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

export function maskTelegramOrderId(id?: number): string {
  if (!id) return "없음";
  const text = String(id);
  if (text.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

export function translateTelegramErrorReason(reason: string): string {
  if (reason.includes("-2015")) {
    return `API 인증 실패 (오류 코드: -2015). API 키와 Secret을 확인하세요.`;
  }
  if (reason.includes("-1021")) {
    return `서버 시간 불일치 (오류 코드: -1021). 시스템 시간을 확인하세요.`;
  }
  if (reason.includes("-1022")) {
    return `서명 오류 (오류 코드: -1022). API Secret을 확인하세요.`;
  }
  if (reason.includes("LIVE gate blocked")) {
    return "실전 거래 조건을 통과하지 못했습니다.";
  }
  return reason;
}

function alertMessage(input: {
  situation: string;
  status: string;
  content?: string;
  mode?: string;
  at?: Date;
}): string {
  const lines = [
    "[렉스토라 알림]",
    `상황: ${input.situation}`,
    `상태: ${input.status}`
  ];
  if (input.content) lines.push(`내용: ${input.content}`);
  if (input.mode) lines.push(`모드: ${input.mode}`);
  lines.push(`시간: ${formatTelegramTimestamp(input.at)}`);
  return lines.join("\n");
}

function tradeMessage(lines: Record<string, string>): string {
  return ["[렉스토라 거래 알림]", ...Object.entries(lines).map(([key, value]) => `${key}: ${value}`)].join("\n");
}

function warningMessage(input: {
  situation: string;
  action?: string;
  reason?: string;
  symbol?: string;
  at?: Date;
}): string {
  const lines = ["[렉스토라 경고]", `상황: ${input.situation}`];
  if (input.symbol) lines.push(`심볼: ${input.symbol}`);
  if (input.action) lines.push(`조치: ${input.action}`);
  if (input.reason) lines.push(`사유: ${translateTelegramErrorReason(input.reason)}`);
  lines.push(`시간: ${formatTelegramTimestamp(input.at)}`);
  return lines.join("\n");
}

function systemErrorMessage(reason: string, at = new Date()): string {
  return `[렉스토라 시스템 오류]
사유: ${translateTelegramErrorReason(reason)}
시간: ${formatTelegramTimestamp(at)}`;
}

export function buildTelegramTestMessage(): string {
  return TELEGRAM_TEST_MESSAGE;
}

export function buildPaperBotStartedMessage(at = new Date()): string {
  return alertMessage({
    situation: "모의 자동매매 시작",
    status: "실행됨",
    mode: "모의 거래",
    at
  });
}

export function buildPaperBotStoppedMessage(at = new Date()): string {
  return alertMessage({
    situation: "모의 자동매매 중지",
    status: "중지됨",
    mode: "모의 거래",
    at
  });
}

export function buildLiveBotStartedMessage(at = new Date()): string {
  return alertMessage({
    situation: "실전 자동매매 시작",
    status: "실행됨",
    mode: "실전 거래",
    at
  });
}

export function buildLiveBotStoppedMessage(at = new Date()): string {
  return alertMessage({
    situation: "실전 자동매매 중지",
    status: "중지됨",
    mode: "실전 거래",
    at
  });
}

export function buildCandidateDetectedMessage(input: {
  symbol: string;
  direction: string;
  score: number;
  mode?: TradingMode;
}): string {
  return tradeMessage({
    상황: "진입 후보 감지",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction),
    "AI 점수": input.score.toFixed(1),
    모드: formatTelegramMode(input.mode ?? "PAPER")
  });
}

export function buildCandidateSelectedMessage(input: {
  symbol: string;
  direction: string;
  score: number;
}): string {
  return tradeMessage({
    상황: "진입 후보 선택",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction),
    "AI 점수": input.score.toFixed(1)
  });
}

export function buildCandidateRejectedMessage(input: {
  symbol: string;
  direction: string;
  reason: string;
}): string {
  return warningMessage({
    situation: "진입 후보 제외",
    symbol: input.symbol,
    reason: input.reason
  });
}

export function buildEntryConditionPassedMessage(input: { symbol: string; direction: string }): string {
  return tradeMessage({
    상황: "진입 조건 통과",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction)
  });
}

export function buildEntryConditionFailedMessage(input: { symbol: string; reason: string }): string {
  return warningMessage({
    situation: "진입 조건 미통과",
    symbol: input.symbol,
    reason: input.reason
  });
}

export function buildLiveEntryAttemptMessage(input: {
  symbol: string;
  direction: string;
  score: number;
}): string {
  return tradeMessage({
    상황: "실전 주문 시도",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction),
    "AI 점수": input.score.toFixed(1)
  });
}

export function buildLiveEntrySuccessMessage(input: {
  symbol: string;
  direction: string;
  leverage?: number;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}): string {
  const lines: Record<string, string> = {
    상황: "실전 진입 성공",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction),
    수량: formatTelegramQuantity(input.quantity),
    진입가: formatTelegramPrice(input.entryPrice),
    손절가: formatTelegramPrice(input.stopLoss),
    익절가: formatTelegramPrice(input.takeProfit),
    "서버 손절/익절": "등록 완료"
  };
  if (input.leverage !== undefined && input.leverage > 0) {
    lines["레버리지"] = `${input.leverage}배`;
  }
  return tradeMessage(lines);
}

export function buildLiveEntryFailureMessage(input: { symbol: string; reason: string }): string {
  return warningMessage({
    situation: "실전 진입 실패",
    symbol: input.symbol,
    reason: input.reason
  });
}

export function buildServerTpSlSuccessMessage(input: {
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  tpPrice: number;
  slPrice: number;
  tpOrderId?: number;
  slOrderId?: number;
}): string {
  return tradeMessage({
    상황: "서버 손절/익절 등록 성공",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.side),
    수량: formatTelegramQuantity(input.quantity),
    진입가: formatTelegramPrice(input.entryPrice),
    손절가: formatTelegramPrice(input.slPrice),
    익절가: formatTelegramPrice(input.tpPrice),
    "손절 주문": maskTelegramOrderId(input.slOrderId),
    "익절 주문": maskTelegramOrderId(input.tpOrderId),
    "서버 손절/익절": "등록 완료"
  });
}

export function buildServerTpSlFailureMessage(input: { symbol: string; reason: string }): string {
  return warningMessage({
    situation: "서버 손절/익절 등록 실패",
    symbol: input.symbol,
    action: "포지션 즉시 청산을 실행했습니다.",
    reason: input.reason
  });
}

export function buildPositionClosedAfterTpSlFailureMessage(input: { symbol: string; reason: string }): string {
  return warningMessage({
    situation: "손절/익절 실패 후 포지션 즉시 청산",
    symbol: input.symbol,
    action: "포지션을 즉시 정리했습니다.",
    reason: input.reason
  });
}

export function buildEmergencyStopMessage(mode: TradingMode = "PAPER"): string {
  return alertMessage({
    situation: "긴급 중단",
    status: "실행됨",
    mode: formatTelegramMode(mode)
  });
}

export function buildCloseAllPositionsMessage(mode: TradingMode = "PAPER"): string {
  return alertMessage({
    situation: "전체 포지션 청산",
    status: mode === "LIVE" ? "실행됨" : "모의 실행됨",
    mode: formatTelegramMode(mode)
  });
}

export function buildCancelAllOrdersMessage(mode: TradingMode = "PAPER"): string {
  return alertMessage({
    situation: "모든 주문 취소",
    status: mode === "LIVE" ? "실행됨" : "모의 실행됨",
    mode: formatTelegramMode(mode)
  });
}

export function buildBinanceConnectionFailureMessage(reason: string): string {
  return warningMessage({
    situation: "Binance 연결 실패",
    reason
  });
}

export function buildApiAuthFailureMessage(code = "-2015"): string {
  return warningMessage({
    situation: "API 인증 실패",
    reason: translateTelegramErrorReason(`오류 코드: ${code}`)
  });
}

export function buildOrderErrorMessage(input: { symbol: string; reason: string }): string {
  return warningMessage({
    situation: "주문 오류",
    symbol: input.symbol,
    reason: input.reason
  });
}

export function buildDuplicatePositionBlockedMessage(symbol: string): string {
  return warningMessage({
    situation: "중복 포지션 차단",
    symbol,
    reason: "동일 심볼 포지션이 이미 존재합니다."
  });
}

export function buildMaxConcurrentPositionsBlockedMessage(maxPositions: number): string {
  return warningMessage({
    situation: "최대 동시 포지션 초과",
    reason: `최대 ${maxPositions}개 포지션까지만 허용됩니다.`
  });
}

export function buildCostRejectedMessage(input: { symbol: string; reason?: string }): string {
  return warningMessage({
    situation: "비용 조건 미통과",
    symbol: input.symbol,
    reason: input.reason ?? "예상 수익이 비용 조건을 통과하지 못했습니다."
  });
}

export function buildSpreadRejectedMessage(input: { symbol: string; spreadPct: number; limitPct: number }): string {
  return warningMessage({
    situation: "스프레드 조건 미통과",
    symbol: input.symbol,
    reason: `현재 스프레드 ${input.spreadPct.toFixed(3)}% (허용 ${input.limitPct.toFixed(3)}%)`
  });
}

export function buildFundingRejectedMessage(input: { symbol: string; fundingPct: number; limitPct: number }): string {
  return warningMessage({
    situation: "펀딩비 조건 미통과",
    symbol: input.symbol,
    reason: `현재 펀딩비 ${input.fundingPct.toFixed(3)}% (허용 ${input.limitPct.toFixed(3)}%)`
  });
}

export function buildTradeEntryFilledMessage(input: {
  symbol: string;
  direction: string;
  entryPrice: number;
  leverage?: number;
  mode: TradingMode;
}): string {
  return tradeMessage({
    상황: "진입 체결",
    심볼: input.symbol,
    방향: formatTelegramDirection(input.direction),
    진입가: formatTelegramPrice(input.entryPrice),
    레버리지: input.leverage ? `${input.leverage}배` : "-",
    모드: formatTelegramMode(input.mode)
  });
}

export function buildTradeClosedMessage(input: {
  symbol: string;
  direction: string;
  pnlPct: number;
  exitReason: string;
  mode: TradingMode;
}): string {
  const resultLine = input.exitReason.includes("익절")
    ? "익절 발생"
    : input.exitReason.includes("손절")
      ? "손절 발생"
      : "청산 완료";
  return [
    "[렉스토라 거래 알림]",
    `상황: ${resultLine}`,
    `심볼: ${input.symbol}`,
    `방향: ${formatTelegramDirection(input.direction)}`,
    `손익: ${input.pnlPct >= 0 ? "+" : ""}${input.pnlPct.toFixed(2)}%`,
    `청산 이유: ${input.exitReason}`,
    "청산 완료",
    `모드: ${formatTelegramMode(input.mode)}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildExitFilledMessage(input: { symbol: string; pnlPct: number; reason?: string }): string {
  return tradeMessage({
    상황: "포지션 청산",
    심볼: input.symbol,
    "손익(%)": input.pnlPct.toFixed(2),
    사유: input.reason ?? "청산"
  });
}

export function buildRiskBlockMessage(message: string): string {
  return warningMessage({
    situation: "리스크 차단",
    reason: translateTelegramErrorReason(message)
  });
}

export function buildDailySummaryMessage(input: { trades: number; pnlPct: number; summary?: string }): string {
  const lines = [
    "[렉스토라 일일 요약]",
    `거래 건수: ${input.trades}건`,
    `손익(%): ${input.pnlPct.toFixed(2)}`,
    "투자 조언이 아닙니다."
  ];
  if (input.summary) lines.push(input.summary);
  lines.push(`시간: ${formatTelegramTimestamp()}`);
  return lines.join("\n");
}

export function buildSystemErrorMessage(reason: string): string {
  return systemErrorMessage(reason);
}

export function buildTopCandidateBriefingMessage(symbols: string[]): string {
  const lines = ["[렉스토라 알림]", "상황: 상위 진입 후보", ...symbols.map((symbol, index) => `${index + 1}. ${symbol}`)];
  lines.push(`시간: ${formatTelegramTimestamp()}`);
  return lines.join("\n");
}

export function containsBannedTelegramLabel(text: string): string | null {
  for (const label of TELEGRAM_BANNED_LABELS) {
    if (text.includes(label)) return label;
  }
  return null;
}

export function containsTelegramSecret(text: string): boolean {
  return /BINANCE_API_(KEY|SECRET)|TG_TOKEN|TG_CHAT_ID|api[_-]?key|api[_-]?secret/i.test(text);
}

export function buildLearningSummaryMessage(input: {
  trades: number;
  winRate: number;
  tpRate: number;
  slRate: number;
  consecutiveLosses: number;
  status: string;
}): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 학습 요약",
    `거래 수: ${input.trades}건`,
    `승률: ${input.winRate.toFixed(1)}%`,
    `익절률: ${input.tpRate.toFixed(1)}%`,
    `손절률: ${input.slRate.toFixed(1)}%`,
    `연속 손실: ${input.consecutiveLosses}회`,
    `학습 상태: ${input.status}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningAdjustmentMessage(input: {
  symbol: string;
  side: string;
  scoreDelta: number;
  leverage: number;
  reason: string;
}): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 학습 보정 반영",
    `심볼: ${input.symbol}`,
    `방향: ${formatTelegramDirection(input.side)}`,
    `점수 보정: ${input.scoreDelta >= 0 ? "+" : ""}${input.scoreDelta}`,
    `레버리지 조정: ${input.leverage}배`,
    `사유: ${input.reason}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningBadPatternMessage(input: { symbol: string; side: string; reason: string }): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 나쁜 패턴 제외",
    `심볼: ${input.symbol}`,
    `방향: ${formatTelegramDirection(input.side)}`,
    `사유: ${input.reason}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningLeverageAdjustedMessage(input: {
  symbol: string;
  side: string;
  leverage: number;
  reason: string;
}): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 레버리지 자동 조정",
    `심볼: ${input.symbol}`,
    `방향: ${formatTelegramDirection(input.side)}`,
    `레버리지: ${input.leverage}배`,
    `사유: ${input.reason}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningConsecutiveLossMessage(count: number): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 최근 손실 연속 감지",
    `연속 손실: ${count}회`,
    "조치: 레버리지와 점수를 보수적으로 조정합니다.",
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningProfileSaveFailedMessage(reason: string): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 학습 프로필 저장 실패",
    `사유: ${translateTelegramErrorReason(reason)}`,
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildLearningProfileUpdatedMessage(): string {
  return [
    "[렉스토라 학습 알림]",
    "상황: 학습 프로필 업데이트 완료",
    "최근 거래 결과가 학습 프로필에 반영되었습니다.",
    `시간: ${formatTelegramTimestamp()}`
  ].join("\n");
}

export function buildExecutionQueueCreatedMessage(input: {
  received: number;
  queued: number;
  skipped: number;
  executed?: number;
  failed?: number;
  mode?: TradingMode;
}): string {
  const parts = [`수신 ${input.received}건`, `대기 ${input.queued}건`, `제외 ${input.skipped}건`];
  if (input.executed) parts.push(`완료 ${input.executed}건`);
  if (input.failed) parts.push(`실패 ${input.failed}건`);
  return alertMessage({
    situation: "실행 큐 생성",
    status: "준비됨",
    content: parts.join(" · "),
    mode: formatTelegramMode(input.mode ?? "PAPER")
  });
}

export function buildQueueCandidateExcludedMessage(input: {
  symbol: string;
  direction: string;
  reason: string;
}): string {
  return alertMessage({
    situation: "후보 제외",
    status: "제외됨",
    content: `${input.symbol} ${formatTelegramDirection(input.direction)} · ${input.reason}`
  });
}

export function buildMultiCandidatePartialFailureMessage(input: {
  succeeded: number;
  failed: number;
  total: number;
}): string {
  return alertMessage({
    situation: "다중 후보 일부 실패",
    status: "주의",
    content: `총 ${input.total}건 중 성공 ${input.succeeded}건 · 실패 ${input.failed}건`
  });
}
