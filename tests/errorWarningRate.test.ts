/**
 * P1-E5 derived errorWarningRate. Temp stores only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ERROR_RATE_MIN_EVALUATED,
  buildPersistedCheckpoint,
  calculationErrorRate,
  createEmptyJobStatistics,
  createEmptySearchPlan,
  createInitialRunnerPayload,
  createSearchJob,
  createSeededRandom,
  deriveErrorRateWarning,
  getStrategySearchJobApi,
  saveSearchPlan,
  updateSearchCheckpoint,
  type StrategySearchJobStatistics,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch";
import { buildCalculationErrorBreakdown } from "../src/lib/rextora/strategySearch/calculationErrorBreakdown";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";

const roots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p1e5-"));
  roots.push(rootDir);
  return { rootDir };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function stats(
  evaluated: number,
  errors: number,
): Pick<StrategySearchJobStatistics, "evaluated" | "errors"> {
  return { evaluated, errors };
}

function sampleConfig() {
  return {
    searchVersion: "1",
    strategyTemplateId: "p1e5",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "test",
    seed: 9,
    generatorType: "random" as const,
    maxIterations: 40,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" as const },
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

function persistStats(
  jobId: string,
  store: StrategySearchStoreOptions,
  evaluated: number,
  errors: number,
  warningRate = 0.35,
) {
  saveSearchPlan(
    jobId,
    createEmptySearchPlan({
      searchName: "p1e5",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 40,
      stageBatchSize: 8,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
      errorWarningRate: warningRate,
      errorAutoPauseRate: 0.55,
    }),
    store,
  );
  const payload = createInitialRunnerPayload({
    prng: createSeededRandom(9).getState(),
    jobStatus: "queued",
  });
  payload.statistics = {
    ...createEmptyJobStatistics(),
    evaluated,
    errors,
    failed: errors,
  };
  updateSearchCheckpoint(
    jobId,
    buildPersistedCheckpoint({
      completedIterations: evaluated,
      nextIteration: evaluated,
      payload,
      bestCandidate: null,
      bestPassedCandidate: null,
      updatedAt: "2026-08-11T00:00:00.000Z",
    }),
    store,
  );
}

describe("deriveErrorRateWarning", () => {
  it("is inactive below the 20-sample minimum even at 100% errors", () => {
    expect(ERROR_RATE_MIN_EVALUATED).toBe(20);
    const w = deriveErrorRateWarning(stats(19, 19), 0.35);
    expect(w.errorWarningActive).toBe(false);
    expect(w.errorRate).toBe(1);
    expect(w.evaluated).toBe(19);
    expect(w.errors).toBe(19);
  });

  it("activates at the exact threshold on the 20th evaluation", () => {
    const w = deriveErrorRateWarning(stats(20, 7), 0.35);
    expect(w.errorRate).toBeCloseTo(0.35);
    expect(w.errorWarningActive).toBe(true);
  });

  it("clears when later successes pull the rate below threshold", () => {
    expect(deriveErrorRateWarning(stats(20, 7), 0.35).errorWarningActive).toBe(
      true,
    );
    const cleared = deriveErrorRateWarning(stats(30, 7), 0.35);
    expect(cleared.errorRate).toBeCloseTo(7 / 30);
    expect(cleared.errorWarningActive).toBe(false);
  });

  it("treats empty/zero statistics as inactive without NaN", () => {
    const empty = deriveErrorRateWarning(null, 0.35);
    expect(empty.errorRate).toBe(0);
    expect(empty.errorWarningActive).toBe(false);
    expect(Number.isFinite(empty.errorRate)).toBe(true);
    const zeros = deriveErrorRateWarning(stats(0, 0), 0.35);
    expect(zeros.errorRate).toBe(0);
    expect(zeros.errorWarningActive).toBe(false);
  });

  it("uses live errors/evaluated, not calculationErrorRate()", () => {
    const live = deriveErrorRateWarning(stats(20, 7), 0.35);
    expect(live.errorRate).toBeCloseTo(7 / 20);
    const trials: StrategySearchTrial[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        jobId: "search_00000000-0000-4000-8000-0000000000e5",
        iteration: i,
        candidateId: `p${i}`,
        generatorType: "random" as const,
        parentCandidateIds: [],
        params: {},
        paramsHash: `ok_${i}`,
        createdAt: "2026-08-11T00:00:00.000Z",
        score: 1,
        passed: true,
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 0,
        failureReasons: [],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        jobId: "search_00000000-0000-4000-8000-0000000000e5",
        iteration: 8 + i,
        candidateId: `q${i}`,
        generatorType: "random" as const,
        parentCandidateIds: [],
        params: {},
        paramsHash: `gate_${i}`,
        createdAt: "2026-08-11T00:00:00.000Z",
        score: 0,
        passed: false,
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 0,
        failureReasons: [
          {
            code: "EVALUATION_FAILED_GATES",
            message: "candidate did not pass complete evaluation gates",
          },
        ],
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        jobId: "search_00000000-0000-4000-8000-0000000000e5",
        iteration: 13 + i,
        candidateId: `e${i}`,
        generatorType: "random" as const,
        parentCandidateIds: [],
        params: {},
        paramsHash: `invalid_${i}`,
        createdAt: "2026-08-11T00:00:00.000Z",
        score: null,
        passed: false,
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 0,
        failureReasons: [
          { code: "VALIDATION_FAILED", message: "generation failed" },
        ],
      })),
    ];
    const postHoc = calculationErrorRate(buildCalculationErrorBreakdown(trials));
    expect(postHoc).toBeCloseTo(7 / 12);
    expect(live.errorRate).not.toBeCloseTo(postHoc);
    expect(live.errorWarningActive).toBe(true);
  });
});

describe("errorWarningRate API projection", () => {
  it("projects derived warning without pausing the job", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    persistStats(job.id, store, 20, 8, 0.35);
    const detail = getStrategySearchJobApi(job.id, store);
    expect(detail.errorWarningActive).toBe(true);
    expect(detail.errorRate).toBeCloseTo(0.4);
    expect(detail.errorWarningRate).toBe(0.35);
    expect(detail.status).toBe("queued");
    expect(detail.completionReason).toBeNull();
  });

  it("stays inactive at 19/19 and activates at 20/7", () => {
    const store = tempStore();
    const below = createSearchJob(sampleConfig(), store);
    persistStats(below.id, store, 19, 19, 0.35);
    expect(getStrategySearchJobApi(below.id, store).errorWarningActive).toBe(
      false,
    );

    const at = createSearchJob(sampleConfig(), store);
    persistStats(at.id, store, 20, 7, 0.35);
    const active = getStrategySearchJobApi(at.id, store);
    expect(active.errorWarningActive).toBe(true);
    expect(active.status).toBe("queued");
  });

  it("clears after reload when the derived rate falls", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    persistStats(job.id, store, 20, 7, 0.35);
    expect(getStrategySearchJobApi(job.id, store).errorWarningActive).toBe(true);
    persistStats(job.id, store, 30, 7, 0.35);
    const reloaded = getStrategySearchJobApi(job.id, store);
    expect(reloaded.errorWarningActive).toBe(false);
    expect(reloaded.errorRate).toBeCloseTo(7 / 30);
    expect(reloaded.status).toBe("queued");
  });

  it("survives a disk reload of the same checkpoint statistics", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    persistStats(job.id, store, 20, 8, 0.35);
    const first = getStrategySearchJobApi(job.id, store);
    const second = getStrategySearchJobApi(job.id, store);
    expect(second.errorWarningActive).toBe(first.errorWarningActive);
    expect(second.errorRate).toBe(first.errorRate);
    expect(second.errorWarningRate).toBe(first.errorWarningRate);
    expect(first.errorWarningActive).toBe(true);
  });

  it("does not persist warning fields onto job JSON", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    persistStats(job.id, store, 20, 8, 0.35);
    getStrategySearchJobApi(job.id, store);
    const raw = JSON.parse(
      fs.readFileSync(path.join(store.rootDir, "jobs", `${job.id}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).not.toHaveProperty("errorWarningActive");
    expect(raw).not.toHaveProperty("errorRate");
  });
});

describe("SearchStatusCard warning presentation", () => {
  const src = fs.readFileSync(
    path.join(
      process.cwd(),
      "components/rextora/strategySearch/SearchStatusCard.tsx",
    ),
    "utf8",
  );

  it("renders a non-blocking warning without pause/failure language", () => {
    expect(src).toContain("ss-error-rate-warning");
    expect(src).toContain("계산 오류율이 경고 기준을 초과했습니다.");
    expect(src).toContain("경고이며 탐색이 일시정지되거나 실패하지 않았습니다.");
    expect(src).toContain("탐색은 계속됩니다.");
    expect(src).toContain("ss-error-status");
    expect(src).toContain("ss-counter-errors");
    const warningBlock = src.slice(
      src.indexOf("ss-error-rate-warning"),
      src.indexOf("ss-error-rate-warning") + 700,
    );
    expect(warningBlock).toContain("경고이며 탐색이 일시정지되거나 실패하지 않았습니다.");
    expect(warningBlock).not.toContain("탐색이 중지");
    expect(warningBlock).not.toContain("탐색이 실패했습니다");
  });

  it("keeps the existing error-status block and responsive grid", () => {
    expect(src).toContain("오류 상태");
    expect(src).toContain("계산 오류는 조건 탈락과 겹치지 않습니다.");
    expect(src).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-4");
    expect(src).toContain("errorWarningActive");
  });
});

describe("runner auto-pause remains independent", () => {
  it("does not teach the runner to pause at the warning rate", () => {
    const runner = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobRunner.ts"),
      "utf8",
    );
    expect(runner).not.toMatch(/errorWarningRate/);
    expect(runner).not.toMatch(/errorWarningActive/);
    expect(runner).toMatch(/errorAutoPauseRate/);
    expect(runner).toMatch(/statistics\.evaluated >= 20/);
    expect(runner).toMatch(
      /statistics\.errors \/ statistics\.evaluated >= autoPauseRate/,
    );
    expect(runner).not.toMatch(/transitionJobCooperativelyPaused[\s\S]{0,80}errorWarning/);
  });
});
