import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  completedActionClass,
  resolveCompletedPrimaryAction,
} from "../components/rextora/strategySearch/completionCustomerView";
import {
  formatCustomerSearchValue,
  looksLikeInternalSearchId,
  searchModeCustomerLabel,
  tradingStyleCustomerLabel,
} from "../components/rextora/strategySearch/customerDisplay";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import { buildAppliedSettingsPreview } from "../components/rextora/strategySearch/formValidation";
import {
  isCompactNoRecommendGroup,
  noRecommendCompactReason,
} from "../components/rextora/strategySearch/rankingGroupCardVisual";
import {
  buildLifecycleNextActionSteps,
  resolveCurrentLifecycleStep,
} from "../components/rextora/strategySearch/LifecycleNextActionsPanel";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search customer decision UX", () => {
  it("A: top-level search mode and advanced settings level use different labels", () => {
    const mode = read(
      "components/rextora/strategySearch/visual/StrategySearchModeSelector.tsx",
    );
    const level = read(
      "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
    );
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(mode).toContain("자동 탐색");
    expect(mode).toContain("탐색 범위 직접 선택");
    expect(level).toContain("설정 수준");
    expect(form).toContain("설정 수준");
    expect(form).toContain("탐색 방식");
    expect(form).not.toMatch(/ss-adv-section__title">탐색 방식/);
  });

  it("B: beginner preset wording is absent", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).not.toContain("초보자 프리셋");
    expect(form).toContain("탐색 프리셋");
    expect(form).toContain("안전형");
    expect(form).toContain("균형형");
    expect(form).toContain("공격형");
  });

  it("C: automatic/basic/expert internal values remain unchanged", () => {
    const level = read(
      "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
    );
    expect(level).toContain('value: "automatic"');
    expect(level).toContain('value: "basic"');
    expect(level).toContain('value: "expert"');
    const body = operatorFormToCreateBody(createDefaultOperatorFormState());
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
  });

  it("D: internal IDs are customer-formatted", () => {
    expect(formatCustomerSearchValue("manual")).toBe("직접 선택");
    expect(formatCustomerSearchValue("automatic")).toBe("자동");
    expect(formatCustomerSearchValue("conservative")).toBe("보수적");
    expect(formatCustomerSearchValue("support_resistance")).toBe("지지·저항");
    expect(formatCustomerSearchValue("supply_demand")).toBe("공급·수요");
    expect(formatCustomerSearchValue("ema_core")).toBe("EMA / 추세 추종");
    expect(formatCustomerSearchValue("order_block")).toBe("오더블럭");
    expect(formatCustomerSearchValue("fvg")).toBe("FVG");
    expect(formatCustomerSearchValue("trendline")).toBe("추세선");
    expect(formatCustomerSearchValue("risk_exits")).toBe("위험 관리");
    expect(looksLikeInternalSearchId("order_block")).toBe(true);
    expect(searchModeCustomerLabel("manual")).toBe("탐색 범위 직접 선택");
    expect(tradingStyleCustomerLabel("stable")).toBe("안전형");
  });

  it("E: raw parameter names are absent from customer helper copy", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).not.toContain("zoneLookback");
    expect(form).not.toContain("minGap");
    expect(form).not.toContain("tolerancePct");
    expect(form).not.toContain("zoneWidthPct");
    expect(form).toContain("분석 범위");
    expect(form).toContain("가격 허용 범위");
  });

  it("F: editable vs read-only fields use distinct presentation", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain('origin="editable"');
    expect(form).toContain("ss-field--readonly");
    expect(form).toContain("ss-field-origin");
    expect(form).toContain("읽기 전용");
    expect(form).toContain("자동 적용");
  });

  it("G: current settings summary contains customer labels, not raw IDs", () => {
    const preview = buildAppliedSettingsPreview(createDefaultOperatorFormState());
    const values = [...preview.rows, ...preview.detailRows].map((row) => row.valueKo);
    expect(preview.rows.some((row) => row.labelKo === "코인")).toBe(true);
    expect(preview.rows.some((row) => row.labelKo === "탐색 방식")).toBe(true);
    expect(preview.rows.some((row) => row.labelKo === "탐색 프리셋")).toBe(true);
    expect(values.join(" ")).not.toMatch(/\bmanual\b/);
    expect(values.join(" ")).not.toContain("support_resistance");
    expect(values.join(" ")).not.toContain("ema_core");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("세부 설정 보기");
  });

  it("H/I/J: no-recommendation groups compact by default; recommended stay open; details remain", () => {
    expect(isCompactNoRecommendGroup({ bestPassedCandidate: null })).toBe(true);
    expect(
      isCompactNoRecommendGroup({ bestPassedCandidate: { score: 1 } }),
    ).toBe(false);
    expect(noRecommendCompactReason("none")).toContain("자격");
    const card = read(
      "components/rextora/strategySearch/ResearchRankingGroupCard.tsx",
    );
    expect(card).toContain("ss-rank-compact");
    expect(card).toContain("aria-expanded={detailsOpen}");
    expect(card).toContain("자세히 보기");
    expect(card).toContain("useState(!compactDefault)");
  });

  it("K/L: primary CTA is state-derived and 새 탐색 does not dominate usable results", () => {
    expect(
      resolveCompletedPrimaryAction({
        showRecommendedRegister: true,
        showQualifiedRegister: true,
        backtestAvailable: true,
        reviewAvailable: true,
      }),
    ).toBe("register_recommended");
    expect(
      completedActionClass(
        "new_search",
        "register_recommended",
      ),
    ).toBe("ss-btn-tertiary");
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("demoteNewSearch");
    expect(workbench).toContain('data-action-rank={demoteNewSearch ? "tertiary"');
  });

  it("M/N/O: roadmap is collapsed by default; current step stays visible from evidence", () => {
    const steps = buildLifecycleNextActionSteps({
      evaluatedStrategies: 10,
      qualifiedStrategies: 3,
      uniqueQualifiedStrategies: 3,
      clusteredRepresentatives: 3,
      duplicateOrNearDuplicateMembers: 0,
      promotedStrategies: 0,
      registeredStrategies: 0,
      recommendationEligibleStrategies: 2,
      backtestRecommendedStrategies: 0,
      top10Saved: 3,
      stageBasicQualified: 3,
      stageStabilityPassed: 3,
      stageCostPassed: 3,
      stageSampleOk: 3,
      stageOverfitOk: 3,
      stageFinalRecommendable: 2,
    });
    const current = resolveCurrentLifecycleStep(steps);
    expect(current?.step.id).toBe("register");
    expect(current?.step.status).toBe("ready");
    const panel = read(
      "components/rextora/strategySearch/LifecycleNextActionsPanel.tsx",
    );
    expect(panel).toContain("ss-lifecycle-current");
    expect(panel).toContain("전체 진행 단계 보기");
    expect(panel).not.toContain("<details open");
  });

  it("P: audited internal terms stay out of standard customer copy", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(form).not.toContain("초보자");
    expect(completion).not.toContain("실행 파이프라인 · 런타임 세부");
    expect(completion).not.toContain("개발자 정보");
  });

  it("Q/R: desktop/mobile and reduced-motion contracts remain", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".ss-btn-tertiary");
    expect(css).toContain(".ss-rank-compact__toggle");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".ss-next-step-current");
  });

  it("S: form serialization is unchanged", () => {
    const form = createDefaultOperatorFormState();
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(form.tradingStyle).toBeDefined();
    expect(form.leverageMode).toBeDefined();
  });
});
