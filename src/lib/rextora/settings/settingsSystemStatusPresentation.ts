/**
 * Presentation helpers for Settings → 시스템 상태.
 * Does not change diagnostics, runtime, risk, or Live authority.
 */

export type SettingsSystemTone = "ok" | "warn" | "bad" | undefined;

export const SETTINGS_SYSTEM_POLL_MS = 12_000;

export const SETTINGS_SYSTEM_LEDE =
  "읽기 전용 모니터링입니다. 12초마다 저장된 상태를 다시 불러옵니다. 설정됨은 연결·전송 검증이 아닙니다.";

export const SETTINGS_SYSTEM_TECHNICAL_KEYS = [
  "runtime.mode",
  "runtime.state",
  "runtime.running",
  "runtime.emergencyStopped",
  "trading.liveTradingEnabled",
  "trading.allowLiveTrading",
  "liveReadiness.status",
  "binance.apiConnected",
  "telegram.configured",
  "settingsStore.updatedAt",
  "engines",
] as const;

export function settingsSystemLiveFlagLabel(enabled: boolean): string {
  return enabled ? "켜짐" : "꺼짐";
}

/** Live flags off is the safe default. On is a dangerous gate. */
export function settingsSystemLiveFlagTone(enabled: boolean): SettingsSystemTone {
  return enabled ? "bad" : "ok";
}

export function settingsSystemLiveOrderLabel(liveReady: boolean): string {
  return liveReady ? "실주문 가능" : "실주문 차단";
}

/** Blocked real orders are safe. Ready is restricted, not a verified live session. */
export function settingsSystemLiveOrderTone(liveReady: boolean): SettingsSystemTone {
  return liveReady ? "warn" : "ok";
}

export function settingsSystemTelegramLabel(configured: boolean): string {
  return configured ? "설정됨 · 전송 미검증" : "미설정";
}

export function settingsSystemTelegramTone(configured: boolean): SettingsSystemTone {
  return configured ? "warn" : undefined;
}

export function settingsSystemConnectionLabel(
  diagnosticStatus?: string,
  apiConnected?: boolean,
): string {
  if (diagnosticStatus === "normal") return "점검 정상";
  if (diagnosticStatus === "warning") return "주의";
  if (diagnosticStatus === "blocked") return "차단";
  if (diagnosticStatus === "unknown") return "미확인";
  return apiConnected ? "연결됨 · 미검증" : "미연결";
}

export function settingsSystemConnectionTone(
  diagnosticStatus?: string,
  apiConnected?: boolean,
): SettingsSystemTone {
  if (diagnosticStatus === "normal") return "ok";
  if (diagnosticStatus === "warning") return "warn";
  if (diagnosticStatus === "blocked") return "warn";
  if (apiConnected) return "warn";
  return undefined;
}

export function settingsSystemPermissionTone(status: string): SettingsSystemTone {
  if (status === "정상") return "ok";
  if (status === "차단") return "ok";
  if (status === "오류") return "bad";
  return undefined;
}

export function settingsSystemPermissionNote(status: string): string {
  if (status === "차단") return "차단은 안전 기본값일 수 있습니다.";
  return "";
}

export function settingsSystemEngineTone(engine: {
  status: string;
  serviceState: string;
}): SettingsSystemTone {
  if (engine.serviceState === "live-blocked" || engine.status === "차단") return "ok";
  if (engine.serviceState === "mock" || engine.serviceState === "simulated") {
    return engine.status === "정상" || engine.status === "대기" ? "warn" : undefined;
  }
  if (engine.status === "정상") return "ok";
  if (engine.status === "대기") return "warn";
  return "bad";
}

export function settingsSystemEngineStatusNote(serviceState: string): string {
  if (serviceState === "live-blocked") return "실주문 차단(안전)";
  if (serviceState === "mock") return "모의 데이터";
  if (serviceState === "simulated") return "시뮬레이션";
  if (serviceState === "read-only") return "읽기 전용";
  return serviceState;
}

export function settingsSystemEmergencyLabel(stopped: boolean): string {
  return stopped ? "긴급 정지됨" : "정상";
}

export function settingsSystemEmergencyTone(stopped: boolean): SettingsSystemTone {
  return stopped ? "bad" : "ok";
}

export function settingsSystemStoreLabel(ok: boolean): string {
  return ok ? "정상" : "오류";
}

export function settingsSystemStoreTone(ok: boolean): SettingsSystemTone {
  return ok ? "ok" : "bad";
}

export function settingsSystemSyncLabel(
  lastSyncAt: string | null,
  lastError: string | null,
): string {
  if (lastError) return "오류";
  if (lastSyncAt) return "기록 있음";
  return "아직 없음";
}

export function settingsSystemSyncTone(
  lastSyncAt: string | null,
  lastError: string | null,
): SettingsSystemTone {
  if (lastError) return "bad";
  if (lastSyncAt) return "ok";
  return undefined;
}

export function settingsSystemRiskTone(state: string): SettingsSystemTone {
  if (state === "정상") return "ok";
  if (state === "주의") return "warn";
  if (state === "위험" || state === "자동 중단") return "bad";
  return undefined;
}

export function settingsSystemBotLabel(running: boolean, state: string): string {
  if (state) return state;
  return running ? "실행 중" : "대기";
}

export function settingsSystemTechnicalKeyLabel(key: string): string {
  switch (key) {
    case "runtime.mode":
      return "실행 모드";
    case "runtime.state":
      return "봇 상태";
    case "runtime.running":
      return "봇 실행 여부";
    case "runtime.emergencyStopped":
      return "긴급 정지";
    case "trading.liveTradingEnabled":
      return "실전 거래 사용";
    case "trading.allowLiveTrading":
      return "실전 거래 허용";
    case "liveReadiness.status":
      return "실전 준비 상태";
    case "binance.apiConnected":
      return "Binance API 연결";
    case "telegram.configured":
      return "텔레그램 구성";
    case "settingsStore.updatedAt":
      return "설정 저장 시각";
    case "engines":
      return "모듈 상태 시드";
    default:
      return key;
  }
}
