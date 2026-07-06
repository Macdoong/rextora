import { getTelegramStatus, sendTestMessage, sendTelegramMessage } from "./telegramService";
import { recentAlertsSeed, telegramAlertSettingsSeed } from "./seedData";
import { readJsonStore, writeJsonStore } from "./storage/jsonStore";
import {
  formatCandidateAlert,
  formatDailyReport,
  formatEmergencyAlert,
  formatEntryAlert,
  formatExitAlert,
  formatRiskAlert,
  formatTopCandidateBriefing
} from "./telegramTemplates";
import type { AlertItem, TelegramAlertSettings } from "./types";

const ALERTS_FILE = "alerts.json";
let lastRiskAlertAt = 0;

export function getAssistantStatus() {
  return getTelegramStatus();
}

export async function sendAssistantTestMessage() {
  return sendTestMessage();
}

export function getAlertSettings(): TelegramAlertSettings {
  return readJsonStore("telegram-settings.json", telegramAlertSettingsSeed);
}

export function saveAlertSettings(settings: TelegramAlertSettings): TelegramAlertSettings {
  return writeJsonStore("telegram-settings.json", settings);
}

export function getRecentAlerts(): AlertItem[] {
  return readJsonStore(ALERTS_FILE, recentAlertsSeed);
}

function appendAlert(item: AlertItem): void {
  writeJsonStore(ALERTS_FILE, [item, ...getRecentAlerts()].slice(0, 100));
}

export async function notifyCandidate(symbol: string, direction: string, score: number): Promise<void> {
  const text = formatCandidateAlert(symbol, direction, score);
  const result = await sendTelegramMessage(text);
  appendAlert({ id: `alert-${Date.now()}`, time: new Date().toLocaleString("ko-KR"), symbol, content: text, riskLevel: "낮음", status: result.ok ? "전송됨" : "mock", serviceState: result.serviceState });
}

export async function sendRiskAlertIfNeeded(message: string): Promise<void> {
  const now = Date.now();
  if (now - lastRiskAlertAt < 60_000) return;
  lastRiskAlertAt = now;
  const text = formatRiskAlert(message, "자동 중단");
  const result = await sendTelegramMessage(text);
  appendAlert({ id: `risk-${Date.now()}`, time: new Date().toLocaleString("ko-KR"), symbol: "SYSTEM", content: text, riskLevel: "위험", status: result.ok ? "전송됨" : "mock", serviceState: result.serviceState });
}

export async function notifyEmergency(action: string): Promise<void> {
  const text = formatEmergencyAlert(action);
  await sendTelegramMessage(text);
}

export {
  formatCandidateAlert,
  formatEntryAlert,
  formatExitAlert,
  formatRiskAlert,
  formatDailyReport,
  formatTopCandidateBriefing
};
