import { describe, expect, it } from "vitest";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { STRATEGY_SEARCH_HISTORY_RETENTION_NOTE } from "../components/rextora/strategySearch/JobList";
import {
  SETTINGS_SEARCH_DEFAULT_DURATION_MINUTES,
  SETTINGS_SEARCH_ENGINE_LEDE,
  SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE,
  settingsSearchEngineFacts,
  settingsSearchEngineGroups,
} from "../src/lib/rextora/settings/settingsSearchPresentation";
import { DEFAULT_ORPHAN_AUTO_RESUME_LIMIT } from "../src/lib/rextora/strategySearch/orphanJobRecovery";

describe("Settings Search Engine presentation", () => {
  it("keeps the six existing Korean facts and grouped hierarchy", () => {
    const groups = settingsSearchEngineGroups();
    expect(groups.map((g) => g.id)).toEqual(["mode", "limits", "recovery"]);
    expect(groups.map((g) => g.title)).toEqual([
      "현재 탐색 방식",
      "탐색 범위 / 실행 제한",
      "복구 / 기록",
    ]);
    const facts = settingsSearchEngineFacts();
    expect(facts).toHaveLength(6);
    expect(facts.map((f) => f.label)).toEqual([
      "기본 탐색 방식",
      "정상 종료",
      "안전 제한",
      "기본 탐색 시간",
      "이력 보존",
      "자동 복구",
    ]);
    for (const fact of facts) {
      expect(fact.label).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
      expect(fact.value).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
  });

  it("displays default duration as hours without changing stored minutes", () => {
    const form = createDefaultOperatorFormState();
    expect(form.durationPreset).toBe("180");
    expect(form.maxRuntimeMinutesOverride).toBe("180");
    expect(form.stopWhenQualifiedTarget).toBe(false);
    expect(SETTINGS_SEARCH_DEFAULT_DURATION_MINUTES).toBe(180);
    expect(SETTINGS_SEARCH_DEFAULT_DURATION_MINUTES / 60).toBe(3);
    const duration = settingsSearchEngineFacts().find((f) => f.label === "기본 탐색 시간");
    expect(duration?.value).toBe("3시간 (변경 가능)");
  });

  it("does not invent settings.json keys or auto-resume", () => {
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
    expect(STRATEGY_SEARCH_HISTORY_RETENTION_NOTE).toBe(20);
    expect(SETTINGS_SEARCH_ENGINE_LEDE).toContain("읽기 전용");
    expect(SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE).toContain("프로세스 내 순차 실행");
    expect(SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE).not.toContain("원본 설정 키");
  });
});
