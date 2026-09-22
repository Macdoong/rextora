import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANCEL_ACK_TIMEOUT_MS,
  finalizeCancellation,
  recoverStaleCancelRequestedJobs,
  requestCancelWithFinalization,
} from "@/src/lib/rextora/strategySearch/cancellationLifecycle";
import {
  createSearchJob,
  getSearchJob,
  listSearchJobs,
  listSearchTrials,
  markSearchJobPaused,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  saveSearchJob,
  saveSearchTrial,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  isSearchJobExecutionActive,
  resetSearchJobExecutionRegistryForTests,
  setDefaultSearchJobExecutionDepsForTests,
  startSearchJobExecution,
  waitForSearchJobExecution,
} from "@/src/lib/rextora/strategySearch/jobExecutionRegistry";
import { previewResearchJobDeletion } from "@/src/lib/rextora/strategySearch/deletionSafety";
import {
  createEmptySearchPlan,
  getSearchPlan,
  saveSearchPlan,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import {
  buildAndPersistResearchTop10,
  getResearchTop10,
} from "@/src/lib/rextora/strategySearch/researchTop10";
import {
  cancelStrategySearchJobApi,
  createStrategySearchJobApi,
  setStrategySearchApiStoreOptionsForTests,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import type { StrategySearchTrial } from "@/src/lib/rextora/strategySearch/types";
import { RETIRED_SAFE_PARAMS_HASH } from "@/src/lib/rextora/strategy/retiredSafeBaseline";


const tempRoots: string[] = [];
const FROM = Date.UTC(2024, 0, 1);
const TO = Date.UTC(2024, 0, 10);

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-cancel-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function sampleConfig() {
  return {
    searchVersion: "1",
    strategyTemplateId: "t",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "v1",
    seed: 1,
    generatorType: "random" as const,
    maxIterations: 5,
    parameterRanges: [
      {
        key: "ema_fast",
        min: 10,
        max: 20,
        step: 1,
        valueType: "integer" as const,
      },
    ],
    evaluationWindows: [
      {
        id: "w",
        label: "w",
        fromOpenTime: 0,
        toOpenTime: 1,
        requiredForPass: true,
      },
    ],
    passCriteria: {},
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function apiCreateBody() {
  return {
    searchVersion: "phase6",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "synthetic-v1",
    seed: 101,
    generatorType: "random",
    maxIterations: 30,
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
  };
}

afterEach(() => {
  resetSearchJobExecutionRegistryForTests();
  setDefaultSearchJobExecutionDepsForTests(null);
  setStrategySearchApiStoreOptionsForTests(null);
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("cancellation lifecycle", () => {
  it("paused → cancel finalizes to cancelled without worker", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestPauseSearchJob(job.id, store);
    markSearchJobPaused(job.id, store);
    const plan = getSearchPlan(job.id, store);
    if (plan) {
      saveSearchPlan(job.id, { ...plan, completionReason: "PAUSED" }, store);
    }

    const result = requestCancelWithFinalization(job.id, store);
    expect(result.finalized).toBe(true);
    expect(result.afterStatus).toBe("cancelled");
    const after = getSearchJob(job.id, store)!;
    expect(after.status).toBe("cancelled");
    expect(after.finishedAt).toBeTruthy();
    expect(after.resultsPreserved).toBe(true);
    const planAfter = getSearchPlan(job.id, store);
    if (planAfter) {
      expect(planAfter.completionReason).toBe("USER_CANCELLED");
    }
    const impact = previewResearchJobDeletion(job.id, store);
    expect(impact.classification).toBe("deletable");
  });

  it("active worker prevents unsafe force-finalize", async () => {
    const store = tempStore();
    setStrategySearchApiStoreOptionsForTests(store);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    setDefaultSearchJobExecutionDepsForTests({
      storeOptions: store,
      loadCandles: async () => {
        await gate;
        return {};
      },
      evaluate: async () => {
        throw new Error("should not evaluate");
      },
    });
    const job = createStrategySearchJobApi(apiCreateBody());
    startSearchJobExecution(job.id, { storeOptions: store });
    expect(isSearchJobExecutionActive(job.id)).toBe(true);

    const result = requestCancelWithFinalization(job.id, store);
    expect(result.finalized).toBe(false);
    expect(result.blockReason).toBe("active_worker");
    expect(getSearchJob(job.id, store)?.status).toBe("cancel_requested");

    const second = requestCancelWithFinalization(job.id, store);
    expect(second.finalized).toBe(false);
    expect(second.blockReason).toBe("active_worker");
    expect(getSearchJob(job.id, store)?.status).toBe("cancel_requested");
    expect(isSearchJobExecutionActive(job.id)).toBe(true);

    release?.();
    await waitForSearchJobExecution(job.id);
  });

  it("stale orphan cancel_requested recovers and preserves trials", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: "c0",
        params: { ema_fast: 12 },
        paramsHash: "hash0",
        generatorType: "random",
        parentCandidateIds: [],
        score: 1,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date(Date.now() - 120_000).toISOString(),
      } as StrategySearchTrial,
      store,
    );
    const stuck = getSearchJob(job.id, store)!;
    saveSearchJob(
      {
        ...stuck,
        cancelRequestedAt: new Date(
          Date.now() - CANCEL_ACK_TIMEOUT_MS - 1000,
        ).toISOString(),
        updatedAt: new Date(Date.now() - CANCEL_ACK_TIMEOUT_MS - 1000).toISOString(),
      },
      store,
    );

    const recovery = recoverStaleCancelRequestedJobs({
      ...store,
      requireTimeout: true,
    });
    expect(recovery.finalized.some((r) => r.jobId === job.id)).toBe(true);
    expect(getSearchJob(job.id, store)?.status).toBe("cancelled");
    expect(listSearchTrials(job.id, store).length).toBe(1);
  });

  it("duplicate stop is idempotent once cancelled", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    const first = requestCancelWithFinalization(job.id, store);
    expect(first.finalized).toBe(true);
    const second = requestCancelWithFinalization(job.id, store);
    expect(second.finalized).toBe(true);
    expect(second.afterStatus).toBe("cancelled");
    expect(getSearchJob(job.id, store)?.status).toBe("cancelled");
  });

  it("cancellation preserves Top-10 shortlist file", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: [
        {
          iteration: 1,
          candidateId: "c1",
          paramsHash: "abc",
          readableName: "t",
          displayAlias: "t",
          strategyFamily: "ema_trend",
          symbol: "BTCUSDT",
          timeframe: "15m",
          sourceResearchJobId: job.id,
          netReturn: 0.1,
          maxDrawdown: -0.05,
          tradeCount: 20,
          profitFactor: 1.2,
          totalCost: 1,
          costStatus: "비용 스트레스 통과",
          sampleConfidence: "표본 충분",
          sampleConfidenceDetail: "ok",
          score: 1,
          stressPassed: true,
          jitterPassed: true,
          robustnessStatus: "거래 안정성 통과",
          overfittingRisk: "low",
          eligibilityStatus: "최종 추천 가능",
          recommendable: true,
          finalRecommendable: true,
          roles: [],
          registrationState: "미등록",
          registeredStrategyId: null,
          clusterId: "cl1",
          isRepresentative: true,
          memberCount: 1,
          strongestPoint: "",
          primaryWeakness: "",
          recommendationReason: "t",
          leverageLabel: "—",
          whyNotRank1: "",
          vsPreviousRankNote: "",
        },
      ],
      options: store,
    });
    expect(getResearchTop10(job.id, store)?.entries.length).toBe(1);
    const result = requestCancelWithFinalization(job.id, store);
    expect(result.finalized).toBe(true);
    expect(getResearchTop10(job.id, store)?.entries.length).toBe(1);
  });

  it("finalizeCancellation is a no-op for non-pending statuses", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    const result = finalizeCancellation(job.id, store);
    expect(result.finalized).toBe(false);
    expect(result.blockReason).toBe("not_cancel_pending");
  });

  it("SAFE params hash remains immutable constant", () => {
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
  });

  it("running → cancel_requested → cancelled stamps acknowledgement", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    const result = requestCancelWithFinalization(job.id, store);
    expect(result.finalized).toBe(true);
    const after = getSearchJob(job.id, store)!;
    expect(after.status).toBe("cancelled");
    expect(after.cancelRequestedAt).toBeTruthy();
    expect(after.cancellationAcknowledgedAt).toBeTruthy();
    expect(after.resultsPreserved).toBe(true);
    expect(after.finishedAt).toBeTruthy();
  });

  it("stale worker-absent cancel permits safe finalize after timeout", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    const stuck = getSearchJob(job.id, store)!;
    saveSearchJob(
      {
        ...stuck,
        cancelRequestedAt: new Date(
          Date.now() - CANCEL_ACK_TIMEOUT_MS - 5_000,
        ).toISOString(),
      },
      store,
    );
    const result = finalizeCancellation(job.id, {
      ...store,
      requireTimeout: true,
    });
    expect(result.finalized).toBe(true);
    expect(result.afterStatus).toBe("cancelled");
  });

  it("timeout_pending blocks finalize when cancel is too fresh", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    const result = finalizeCancellation(job.id, {
      ...store,
      requireTimeout: true,
      timeoutMs: CANCEL_ACK_TIMEOUT_MS,
    });
    expect(result.finalized).toBe(false);
    expect(result.blockReason).toBe("timeout_pending");
    expect(getSearchJob(job.id, store)?.status).toBe("cancel_requested");
  });

  it("terminal cancelled job is not treated as active for deletion", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelWithFinalization(job.id, store);
    const impact = previewResearchJobDeletion(job.id, store);
    expect(impact.classification).toBe("deletable");
    expect(impact.reasonsKo.some((r) => r.includes("실행 중"))).toBe(false);
  });

  it("paused plan completionReason does not falsely protect cancelled job", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestPauseSearchJob(job.id, store);
    markSearchJobPaused(job.id, store);
    saveSearchPlan(
      job.id,
      {
        ...createEmptySearchPlan({
          searchName: "paused-protect-test",
          depthProfile: "standard",
          qualificationProfile: "balanced",
          qualifiedTarget: 3,
          candidateBudget: 100,
          stageBatchSize: 20,
          maxRuntimeMs: 60_000,
          spaces: [{ id: "s1", labelKo: "s1" }],
        }),
        completionReason: "PAUSED",
        pausedAtMs: Date.now(),
      },
      store,
    );
    requestCancelWithFinalization(job.id, store);
    expect(getSearchJob(job.id, store)?.status).toBe("cancelled");
    const planAfter = getSearchPlan(job.id, store);
    expect(planAfter?.completionReason).toBe("USER_CANCELLED");
    expect(previewResearchJobDeletion(job.id, store).classification).toBe(
      "deletable",
    );
  });

  it("cancellation updates listed job index status", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelWithFinalization(job.id, store);
    const listed = listSearchJobs(store).find((j) => j.id === job.id);
    expect(listed?.status).toBe("cancelled");
  });

  it("cancellation writes recovery audit record", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    const stuck = getSearchJob(job.id, store)!;
    saveSearchJob(
      {
        ...stuck,
        cancelRequestedAt: new Date(
          Date.now() - CANCEL_ACK_TIMEOUT_MS - 1_000,
        ).toISOString(),
      },
      store,
    );
    recoverStaleCancelRequestedJobs({ ...store, requireTimeout: true });
    const auditPath = path.join(store.rootDir!, "recovery-audit.jsonl");
    expect(fs.existsSync(auditPath)).toBe(true);
    const lines = fs
      .readFileSync(auditPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines.some((l) => l.includes(job.id) && l.includes("cancelled"))).toBe(
      true,
    );
  });

  it("API detail after cancel reports USER_CANCELLED and inactive execution", () => {
    const store = tempStore();
    setStrategySearchApiStoreOptionsForTests(store);
    const created = createStrategySearchJobApi(apiCreateBody());
    markSearchJobRunning(created.id, store);
    const detail = cancelStrategySearchJobApi(created.id);
    expect(detail.status).toBe("cancelled");
    expect(detail.terminationReason).toBe("USER_CANCELLED");
    expect(detail.executionActive).toBe(false);
  });

  it("isolated temp storage never touches SAFE params hash", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelWithFinalization(job.id, store);
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(store.rootDir).not.toContain(`${path.sep}data${path.sep}strategies`);
  });
});
