/**
 * P1-E1: job.config.parameterRanges must not alias plan mutation snapshots.
 * Temp stores only — no production strategy-search data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { filterRangesForLeverageMode } from "../src/lib/rextora/strategySearch/leverageMode";
import {
  applyPatternOperatorConfigToRanges,
  patternConfigFromPlanFields,
} from "../src/lib/rextora/strategySearch/patternSearchConfig";
import { fvgSearchRanges } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { recoverMissingJobRecord } from "../src/lib/rextora/strategySearch/jobRecordRecovery";
import {
  createSearchJob,
  getSearchJob,
  saveSearchJob,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import { applyStageConfig } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { cloneSearchParameterRanges } from "../src/lib/rextora/strategySearch/searchSpaceMutation";
import type {
  StrategySearchConfig,
  StrategySearchParameterRange,
} from "../src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1e1-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function baseConfig(
  ranges: StrategySearchParameterRange[],
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1e1_range_isolation",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test-v1",
    seed: 17,
    generatorType: "random",
    maxIterations: 8,
    parameterRanges: cloneSearchParameterRanges(ranges),
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: false },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function sourceRanges(): StrategySearchParameterRange[] {
  return [
    {
      key: "penetrationPct",
      min: 0.4,
      max: 0.7,
      step: 0.05,
      valueType: "float",
      defaultValue: 0.45,
    },
    {
      key: "mode",
      min: null,
      max: null,
      valueType: "enum",
      enumValues: ["a", "b"],
      defaultValue: "a",
    },
  ];
}

function seedJob(overrides?: {
  patternConfigLevel?: "automatic" | "basic";
  patternRetestMode?: "required" | "optional" | "disabled";
  patternConfirmStrength?: "standard" | "strict";
  patternStrength?: "loose" | "standard" | "strict";
  ranges?: StrategySearchParameterRange[];
  spaceId?: string;
}) {
  const store = tempStore();
  const ranges = overrides?.ranges ?? sourceRanges();
  const job = createSearchJob(baseConfig(ranges), store);
  const mutated = cloneSearchParameterRanges(ranges);
  const lastMutationRanges = cloneSearchParameterRanges(ranges);
  const plan = {
    ...createEmptySearchPlan({
      searchName: "p1e1-isolation",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 40,
      stageBatchSize: 8,
      maxRuntimeMs: null,
      spaces: [{ id: overrides?.spaceId ?? "fvg", labelKo: "FVG" }],
      patternConfigLevel: overrides?.patternConfigLevel ?? "automatic",
      patternRetestMode: overrides?.patternRetestMode ?? null,
      patternConfirmStrength: overrides?.patternConfirmStrength ?? null,
      patternStrength: overrides?.patternStrength ?? null,
    }),
    mutatedParameterRanges: mutated,
    lastMutation: {
      version: 1 as const,
      appliedAt: "2026-08-11T00:00:00.000Z",
      weaknessCategories: ["unstable_parameters"],
      previousRanges: cloneSearchParameterRanges(ranges),
      mutatedRanges: lastMutationRanges,
      mutations: [],
    },
  };
  saveSearchPlan(job.id, plan, store);
  return { store, job, livePlan: plan, mutated, lastMutationRanges };
}

function preFixStageRanges(
  plan: {
    mutatedParameterRanges: StrategySearchParameterRange[] | null;
    patternConfigLevel?: "automatic" | "basic" | null;
    patternRetestMode?: "required" | "optional" | "disabled" | null;
    patternConfirmStrength?: "standard" | "strict" | null;
    patternStrength?: "loose" | "standard" | "strict" | null;
    leverageMode?: "automatic" | "fixed" | "range" | "disabled" | null;
  },
  overlaySpace: boolean,
) {
  const filtered = filterRangesForLeverageMode(
    plan.mutatedParameterRanges ?? [],
    plan,
  );
  const patternConfig = patternConfigFromPlanFields(plan);
  return overlaySpace
    ? applyPatternOperatorConfigToRanges(filtered, patternConfig)
    : filtered;
}

describe("search-space range reference isolation (P1-E1)", () => {
  it("automatic-mode assignment previously nested-aliased mutatedParameterRanges", () => {
    const mutated = sourceRanges();
    const plan = {
      mutatedParameterRanges: mutated,
      patternConfigLevel: "automatic" as const,
      patternRetestMode: null,
      patternConfirmStrength: null,
      patternStrength: null,
      leverageMode: null,
    };
    const stageRanges = preFixStageRanges(plan, true);
    const arrayAlias = stageRanges === mutated;
    const nestedAlias = stageRanges.some((range, i) => range === mutated[i]);
    expect(arrayAlias).toBe(false);
    expect(nestedAlias).toBe(true);
    const before = mutated[0]!.min;
    stageRanges[0]!.min = 0.11;
    expect(mutated[0]!.min).toBe(0.11);
    mutated[0]!.min = before;
  });

  it("applyStageConfig owns an independent array and nested range objects in automatic mode", () => {
    const ctx = seedJob();
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store);
    expect(saved).toBeDefined();
    const owned = saved!.config.parameterRanges;
    expect(owned).not.toBe(ctx.livePlan.mutatedParameterRanges);
    expect(owned).not.toBe(ctx.mutated);
    expect(owned[0]).not.toBe(ctx.livePlan.mutatedParameterRanges![0]);
    expect(owned[0]).not.toBe(ctx.mutated[0]);
    expect(owned.map((r) => r.key)).toEqual(
      ctx.livePlan.mutatedParameterRanges!.map((r) => r.key),
    );
    expect(owned).toEqual(
      filterRangesForLeverageMode(
        ctx.livePlan.mutatedParameterRanges!,
        ctx.livePlan,
      ),
    );
  });

  it("mutating job.config.parameterRanges does not alter plan.mutatedParameterRanges", () => {
    const ctx = seedJob();
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    const originalMax = ctx.livePlan.mutatedParameterRanges![0]!.max;
    saved.config.parameterRanges[0]!.min = 0.12;
    expect(ctx.livePlan.mutatedParameterRanges![0]!.min).toBe(0.4);
    expect(ctx.livePlan.mutatedParameterRanges![0]!.max).toBe(originalMax);
  });

  it("mutating plan.mutatedParameterRanges does not alter job.config.parameterRanges", () => {
    const ctx = seedJob();
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    const originalMin = saved.config.parameterRanges[0]!.min;
    ctx.livePlan.mutatedParameterRanges![0]!.max = 0.99;
    expect(saved.config.parameterRanges[0]!.max).toBe(0.7);
    expect(saved.config.parameterRanges[0]!.min).toBe(originalMin);
  });

  it("lastMutation.mutatedRanges remains independently isolated", () => {
    const ctx = seedJob();
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    expect(saved.config.parameterRanges).not.toBe(
      ctx.livePlan.lastMutation!.mutatedRanges,
    );
    expect(saved.config.parameterRanges[0]).not.toBe(
      ctx.livePlan.lastMutation!.mutatedRanges[0],
    );
    saved.config.parameterRanges[0]!.min = 0.01;
    ctx.livePlan.lastMutation!.mutatedRanges[0]!.max = 0.91;
    expect(ctx.livePlan.lastMutation!.mutatedRanges[0]!.min).toBe(0.4);
    expect(saved.config.parameterRanges[0]!.max).toBe(0.7);
  });

  it("automatic-mode values, order, and optional fields are preserved", () => {
    const ctx = seedJob({ patternConfigLevel: "automatic" });
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    const owned = saved.config.parameterRanges;
    const expected = filterRangesForLeverageMode(
      ctx.livePlan.mutatedParameterRanges!,
      ctx.livePlan,
    );
    expect(owned.map((r) => r.key)).toEqual(expected.map((r) => r.key));
    expect(owned).toEqual(expected);
    const mode = owned.find((r) => r.key === "mode");
    expect(mode?.enumValues).toEqual(["a", "b"]);
    expect(mode?.enumValues).not.toBe(
      ctx.livePlan.mutatedParameterRanges!.find((r) => r.key === "mode")
        ?.enumValues,
    );
    expect(owned.find((r) => r.key === "penetrationPct")).toEqual({
      key: "penetrationPct",
      min: 0.4,
      max: 0.7,
      step: 0.05,
      valueType: "float",
      defaultValue: 0.45,
    });
    const pen = owned.find((r) => r.key === "penetrationPct")!;
    expect(Number(pen.min) <= Number(pen.max)).toBe(true);
  });

  it("overlay mode still tightens penetrationPct without inversion or aliasing", () => {
    const catalog = fvgSearchRanges();
    const ctx = seedJob({
      patternConfigLevel: "basic",
      patternRetestMode: "required",
      patternConfirmStrength: "standard",
      patternStrength: "standard",
      ranges: catalog,
    });
    const beforePen = ctx.livePlan.mutatedParameterRanges!.find(
      (r) => r.key === "penetrationPct",
    )!;
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    const afterPen = saved.config.parameterRanges.find(
      (r) => r.key === "penetrationPct",
    )!;
    expect(Number(afterPen.max)).toBeLessThan(Number(beforePen.max));
    expect(Number(afterPen.min) <= Number(afterPen.max)).toBe(true);
    expect(saved.config.parameterRanges[0]).not.toBe(
      ctx.livePlan.mutatedParameterRanges![0],
    );
    expect(beforePen.max).toBe(
      catalog.find((r) => r.key === "penetrationPct")!.max,
    );

    const impossible = cloneSearchParameterRanges(catalog);
    const pen = impossible.find((r) => r.key === "penetrationPct")!;
    pen.min = 0.94;
    pen.max = 0.95;
    const skipped = applyPatternOperatorConfigToRanges(
      impossible,
      patternConfigFromPlanFields({
        patternConfigLevel: "basic",
        patternRetestMode: "required",
        patternConfirmStrength: "standard",
        patternStrength: "standard",
      }),
    );
    const skippedPen = skipped.find((r) => r.key === "penetrationPct")!;
    expect(skippedPen.max).toBe(0.95);
    expect(Number(skippedPen.min) <= Number(skippedPen.max)).toBe(true);
  });

  it("persists independent copies and reloads identical values without changing lifecycle", () => {
    const ctx = seedJob();
    const beforeStatus = ctx.job.status;
    const saved = applyStageConfig(ctx.job.id, ctx.livePlan, ctx.store)!;
    expect(saved.status).toBe(beforeStatus);
    const reloadedJob = getSearchJob(ctx.job.id, ctx.store)!;
    const reloadedPlan = getSearchPlan(ctx.job.id, ctx.store)!;
    expect(reloadedJob.status).toBe(beforeStatus);
    expect(reloadedPlan.completionReason).toBeNull();
    expect(reloadedJob.config.parameterRanges).toEqual(
      saved.config.parameterRanges,
    );
    expect(reloadedPlan.mutatedParameterRanges).toEqual(
      ctx.livePlan.mutatedParameterRanges,
    );
    expect(reloadedJob.config.parameterRanges).not.toBe(
      reloadedPlan.mutatedParameterRanges,
    );
  });

  it("recovery copies jitter/plan ranges into job.config without aliasing the plan snapshot", () => {
    const ctx = seedJob();
    const jobPath = path.join(ctx.store.rootDir!, "jobs", `${ctx.job.id}.json`);
    fs.unlinkSync(jobPath);
    const recovery = recoverMissingJobRecord(ctx.job.id, ctx.store);
    expect(recovery.recovered).toBe(true);
    const restored = getSearchJob(ctx.job.id, ctx.store)!;
    const plan = getSearchPlan(ctx.job.id, ctx.store)!;
    expect(restored.config.parameterRanges).toEqual(plan.mutatedParameterRanges);
    expect(restored.config.parameterRanges).not.toBe(plan.mutatedParameterRanges);
    expect(restored.config.parameterRanges[0]).not.toBe(
      plan.mutatedParameterRanges![0],
    );
    const originalMin = plan.mutatedParameterRanges![0]!.min;
    restored.config.parameterRanges[0]!.min = 0.01;
    saveSearchJob(restored, ctx.store);
    const planAfter = getSearchPlan(ctx.job.id, ctx.store)!;
    expect(planAfter.mutatedParameterRanges![0]!.min).toBe(originalMin);
  });
});

