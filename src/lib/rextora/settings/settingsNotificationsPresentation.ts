/**
 * Presentation helpers for Settings → 알림.
 * Does not change routing, credentials, validation, or telegram runtime logic.
 */

export const SETTINGS_TELEGRAM_FIELD_KEYS = [
  "telegramEnabled",
  "alertOnBotStart",
  "alertOnBotStop",
  "alertOnEmergency",
  "alertOnDailyReport",
  "alertOnCandidate",
  "alertOnEntry",
  "alertOnExit",
  "alertOnTpSlPlaced",
  "alertOnRiskBlock",
  "minCandidateScoreForAlert",
  "alertRateLimitMs",
] as const;

export type SettingsTelegramFieldKey =
  (typeof SETTINGS_TELEGRAM_FIELD_KEYS)[number];

export const SETTINGS_TELEGRAM_TECHNICAL_KEYS = SETTINGS_TELEGRAM_FIELD_KEYS;

export const SETTINGS_TELEGRAM_ENV_KEYS = ["TG_TOKEN", "TG_CHAT_ID"] as const;

export const SETTINGS_TELEGRAM_GROUPS = [
  {
    id: "usage",
    label: "알림 사용",
    keys: ["telegramEnabled"],
  },
  {
    id: "ops",
    label: "운영",
    keys: [
      "alertOnBotStart",
      "alertOnBotStop",
      "alertOnEmergency",
      "alertOnDailyReport",
    ],
  },
  {
    id: "trade",
    label: "거래",
    keys: [
      "alertOnCandidate",
      "alertOnEntry",
      "alertOnExit",
      "alertOnTpSlPlaced",
    ],
  },
  {
    id: "risk",
    label: "위험",
    keys: ["alertOnRiskBlock"],
  },
  {
    id: "limits",
    label: "전송 제한",
    keys: ["minCandidateScoreForAlert", "alertRateLimitMs"],
  },
] as const;

export const SETTINGS_TELEGRAM_FIELD_UNITS: Record<
  SettingsTelegramFieldKey,
  "점" | "ms" | null
> = {
  telegramEnabled: null,
  alertOnBotStart: null,
  alertOnBotStop: null,
  alertOnEmergency: null,
  alertOnDailyReport: null,
  alertOnCandidate: null,
  alertOnEntry: null,
  alertOnExit: null,
  alertOnTpSlPlaced: null,
  alertOnRiskBlock: null,
  minCandidateScoreForAlert: "점",
  alertRateLimitMs: "ms",
};

export const SETTINGS_NOTIFICATION_LEDE =
  "유일한 알림 채널은 텔레그램입니다. 봇 토큰과 채팅 ID는 환경변수로만 관리하며, 설정됨은 전송 검증이 아닙니다.";

export const SETTINGS_NOTIFICATION_SECRET_NOTE =
  "비밀값은 화면에 표시하지 않습니다. 설정됨은 자격 증명 존재만 뜻하고, 메시지 전송이 확인된 상태가 아닙니다.";

export function settingsTelegramDisplayUnit(
  fieldKey: string,
): "점" | "ms" | null {
  if ((SETTINGS_TELEGRAM_FIELD_KEYS as readonly string[]).includes(fieldKey)) {
    return SETTINGS_TELEGRAM_FIELD_UNITS[
      fieldKey as SettingsTelegramFieldKey
    ];
  }
  return null;
}

export function settingsTelegramChannelLabel(): string {
  return "텔레그램";
}

export function settingsTelegramEnabledLabel(enabled: boolean): string {
  return enabled ? "사용 중" : "사용 안 함";
}

export function settingsTelegramConfiguredLabel(configured: boolean): string {
  return configured ? "설정됨" : "미설정";
}

/** Presence is not verified delivery. */
export function settingsTelegramConfiguredTone(
  configured: boolean,
): "warn" | undefined {
  return configured ? "warn" : undefined;
}

export function settingsTelegramChannelStateLabel(
  tokenConfigured: boolean,
  chatIdConfigured: boolean,
): string {
  if (tokenConfigured && chatIdConfigured) return "설정됨 · 전송 미검증";
  if (tokenConfigured || chatIdConfigured) return "일부 설정됨 · 전송 미검증";
  return "미설정";
}

export function settingsTelegramChannelStateTone(
  tokenConfigured: boolean,
  chatIdConfigured: boolean,
): "warn" | undefined {
  return tokenConfigured || chatIdConfigured ? "warn" : undefined;
}

export function settingsTelegramServiceStateLabel(state: string): string {
  if (state === "read-only") return "읽기 전용";
  if (state === "mock") return "모의 데이터";
  return state;
}

export function settingsTelegramEnvKeyLabel(key: string): string {
  if (key === "TG_TOKEN") return "봇 토큰 (환경변수)";
  if (key === "TG_CHAT_ID") return "채팅 ID (환경변수)";
  return key;
}
