import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalogPatternBlocks,
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import { validateStrategySearchForm } from "../components/rextora/strategySearch/formValidation";
import { PATTERN_PARAMETER_CATALOG } from "../src/lib/rextora/strategySearch/patternParameterCatalog";
import {
  buildCombinationSpec,
  combinationParamsForCandidate,
} from "../src/lib/rextora/strategySearch/patternCombination";
import { buildComboAwareStrategyName } from "../src/lib/rextora/strategySearch/readableStrategyName";
import { buildLifecycleNextActionSteps } from "../components/rextora/strategySearch/LifecycleNextActionsPanel";

const ROOT = path.resolve(__dirname, "..");

describe("todo 5 catalog-driven builder", () => {
  it("persists every selected block control and catalog default", () => {
    const form = createDefaultOperatorFormState();
    const families = ["order_block", "fvg"];
    const blocks = buildCatalogPatternBlocks(families, "confluence");
    const configured = {
      ...form,
      autoStrategyCombo: false,
      selectedSpaceIds: families,
      patternConfigLevel: "expert" as const,
      patternCombinationTemplate: "confluence" as const,
      patternCombinationOperator: "weighted_score" as const,
      patternCombinationFailurePolicy: "majority" as const,
      patternCombinationWeightedThreshold: "1.5",
      patternCombinationFamilies: families,
      patternCombinationBlocks: blocks.map((block, index) => ({
        ...block,
        required: index === 0,
        weight: index + 1,
        priority: index,
      })),
    };
    expect(validateStrategySearchForm(configured)).toEqual([]);
    const spec = operatorFormToCreateBody(configured).operatorPlan
      ?.patternCombinationSpec;
    expect(spec).toMatchObject({
      operator: "weighted_score",
      failurePolicy: "majority",
      weightedThreshold: 1.5,
    });
    expect(spec?.blocks).toHaveLength(2);
    for (const block of spec?.blocks ?? []) {
      expect(Object.keys(block.params).sort()).toEqual(
        PATTERN_PARAMETER_CATALOG[block.family].map((entry) => entry.key).sort(),
      );
      expect(block).toEqual(
        expect.objectContaining({
          required: expect.any(Boolean),
          weight: expect.any(Number),
          priority: expect.any(Number),
          order: expect.any(Number),
        }),
      );
    }
  });

  it("rejects out-of-catalog values before submit", () => {
    const form = createDefaultOperatorFormState();
    const blocks = buildCatalogPatternBlocks(["fvg"], "single");
    blocks[0]!.params.minGapPct = 99;
    const errors = validateStrategySearchForm({
      ...form,
      autoStrategyCombo: false,
      selectedSpaceIds: ["fvg"],
      patternCombinationFamilies: ["fvg"],
      patternCombinationBlocks: blocks,
    });
    expect(errors.some((error) => error.field.includes("minGapPct"))).toBe(true);
  });
});

describe("todo 5 naming and lifecycle", () => {
  it("creates deterministic combo-aware identity without a hash", () => {
    const combo = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "fvg"],
      operator: "and",
    });
    const name = buildComboAwareStrategyName({
      params: combinationParamsForCandidate(combo),
      symbol: "btcusdt",
      timeframe: "15m",
    });
    expect(name).toContain("BTCUSDT 15m");
    expect(name).toContain("OB AND FVG");
    expect(name).toContain("entry_zone");
    expect(name).not.toMatch(/[a-f0-9]{12}/);
  });

  it("keeps the required completion order and gates paper/live", () => {
    const steps = buildLifecycleNextActionSteps({
      evaluatedStrategies: 10,
      qualifiedStrategies: 3,
      uniqueQualifiedStrategies: 3,
      clusteredRepresentatives: 3,
      duplicateOrNearDuplicateMembers: 0,
      promotedStrategies: 0,
      registeredStrategies: 0,
      recommendationEligibleStrategies: 3,
      backtestRecommendedStrategies: 3,
      top10Saved: 3,
      stageBasicQualified: 3,
      stageStabilityPassed: 3,
      stageCostPassed: 3,
      stageSampleOk: 3,
      stageOverfitOk: 3,
      stageFinalRecommendable: 3,
    });
    expect(steps.map((step) => step.id)).toEqual([
      "research",
      "best",
      "compare_top3",
      "register",
      "backtest",
      "paper",
      "live",
    ]);
    expect(steps.find((step) => step.id === "paper")?.status).toBe("blocked");
    expect(steps.find((step) => step.id === "live")?.status).toBe("blocked");
  });
});

describe("todo 5 UI and snapshot contracts", () => {
  it("contains institutional Top10 columns, merged Top3 and null-safe charts", () => {
    const results = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/results/CurrentResearchResultsPanel.tsx",
      ),
      "utf8",
    );
    for (const label of [
      "순위",
      "변동",
      "전략",
      "패턴 스택",
      "승률",
      "수익률",
      "낙폭",
      "Sharpe",
      "견고성",
      "레버리지",
      "위험",
      "신뢰도",
      "미니 차트",
      "승격 근거",
    ]) {
      expect(results).toContain(`"${label}"`);
    }
    expect(results).toContain("const decisionTop3");
    expect(results).toContain("미니 차트 데이터 없음");
    expect(results).toContain("top10.slice(0, 3)");
  });

  it("stores lifecycle display snapshots and terminates aborted loading", () => {
    const paper = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/paper/paperSessionStore.ts"),
      "utf8",
    );
    const backtest = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/backtest/backtestRunner.ts"),
      "utf8",
    );
    const completion = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
      ),
      "utf8",
    );
    expect(paper).toContain("displayAliasSnapshot");
    expect(paper).toContain("displayNameSnapshot");
    expect(backtest).toContain(
      "strategy.displayAlias ?? strategy.displayName ?? strategy.name",
    );
    expect(completion).toContain("new AbortController()");
    expect(completion).toContain("controller.abort()");
  });
});
