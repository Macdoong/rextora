/**
 * P1-E4 diagnosis only. Does not change production runner behavior.
 * Temp stores only — no production strategy-search data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyJobStatistics,
  createEmptySearchPlan,
  createSearchJob,
  getSearchPlan,
  recordError,
  recordEvaluation,
  saveSearchPlan,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1e4-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function tinyConfig() {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1e4",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test",
    seed: 1,
    generatorType: "random" as const,
    maxIterations: 4,
    parameterRanges: [
      {
        key: "ema_fast",
        min: 12,
        max: 12,
        step: 1,
        valueType: "integer" as const,
      },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: { minTradeCount: 1 },
    costStress: { enabled: false, multipliers: [] as number[] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

describe("errorWarningRate diagnosis (P1-E4)", () => {
  it("defaults to 0.35 and persists on the plan only", () => {
    const store = tempStore();
    const job = createSearchJob(tinyConfig(), store);
    const plan = createEmptySearchPlan({
      searchName: "p1e4",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 8,
      stageBatchSize: 4,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.errorWarningRate).toBe(0.35);
    expect(plan.errorAutoPauseRate).toBe(0.55);
    saveSearchPlan(job.id, plan, store);
    const loaded = getSearchPlan(job.id, store)!;
    expect(loaded.errorWarningRate).toBe(0.35);
    expect(job.config).not.toHaveProperty("errorWarningRate");
  });

  it("is not consumed by the runner or orchestrator; sibling auto-pause is", () => {
    const runner = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobRunner.ts"),
      "utf8",
    );
    const orch = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    const api = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(runner).not.toMatch(/errorWarningRate/);
    expect(orch).not.toMatch(/errorWarningRate/);
    expect(runner).toMatch(/errorAutoPauseRate/);
    expect(runner).toMatch(/statistics\.evaluated >= 20/);
    expect(runner).toMatch(
      /statistics\.errors \/ statistics\.evaluated >= autoPauseRate/,
    );
    expect(api).toMatch(/errorWarningRate: validated\.operatorPlan\.errorWarningRate/);
    const summarizeIdx = api.indexOf("function summarizeJob");
    const createIdx = api.indexOf("errorWarningRate: validated.operatorPlan");
    expect(summarizeIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(summarizeIdx);
  });

  it("current error-rate statistics count calculation errors over evaluated attempts", () => {
    let stats = createEmptyJobStatistics();
    stats = recordEvaluation(stats, {
      score: 1,
      passed: true,
      stressPassed: false,
      jitterPassed: false,
    });
    stats = recordEvaluation(stats, {
      score: 0,
      passed: false,
      stressPassed: false,
      jitterPassed: false,
    });
    stats = recordError(stats);
    stats = recordEvaluation(stats, {
      score: null,
      passed: false,
      stressPassed: false,
      jitterPassed: false,
      evaluationFailed: true,
    });
    expect(stats.evaluated).toBe(3);
    expect(stats.errors).toBe(1);
    expect(stats.passed).toBe(1);
    expect(stats.failed).toBe(2);
    expect(stats.errors / stats.evaluated).toBeCloseTo(1 / 3);
    expect(stats.errors / stats.evaluated >= 0.35).toBe(false);
    expect(stats.evaluated >= 20).toBe(false);
  });
});
