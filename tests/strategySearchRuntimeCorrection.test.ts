/**
 * Strategy Search runtime correction — focused proofs for the verified
 * OUT_OF_RANGE fatal job failure and related operator invariants.
 * Uses isolated temp storage only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  StrategySearchGenerationError,
  generateRandomCandidate,
} from "../src/lib/rextora/strategySearch/candidateGenerator";
import {
  classifyEngineError,
  isRecoverableGenerationError,
} from "../src/lib/rextora/strategySearch/engineErrorClassification";
import {
  assertCanonicalCounterInvariant,
  createEmptyJobStatistics,
  deriveCanonicalCounters,
  recordError,
  recordEvaluation,
} from "../src/lib/rextora/strategySearch/jobStatistics";
import {
  getDefaultSafeV44SearchSpace,
  normalizeCandidateParams,
  validateCandidateParams,
} from "../src/lib/rextora/strategySearch/paramSpace";
import { applySearchSpaceMutation } from "../src/lib/rextora/strategySearch/searchSpaceMutation";
import {
  SAFETY_BUDGET_CEILING,
  createEmptySearchPlan,
  replenishDeadlineBudget,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import { buildSymbolSelectionEvidence } from "../src/lib/rextora/strategySearch/symbolSelection";
import { recommendStrategyAction } from "../src/lib/rextora/results/recommendation";
import { pipelineStageUiStatus } from "../components/rextora/strategySearch/formatters";
import type { StrategySearchParameterRange } from "../src/lib/rextora/strategySearch/types";
import {
  createSearchJob,
  getSearchJob,
  markSearchJobFailed,
  markSearchJobRunning,
  resumeSearchJob,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";

const tmpRoots: string[] = [];

function isolatedStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-ss-runtime-"));
  tmpRoots.push(root);
  return { rootDir: root };
}

afterEach(() => {
  while (tmpRoots.length) {
    const root = tmpRoots.pop()!;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function floatRange(
  key: string,
  min: number,
  max: number,
  step = 0.01,
): StrategySearchParameterRange {
  return { key, min, max, step, valueType: "float", defaultValue: min };
}

describe("strategy search runtime correction", () => {
  it("raise_cost_guard never collapses cost_guard_k into an unusable point range", () => {
    let ranges = [floatRange("cost_guard_k", 3, 9, 0.01)];
    for (let i = 0; i < 30; i += 1) {
      const { ranges: next } = applySearchSpaceMutation(
        ranges,
        {
          version: 1,
          actions: [{ type: "raise_cost_guard", reasonKo: "비용" }],
          nextFamilyHint: null,
        },
        ["raise_cost_guard"],
      );
      ranges = next;
    }
    const cg = ranges.find((r) => r.key === "cost_guard_k")!;
    expect((cg.max as number) - (cg.min as number)).toBeGreaterThan(0);
    const mid = ((cg.min as number) + (cg.max as number)) / 2;
    const normalized = normalizeCandidateParams(
      { ...CONTEXT_FALLBACK_PARAMS, cost_guard_k: mid },
      ranges,
    );
    const validation = validateCandidateParams(normalized, ranges);
    expect(validation.ok).toBe(true);
  });

  it("recoverable VALIDATION_FAILED is not fatal", () => {
    const err = new StrategySearchGenerationError(
      "VALIDATION_FAILED",
      "candidate validation failed: OUT_OF_RANGE",
    );
    expect(isRecoverableGenerationError(err)).toBe(true);
    const classified = classifyEngineError(err, "candidate_generation");
    expect(classified.fatal).toBe(false);
    expect(classified.class).toBe("candidate_invalid");
  });

  it("invalid parameterRanges is CONFIGURATION_INVALID and fatal", () => {
    const err = new StrategySearchGenerationError(
      "CONFIGURATION_INVALID",
      "invalid parameterRanges: min must be <= max",
    );
    expect(isRecoverableGenerationError(err)).toBe(false);
    const classified = classifyEngineError(err, "candidate_generation");
    expect(classified.fatal).toBe(true);
    expect(classified.code).toBe("CONFIGURATION_INVALID");
  });

  it("nextInt range collapse is recoverable parameter_out_of_range", () => {
    const classified = classifyEngineError(
      new Error("nextInt minInclusive must be <= maxInclusive"),
      "candidate_generation",
    );
    expect(classified.fatal).toBe(false);
    expect(classified.class).toBe("parameter_out_of_range");
  });

  it("trial collision and invalid pause transition are non-fatal", () => {
    const trial = classifyEngineError(
      new Error(
        "strategy-search trial already exists with different contents: search_x#1",
      ),
      "persistence",
    );
    expect(trial.fatal).toBe(false);
    expect(trial.code).toBe("TRIAL_COLLISION");
    const pause = classifyEngineError(
      new Error("invalid strategy-search status transition: running → paused"),
      "job_state",
    );
    expect(pause.fatal).toBe(false);
    expect(pause.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("fatal unclassified errors remain fatal", () => {
    const classified = classifyEngineError(
      new Error("unexpected null pointer in orchestrator"),
      "orchestrator",
    );
    expect(classified.fatal).toBe(true);
    expect(classified.class).toBe("fatal_engine_error");
  });

  it("counter invariant: evaluated = qualified + rejected + evaluationErrors", () => {
    let stats = createEmptyJobStatistics();
    for (let i = 0; i < 5; i += 1) {
      stats = recordEvaluation(stats, {
        score: 1,
        passed: true,
        stressPassed: true,
        jitterPassed: true,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      stats = recordEvaluation(stats, {
        score: 0,
        passed: false,
        stressPassed: false,
        jitterPassed: false,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      stats = recordError(stats);
      stats = recordEvaluation(stats, {
        score: null,
        passed: false,
        stressPassed: false,
        jitterPassed: false,
        evaluationFailed: true,
      });
    }
    const c = deriveCanonicalCounters(stats);
    expect(c.evaluated).toBe(10);
    expect(c.qualified).toBe(5);
    expect(c.rejected).toBe(3);
    expect(c.evaluationErrors).toBe(2);
    expect(c.failed).toBe(5);
    expect(c.invariantOk).toBe(true);
    expect(() => assertCanonicalCounterInvariant(stats)).not.toThrow();
    // failed and errors overlap — not independent additive UI totals
    expect(c.rejected + c.evaluationErrors).toBe(c.failed);
  });

  it("initial soft budget differs from hard safety ceiling and replenish soft budget", () => {
    const plan = createEmptySearchPlan({
      searchName: "budget-test",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      candidateBudget: 200,
      stageBatchSize: 40,
      maxRuntimeMs: 3 * 60 * 60 * 1000,
      spaces: [
        { id: "ema_core", labelKo: "EMA" },
        { id: "rsi_pullback", labelKo: "RSI" },
      ],
    });
    expect(plan.initialCandidateBudget).toBe(200);
    expect(plan.candidateBudget).toBe(200);
    expect(SAFETY_BUDGET_CEILING).toBe(50_000);
    expect(SAFETY_BUDGET_CEILING).toBeGreaterThan(plan.candidateBudget);

    let next = plan;
    for (let i = 0; i < 20; i += 1) {
      const r = replenishDeadlineBudget({
        ...next,
        uniqueEvaluatedCount: next.candidateBudget,
        candidateBudgetUsed: next.candidateBudget,
      });
      if (!r) break;
      next = r;
    }
    expect(next.candidateBudget).toBeGreaterThan(200);
    expect(next.candidateBudget).toBeLessThanOrEqual(SAFETY_BUDGET_CEILING);
    expect(next.initialCandidateBudget).toBe(200);
  });

  it("timed plan does not stop at first PASS by default", () => {
    const plan = createEmptySearchPlan({
      searchName: "deadline",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 200,
      stageBatchSize: 40,
      maxRuntimeMs: 5_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.stopWhenQualifiedTarget).toBe(false);
  });

  it("pipeline marks active stage as failed when job failed", () => {
    expect(
      pipelineStageUiStatus({
        stageStatus: "active",
        jobStatus: "failed",
        stageIndex: 2,
        activeIndex: 2,
      }),
    ).toBe("failed");
    expect(
      pipelineStageUiStatus({
        stageStatus: "completed",
        jobStatus: "failed",
        stageIndex: 0,
        activeIndex: 2,
      }),
    ).toBe("completed");
    expect(
      pipelineStageUiStatus({
        stageStatus: "pending",
        jobStatus: "failed",
        stageIndex: 3,
        activeIndex: 2,
      }),
    ).toBe("skipped");
  });

  it("highest return without risk evidence is not recommended", () => {
    const rec = recommendStrategyAction({
      totalReturn: 0.7179,
      mdd: null,
      tradeCount: null,
      passed: true,
      paperActive: false,
      liveActive: false,
      isSafe: false,
      evaluationComplete: false,
      hasRobustnessEvidence: false,
      sourceJobOutcome: "partial_completed",
    });
    expect(rec.code).toBe("review_backtest");
    expect(rec.labelKo).toContain("추가 검증");
  });

  it("persists automatic symbol selection reason", () => {
    const evidence = buildSymbolSelectionEvidence({
      mode: "recommended",
      selectedSymbol: "ETHUSDT",
    });
    expect(evidence.selectedSymbol).toBe("BTCUSDT");
    expect(evidence.reasonKo).toContain("거래량");
    expect(evidence.liquidityStatus).toBe("충분");
    expect(evidence.dataAvailability).toBe("정상");
    expect(evidence.excludedAlternatives.length).toBeGreaterThan(0);
  });

  it("failed job can be requeued for retry without wiping store root", () => {
    const store = isolatedStore();
    const ranges = getDefaultSafeV44SearchSpace().slice(0, 3);
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "retry-test",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "binance-v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 10,
        parameterRanges: ranges,
        evaluationWindows: [
          {
            id: "full",
            label: "full",
            fromOpenTime: Date.now() - 86400000,
            toOpenTime: Date.now(),
            requiredForPass: true,
          },
        ],
      },
      store,
    );
    markSearchJobRunning(job.id, store);
    markSearchJobFailed(
      job.id,
      "candidate validation failed: OUT_OF_RANGE",
      store,
    );
    const failed = getSearchJob(job.id, store)!;
    expect(failed.status).toBe("failed");
    const resumed = resumeSearchJob(job.id, store);
    expect(resumed.status).toBe("queued");
    expect(resumed.failureMessage).toBeNull();
  });

  it("degenerate float range from production failure snapshot becomes generatable", () => {
    const ranges: StrategySearchParameterRange[] = [
      {
        key: "cost_guard_k",
        min: 9.018752238980076,
        max: 9.018752238980076,
        step: 0.01,
        valueType: "float",
        defaultValue: 9.018752238980076,
      },
      ...getDefaultSafeV44SearchSpace().filter((r) => r.key !== "cost_guard_k"),
    ];
    // Mutation sanitize expands collapsed domain.
    const { ranges: repaired } = applySearchSpaceMutation(
      ranges,
      { version: 1, actions: [], nextFamilyHint: null },
      ["continue_runtime"],
    );
    const random = createSeededRandom(7);
    const candidate = generateRandomCandidate({
      jobId: "search_00000000-0000-4000-8000-000000000001",
      iteration: 0,
      searchVersion: "1",
      parameterRanges: repaired,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      random,
    });
    expect(candidate.paramsHash).toMatch(/^[a-f0-9]+$/i);
  });

  it("retired SAFE params hash remains a historical identity token only", () => {
    expect("7893ca3f0e30").toHaveLength(12);
    const safePath = path.join(
      process.cwd(),
      "data",
      "strategies",
      "SAFE_v44_i4060.json",
    );
    expect(fs.existsSync(safePath)).toBe(false);
  });
});
