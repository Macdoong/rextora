import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import {
  buildCreateBodyIfValid,
  validateStrategySearchForm,
} from "../components/rextora/strategySearch/formValidation";
import { resolveVisualBuilderPanels } from "../components/rextora/strategySearch/visual/StrategySearchVisualBuilder";
import {
  GUIDE_COPY,
  STRATEGY_SEARCH_SETUP_STEPS,
  detectDependencyInvalidatedSteps,
  filterErrorsForStep,
  filterInvalidatedForNeedsReview,
  isSetupStepValid,
  isStepEnterable,
  resolveStepUiState,
  validateSetupStep,
} from "../components/rextora/strategySearch/guided/strategySearchStepModel";
import {
  isGuidedSetupActive,
  resolveStrategySearchPresentationMode,
} from "../components/rextora/strategySearch/guided/strategySearchPresentation";

const ROOT = process.cwd();
const read = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("Strategy Search guided setup model", () => {
  it("validates per step without changing full-form semantics", () => {
    const form = createDefaultOperatorFormState();
    const full = validateStrategySearchForm(form);
    const review = validateSetupStep(form, "review");
    expect(review).toEqual(full);
    expect(isSetupStepValid(form, "market")).toBe(true);
  });

  it("Step 1 Next does not fail because of future Step 3 zero-family validation", () => {
    const form = createDefaultOperatorFormState();
    const direct = {
      ...form,
      autoStrategyCombo: false,
      selectedSpaceIds: [],
    };
    expect(validateSetupStep(direct, "market").length).toBe(0);
    expect(validateSetupStep(direct, "strategy").length).toBeGreaterThan(0);
  });

  it("blocks zero selected strategy family on strategy step", () => {
    const form = createDefaultOperatorFormState();
    const direct = {
      ...form,
      autoStrategyCombo: false,
      selectedSpaceIds: [],
    };
    const strategyErrors = validateSetupStep(direct, "strategy");
    expect(strategyErrors.some((e) => e.field === "selectedSpaceIds")).toBe(
      true,
    );
  });

  it("allows automatic mode without manual family selection", () => {
    const form = createDefaultOperatorFormState();
    const auto = { ...form, autoStrategyCombo: true };
    expect(isSetupStepValid(auto, "strategy")).toBe(true);
  });

  it("NEEDS_REVIEW only after visited/completed downstream invalidation", () => {
    const form = createDefaultOperatorFormState();
    const toggled = { ...form, autoStrategyCombo: !form.autoStrategyCombo };
    const invalidated = detectDependencyInvalidatedSteps(form, toggled);
    expect(invalidated).toContain("review");
    const gated = filterInvalidatedForNeedsReview(invalidated, {
      visited: new Set(["market"]),
      completed: new Set(),
    });
    expect(gated).not.toContain("review");
  });

  it("fresh setup: step 1 current, steps 2-5 locked", () => {
    const visited = new Set(["market" as const]);
    const opts = {
      currentStepId: "market" as const,
      visited,
      completed: new Set<typeof STRATEGY_SEARCH_SETUP_STEPS[number]["id"]>(),
      needsReview: new Set<typeof STRATEGY_SEARCH_SETUP_STEPS[number]["id"]>(),
    };
    expect(resolveStepUiState("market", opts)).toBe("current");
    expect(resolveStepUiState("approach", opts)).toBe("locked");
    expect(resolveStepUiState("review", opts)).toBe("locked");
  });

  it("preserves equivalent API payload for default guided form values", () => {
    const form = createDefaultOperatorFormState();
    expect(buildCreateBodyIfValid(form)).toEqual(
      buildCreateBodyIfValid({ ...form }),
    );
  });

  it("exposes static AI guide copy for every setup step", () => {
    for (const step of STRATEGY_SEARCH_SETUP_STEPS) {
      expect(GUIDE_COPY[step.id].statusKo.length).toBeGreaterThan(2);
      expect(GUIDE_COPY[step.id].taskKo.length).toBeGreaterThan(5);
    }
  });

  it("Step 1 customer labels use 분석 대상 / 분석 기준", () => {
    const market = STRATEGY_SEARCH_SETUP_STEPS.find((s) => s.id === "market");
    expect(market?.navLabelKo).toBe("분석 대상");
    expect(market?.headingKo).toBe("분석 기준");
    expect(GUIDE_COPY.market.taskKo).toBe(
      "어떤 코인과 시간 범위를 분석할지 정합니다.",
    );
  });

  it("direct goToStep is a single jump (no intermediate traversal in hook)", () => {
    const hookSrc = read(
      "components/rextora/strategySearch/guided/useStrategySearchGuidedSetup.ts",
    );
    expect(hookSrc).toMatch(/setCurrentStepId\(stepId\)/);
    expect(hookSrc).not.toMatch(/for\s*\(.*setCurrentStepId/);
  });

  it("needs-review and locked semantics unchanged in resolveStepUiState", () => {
    const lockedOpts = {
      currentStepId: "market" as const,
      visited: new Set(["market" as const]),
      completed: new Set<typeof STRATEGY_SEARCH_SETUP_STEPS[number]["id"]>(),
      needsReview: new Set<typeof STRATEGY_SEARCH_SETUP_STEPS[number]["id"]>(),
    };
    expect(resolveStepUiState("approach", lockedOpts)).toBe("locked");
    const reviewOpts = {
      currentStepId: "approach" as const,
      visited: new Set(["market" as const, "approach" as const]),
      completed: new Set(["market" as const]),
      needsReview: new Set(["review" as const]),
    };
    expect(resolveStepUiState("review", reviewOpts)).toBe("needs_review");
  });
});

describe("Strategy Search guided visual polish (semantics)", () => {
  const css = read("components/rextora/v3/strategy-search.css");

  it("includes reduced-motion overrides for guided setup motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".ss-guided-guide--enter");
    expect(css).toContain(".ss-guided-step-surface--enter");
    expect(css).toContain(".ss-guided-nav__check");
    expect(css).toContain(".ss-guided-nav__traveler");
  });

  it("desktop rail traveler shares five-column marker geometry", () => {
    const navSrc = read(
      "components/rextora/strategySearch/guided/StrategySearchStepNavigation.tsx",
    );
    expect(navSrc).toContain("--ss-guided-travel-index");
    expect(navSrc).toContain("ss-guided-nav__track");
    expect(navSrc).not.toContain("ss-guided-nav__connector");
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain("translateX(-50%)");
    expect(css).not.toMatch(/travel-index\)[\s\S]*-\s*15px/);
    expect(css).toMatch(
      /\(var\(--ss-guided-travel-index\) \+ 0\.5\)[\s\S]*100% \/ var\(--ss-guided-travel-steps\)/,
    );
  });

  it("step navigation component preserves aria-current and disabled locked steps", () => {
    const navSrc = read(
      "components/rextora/strategySearch/guided/StrategySearchStepNavigation.tsx",
    );
    expect(navSrc).toContain('aria-current={state === "current" ? "step" : undefined}');
    expect(navSrc).toContain("disabled={locked}");
  });

  it("AI researcher role and per-step status remain in guide", () => {
    const guideSrc = read(
      "components/rextora/strategySearch/guided/StrategySearchStepGuide.tsx",
    );
    expect(guideSrc).toContain("AI 연구원");
    expect(guideSrc).toContain("copy.statusKo");
    expect(guideSrc).not.toMatch(/fetch\(|openai|anthropic|llm/i);
  });

  it("recent results disclosure stays collapsed by default", () => {
    const collapsibleSrc = read(
      "components/rextora/strategySearch/guided/SetupResultsCollapsible.tsx",
    );
    expect(collapsibleSrc).toContain("<details");
    expect(collapsibleSrc).not.toContain("open");
    expect(collapsibleSrc).toContain("ss-setup-results-toggle");
  });
});

describe("Strategy Search guided wiring (structural)", () => {
  const formSrc = read("components/rextora/strategySearch/JobCreateForm.tsx");
  const workbenchSrc = read(
    "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
  );

  it("uses conditional mount and authoritative presentation mode", () => {
    expect(formSrc).toContain("GuidedStepMount");
    expect(formSrc).not.toContain("stepPanelClass");
    expect(workbenchSrc).toContain("resolveStrategySearchPresentationMode");
    expect(workbenchSrc).toContain("data-guided-setup-active");
  });

  it("visual builder workspace:false resolves to no scope/layers", () => {
    const p = resolveVisualBuilderPanels({
      mode: false,
      market: true,
      workspace: false,
    });
    expect(p.workspaceControls).toBe(false);
    expect(p.scopeMap).toBe(false);
  });

  it("completed job with outcomeViewPrimary false keeps guided setup active", () => {
    expect(
      isGuidedSetupActive(
        resolveStrategySearchPresentationMode({
          clientReady: true,
          showRunningVisual: false,
          outcomeViewPrimary: false,
        }),
      ),
    ).toBe(true);
  });
});
