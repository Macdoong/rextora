/**
 * Presentation copy for Settings → 탐색 엔진.
 * Read-only facts. Does not change search/runtime defaults or stored settings.
 */

export type SettingsSearchFact = { label: string; value: string };

export type SettingsSearchFactGroup = {
  id: "mode" | "limits" | "recovery";
  title: string;
  facts: SettingsSearchFact[];
};

/** Matches operator form default durationPreset "180". Display remains hours. */
export const SETTINGS_SEARCH_DEFAULT_DURATION_MINUTES = 180;

export const SETTINGS_SEARCH_ENGINE_LEDE =
  "연구 런타임·복구·보존의 기본 동작입니다. 이 화면은 읽기 전용이며, 작업별 시간·한도는 전략 탐색에서 바꿉니다.";

export const SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE =
  "워커는 프로세스 내 순차 실행이며, 탐색 전략 한도와 합격 최소 확보는 안전 가드입니다. 정상 종료 코드는 연구 시간 종료입니다.";

export function settingsSearchEngineGroups(): SettingsSearchFactGroup[] {
  const hours = SETTINGS_SEARCH_DEFAULT_DURATION_MINUTES / 60;
  return [
    {
      id: "mode",
      title: "현재 탐색 방식",
      facts: [
        { label: "기본 탐색 방식", value: "설정한 시간까지 계속 연구" },
        { label: "정상 종료", value: "탐색 시간 마감" },
      ],
    },
    {
      id: "limits",
      title: "탐색 범위 / 실행 제한",
      facts: [
        { label: "안전 제한", value: "탐색 전략 한도 · 합격 최소 확보" },
        { label: "기본 탐색 시간", value: `${hours}시간 (변경 가능)` },
      ],
    },
    {
      id: "recovery",
      title: "복구 / 기록",
      facts: [
        { label: "이력 보존", value: "최근 탐색 기록 보관" },
        { label: "자동 복구", value: "중단된 연구 작업 복구" },
      ],
    },
  ];
}

export function settingsSearchEngineFacts(): SettingsSearchFact[] {
  return settingsSearchEngineGroups().flatMap((group) => group.facts);
}
