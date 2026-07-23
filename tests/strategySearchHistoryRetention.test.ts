import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT,
  classifyJobForRetention,
  clampHistoryRetentionLimit,
  compareJobsNewestFirst,
  createEmptySearchPlan,
  createSearchJob,
  createStrategySearchCandidateId,
  createStrategySearchJobApi,
  deleteSearchJob,
  deleteStrategySearchJobApi,
  descriptionReferencesSearchJob,
  enforceHistoryRetention,
  getSearchJob,
  listSearchJobs,
  listStrategySearchJobsApi,
  markSearchJobCancelled,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobPaused,
  markSearchJobRunning,
  normalizeJobStatusForRetention,
  requestCancelSearchJob,
  requestPauseSearchJob,
  saveJobExecutionProfile,
  saveSearchPlan,
  saveSearchTrial,
  type StrategySearchConfig,
  type StrategySearchTrial,
} from "../src/lib/rextora/strategySearch";
import { getJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { getSearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { getStrategyById, listStrategies } from "../src/lib/rextora/strategy/strategyStore";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const FROM = Date.UTC(2024, 0, 1);
const TO = Date.UTC(2024, 0, 10);

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-ss-retention-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 40, step: 1 }],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: FROM,
        toOpenTime: TO,
      },
    ],
    passCriteria: {
      minTradeCount: 1,
      requireAllWindowsPass: true,
    },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function sampleExecution() {
  return {
    version: 1 as const,
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 1 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.2,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" as const },
      ],
    },
    dataRef: {
      availableFrom: FROM,
      availableTo: TO,
      source: "preloaded" as const,
    },
  };
}

function sampleTrial(jobId: string, iteration: number): StrategySearchTrial {
  return {
    jobId,
    iteration,
    candidateId: createStrategySearchCandidateId(jobId, iteration),
    params: { ema_fast: 20 },
    paramsHash: `hash_${iteration}`,
    generatorType: "random",
    parentCandidateIds: [],
    score: 1.25,
    passed: true,
    failureReasons: [],
    windowResults: [{ windowId: "w1", totalReturn: 0.1 }],
    costStressResults: [],
    jitterResults: [],
    durationMs: 12,
    createdAt: new Date().toISOString(),
  };
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

function stampCreatedAt(root: string, jobId: string, createdAt: string): void {
  const jobPath = path.join(root, "jobs", `${jobId}.json`);
  const raw = JSON.parse(fs.readFileSync(jobPath, "utf8")) as {
    createdAt: string;
    updatedAt: string;
  };
  raw.createdAt = createdAt;
  fs.writeFileSync(jobPath, JSON.stringify(raw, null, 2), "utf8");

  const indexPath = path.join(root, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
    jobs: Array<{ id: string; createdAt: string }>;
  };
  index.jobs = index.jobs.map((row) =>
    row.id === jobId ? { ...row, createdAt } : row,
  );
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
}

function seedTerminalJob(
  root: string,
  createdAt: string,
  status: "completed" | "cancelled" | "failed" = "completed",
): string {
  const opts = { rootDir: root };
  const job = createSearchJob(sampleConfig(), opts);
  markSearchJobRunning(job.id, opts);
  if (status === "completed") {
    markSearchJobCompleted(job.id, opts);
  } else if (status === "failed") {
    markSearchJobFailed(job.id, "boom", opts);
  } else {
    requestCancelSearchJob(job.id, opts);
    markSearchJobCancelled(job.id, opts);
  }

  stampCreatedAt(root, job.id, createdAt);
  saveJobExecutionProfile(job.id, sampleExecution(), opts);
  saveSearchPlan(
    job.id,
    {
      ...createEmptySearchPlan({
        searchName: "retention-test",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 50,
        stageBatchSize: 10,
        maxRuntimeMs: null,
        spaces: [
          { id: "ema_core", labelKo: "EMA 추세" },
          { id: "rsi_pullback", labelKo: "RSI 되돌림" },
        ],
      }),
      completionReason: "MAX_CANDIDATE_BUDGET",
      spaces: [
        {
          id: "ema_core",
          labelKo: "EMA 추세",
          status: "completed",
          uniqueEvaluated: 1,
        },
        {
          id: "rsi_pullback",
          labelKo: "RSI 되돌림",
          status: "skipped",
          uniqueEvaluated: 0,
        },
      ],
    },
    opts,
  );
  saveSearchTrial(sampleTrial(job.id, 0), opts);
  return job.id;
}

describe("strategy search history retention", () => {
  it("clamps retention bounds", () => {
    expect(clampHistoryRetentionLimit(undefined)).toBe(
      STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT,
    );
    expect(clampHistoryRetentionLimit(5)).toBe(10);
    expect(clampHistoryRetentionLimit(1000)).toBe(100);
    expect(clampHistoryRetentionLimit(20)).toBe(20);
  });

  it("maps legacy terminal states safely", () => {
    expect(normalizeJobStatusForRetention("COMPLETED")).toBe("completed");
    expect(normalizeJobStatusForRetention("CANCELLED")).toBe("cancelled");
    expect(normalizeJobStatusForRetention("FAILED")).toBe("failed");
    expect(normalizeJobStatusForRetention("CANCELLING")).toBe(
      "cancel_requested",
    );
  });

  it("does nothing when fewer than 20 eligible jobs", () => {
    const root = makeTempRoot();
    for (let i = 0; i < 5; i++) {
      seedTerminalJob(
        root,
        `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      );
    }
    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).toEqual([]);
    expect(listSearchJobs({ rootDir: root })).toHaveLength(5);
  });

  it("does nothing when exactly 20 eligible jobs", () => {
    const root = makeTempRoot();
    for (let i = 0; i < 20; i++) {
      seedTerminalJob(
        root,
        `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      );
    }
    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).toEqual([]);
    expect(listSearchJobs({ rootDir: root })).toHaveLength(20);
  });

  it("deletes oldest eligible when 21 terminal jobs exist", () => {
    const root = makeTempRoot();
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      ids.push(
        seedTerminalJob(
          root,
          `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    const oldest = ids[0]!;
    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).toEqual([oldest]);
    const remaining = listSearchJobs({ rootDir: root }).map((j) => j.id);
    expect(remaining).toHaveLength(20);
    expect(remaining).not.toContain(oldest);
    expect(remaining).toContain(ids[20]!);
  });

  it("retains newest 20 eligible jobs", () => {
    const root = makeTempRoot();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      ids.push(
        seedTerminalJob(
          root,
          `2026-02-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    const remaining = new Set(
      listSearchJobs({ rootDir: root }).map((j) => j.id),
    );
    expect(remaining.size).toBe(20);
    for (let i = 5; i < 25; i++) expect(remaining.has(ids[i]!)).toBe(true);
    for (let i = 0; i < 5; i++) expect(remaining.has(ids[i]!)).toBe(false);
  });

  it("never deletes active, paused, or cancel-requested jobs", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    for (let i = 0; i < 20; i++) {
      seedTerminalJob(
        root,
        `2026-03-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      );
    }
    const active = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(active.id, opts);

    const paused = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(paused.id, opts);
    requestPauseSearchJob(paused.id, opts);
    markSearchJobPaused(paused.id, opts);

    const cancelling = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(cancelling.id, opts);
    requestCancelSearchJob(cancelling.id, opts);

    seedTerminalJob(root, "2026-03-01T01:00:00.000Z");

    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).not.toContain(active.id);
    expect(result.deletedJobIds).not.toContain(paused.id);
    expect(result.deletedJobIds).not.toContain(cancelling.id);
    expect(getSearchJob(active.id, opts)?.status).toBe("running");
    expect(getSearchJob(paused.id, opts)?.status).toBe("paused");
    expect(getSearchJob(cancelling.id, opts)?.status).toBe("cancel_requested");
    expect(classifyJobForRetention(active, opts).eligible).toBe(false);
  });

  it("protects jobs referenced by registered strategies", () => {
    const root = makeTempRoot();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(
        seedTerminalJob(
          root,
          `2026-04-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    const protectedId = ids[0]!;
    const plan = getSearchPlan(protectedId, { rootDir: root })!;
    saveSearchPlan(
      protectedId,
      {
        ...plan,
        promotions: [
          {
            paramsHash: "abc",
            iteration: 0,
            status: "promoted",
            strategyId: SAFE_STRATEGY_ID,
            strategyName: "SAFE",
            error: null,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      { rootDir: root },
    );

    seedTerminalJob(root, "2026-04-01T02:00:00.000Z");
    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).not.toContain(protectedId);
    expect(getSearchJob(protectedId, { rootDir: root })).not.toBeNull();
    expect(getStrategyById(SAFE_STRATEGY_ID)?.id).toBe(SAFE_STRATEGY_ID);
  });

  it("deletes job-owned trials, checkpoint job file, execution, plan, and index entry", () => {
    const root = makeTempRoot();
    const keep: string[] = [];
    for (let i = 0; i < 20; i++) {
      keep.push(
        seedTerminalJob(
          root,
          `2026-05-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    const victim = seedTerminalJob(root, "2026-04-30T00:00:00.000Z");
    const unrelated = keep[19]!;

    expect(fs.existsSync(path.join(root, "jobs", `${victim}.json`))).toBe(true);
    expect(
      fs.existsSync(path.join(root, "jobs", `${victim}.execution.json`)),
    ).toBe(true);
    expect(fs.existsSync(path.join(root, "jobs", `${victim}.plan.json`))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(root, "trials", victim, "00000000.json")),
    ).toBe(true);

    enforceHistoryRetention({ rootDir: root, maxRetained: 20 });

    expect(fs.existsSync(path.join(root, "jobs", `${victim}.json`))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(root, "jobs", `${victim}.execution.json`)),
    ).toBe(false);
    expect(fs.existsSync(path.join(root, "jobs", `${victim}.plan.json`))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(root, "trials", victim))).toBe(false);

    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    ) as { jobs: Array<{ id: string }> };
    expect(index.jobs.some((j) => j.id === victim)).toBe(false);
    expect(Array.isArray(index.jobs)).toBe(true);

    expect(fs.existsSync(path.join(root, "jobs", `${unrelated}.json`))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(root, "jobs", `${unrelated}.execution.json`)),
    ).toBe(true);
    expect(
      getJobExecutionProfile(unrelated, { rootDir: root }),
    ).not.toBeNull();
  });

  it("uses deterministic id tie-breaker for identical timestamps", () => {
    const root = makeTempRoot();
    const stamp = "2026-06-01T00:00:00.000Z";
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      ids.push(seedTerminalJob(root, stamp));
    }
    const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const result = enforceHistoryRetention({ rootDir: root, maxRetained: 20 });
    expect(result.deletedJobIds).toEqual([sorted[0]!]);
  });

  it("runs cleanup after successful create and not after failed create", () => {
    const root = makeTempRoot();
    for (let i = 0; i < 21; i++) {
      seedTerminalJob(
        root,
        `2026-07-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      );
    }
    const oldest = [...listSearchJobs({ rootDir: root })].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )[0]!;

    const created = createStrategySearchJobApi(validCreateBody(), {
      rootDir: root,
    });
    expect(created.id).toBeTruthy();
    expect(getSearchJob(oldest.id, { rootDir: root })).toBeNull();
    expect(getSearchJob(created.id, { rootDir: root })).not.toBeNull();

    const before = listSearchJobs({ rootDir: root }).length;
    expect(() =>
      createStrategySearchJobApi({ bogus: true }, { rootDir: root }),
    ).toThrow();
    expect(listSearchJobs({ rootDir: root })).toHaveLength(before);
  });

  it("cleanup failure does not corrupt the job index", () => {
    const root = makeTempRoot();
    for (let i = 0; i < 21; i++) {
      seedTerminalJob(
        root,
        `2026-08-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      );
    }
    const result = enforceHistoryRetention({
      rootDir: root,
      maxRetained: 20,
      deleteJobForTests: () => {
        throw new Error("simulated delete failure");
      },
    });
    expect(result.warnings.some((w) => w.includes("simulated delete"))).toBe(
      true,
    );
    const indexRaw = fs.readFileSync(path.join(root, "index.json"), "utf8");
    const parsed = JSON.parse(indexRaw) as { jobs: unknown[] };
    expect(Array.isArray(parsed.jobs)).toBe(true);
    expect(parsed.jobs).toHaveLength(21);
  });

  it("history API returns newest first and defaults to visible limit 20", () => {
    const root = makeTempRoot();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      ids.push(
        seedTerminalJob(
          root,
          `2026-09-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    // Keep all on disk for this visibility test (skip storage prune).
    const listed = listStrategySearchJobsApi({ rootDir: root });
    expect(listed).toHaveLength(20);
    expect(listed[0]?.id).toBe(ids[24]!);
    expect(listed[19]?.id).toBe(ids[5]!);
    const page2 = listStrategySearchJobsApi({
      rootDir: root,
      limit: 20,
      offset: 20,
    });
    expect(page2.length).toBe(5);
    expect(page2[0]?.id).toBe(ids[4]!);
  });

  it("legacy description matching requires exact job= token", () => {
    const id = "search_11111111-1111-1111-1111-111111111111";
    expect(
      descriptionReferencesSearchJob(`전략 탐색 · 출처 job=${id} · ok`, id),
    ).toBe(true);
    expect(
      descriptionReferencesSearchJob(`unrelated job note about ${id}`, id),
    ).toBe(false);
    expect(
      descriptionReferencesSearchJob(`job=${id}extra`, id),
    ).toBe(false);
  });

  it("manual delete allows terminal eligible and rejects active/protected", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const terminal = seedTerminalJob(root, "2026-09-10T00:00:00.000Z");
    const active = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(active.id, opts);
    const paused = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(paused.id, opts);
    requestPauseSearchJob(paused.id, opts);
    markSearchJobPaused(paused.id, opts);
    const cancelling = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(cancelling.id, opts);
    requestCancelSearchJob(cancelling.id, opts);

    const protectedId = seedTerminalJob(root, "2026-09-09T00:00:00.000Z");
    const plan = getSearchPlan(protectedId, opts)!;
    saveSearchPlan(
      protectedId,
      {
        ...plan,
        promotions: [
          {
            paramsHash: "abc",
            iteration: 0,
            status: "promoted",
            strategyId: SAFE_STRATEGY_ID,
            strategyName: "SAFE",
            error: null,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      opts,
    );

    expect(deleteStrategySearchJobApi(terminal, opts)).toEqual({
      deleted: true,
      jobId: terminal,
    });
    expect(getSearchJob(terminal, opts)).toBeNull();

    expect(() => deleteStrategySearchJobApi(active.id, opts)).toThrow(
      /실행 중|대기 중/,
    );
    expect(() => deleteStrategySearchJobApi(paused.id, opts)).toThrow(
      /실행 중|대기 중/,
    );
    expect(() => deleteStrategySearchJobApi(cancelling.id, opts)).toThrow(
      /실행 중|대기 중/,
    );
    expect(() => deleteStrategySearchJobApi(protectedId, opts)).toThrow(
      /출처 기록/,
    );
    expect(getSearchJob(protectedId, opts)).not.toBeNull();
  });

  it("SAFE and Strategy Management records remain unchanged", () => {
    const beforeHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    const strategiesBefore = listStrategies()
      .map((s) => s.id)
      .sort();

    const root = makeTempRoot();
    for (let i = 0; i < 22; i++) {
      seedTerminalJob(
        root,
        `2026-10-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      );
    }
    enforceHistoryRetention({ rootDir: root, maxRetained: 20 });

    const afterHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    expect(afterHash).toBe(beforeHash);
    expect(
      listStrategies()
        .map((s) => s.id)
        .sort(),
    ).toEqual(strategiesBefore);
  });

  it("UI displays Korean retention note", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components",
        "rextora",
        "strategySearch",
        "JobList.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("최근 탐색 기록");
    expect(src).toContain("개를 보관합니다");
    expect(src).toContain("ss-history-retention-note");
    expect(src).toContain(String(STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT));
  });

  it("deleteSearchJob removes only one job scope", () => {
    const root = makeTempRoot();
    const a = seedTerminalJob(root, "2026-11-01T00:00:00.000Z");
    const b = seedTerminalJob(root, "2026-11-02T00:00:00.000Z");
    deleteSearchJob(a, { rootDir: root });
    expect(getSearchJob(a, { rootDir: root })).toBeNull();
    expect(getSearchJob(b, { rootDir: root })).not.toBeNull();
    expect(fs.existsSync(path.join(root, "trials", b))).toBe(true);
  });

  it("integration: create with active + protected + >20 terminal", () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const terminalIds: string[] = [];
    for (let i = 0; i < 22; i++) {
      terminalIds.push(
        seedTerminalJob(
          root,
          `2026-12-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    const protectedId = terminalIds[0]!;
    const plan = getSearchPlan(protectedId, opts)!;
    saveSearchPlan(
      protectedId,
      {
        ...plan,
        promotions: [
          {
            paramsHash: "prot",
            iteration: 0,
            status: "promoted",
            strategyId: SAFE_STRATEGY_ID,
            strategyName: "SAFE",
            error: null,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      opts,
    );

    const active = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(active.id, opts);

    const created = createStrategySearchJobApi(validCreateBody({ seed: 77 }), opts);
    expect(created.status).toBe("queued");

    const remaining = listSearchJobs(opts);
    expect(remaining.some((j) => j.id === active.id)).toBe(true);
    expect(remaining.some((j) => j.id === protectedId)).toBe(true);
    expect(remaining.some((j) => j.id === created.id)).toBe(true);

    const eligible = remaining.filter((j) => {
      const c = classifyJobForRetention(j, opts);
      return c.eligible;
    });
    expect(eligible.length).toBeLessThanOrEqual(20);

    // Oldest unprotected terminal should be gone
    expect(getSearchJob(terminalIds[1]!, opts)).toBeNull();
    expect(
      fs.existsSync(path.join(root, "trials", terminalIds[1]!)),
    ).toBe(false);

    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    ) as { version: number; jobs: unknown[] };
    expect(index.version).toBe(1);
    expect(Array.isArray(index.jobs)).toBe(true);
  });
});
