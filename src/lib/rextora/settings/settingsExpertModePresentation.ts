/**
 * Presentation helpers for Settings → 전문가 모드.
 * Does not change the localStorage gate, research, Live, or stored settings.
 */

export type SettingsExpertTone = "ok" | "warn" | "bad" | undefined;

/** Existing browser gate. Must stay identical to ExpertModeCard / ExpertRouteGuard. */
export const SETTINGS_EXPERT_STORAGE_KEY = "rextora.expertMode";

export const SETTINGS_EXPERT_STORAGE_ON = "1";
export const SETTINGS_EXPERT_STORAGE_OFF = "0";

export const SETTINGS_EXPERT_WIZARD_HREF = "/strategies?expert=1";

export const SETTINGS_EXPERT_LEDE =
  "기본 경로는 전략 탐색입니다. 전문가 모드는 이 브라우저에서만 켜지며 서버 설정을 저장하지 않습니다. 켜면 수동 전략 빌더와 전문가 백테스트 가드가 열립니다. 실주문·Live는 켜지지 않습니다.";

export const SETTINGS_EXPERT_SAFE_NOTE =
  "SAFE는 잠긴 원본이라 수정할 수 없습니다. 변경이 필요하면 복사본을 만드세요.";

export const SETTINGS_EXPERT_TECHNICAL_KEYS = [
  "rextora.expertMode",
  "expert=1",
  "stopWhenQualifiedTarget",
] as const;

export type SettingsExpertFieldClass =
  | "USER_EXPERT_SETTING"
  | "OPERATOR_ONLY"
  | "INTERNAL_ONLY"
  | "LEGACY_UNUSED";

export const SETTINGS_EXPERT_MOUNTED_FIELDS = [
  {
    field: "rextora.expertMode",
    class: "USER_EXPERT_SETTING" as const,
    editable: true,
  },
] as const;

export const SETTINGS_EXPERT_UNMOUNTED_FIELDS = [
  {
    field: "ui.showAdvancedSettings",
    class: "INTERNAL_ONLY" as const,
  },
  {
    field: "ui.compactMode",
    class: "INTERNAL_ONLY" as const,
  },
  {
    field: "ui.dashboardRefreshMs",
    class: "LEGACY_UNUSED" as const,
  },
  {
    field: "ui.marketWatchRefreshMs",
    class: "LEGACY_UNUSED" as const,
  },
  {
    field: "ui.systemStatusRefreshMs",
    class: "LEGACY_UNUSED" as const,
  },
  {
    field: "ui.expertMode",
    class: "LEGACY_UNUSED" as const,
  },
  {
    field: "stopWhenQualifiedTarget",
    class: "OPERATOR_ONLY" as const,
  },
] as const;

export function settingsExpertGateLabel(enabled: boolean): string {
  return enabled ? "켜짐" : "꺼짐";
}

/** Off is the safe default. On unlocks advanced screens, not Live. */
export function settingsExpertGateTone(enabled: boolean): SettingsExpertTone {
  return enabled ? "warn" : undefined;
}

export function settingsExpertStoreLabel(): string {
  return "이 브라우저";
}

export function settingsExpertServerSettingsLabel(): string {
  return "저장하지 않음";
}

export function settingsExpertSafeLockLabel(): string {
  return "잠금 · 수정 불가";
}

export function settingsExpertBuilderStatus(enabled: boolean): string {
  return enabled ? "열 수 있음" : "게이트 필요";
}

export function settingsExpertBacktestStatus(): string {
  return "같은 브라우저 게이트 적용";
}

export function settingsExpertTechnicalKeyLabel(key: string): string {
  switch (key) {
    case "rextora.expertMode":
      return "브라우저 전문가 모드 플래그";
    case "expert=1":
      return "전문가 화면 주소 쿼리";
    case "stopWhenQualifiedTarget":
      return "탐색 조기 종료 옵션 (전략 탐색 화면)";
    default:
      return key;
  }
}

export function settingsExpertToggleLabel(enabled: boolean): string {
  return enabled ? "전문가 모드 끄기" : "전문가 모드 켜기";
}
