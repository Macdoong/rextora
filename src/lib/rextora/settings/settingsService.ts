import { appendAuditLog } from "../storage/auditStore";
import { createDefaultSettings } from "./defaultSettings";
import { loadSettings, resetSettings, saveSettings } from "./settingsStore";
import { sanitizeSettingsInput, validateSettings } from "./settingsValidation";
import type { RextoraSettings, SettingsCategory } from "./settingsTypes";

export function getRextoraSettings(): RextoraSettings {
  return loadSettings();
}

export function getSettingsCategory<K extends SettingsCategory>(category: K): RextoraSettings[K] {
  return loadSettings()[category];
}

export function updateRextoraSettings(partial: Partial<RextoraSettings>, actor = "operator"): { ok: boolean; settings?: RextoraSettings; errors?: { field: string; message: string }[] } {
  const current = loadSettings();
  const merged = sanitizeSettingsInput(partial, current);
  const validation = validateSettings(merged);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const saved = saveSettings(merged);
  appendAuditLog({
    type: "settings_change",
    actor,
    message: "설정이 저장되었습니다.",
    mode: saved.trading.defaultMode,
    correlationId: `settings-${Date.now()}`,
    details: { categories: Object.keys(partial).filter((k) => k !== "version" && k !== "updatedAt") }
  });
  return { ok: true, settings: saved };
}

export function resetRextoraSettings(actor = "operator"): RextoraSettings {
  const saved = resetSettings();
  appendAuditLog({
    type: "settings_reset",
    actor,
    message: "설정이 기본값으로 초기화되었습니다.",
    mode: "PAPER",
    correlationId: `settings-reset-${Date.now()}`
  });
  return saved;
}

export function exportSettingsJson(): string {
  return JSON.stringify(loadSettings(), null, 2);
}

export function importSettingsJson(raw: string, actor = "operator"): { ok: boolean; settings?: RextoraSettings; errors?: { field: string; message: string }[] } {
  let parsed: Partial<RextoraSettings>;
  try {
    parsed = JSON.parse(raw) as Partial<RextoraSettings>;
  } catch {
    return { ok: false, errors: [{ field: "json", message: "유효하지 않은 JSON입니다." }] };
  }

  const forbidden = ["BINANCE_API_KEY", "BINANCE_API_SECRET", "TG_TOKEN", "TG_CHAT_ID", "apiKey", "apiSecret", "secret", "token"];
  const text = raw.toLowerCase();
  if (forbidden.some((key) => text.includes(key.toLowerCase()))) {
    return { ok: false, errors: [{ field: "secrets", message: "설정 JSON에 비밀값을 포함할 수 없습니다." }] };
  }

  const base = createDefaultSettings();
  return updateRextoraSettings({ ...base, ...parsed, version: base.version }, actor);
}

export function getEffectiveTradingMode(): "PAPER" | "LIVE" {
  const settings = loadSettings();
  const allowed = settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;
  return allowed && settings.trading.defaultMode === "LIVE" ? "LIVE" : "PAPER";
}
