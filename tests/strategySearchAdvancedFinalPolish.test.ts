import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advancedDisclosureControl,
  isStrategySearchDeveloperDiagnosticsVisible,
} from "../components/rextora/strategySearch/completionCustomerView";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { operatorFormToCreateBody } from "../components/rextora/strategySearch/formDefaults";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search advanced final polish", () => {
  it("A/B/C: disclosure copy, chevron, and aria-expanded share one boolean", () => {
    const collapsed = advancedDisclosureControl(false);
    const expanded = advancedDisclosureControl(true);
    expect(collapsed).toEqual({
      copy: "펼치기",
      chevron: "down",
      chevronGlyph: "▼",
    });
    expect(expanded).toEqual({
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
    expect(form).toContain("hidden={!detailsOpen}");
    expect(disclosure).toContain("<details");
    expect(disclosure).toContain("ss-guided-disclosure__chevron");
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).not.toContain(
      ".ss-advanced-disclosure[data-open=\"true\"] .ss-advanced-trigger__chevron",
    );
  });

  it("D/E/F: radius hierarchy is section 12 / nested 10 / field 10", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-adv-section");
    expect(css).toContain("border-radius: 12px");
    expect(css).toContain(".ss-adv-subgroup");
    expect(css).toContain(".ss-pattern-table-wrap");
    expect(css).toContain("border-radius: 10px");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("ss-adv-section");
    expect(form).not.toContain("rounded-none");
    expect(form).not.toContain("rounded-sm");
  });

  it("G/H: settings-level and risk/cost/leverage semantics stay unchanged", () => {
    const selector = read(
      "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
    );
    expect(selector).toContain('value: "automatic"');
    expect(selector).toContain('value: "basic"');
    expect(selector).toContain('value: "expert"');
    expect(selector).toContain("aria-checked");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("ss-leverage-mode");
    expect(form).toContain("위험 및 레버리지");
    expect(form).toContain("비용 검증");
    expect(form).toContain('set("patternConfigLevel", value)');
  });

  it("I: applied settings remain read-only and rounded/light", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("현재 적용 설정");
    expect(form).toContain("ss-applied-summary");
    expect(form).toContain("ss-readonly-summary");
    expect(form).toContain('data-testid="ss-applied-settings-preview"');
  });

  it("J/K/L: standard customer files do not render diagnostics; localhost is not a gate", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(workbench).not.toContain("실행 파이프라인 · 런타임 세부");
    expect(completion).not.toContain("개발자 정보");
    expect(isStrategySearchDeveloperDiagnosticsVisible()).toBe(false);
    const gate = read(
      "components/rextora/strategySearch/completionCustomerView.ts",
    );
    expect(gate).not.toContain('NODE_ENV === "development"');
    expect(gate).toContain("return false");
  });

  it("M: job-scoped results customer copy has no audited trial/internal jargon", () => {
    const results = read("components/rextora/results/ResultsWorkbench.tsx");
    const current = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).not.toMatch(/원본 trial|trial 파일|유지 trial|합격 trial/);
    expect(current).not.toContain("iteration {");
    expect(current).not.toContain("탐색 trial");
    expect(current).toContain("후보 번호");
  });

  it("N: form serialization is unchanged", () => {
    const form = createDefaultOperatorFormState();
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(form.leverageMode).toBeDefined();
    expect(form.maxMdd).toBeDefined();
  });

  it("O: mobile advanced layout stays full-width without overflow rules", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".ss-level-selector");
    expect(css).toContain("width: 100%");
    expect(css).toContain(".ss-pattern-table-wrap");
    expect(css).toContain("overflow-x: auto");
  });
});
