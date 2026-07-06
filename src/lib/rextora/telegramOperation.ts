import { getRextoraSettings } from "./settings/settingsService";
import { sendTelegramMessage } from "./telegramService";
import { appendAuditLog } from "./storage/auditStore";
import {
  formatCandidateAlert,
  formatDailyReport,
  formatEmergencyAlert,
  formatEntryAlert,
  formatExitAlert,
  formatRiskAlert
} from "./telegramTemplates";

let lastAlertAt = 0;
let telegramTestPassed = false;

function rateLimitOk(): boolean {
  const settings = getRextoraSettings();
  const now = Date.now();
  if (now - lastAlertAt < settings.telegram.alertRateLimitMs) return false;
  lastAlertAt = now;
  return true;
}

function maskOrderId(id?: number): string {
  if (!id) return "없음";
  const text = String(id);
  if (text.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

export function isTelegramTestPassed(): boolean {
  return telegramTestPassed;
}

export async function runTelegramTest(): Promise<{ ok: boolean; message: string }> {
  const result = await sendTelegramMessage("Rextora Telegram test");
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

export async function notifyBotStarted(): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnBotStart || !rateLimitOk()) return;
  await sendTelegramMessage("Rextora LIVE/PAPER bot started");
}

export async function notifyBotStopped(): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnBotStop || !rateLimitOk()) return;
  await sendTelegramMessage("Rextora bot stopped");
}

export async function notifyCandidate(symbol: string, direction: string, score: number): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnCandidate || score < settings.telegram.minCandidateScoreForAlert || !rateLimitOk()) return;
  await sendTelegramMessage(formatCandidateAlert(symbol, direction, score));
}

export async function notifyLiveEntryAttempt(symbol: string, direction: string, score: number): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEntry || !rateLimitOk()) return;
  await sendTelegramMessage(`[LIVE] ${symbol} ${direction} 진입 시도 (score=${score})`);
}

export async function notifyEntryFilled(symbol: string, direction: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEntry || !rateLimitOk()) return;
  await sendTelegramMessage(formatEntryAlert(symbol, direction));
}

export async function notifyLiveTpSlPlaced(input: {
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  tpPrice: number;
  slPrice: number;
  tpOrderId?: number;
  slOrderId?: number;
}): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnTpSlPlaced || !rateLimitOk()) return;
  await sendTelegramMessage(
    `[LIVE TP/SL] ${input.symbol} ${input.side}\n` +
      `진입: ${input.entryPrice}\n` +
      `수량: ${input.quantity}\n` +
      `TP: ${input.tpPrice} (${maskOrderId(input.tpOrderId)})\n` +
      `SL: ${input.slPrice} (${maskOrderId(input.slOrderId)})`
  );
}

export async function notifyTpSlPlaced(symbol: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnTpSlPlaced || !rateLimitOk()) return;
  await sendTelegramMessage(`${symbol} 서버 TP/SL 배치 완료`);
}

export async function notifyLiveTpSlFailure(symbol: string, reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendTelegramMessage(`[LIVE 경고] ${symbol} TP/SL 실패 — 포지션 즉시 청산\n사유: ${reason}`);
}

export async function notifyLiveOrderError(symbol: string, reason: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnRiskBlock || !rateLimitOk()) return;
  await sendTelegramMessage(`[LIVE 오류] ${symbol} 주문 실패\n${reason}`);
}

export async function notifyExitFilled(symbol: string, pnlPct: number): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnExit || !rateLimitOk()) return;
  await sendTelegramMessage(formatExitAlert(symbol, pnlPct));
}

export async function notifyRiskBlock(message: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnRiskBlock || !rateLimitOk()) return;
  await sendTelegramMessage(formatRiskAlert(message, "차단"));
}

export async function notifyEmergency(action: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnEmergency || !rateLimitOk()) return;
  await sendTelegramMessage(formatEmergencyAlert(action));
}

export async function notifyDailyReport(summary: string): Promise<void> {
  const settings = getRextoraSettings();
  if (!settings.telegram.telegramEnabled || !settings.telegram.alertOnDailyReport || !rateLimitOk()) return;
  await sendTelegramMessage(formatDailyReport(0, 0) + `\n${summary}`);
}
