import { describe, expect, it } from "vitest";
import {
  containsForbiddenPrimaryText,
  mapGoalToOperatorKo,
  mapInternalErrorToOperatorKo,
  sanitizePrimaryUserText,
} from "../src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";
import {
  countPrimaryTextLeaks,
  detectPrimaryTextLeaks,
} from "../src/lib/rextora/agent/v2/reasoning/primaryLeakDetector";

describe("userVisibleSanitizer — D/J/K leakage fixtures", () => {
  const previouslyObserved = {
    D_none: "현재 승인할 대기 제안이 없습니다.\n\n이전에 요청하신 백테스트는 이미 실행되어 결과가 저장되었습니다.\n\nNone.",
    D_inform:
      "현재 승인할 대기 제안이 없습니다.\n\n이전에 요청하신 백테스트는 이미 실행되어 결과가 저장되었습니다.\n\ninform_user.",
    J_prepare_backtest:
      "사용자가 승인한 목표: prepare_backtest 사용자가 이 실행 계획을 명시적으로 승인했습니다. 백테스트의 실제 종료 결과가 저장소 이벤트로 확인되었습니다.",
    K_detach:
      "STRATEGY_DEPENDENCIES_REQUIRE_DETACH:모의매매:해당 모의매매\n\n진행 상황을 확인하세요\nSTRATEGY_DEPENDENCIES_REQUIRE_DETACH:모의매매:해당 모의매매",
  } as const;

  it("detector fails against previously observed D/J/K primary leaks", () => {
    expect(countPrimaryTextLeaks(previouslyObserved.D_none)).toBeGreaterThan(0);
    expect(countPrimaryTextLeaks(previouslyObserved.D_inform)).toBeGreaterThan(0);
    expect(countPrimaryTextLeaks(previouslyObserved.J_prepare_backtest)).toBeGreaterThan(0);
    expect(countPrimaryTextLeaks(previouslyObserved.K_detach)).toBeGreaterThan(0);
    expect(
      detectPrimaryTextLeaks(previouslyObserved.K_detach).some(
        (h) => h.match === "STRATEGY_DEPENDENCIES_REQUIRE_DETACH",
      ),
    ).toBe(true);
  });

  it("sanitizer converts D/J/K observed leaks into operator Korean", () => {
    const dNone = sanitizePrimaryUserText(previouslyObserved.D_none);
    const dInform = sanitizePrimaryUserText(previouslyObserved.D_inform);
    const j = sanitizePrimaryUserText(previouslyObserved.J_prepare_backtest);
    const k = sanitizePrimaryUserText(previouslyObserved.K_detach);

    expect(dNone).not.toMatch(/\bNone\b/i);
    expect(dInform).not.toMatch(/inform_user/i);
    expect(j).toContain("백테스트 준비");
    expect(j).not.toMatch(/\bprepare_backtest\b/i);
    expect(k).toContain("연결 관계를 먼저 해제");
    expect(k).not.toMatch(/STRATEGY_DEPENDENCIES_REQUIRE_DETACH/);

    expect(containsForbiddenPrimaryText(dNone)).toEqual([]);
    expect(containsForbiddenPrimaryText(dInform)).toEqual([]);
    expect(containsForbiddenPrimaryText(j)).toEqual([]);
    expect(containsForbiddenPrimaryText(k)).toEqual([]);
    expect(countPrimaryTextLeaks(dNone)).toBe(0);
    expect(countPrimaryTextLeaks(dInform)).toBe(0);
    expect(countPrimaryTextLeaks(j)).toBe(0);
    expect(countPrimaryTextLeaks(k)).toBe(0);
  });

  it("maps internal error codes without erasing meaning", () => {
    const mapped = mapInternalErrorToOperatorKo(
      "STRATEGY_DEPENDENCIES_REQUIRE_DETACH:paper:paper_76fd6755-2518-4b11-af16-5d501e17a1c0",
    );
    expect(mapped.code).toBe("STRATEGY_DEPENDENCIES_REQUIRE_DETACH");
    expect(mapped.operatorKo).toContain("연결 관계를 먼저 해제");
    expect(mapped.operatorKo).not.toMatch(/STRATEGY_DEPENDENCIES/);
  });

  it("maps goals to natural Korean", () => {
    expect(mapGoalToOperatorKo("prepare_backtest")).toBe("백테스트 준비");
    expect(mapGoalToOperatorKo("prepare_search")).toBe("탐색 준비");
  });

  it("detects lifecycle leaks across status, context, action, and memory surfaces", () => {
    const hits = detectPrimaryTextLeaks({
      timestampStatus: "21:30 · paper_active",
      contextStrip: "AI 직원 · paper_ready",
      actionCard: "Paper approval state",
      memoryText: "이전 상태 pending_approval",
    });
    expect(hits.map((hit) => hit.surface)).toEqual(
      expect.arrayContaining([
        "timestampStatus",
        "contextStrip",
        "actionCard",
        "memoryText",
      ]),
    );
  });
});
