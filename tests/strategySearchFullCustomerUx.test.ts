import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { operatorFormToCreateBody } from "../components/rextora/strategySearch/formDefaults";
import {
  advancedDisclosureControl,
  isStrategySearchDeveloperDiagnosticsVisible,
} from "../components/rextora/strategySearch/completionCustomerView";
import { visibleJobLifecycleActions } from "../components/rextora/strategySearch/jobActionVisibility";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search full customer UX", () => {
  it("A/B: all settings-level options stay visible with distinct selected classes", () => {
    const selector = read(
      "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
    );
    expect(selector).toContain('value: "automatic"');
    expect(selector).toContain('value: "basic"');
    expect(selector).toContain('value: "expert"');
    expect(selector).toContain("ss-level-card");
    expect(selector).toContain("is-selected");
    expect(selector).toContain('data-testid="ss-config-level-control"');
    expect(selector).toContain('role="radio"');
    expect(selector).toContain("aria-checked");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("AdvancedLevelSelector");
    expect(form).toContain('set("patternConfigLevel", value)');
    expect(form).not.toContain("SegmentedControl");
  });

  it("C/D: advanced sections and selects use light outlined surfaces", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(form).toContain("ss-adv-section");
    expect(form).toContain("설정 수준");
    expect(form).toContain("탐색 방식");
    expect(form).toContain("검증 · 위험 기준");
    expect(form).toContain("패턴 · 조합 조건");
    expect(form).toContain("위험 · 비용 조건");
    expect(form).toContain("현재 적용 설정");
    const builder = read(
      "components/rextora/strategySearch/visual/StrategySearchVisualBuilder.tsx",
    );
    expect(builder).toContain("ss-field-select");
    expect(css).toContain(".ss-adv-section");
    expect(css).toContain("background: var(--v3-surface)");
    expect(css).toContain("min-height: 44px");
  });

  it("E: checkbox/toggle/chip semantics stay on real form fields", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain('data-testid="ss-auto-strategy-combo"');
    expect(form).toContain('data-testid={`ss-pattern-toggle-${p.id}`}');
    expect(form).toContain("ss-choice-tile");
    expect(form).toContain('data-testid={`ss-pattern-level-${id}`}');
    expect(form).toContain('data-testid={`ss-combo-preset-${id}`}');
  });

  it("F: applied settings summary is read-only and not disabled-looking", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("현재 적용 설정");
    expect(form).toContain("ss-applied-summary");
    expect(form).toContain('data-testid="ss-applied-settings-preview"');
    expect(form).not.toContain("disabled={true}");
  });

  it("G/H/J: developer labels stay behind NODE_ENV development", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(form).not.toContain("개발자 정보");
    expect(form).not.toContain("엔진 임계값 · 개발자 정보");
    expect(form).toContain("전문 설정");
    expect(form).toContain("isStrategySearchDeveloperDiagnosticsVisible");
    expect(workbench).not.toContain("실행 파이프라인 · 런타임 세부");
    expect(isStrategySearchDeveloperDiagnosticsVisible()).toBe(false);
  });

  it("I: non-group research detail hides generation/seed in customer mode", () => {
    const status = read(
      "components/rextora/strategySearch/SearchStatusCard.tsx",
    );
    expect(status).toContain("isStrategySearchDeveloperDiagnosticsVisible");
    expect(status).toContain("ss-generation-count");
    expect(status).toContain("시드");
    const gen = status.slice(status.indexOf("ss-generation-count") - 220);
    expect(gen).toContain("isStrategySearchDeveloperDiagnosticsVisible");
  });

  it("K: job-scoped results customer copy does not say trial", () => {
    const current = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    const results = read("components/rextora/results/ResultsWorkbench.tsx");
    expect(current).toContain("통과 후보");
    expect(current).not.toContain("탐색 trial 기록");
    expect(results).toContain("통과 후보와는 별도입니다");
    expect(results).not.toContain("합격 trial과는 별도");
  });

  it("L: completed duplicate results CTA is demoted from execution controls", () => {
    const controls = read(
      "components/rextora/strategySearch/ExecutionControls.tsx",
    );
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(controls).toContain('status !== "completed"');
    expect(workbench).toContain("이 탐색 결과");
    expect(visibleJobLifecycleActions({
      status: "completed",
      hasSelection: true,
    })).toEqual(["results"]);
  });

  it("M: finalEligible vs group recommendation helper uses real contracts", () => {
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(completion).toContain("ss-group-rec-contract");
    expect(completion).toContain("통과 후보는 자격 기준을 통과한 전략입니다");
    expect(completion).toContain("그룹별 최종 추천은 각 전략군 안에서");
    expect(completion).toContain("counts?.stageFinalRecommendable");
  });

  it("N: settings serialization is unchanged", () => {
    const form = createDefaultOperatorFormState();
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(form.patternConfigLevel).toBe("automatic");
    expect(form.seed).toBeDefined();
  });

  it("O/P/Q: desktop/mobile/reduced-motion contracts remain", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-level-selector");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".ss-level-selector");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".ss-adv-section");
    expect(css).toContain(".ss-level-card");
    expect(css).toContain(".ss-choice-tile");
  });
});

describe("Strategy Search advanced final polish", () => {
  it("A/B/C: collapsed/expanded copy and chevron share aria-expanded boolean", () => {
    expect(advancedDisclosureControl(false)).toEqual({
      copy: "펼치기",
      chevron: "down",
      chevronGlyph: "▼",
    });
    expect(advancedDisclosureControl(true)).toEqual({
      copy: "접기",
      chevron: "up",
      chevronGlyph: "▲",
    });
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const disclosure = read(
      "components/rextora/strategySearch/guided/GuidedDisclosure.tsx",
    );
    expect(form).toContain("GuidedDisclosure");
    expect(form).toContain("aria-expanded={detailsOpen}");
    expect(disclosure).toContain("ss-guided-disclosure__chevron");
  });

  it("D/E/F/I: unified radius hierarchy and one light applied-settings surface", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(css).toContain(".ss-adv-section");
    expect(css).toContain("border-radius: 12px");
    expect(css).toContain(".ss-adv-subgroup");
    expect(css).toContain(".ss-field-select");
    expect(css).toContain("border-radius: 10px");
    expect(form).toContain("ss-adv-section");
    expect(form).not.toContain("rounded-none");
    expect(form).toContain("ss-applied-summary");
    expect(form).toContain("ss-readonly-summary");
    expect(form).toContain('data-testid="ss-applied-settings-preview"');
  });

  it("J/K/L: customer workbench never renders isolated diagnostics", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    const gate = read(
      "components/rextora/strategySearch/completionCustomerView.ts",
    );
    expect(workbench).not.toContain("실행 파이프라인 · 런타임 세부");
    expect(completion).not.toContain("개발자 정보");
    expect(workbench).not.toContain("StrategySearchRuntimeDiagnostics");
    expect(completion).not.toContain("StrategySearchDeveloperInfo");
    expect(isStrategySearchDeveloperDiagnosticsVisible()).toBe(false);
    expect(gate).not.toContain('NODE_ENV === "development"');
  });

  it("M: results customer copy has no audited internal jargon", () => {
    const results = read("components/rextora/results/ResultsWorkbench.tsx");
    const current = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).not.toMatch(/원본 trial|trial 파일|유지 trial|합격 trial/);
    expect(current).not.toContain("탐색 trial");
    expect(current).toContain("후보 번호");
  });
});
