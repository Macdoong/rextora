import { getRuntimeState } from "./runtimeState";
import { getRextoraSettings } from "./settings/settingsService";
import { sendTelegramMessage } from "./telegramService";
import { appendAuditLog } from "./storage/auditStore";
import {
  isAllowedTelegramEvent,
  normalizeTelegramEventType,
  recordBlockedTelegramEvent
} from "./telegramNotifier";
import {
  buildCancelAllOrdersMessage,
  buildCloseAllPositionsMessage,
  buildEmergencyStopMessage,
  buildExitFilledMessage,
  buildLiveBotStartedMessage,
  buildLiveBotStoppedMessage,
  buildLiveEntrySuccessMessage,
  buildOrderErrorMessage,
  buildPaperBotStartedMessage,
  buildPaperBotStoppedMessage,
  buildRiskBlockMessage,
  buildServerTpSlFailureMessage,
  buildTelegramTestMessage,
  buildSystemErrorMessage,
  buildTradeEntryFilledMessage,
  buildTradeClosedMessage,
  buildMultiCandidatePartialFailureMessage
} from "./telegram/telegramMessages";
import type { TradingMode } from "./types";

let lastAlertAt = 0;
let telegramTestPassed = false;

function rateLimitOk(): boolean {
  const settings = getRextoraSettings();
  const now = Date.now();
  if (now - lastAlertAt < settings.telegram.alertRateLimitMs) return false;
  lastAlertAt = now;
  return true;
}

function currentMode(): TradingMode {
  return getRuntimeState().mode ?? "PAPER";
}

/**
 * Final Telegram boundary: only allowlisted quant-trading events may be sent.
 * Queue/candidate/observation events are recorded as blocked and never sent.
 */
async function sendOperationalTelegram(eventType: string, text: string): Promise<boolean> {
  const normalized = normalizeTelegramEventType(eventType);
  if (!isAllowedTelegramEvent(normalized)) {
    recordBlockedTelegramEvent(eventType);
    return false;
  }
  await sendTelegramMessage(text);
  return true;
}

export function isTelegramTestPassed(): boolean {
  return telegramTestPassed;
}

export async function runTelegramTest(): Promise<{ ok: boolean; message: string }> {
  const result = await sendTelegramMessage(buildTelegramTestMessage());
  telegramTestPassed = result.ok;
  if (!result.ok) {
    appendAuditLog({
      type: "telegram_failure",
      actor: "telegramOperation",
      message: result.message,
      mode: "SYSTEM",
      correlationId: `tg-test-${Date.now()}`
    });
  }
  return { ok: result.ok, message: result.message };
}

export async function notifyBotStarted(mode: TradingMode = currentMode()): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnBotStart || !rateLimitOk()) return;
  if (mode === "LIVE") {
    await sendOperationalTelegram("live_start", buildLiveBotStartedMessage());
  } else {
    await sendOperationalTelegram("paper_start", buildPaperBotStartedMessage());
  }
}

export async function notifyBotStopped(mode: TradingMode = currentMode()): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnBotStop || !rateLimitOk()) return;
  if (mode === "LIVE") {
    await sendOperationalTelegram("live_stop", buildLiveBotStoppedMessage());
  } else {
    await sendOperationalTelegram("paper_stop", buildPaperBotStoppedMessage());
  }
}

/** Blocked: candidate detection is internal-only and must not notify Telegram. */
export async function notifyCandidate(_symbol: string, _direction: string, _score: number): Promise<void> {
  recordBlockedTelegramEvent("candidate_detected");
}

/** Blocked: entry attempts are internal-only; only fills notify Telegram. */
export async function notifyLiveEntryAttempt(_symbol: string, _direction: string, _score: number): Promise<void> {
  recordBlockedTelegramEvent("entry_attempt");
}

export async function notifyLiveEntrySuccess(input: {
  symbol: string;
  direction: string;
  leverage?: number;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEntry || !rateLimitOk()) return;
  await sendOperationalTelegram("entry_filled", buildLiveEntrySuccessMessage(input));
}

export async function notifyEntryFilled(symbol: string, direction: string): Promise<void> {
  await notifyLiveEntrySuccess({
    symbol,
    direction,
    quantity: 0,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0
  });
}

export async function notifyTradeEntry(input: {
  symbol: string;
  direction: string;
  entryPrice: number;
  leverage?: number;
  mode: TradingMode;
}): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEntry || !rateLimitOk()) return;
  await sendOperationalTelegram("entry_filled", buildTradeEntryFilledMessage(input));
}

export async function notifyTradeClosed(input: {
  symbol: string;
  direction: string;
  pnlPct: number;
  exitReason: string;
  mode: TradingMode;
}): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnExit || !rateLimitOk()) return;
  const eventType = input.exitReason.includes("익절")
    ? "take_profit"
    : input.exitReason.includes("손절")
      ? "stop_loss"
      : "trade_close";
  await sendOperationalTelegram(eventType, buildTradeClosedMessage(input));
}

/** Blocked: 보호 주문 등록 안내는 허용된 운영 이벤트가 아닙니다. */
export async function notifyLiveTpSlPlaced(_input: {
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  tpPrice: number;
  slPrice: number;
  tpOrderId?: number;
  slOrderId?: number;
}): Promise<void> {
  recordBlockedTelegramEvent("tp_sl_placed");
}

export async function notifyTpSlPlaced(_symbol: string): Promise<void> {
  recordBlockedTelegramEvent("tp_sl_placed");
}

export async function notifyLiveTpSlFailure(symbol: string, reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendOperationalTelegram("error", buildServerTpSlFailureMessage({ symbol, reason }));
}

export async function notifyLiveOrderError(symbol: string, reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnRiskBlock || !rateLimitOk()) return;
  await sendOperationalTelegram("error", buildOrderErrorMessage({ symbol, reason }));
}

export async function notifyExitFilled(symbol: string, pnlPct: number, reason?: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnExit || !rateLimitOk()) return;
  const eventType = reason?.includes("익절") ? "take_profit" : reason?.includes("손절") ? "stop_loss" : "trade_closed";
  await sendOperationalTelegram(eventType, buildExitFilledMessage({ symbol, pnlPct, reason }));
}

export async function notifyRiskBlock(message: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnRiskBlock || !rateLimitOk()) return;
  await sendOperationalTelegram("live_blocked", buildRiskBlockMessage(message));
}

/** Blocked: per-candidate rejection reasons are internal-only. */
export async function notifyCostRejected(_symbol: string, _reason?: string): Promise<void> {
  recordBlockedTelegramEvent("cost_rejected");
}

export async function notifySpreadRejected(_symbol: string, _spreadPct: number, _limitPct: number): Promise<void> {
  recordBlockedTelegramEvent("spread_rejected");
}

export async function notifyFundingRejected(_symbol: string, _fundingPct: number, _limitPct: number): Promise<void> {
  recordBlockedTelegramEvent("funding_rejected");
}

export async function notifyDuplicatePositionBlocked(_symbol: string): Promise<void> {
  recordBlockedTelegramEvent("duplicate_position_blocked");
}

export async function notifyMaxConcurrentPositionsBlocked(_maxPositions: number): Promise<void> {
  recordBlockedTelegramEvent("max_positions_blocked");
}

export async function notifyEmergency(mode: TradingMode = currentMode()): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendOperationalTelegram("emergency_stop", buildEmergencyStopMessage(mode));
}

export async function notifyCloseAllPositions(mode: TradingMode = currentMode()): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendOperationalTelegram("trade_closed", buildCloseAllPositionsMessage(mode));
}

export async function notifyCancelAllOrders(mode: TradingMode = "PAPER"): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendOperationalTelegram("emergency_stop", buildCancelAllOrdersMessage(mode));
}

/** Blocked: daily reports are not part of the allowed operator event set. */
export async function notifyDailyReport(_summary: string, _trades = 0, _pnlPct = 0): Promise<void> {
  recordBlockedTelegramEvent("daily_report");
}

export async function notifySystemError(reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendOperationalTelegram("error", buildSystemErrorMessage(reason));
}

/** Blocked: learning summaries are shown in the UI, not sent to Telegram. */
export async function notifyLearningSummary(): Promise<void> {
  recordBlockedTelegramEvent("learning_summary");
}

export async function notifyLearningAdjustment(
  _symbol: string,
  _side: string,
  _scoreDelta: number,
  _leverage: number,
  _reason?: string
): Promise<void> {
  recordBlockedTelegramEvent("learning_adjustment");
}

export async function notifyLearningBadPattern(_symbol: string, _side: string, _reason: string): Promise<void> {
  recordBlockedTelegramEvent("learning_bad_pattern");
}

export async function notifyLearningLeverageAdjusted(
  _symbol: string,
  _side: string,
  _leverage: number,
  _reason: string
): Promise<void> {
  recordBlockedTelegramEvent("learning_leverage_adjusted");
}

export async function notifyLearningConsecutiveLosses(_count: number): Promise<void> {
  recordBlockedTelegramEvent("learning_consecutive_losses");
}

export async function notifyLearningProfileSaveFailed(reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.learning.enabled || !rateLimitOk()) return;
  await sendOperationalTelegram("error", buildSystemErrorMessage(`학습 프로필 저장 실패: ${reason}`));
}

export async function notifyLearningProfileUpdated(): Promise<void> {
  recordBlockedTelegramEvent("learning_profile_updated");
}

/** Blocked: execution queue summaries must never reach Telegram. */
export async function notifyExecutionQueueCreated(_input: {
  received: number;
  queued: number;
  skipped: number;
  executed?: number;
  failed?: number;
  mode?: TradingMode;
}): Promise<void> {
  recordBlockedTelegramEvent("queue_created");
}

/** Blocked: per-candidate queue exclusions are internal-only. */
export async function notifyQueueCandidateExcluded(_symbol: string, _direction: string, _reason: string): Promise<void> {
  recordBlockedTelegramEvent("queue_excluded");
}

export async function notifyMultiCandidatePartialFailure(succeeded: number, failed: number, total: number): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnRiskBlock || !rateLimitOk()) return;
  await sendOperationalTelegram("error", buildMultiCandidatePartialFailureMessage({ succeeded, failed, total }));
}
