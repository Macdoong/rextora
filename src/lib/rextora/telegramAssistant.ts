import { getTelegramStatus, sendTestMessage, sendTelegramMessage } from "./telegramService";
import { recentAlertsSeed, telegramAlertSettingsSeed } from "./seedData";
import { readJsonStore, writeJsonStore } from "./storage/jsonStore";
import {
  buildCandidateDetectedMessage,
  buildEmergencyStopMessage,
  buildRiskBlockMessage
} from "./telegram/telegramMessages";
import { recordBlockedTelegramEvent } from "./telegramNotifier";
import { getRuntimeState } from "./runtimeState";
import type { AlertItem, TelegramAlertSettings, TradingMode } from "./types";

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
  // Candidate events are recorded in the in-app alert list only; Telegram is never sent.
  recordBlockedTelegramEvent("candidate_detected");
  const text = buildCandidateDetectedMessage({
    symbol,
    direction,
    score,
    mode: getRuntimeState().mode ?? "PAPER"
  });
  appendAlert({ id: `alert-${Date.now()}`, time: new Date().toLocaleString("ko-KR"), symbol, content: text, riskLevel: "낮음", status: "mock", serviceState: "mock" });
}

export async function sendRiskAlertIfNeeded(message: string): Promise<void> {
  const now = Date.now();
  if (now - lastRiskAlertAt < 60_000) return;
  lastRiskAlertAt = now;
  const text = buildRiskBlockMessage(message);
  const result = await sendTelegramMessage(text);
  appendAlert({ id: `risk-${Date.now()}`, time: new Date().toLocaleString("ko-KR"), symbol: "SYSTEM", content: text, riskLevel: "위험", status: result.ok ? "전송됨" : "mock", serviceState: result.serviceState });
}

export async function notifyEmergency(mode: TradingMode = getRuntimeState().mode ?? "PAPER"): Promise<void> {
  const text = buildEmergencyStopMessage(mode === "LIVE" ? "LIVE" : "PAPER");
  await sendTelegramMessage(text);
}
