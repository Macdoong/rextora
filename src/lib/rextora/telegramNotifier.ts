import type { TradingMode } from "./types";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

type TelegramEventRecord = {
  payload: string;
  sentAt: number;
  skippedReason?: string;
};

const telegramEventState = new Map<string, TelegramEventRecord>();
let lastSkippedReason: string | null = null;
const blockedTelegramEvents: string[] = [];

export type AllowedTelegramEventType =
  | "paper_start"
  | "paper_stop"
  | "live_start"
  | "live_stop"
  | "trade_entry"
  | "entry_filled"
  | "take_profit"
  | "stop_loss"
  | "trade_close"
  | "trade_closed"
  | "emergency_stop"
  | "error"
  | "daily_report"
  | "live_blocked";

export const ALLOWED_TELEGRAM_EVENTS: ReadonlySet<string> = new Set<AllowedTelegramEventType>([
  "paper_start",
  "paper_stop",
  "live_start",
  "live_stop",
  "trade_entry",
  "entry_filled",
  "take_profit",
  "stop_loss",
  "trade_close",
  "trade_closed",
  "emergency_stop",
  "error",
  "daily_report",
  "live_blocked"
]);

export const ALLOWED_TELEGRAM_EVENT_LABELS: Record<string, string> = {
  paper_start: "모의 거래 시작",
  paper_stop: "모의 거래 중지",
  live_start: "실전 거래 시작",
  live_stop: "실전 거래 중지",
  trade_entry: "진입 체결",
  entry_filled: "진입 체결",
  take_profit: "익절 발생",
  stop_loss: "손절 발생",
  trade_close: "청산 완료",
  trade_closed: "청산 완료",
  emergency_stop: "긴급 중지",
  error: "오류 발생",
  daily_report: "일일 보고",
  live_blocked: "실전 거래 차단"
};

const EVENT_TYPE_ALIASES: Record<string, string> = {
  "모의 거래 시작": "paper_start",
  "모의 거래 중지": "paper_stop",
  "실전 거래 시작": "live_start",
  "실전 거래 중지": "live_stop",
  "진입 체결": "trade_entry",
  "익절 발생": "take_profit",
  "손절 발생": "stop_loss",
  "청산 완료": "trade_close",
  "긴급 중지": "emergency_stop",
  "오류 발생": "error",
  "일일 보고": "daily_report",
  "실전 거래 차단": "live_blocked",
  bot_started_paper: "paper_start",
  bot_stopped_paper: "paper_stop",
  bot_started_live: "live_start",
  bot_stopped_live: "live_stop",
  entry_success: "entry_filled",
  exit_filled: "trade_closed",
  system_error: "error",
  risk_block: "live_blocked",
  execution_queue_created: "queue_created",
  candidate_summary: "candidate_detected",
  waiting_summary: "waiting_summary",
  excluded_summary: "excluded_summary",
  candidate_created: "candidate_detected",
  observation: "observation",
  weak_signal: "weak_signal",
  cost_too_high: "cost_too_high",
  volatility_too_high: "volatility_too_high",
  strategy_scan_summary: "strategy_scan_summary"
};

export function normalizeTelegramEventType(event: string): string {
  const trimmed = event.trim();
  return EVENT_TYPE_ALIASES[trimmed] ?? trimmed;
}

export function isAllowedTelegramEvent(eventType: string): boolean {
  return ALLOWED_TELEGRAM_EVENTS.has(normalizeTelegramEventType(eventType));
}

export function recordBlockedTelegramEvent(eventType: string): void {
  const normalized = normalizeTelegramEventType(eventType);
  if (!blockedTelegramEvents.includes(normalized)) {
    blockedTelegramEvents.push(normalized);
  }
}

export function getBlockedTelegramEventTypes(): string[] {
  return [...blockedTelegramEvents];
}

export function resetBlockedTelegramEventsForTests(): void {
  blockedTelegramEvents.length = 0;
}

export function getLastTelegramSkipReason(): string | null {
  return lastSkippedReason;
}

export function shouldSendTelegramEvent(eventKey: string, payload: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  const now = Date.now();
  const last = telegramEventState.get(eventKey);

  if (last && last.payload === payload && now - last.sentAt < ttlMs) {
    lastSkippedReason = `telegram_dedupe_suppressed:${eventKey}`;
    telegramEventState.set(eventKey, { ...last, skippedReason: lastSkippedReason });
    return false;
  }

  lastSkippedReason = null;
  telegramEventState.set(eventKey, { payload, sentAt: now });
  return true;
}

export function markTelegramEventSent(eventKey: string, payload: string): void {
  telegramEventState.set(eventKey, { payload, sentAt: Date.now() });
  lastSkippedReason = null;
}

export function resetTelegramNotifierForTests(): void {
  telegramEventState.clear();
  lastSkippedReason = null;
}

export interface QueueNotificationDedupeInput {
  mode: TradingMode;
  received: number;
  queued: number;
  skipped: number;
  executed?: number;
  failed?: number;
  queueReadyCount?: number;
  topCandidateSummaries?: string[];
}

export function buildQueueNotificationDedupeKey(summary: QueueNotificationDedupeInput): string {
  const ready = summary.queueReadyCount ?? summary.queued;
  const tops = [...(summary.topCandidateSummaries ?? [])].sort().join(",");
  return [
    "queue-created",
    summary.mode,
    `r${summary.received}`,
    `q${summary.queued}`,
    `x${summary.skipped}`,
    `ready${ready}`,
    `e${summary.executed ?? 0}`,
    `f${summary.failed ?? 0}`,
    `tops:${tops}`
  ].join("|");
}

export function getTelegramEventLabel(eventType: string): string {
  const normalized = normalizeTelegramEventType(eventType);
  return ALLOWED_TELEGRAM_EVENT_LABELS[normalized] ?? eventType;
}
