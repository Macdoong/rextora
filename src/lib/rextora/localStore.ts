import { alertRulesSeed, botStatusSeed, emergencyActionsSeed, riskSettingsSeed } from "./seedData";
import type { AlertRule, EmergencyAction, RiskSettings, TradingMode } from "./types";

const memory = new Map<string, string>();

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getItem(key: string): string | null {
  if (storageAvailable()) return window.localStorage.getItem(key);
  return memory.get(key) ?? null;
}

function setItem(key: string, value: string): void {
  if (storageAvailable()) {
    window.localStorage.setItem(key, value);
    return;
  }
  memory.set(key, value);
}

function loadJson<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): T {
  setItem(key, JSON.stringify(value));
  return value;
}

export function loadRiskSettings(): RiskSettings {
  return loadJson("rextora:risk-settings", riskSettingsSeed);
}

export function saveRiskSettings(settings: RiskSettings): RiskSettings {
  return saveJson("rextora:risk-settings", settings);
}

export function loadAlertRules(): AlertRule[] {
  return loadJson("rextora:alert-rules", alertRulesSeed);
}

export function saveAlertRules(rules: AlertRule[]): AlertRule[] {
  return saveJson("rextora:alert-rules", rules);
}

export function loadBotMode(): TradingMode {
  return loadJson("rextora:bot-mode", botStatusSeed.mode);
}

export function saveBotMode(mode: TradingMode): TradingMode {
  return saveJson("rextora:bot-mode", mode);
}

export function loadEmergencyActions(): EmergencyAction[] {
  return loadJson("rextora:emergency-actions", emergencyActionsSeed);
}

export function saveEmergencyActions(actions: EmergencyAction[]): EmergencyAction[] {
  return saveJson("rextora:emergency-actions", actions);
}

export function appendEmergencyAction(action: EmergencyAction): EmergencyAction[] {
  const next = [action, ...loadEmergencyActions()];
  return saveEmergencyActions(next);
}
