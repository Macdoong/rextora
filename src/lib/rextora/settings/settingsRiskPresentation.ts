/**
 * Presentation helpers for Settings → 위험 제한.
 * Does not change stored values, units, or risk engine logic.
 */

import type { RiskSettings } from "@/src/lib/rextora/types";

export const SETTINGS_RISK_FIELD_KEYS = [
  "dailyLossLimitPct",
  "totalLossLimitPct",
  "consecutiveLossLimit",
  "maxSimultaneousPositions",
  "maxPositionSizePerCoinPct",
  "maxLeverage",
  "maxDailyTrades",
  "overtradingCooldownMinutes",
] as const;

export type SettingsRiskFieldKey = (typeof SETTINGS_RISK_FIELD_KEYS)[number];

export const SETTINGS_RISK_TECHNICAL_KEYS = SETTINGS_RISK_FIELD_KEYS;

export const SETTINGS_RISK_GROUPS = [
  {
    id: "loss",
    label: "손실 제한",
    keys: ["dailyLossLimitPct", "totalLossLimitPct"],
  },
  {
    id: "position",
    label: "포지션 제한",
    keys: [
      "maxSimultaneousPositions",
      "maxLeverage",
      "maxPositionSizePerCoinPct",
    ],
  },
  {
    id: "operation",
    label: "운영 제한",
    keys: [
      "consecutiveLossLimit",
      "maxDailyTrades",
      "overtradingCooldownMinutes",
    ],
  },
] as const;

export const SETTINGS_RISK_FIELD_UNITS: Record<SettingsRiskFieldKey, string> = {
  dailyLossLimitPct: "%",
  totalLossLimitPct: "%",
  consecutiveLossLimit: "회",
  maxSimultaneousPositions: "개",
  maxPositionSizePerCoinPct: "%",
  maxLeverage: "배",
  maxDailyTrades: "회",
  overtradingCooldownMinutes: "분",
};

const RISK_FIELD_LABELS: Record<SettingsRiskFieldKey, string> = {
  dailyLossLimitPct: "일일 손실 한도",
  totalLossLimitPct: "전체 손실 한도",
  consecutiveLossLimit: "연속 손실 한도",
  maxSimultaneousPositions: "최대 동시 포지션",
  maxPositionSizePerCoinPct: "코인별 진입 한도",
  maxLeverage: "최대 레버리지",
  maxDailyTrades: "일일 거래 한도",
  overtradingCooldownMinutes: "과매매 방지 대기",
};

export function settingsRiskFieldLabel(key: SettingsRiskFieldKey): string {
  return RISK_FIELD_LABELS[key];
}

export function settingsRiskDisplayUnit(key: SettingsRiskFieldKey): string {
  return SETTINGS_RISK_FIELD_UNITS[key];
}

/** Stored number as-is. No abs, percent, or minute conversion. */
export function settingsRiskDisplayValue(value: number): string {
  return String(value);
}

export function settingsRiskTechnicalKeyLabel(key: SettingsRiskFieldKey): string {
  return RISK_FIELD_LABELS[key];
}

export function settingsRiskConfiguredFacts(
  settings: Pick<RiskSettings, SettingsRiskFieldKey>,
): Array<{ key: SettingsRiskFieldKey; label: string; value: string; unit: string }> {
  return SETTINGS_RISK_FIELD_KEYS.map((key) => ({
    key,
    label: settingsRiskFieldLabel(key),
    value: settingsRiskDisplayValue(settings[key]),
    unit: settingsRiskDisplayUnit(key),
  }));
}
