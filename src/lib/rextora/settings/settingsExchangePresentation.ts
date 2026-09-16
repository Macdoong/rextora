/**
 * Presentation helpers for Settings → 거래소 연결.
 * Does not read or display secret values. Does not call exchange APIs.
 */

export const SETTINGS_TRADING_FIELD_KEYS = [
  "defaultMode",
  "liveTradingEnabled",
  "allowLiveTrading",
  "operatorLiveStartRequired",
  "manualLiveConfirmationRequired",
  "liveConfirmationText",
  "testnetMode",
  "positionMode",
  "marginType",
  "defaultLeverage",
  "maxLeverage",
] as const;

export const SETTINGS_TRADING_HIDDEN_KEYS = [
  "operatorLiveStartRequired",
  "manualLiveConfirmationRequired",
  "liveConfirmationText",
] as const;

export type SettingsExchangeTone = "ok" | "warn" | "bad" | undefined;

export function settingsCredentialPresenceLabel(configured: boolean): string {
  return configured ? "설정됨" : "미설정";
}

/** Configured is not verified. Missing is informational, not an error. */
export function settingsCredentialPresenceTone(configured: boolean): SettingsExchangeTone {
  return configured ? "warn" : undefined;
}

export function settingsPermissionTone(status: string): SettingsExchangeTone {
  if (status === "차단" || status === "오류") return "bad";
  if (status === "정상") return "ok";
  return undefined;
}

export function settingsLiveFlagTone(enabled: boolean): SettingsExchangeTone {
  return enabled ? "bad" : "ok";
}

export function settingsExchangeEnvironmentLabel(testnetEnv: boolean): string {
  return testnetEnv ? "테스트넷 (환경변수)" : "메인넷 (환경변수)";
}

export function settingsCredentialConnectionLabel(bothConfigured: boolean): string {
  return bothConfigured ? "자격 증명 구성됨 · 연결 미검증" : "자격 증명 미설정";
}

export function settingsRealOrderEngineLabel(connected: boolean): string {
  return connected ? "연결됨" : "연결 안 됨";
}
