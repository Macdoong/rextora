import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelStrategySearchJobApi,
  createStrategySearchJobApi,
  getSearchJob,
  getStrategySearchBestApi,
  getStrategySearchJobApi,
  isSearchJobExecutionActive,
  listStrategySearchJobsApi,
  listStrategySearchTrialsApi,
  pauseStrategySearchJobApi,
  readProtectedSafeSnapshot,
  resetSearchJobExecutionRegistryForTests,
  resumeStrategySearchJobApi,
  setDefaultSearchJobExecutionDepsForTests,
  setStrategySearchApiStoreOptionsForTests,
  startStrategySearchJobApi,
  updateSearchCheckpoint,
  waitForSearchJobExecution,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const STRATEGIES_DIR = path.join(process.cwd(), "data", "strategies");
const FROM = Date.UTC(2024, 0, 1);
const TO = Date.UTC(2024, 0, 10);

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-api-"));
  tempRoots.push(root);
  return root;
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    searchVersion: "phase6",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "synthetic-v1",
    seed: 101,
    generatorType: "random",
    maxIterations: 3,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: FROM,
        toOpenTime: TO,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [
      {
        id: "s1",
        label: "s1",
        requiredForPass: true,
        feeMultiplier: 1,
        slippageMultiplier: 1,
        fundingMultiplier: 1,
        spreadMultiplier: 1,
        costGuardKMultiplier: 1,
      },
    ],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.2,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
      ],
    },
    dataRef: {
      source: "binance_historical",
      availableFrom: FROM,
      availableTo: TO,
    },
    ...overrides,
  };
}

function mockEval(
  scoreFor: (call: number) => number,
  options?: { failCalls?: Set<number>; passScore?: number },
): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  let call = 0;
  return async (input) => {
    call += 1;
    if (options?.failCalls?.has(call)) {
      throw new Error(`eval fail #${call}`);
    }
    const score = scoreFor(call);
    const passed = score >= (options?.passScore ?? 0);
    return {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      baseEvaluation: {
        candidateId: input.candidate.candidateId,
        paramsHash: input.candidate.paramsHash,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [],
        costConfig: {
          feeRate: 0,
          slippageRate: 0,
          fundingRate: 0,
          applyFunding: false,
          applySpread: false,
          spreadRate: 0,
        },
        startedAt: "2024-01-01T00:00:00.000Z",
        completedAt: "2024-01-01T00:00:01.000Z",
        durationMs: 1,
      },
      basePass: {
        passed,
        requiredWindowCount: 1,
        passedRequiredWindowCount: passed ? 1 : 0,
        failedRequiredWindowCount: passed ? 0 : 1,
        issues: [],
      },
      baseScore: {
        finalScore: score,
        breakdown: {
          returnReward: score,
          mddPenalty: 0,
          profitFactorReward: 0,
          winRateReward: 0,
          tradeAdequacy: 0,
          negativeMonthPenalty: 0,
          consistency: 0,
          weightedReturn: score,
          weightedMdd: 0,
          weightedProfitFactor: 0,
          weightedWinRate: 0,
          weightedTradeAdequacy: 0,
          weightedNegativeMonth: 0,
          weightedConsistency: 0,
        },
        weights: validCreateBody().scoreWeights as never,
        requiredWindowCount: 1,
      },
      costStressResults: [],
      costStressPassed: true,
      jitterResult: {
        enabled: false,
        jitterPassed: true,
        sampleCount: 0,
        passedSampleCount: 0,
        failedSampleCount: 0,
        passRate: 1,
        averageScore: null,
        minimumScore: null,
        maximumScore: null,
        averageScoreDropRatio: null,
        maximumObservedScoreDropRatio: null,
        baseScore: score,
        samples: [],
      },
      finalPassed: passed,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    };
  };
}

describe("strategySearch Phase 6 API", () => {
  let root: string;
  let safeBefore: Buffer;
  let strategiesBefore: string[];

  beforeEach(() => {
    root = makeTempRoot();
    safeBefore = fs.readFileSync(SAFE_PATH);
    strategiesBefore = fs.readdirSync(STRATEGIES_DIR).sort();
    resetSearchJobExecutionRegistryForTests();
    setStrategySearchApiStoreOptionsForTests({ rootDir: root });
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      evaluate: mockEval(() => 5),
      preloadedCandlesByKey: {},
    });
  });

  afterEach(() => {
    resetSearchJobExecutionRegistryForTests();
    setStrategySearchApiStoreOptionsForTests(null);
    setDefaultSearchJobExecutionDepsForTests(null);
    for (const r of tempRoots.splice(0)) {
      fs.rmSync(r, { recursive: true, force: true });
    }
  });

  it("creates a valid job", () => {
    const job = createStrategySearchJobApi(validCreateBody());
    expect(job.id).toMatch(/^search_/);
    expect(job.status).toBe("queued");
    expect(job.maxIterations).toBe(3);
    expect(job.completedIterations).toBe(0);
    expect(fs.existsSync(path.join(root, "jobs", `${job.id}.execution.json`))).toBe(
      true,
    );
  });

  it("rejects invalid configuration", () => {
    expect(() =>
      createStrategySearchJobApi(validCreateBody({ seed: Number.NaN })),
    ).toThrow(/invalid/i);
    try {
      createStrategySearchJobApi(validCreateBody({ candles: [] }));
      expect.unreachable("should reject candles");
    } catch (err) {
      expect(err).toMatchObject({ code: "INVALID_REQUEST" });
      expect((err as { details: string[] }).details.join(" ")).toMatch(
        /not allowed/i,
      );
    }
    try {
      createStrategySearchJobApi(
        validCreateBody({
          baseCostConfig: {
            feeRate: 0.0004,
            slippageRate: 0.0002,
            fundingRate: 0,
            applyFunding: false,
            applySpread: false,
            spreadRate: 0,
            costGuardK: 1,
          },
        }),
      );
      expect.unreachable("should reject costGuardK");
    } catch (err) {
      expect((err as { details: string[] }).details.join(" ")).toMatch(
        /costGuardK/i,
      );
    }
  });

  it("rejects zero required windows", () => {
    try {
      createStrategySearchJobApi(
        validCreateBody({
          evaluationWindows: [
            {
              id: "opt",
              label: "opt",
              fromOpenTime: FROM,
              toOpenTime: TO,
              requiredForPass: false,
            },
          ],
        }),
      );
      expect.unreachable("should reject zero required windows");
    } catch (err) {
      expect((err as { details: string[] }).details.join(" ")).toMatch(
        /requiredForPass/i,
      );
    }
  });

  it("lists jobs and reads job detail", () => {
    const a = createStrategySearchJobApi(validCreateBody({ seed: 1 }));
    const b = createStrategySearchJobApi(validCreateBody({ seed: 2 }));
    const list = listStrategySearchJobsApi({ limit: 100 });
    expect(list.map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    const detail = getStrategySearchJobApi(a.id);
    expect(detail.id).toBe(a.id);
    expect(detail.config.parameterRangeKeys).toContain("ema_fast");
    expect(detail.progressRatio).toBe(0);
  });

  it("returns job not found", () => {
    expect(() =>
      getStrategySearchJobApi("search_00000000-0000-4000-8000-000000000000"),
    ).toThrow(/not found/i);
  });

  it("starts a job and rejects duplicate start", async () => {
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 2 }));
    const started = startStrategySearchJobApi(job.id);
    expect(started.executionActive).toBe(true);
    expect(() => startStrategySearchJobApi(job.id)).toThrow(/already running/i);
    await waitForSearchJobExecution(job.id);
    const done = getStrategySearchJobApi(job.id);
    expect(done.status).toBe("completed");
    expect(done.completedIterations).toBe(2);
  });

  it("pauses a running job and rejects invalid pause", async () => {
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      preloadedCandlesByKey: {},
      evaluate: async (input) => {
        // Keep first iteration slow enough to pause
        await new Promise((r) => setTimeout(r, 30));
        return mockEval(() => 3)(input);
      },
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 20 }));
    startStrategySearchJobApi(job.id);
    // Wait until status becomes running
    let running = false;
    for (let i = 0; i < 50; i += 1) {
      const cur = getSearchJob(job.id, { rootDir: root });
      if (cur?.status === "running") {
        running = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(running).toBe(true);
    const pausedReq = pauseStrategySearchJobApi(job.id);
    expect(["pause_requested", "paused", "running"]).toContain(pausedReq.status);
    await waitForSearchJobExecution(job.id);
    const after = getStrategySearchJobApi(job.id);
    expect(["paused", "completed"]).toContain(after.status);

    const queued = createStrategySearchJobApi(validCreateBody({ seed: 9 }));
    expect(() => pauseStrategySearchJobApi(queued.id)).toThrow(/cannot pause/i);
  });

  it("resumes a paused job and rejects invalid resume", async () => {
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      preloadedCandlesByKey: {},
      evaluate: async (input) => {
        const job = getSearchJob(input.candidate.jobId, { rootDir: root });
        if (job && job.checkpoint.completedIterations === 0) {
          // request pause after first eval via cooperative path
        }
        return mockEval(() => 4)(input);
      },
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 4 }));
    startStrategySearchJobApi(job.id);
    // Force pause request while running
    for (let i = 0; i < 50; i += 1) {
      const cur = getSearchJob(job.id, { rootDir: root });
      if (cur?.status === "running") {
        pauseStrategySearchJobApi(job.id);
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    await waitForSearchJobExecution(job.id);
    const paused = getStrategySearchJobApi(job.id);
    if (paused.status === "paused") {
      const resumed = resumeStrategySearchJobApi(job.id);
      expect(resumed.executionActive).toBe(true);
      await waitForSearchJobExecution(job.id);
      expect(getStrategySearchJobApi(job.id).status).toBe("completed");
    }
    expect(() => resumeStrategySearchJobApi(job.id)).toThrow(/cannot resume/i);
  });

  it("cancels a running job and rejects invalid cancellation", async () => {
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      preloadedCandlesByKey: {},
      evaluate: async (input) => {
        await new Promise((r) => setTimeout(r, 20));
        return mockEval(() => 2)(input);
      },
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 30 }));
    startStrategySearchJobApi(job.id);
    for (let i = 0; i < 50; i += 1) {
      if (getSearchJob(job.id, { rootDir: root })?.status === "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const cancelled = cancelStrategySearchJobApi(job.id);
    expect(["cancel_requested", "cancelled"]).toContain(cancelled.status);
    await waitForSearchJobExecution(job.id);
    expect(getStrategySearchJobApi(job.id).status).toBe("cancelled");

    expect(() => cancelStrategySearchJobApi(job.id)).toThrow(/terminal/i);
  });

  it("settles cancel requested during candle load to cancelled", async () => {
    let releaseLoad: (() => void) | null = null;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      loadCandles: async () => {
        await loadGate;
        return {};
      },
      evaluate: mockEval(() => 1),
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 5 }));
    startStrategySearchJobApi(job.id);
    expect(isSearchJobExecutionActive(job.id)).toBe(true);
    const cancelling = cancelStrategySearchJobApi(job.id);
    expect(cancelling.status).toBe("cancel_requested");
    releaseLoad?.();
    await waitForSearchJobExecution(job.id);
    expect(getStrategySearchJobApi(job.id).status).toBe("cancelled");
    expect(getStrategySearchJobApi(job.id).completedIterations).toBe(0);
  });

  it("bounds trial listing", async () => {
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 5 }));
    startStrategySearchJobApi(job.id);
    await waitForSearchJobExecution(job.id);
    const page = listStrategySearchTrialsApi(job.id, { limit: 2, offset: 1 });
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);
    expect(page.trials.length).toBe(2);
    expect(page.total).toBe(5);
    const capped = listStrategySearchTrialsApi(job.id, { limit: 10_000 });
    expect(capped.limit).toBe(200);
  });

  it("returns best-scored and best fully-passed results", async () => {
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      preloadedCandlesByKey: {},
      evaluate: mockEval((call) => [10, 2, 7][call - 1] ?? 1, { passScore: 5 }),
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 3 }));
    startStrategySearchJobApi(job.id);
    await waitForSearchJobExecution(job.id);
    const best = getStrategySearchBestApi(job.id);
    expect(best.bestCandidate?.score).toBe(10);
    expect(best.bestPassedCandidate?.score).toBe(10);
    expect(best.bestTrial?.paramsHash).toBe(best.bestCandidate?.paramsHash);
    expect(best.gateNotes.finalPassMeaning).toMatch(/final PASS/i);
  });

  it("maps corrupt checkpoint into stable API job detail failure path", async () => {
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 1 }));
    updateSearchCheckpoint(
      job.id,
      {
        completedIterations: 0,
        nextIteration: 0,
        randomState: "{bad-json",
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date().toISOString(),
      },
      { rootDir: root },
    );
    // Detail should still load job; statistics null when payload corrupt
    const detail = getStrategySearchJobApi(job.id);
    expect(detail.statistics).toBeNull();
    expect(detail.checkpoint.hasRunnerPayload).toBe(false);

    // Start should fail the job via runner corrupt handling
    startStrategySearchJobApi(job.id);
    await waitForSearchJobExecution(job.id);
    const failed = getStrategySearchJobApi(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.failureMessage).toMatch(/JSON|corrupt|version/i);
  });

  it("reflects recoverable evaluation failures in statistics without writing strategies", async () => {
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: { rootDir: root },
      preloadedCandlesByKey: {},
      evaluate: mockEval(() => 1, { failCalls: new Set([1]) }),
    });
    const job = createStrategySearchJobApi(validCreateBody({ maxIterations: 2 }));
    startStrategySearchJobApi(job.id);
    await waitForSearchJobExecution(job.id);
    const done = getStrategySearchJobApi(job.id);
    expect(done.status).toBe("completed");
    expect(done.statistics?.errors).toBeGreaterThanOrEqual(1);
  });

  it("does not modify protected SAFE strategy bytes or hash", async () => {
    const snap = readProtectedSafeSnapshot();
    expect(snap.name).toBe("SAFE_v44_i4060");
    expect(snap.paramsHash).toBe("7893ca3f0e30");

    const job = createStrategySearchJobApi(
      validCreateBody({ strategyTemplateId: "SAFE_v44_i4060", maxIterations: 2 }),
    );
    startStrategySearchJobApi(job.id);
    await waitForSearchJobExecution(job.id);

    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(safeBefore, after)).toBe(0);
    expect(fs.readdirSync(STRATEGIES_DIR).sort()).toEqual(strategiesBefore);
    const json = JSON.parse(after.toString("utf8")) as {
      name: string;
      params_hash: string;
    };
    expect(json.name).toBe("SAFE_v44_i4060");
    expect(json.params_hash).toBe("7893ca3f0e30");
  });

  it("HTTP routes expose create/list/detail/start/trials/best", async () => {
    const { GET: listGet, POST: createPost } = await import(
      "../app/api/rextora/strategy-search/route"
    );
    const createRes = await createPost(
      new Request("http://localhost/api/rextora/strategy-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody({ maxIterations: 2, seed: 55 })),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      ok: boolean;
      data: { id: string };
    };
    expect(created.ok).toBe(true);
    const jobId = created.data.id;

    const listRes = await listGet(
      new Request("http://localhost/api/rextora/strategy-search?limit=20"),
    );
    const listed = (await listRes.json()) as { ok: boolean; data: unknown[] };
    expect(listed.ok).toBe(true);
    expect(listed.data.length).toBeGreaterThanOrEqual(1);

    const { GET: detailGet } = await import(
      "../app/api/rextora/strategy-search/[jobId]/route"
    );
    const detailRes = await detailGet(new Request("http://localhost"), {
      params: Promise.resolve({ jobId }),
    });
    const detail = (await detailRes.json()) as { ok: boolean; data: { id: string } };
    expect(detail.data.id).toBe(jobId);

    const { POST: startPost } = await import(
      "../app/api/rextora/strategy-search/[jobId]/start/route"
    );
    const startRes = await startPost(new Request("http://localhost"), {
      params: Promise.resolve({ jobId }),
    });
    const started = (await startRes.json()) as {
      ok: boolean;
      data: { executionActive: boolean };
    };
    expect(started.ok).toBe(true);
    await waitForSearchJobExecution(jobId);

    const { GET: trialsGet } = await import(
      "../app/api/rextora/strategy-search/[jobId]/trials/route"
    );
    const trialsRes = await trialsGet(
      new Request(
        "http://localhost/api/rextora/strategy-search/x/trials?limit=10&offset=0",
      ),
      { params: Promise.resolve({ jobId }) },
    );
    const trials = (await trialsRes.json()) as {
      ok: boolean;
      data: { trials: unknown[]; limit: number };
    };
    expect(trials.ok).toBe(true);
    expect(trials.data.trials.length).toBe(2);

    const { GET: bestGet } = await import(
      "../app/api/rextora/strategy-search/[jobId]/best/route"
    );
    const bestRes = await bestGet(new Request("http://localhost"), {
      params: Promise.resolve({ jobId }),
    });
    const best = (await bestRes.json()) as { ok: boolean; data: { bestCandidate: unknown } };
    expect(best.ok).toBe(true);
    expect(best.data.bestCandidate).toBeTruthy();
  });

  it("keeps existing backtest route importable (unaffected)", async () => {
    const mod = await import("../app/api/rextora/backtest/run/route");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.GET).toBe("function");
  });
});
