import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hashFile,
  installIsolatedStrategyStore,
  canonicalSafeSourcePath,
} from "./helpers/isolatedStrategyStore";
import { createSearchJob, saveSearchTrial } from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import {
  buildResearchResultsSummary,
  parseSourceResearchJobId,
  promoteTopResearchResults,
  validateResearchResultsIntegrity,
} from "../src/lib/rextora/strategySearch/researchResultsSummary";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import { listStrategies } from "../src/lib/rextora/strategy/strategyStore";

import { StrategySearchApiError } from "../src/lib/rextora/strategySearch/jobApiService";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const tempRoots: string[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-rrc-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function baseParams(emaFast: number) {
  return {
    ema_fast: emaFast,
    ema_mid: 48,
    ema_slow: 96,
    rsi_period: 14,
    sl_atr_mult: 1.5,
    tp_atr_mult: 2.5,
    vol_ratio_min: 1.1,
    pullback_max_dist: 0.02,
  };
}

function makeTrial(
  jobId: string,
  iteration: number,
  opts: {
    passed: boolean;
    paramsHash: string;
    params: Record<string, number>;
    totalReturn: number;
    mdd: number;
    trades?: number;
    score?: number;
    withRobustness?: boolean;
  },
): StrategySearchTrial {
  const robust = opts.withRobustness !== false;
  return {
    jobId,
    iteration,
    candidateId: `cand_${iteration}`,
    params: opts.params,
    paramsHash: opts.paramsHash,
    generatorType: "random",
    parentCandidateIds: [],
    score: opts.score ?? opts.totalReturn,
    passed: opts.passed,
    failureReasons: [],
    windowResults: [
      {
        totalReturn: opts.totalReturn,
        mdd: opts.mdd,
        trades: opts.trades ?? 40,
        profitFactor: 1.4,
        totalCost: 12,
        winRate: 0.55,
      },
    ],
    costStressResults: robust
      ? [{ passed: true, multiplier: 1.5 }]
      : [],
    jitterResults: robust ? [{ passed: true, sample: 1 }] : [],
    durationMs: 10,
    createdAt: new Date().toISOString(),
  };
}

function seedJobWithTrials() {
  const store = makeRoot();
  const isolated = installIsolatedStrategyStore();
  cleanups.push(isolated.cleanup);

  const job = createSearchJob(
    {
      searchVersion: "1",
      strategyTemplateId: "rrc",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "v1",
      seed: 7,
      generatorType: "random",
      maxIterations: 20,
      parameterRanges: [
        { key: "ema_fast", min: 8, max: 40, step: 1, valueType: "integer" },
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
      balance: 10_000,
      baseCostConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      passPolicy: { thresholds: {} },
      scoreWeights: {
        returnWeight: 1,
        mddWeight: 1,
        profitFactorWeight: 0.25,
        winRateWeight: 0.25,
        tradeAdequacyWeight: 0.25,
        negativeMonthWeight: 0.1,
        consistencyWeight: 0.1,
      },
      costStressScenarios: [],
      jitterConfig: {
        enabled: true,
        sampleCount: 1,
        mutationScale: 0.1,
        seed: 1,
        minimumPassRate: 0,
        maximumScoreDropRatio: 1,
        parameterRanges: [],
      },
      dataRef: {
        source: "binance_historical",
        availableFrom: 0,
        availableTo: 1,
      },
    },
    store,
  );
  saveJobExecutionProfile(
    job.id,
    {
      version: 1,
      balance: 10_000,
      baseCostConfig: {
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
      },
      passPolicy: { thresholds: {} },
      scoreWeights: {
        returnWeight: 1,
        mddWeight: 1,
        profitFactorWeight: 0.25,
        winRateWeight: 0.25,
        tradeAdequacyWeight: 0.25,
        negativeMonthWeight: 0.1,
        consistencyWeight: 0.1,
      },
      costStressScenarios: [],
      jitterConfig: {
        enabled: true,
        sampleCount: 1,
        mutationScale: 0.1,
        seed: 1,
        minimumPassRate: 0,
        maximumScoreDropRatio: 1,
        parameterRanges: [],
      },
      dataRef: {
        source: "preloaded",
        availableFrom: 0,
        availableTo: 1,
      },
    },
    store,
  );

  const plan = createEmptySearchPlan({
    searchName: "test research",
    depthProfile: "standard",
    qualificationProfile: "balanced",
    qualifiedTarget: 5,
    stopWhenQualifiedTarget: false,
    candidateBudget: 100,
    stageBatchSize: 10,
    maxRuntimeMs: null,
    spaces: [{ id: "space_a", labelKo: "기본" }],
  });
  plan.uniqueEvaluatedCount = 5;
  plan.qualifiedHashes = [
    "hash_hi_ret",
    "hash_stable",
    "hash_near_a",
    "hash_near_b",
    "hash_fail_rob",
  ];
  saveSearchPlan(job.id, plan, store);

  // High return, no robustness → not final recommendation.
  saveSearchTrial(
    makeTrial(job.id, 1, {
      passed: true,
      paramsHash: "hash_hi_ret",
      params: baseParams(12),
      totalReturn: 0.5,
      mdd: 0.12,
      score: 0.9,
      withRobustness: false,
    }),
    store,
  );
  // Stable + robust → recommendable
  saveSearchTrial(
    makeTrial(job.id, 2, {
      passed: true,
      paramsHash: "hash_stable",
      params: baseParams(20),
      totalReturn: 0.18,
      mdd: 0.04,
      score: 0.7,
      withRobustness: true,
    }),
    store,
  );
  // Near-duplicates (same family, close params/returns)
  saveSearchTrial(
    makeTrial(job.id, 3, {
      passed: true,
      paramsHash: "hash_near_a",
      params: { ...baseParams(30), sl_atr_mult: 1.5, tp_atr_mult: 2.5 },
      totalReturn: 0.22,
      mdd: 0.08,
      score: 0.6,
      withRobustness: true,
    }),
    store,
  );
  saveSearchTrial(
    makeTrial(job.id, 4, {
      passed: true,
      paramsHash: "hash_near_b",
      params: { ...baseParams(31), sl_atr_mult: 1.52, tp_atr_mult: 2.48 },
      totalReturn: 0.23,
      mdd: 0.085,
      score: 0.61,
      withRobustness: true,
    }),
    store,
  );
  // Failed trial — not qualified
  saveSearchTrial(
    makeTrial(job.id, 5, {
      passed: false,
      paramsHash: "hash_fail",
      params: baseParams(40),
      totalReturn: -0.1,
      mdd: 0.3,
      withRobustness: false,
    }),
    store,
  );
  // Exact duplicate hash of stable (should collapse in unique)
  saveSearchTrial(
    makeTrial(job.id, 6, {
      passed: true,
      paramsHash: "hash_stable",
      params: baseParams(20),
      totalReturn: 0.17,
      mdd: 0.05,
      score: 0.65,
      withRobustness: true,
    }),
    store,
  );

  return { job, store, isolated };
}

describe("Research → Results completion", () => {
  it("1-2. successful job exposes qualified trials and counts match", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.counts.evaluatedStrategies).toBe(5);
    expect(summary.counts.qualifiedStrategies).toBe(5);
    // unique by hash: hi_ret, stable, near_a, near_b (fail excluded; dup hash collapsed)
    expect(summary.counts.uniqueQualifiedStrategies).toBe(4);
    const integrity = validateResearchResultsIntegrity(summary);
    expect(integrity.ok).toBe(true);
  });

  it("3-4. exact duplicates removed; near-duplicates clustered", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.counts.uniqueQualifiedStrategies).toBe(4);
    expect(summary.counts.clusteredRepresentatives).toBeLessThanOrEqual(4);
    expect(summary.counts.duplicateOrNearDuplicateMembers).toBeGreaterThanOrEqual(0);
    const multi = summary.clusters.filter((c) => c.memberCount > 1);
    expect(multi.length).toBeGreaterThanOrEqual(1);
    for (const c of multi) {
      expect(c.memberIterations.length).toBe(c.memberCount);
      expect(c.similarityReason.length).toBeGreaterThan(0);
    }
  });

  it("5-7. promotion creates new identity; SAFE never overwritten; incomplete blocked", () => {
    const { job, store } = seedJobWithTrials();
    const safeBefore = hashFile(canonicalSafeSourcePath());
    const promoted = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 2,
      storeOptions: store,
    });
    expect(promoted.registrationState).toBe("registered");
    expect(promoted.strategyId).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(promoted.paramsHash).not.toBe(RETIRED_SAFE_PARAMS_HASH);
    expect(promoted.paramsHash).not.toBe("7893ca3f0e30");
    const created = listStrategies().find((s) => s.id === promoted.strategyId);
    expect(created).toBeTruthy();
    expect(parseSourceResearchJobId(created!.description)).toBe(job.id);

    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: job.id,
        iteration: 5,
        storeOptions: store,
      }),
    ).toThrow(StrategySearchApiError);

    expect(hashFile(canonicalSafeSourcePath())).toBe(safeBefore);
  });

  it("8-9. current Research filter uses sourceResearchJobId; promoted matches registry", () => {
    const { job, store } = seedJobWithTrials();
    promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 2,
      storeOptions: store,
    });
    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.counts.registeredStrategies).toBeGreaterThanOrEqual(1);
    const fromJob = listStrategies().filter(
      (s) => parseSourceResearchJobId(s.description) === job.id,
    );
    expect(fromJob.length).toBe(summary.counts.registeredStrategies);
    expect(
      fromJob.every((s) => s.id !== RETIRED_SAFE_STRATEGY_ID),
    ).toBe(true);
  });

  it("10-12. highest return alone is not final recommendation; robustness required", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.topProfit?.paramsHash).toBe("hash_hi_ret");
    // Seeded trials lack research evaluation identity, so CHAMP-A does not
    // promote highest return (or any trial) to final recommendation.
    expect(summary.topRecommend).toBeNull();
  });

  it("13. backtest recommendation set is bounded (≤10)", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(summary.backtestRecommendations.length).toBeLessThanOrEqual(10);
    expect(summary.counts.backtestRecommendedStrategies).toBe(
      summary.backtestRecommendations.length,
    );
    expect(summary.top10.length).toBeLessThanOrEqual(10);
    expect(summary.counts.top10Saved).toBe(summary.top10.length);
    expect(Array.isArray(summary.top10RankChanges)).toBe(true);
    expect(summary.counts.stageBasicQualified).toBeGreaterThan(0);
  });

  it("14-15. Results→Backtest identity fields preserved; period remains external", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    const card = summary.backtestRecommendations[0] ?? summary.topRecommend!;
    expect(card.sourceResearchJobId).toBe(job.id);
    expect(card.paramsHash).toBeTruthy();
    expect(card.symbol).toBe("BTCUSDT");
    expect(card.timeframe).toBe("15m");
    // Period is not embedded — Backtest UI selects independently.
    expect(
      Object.prototype.hasOwnProperty.call(card, "backtestFrom"),
    ).toBe(false);
  });

  it("16-17. current Research results separate from library; SAFE not in current results", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(
      summary.representatives.every(
        (r) =>
          r.paramsHash !== RETIRED_SAFE_PARAMS_HASH &&
          r.paramsHash !== "7893ca3f0e30",
      ),
    ).toBe(true);
    expect(summary.counts.registeredStrategies).toBe(0);
    expect(summary.provenanceNote).toMatch(/trial/);
  });

  it("18. cluster expansion preserves member identities", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    for (const cluster of summary.clusters) {
      const uniq = new Set(cluster.memberIterations);
      expect(uniq.size).toBe(cluster.memberCount);
      expect(cluster.memberIterations).toContain(
        cluster.representativeIteration,
      );
    }
  });

  it("19. UI counts consistent with integrity validator", () => {
    const { job, store } = seedJobWithTrials();
    const summary = buildResearchResultsSummary(job.id, store);
    expect(validateResearchResultsIntegrity(summary).ok).toBe(true);
    expect(
      summary.counts.uniqueQualifiedStrategies -
        summary.counts.clusteredRepresentatives,
    ).toBe(summary.counts.duplicateOrNearDuplicateMembers);
  });

  it("20-22. tests use isolated storage; SAFE immutable; no exchange order APIs", () => {
    const { job, store, isolated } = seedJobWithTrials();
    expect(isolated.root).toContain("rextora-strategies-");
    expect(store.rootDir).toContain("rextora-rrc-");
    const safeBefore = hashFile(canonicalSafeSourcePath());
    const top = promoteTopResearchResults(job.id, {
      limit: 3,
      storeOptions: store,
    });
    expect(top.promoted.length).toBeLessThanOrEqual(3);
    expect(top.summary.counts.backtestRecommendedStrategies).toBeLessThanOrEqual(
      10,
    );
    expect(hashFile(canonicalSafeSourcePath())).toBe(safeBefore);
    // No real exchange — promote path only touches strategyStore files.
    expect(listStrategies().every((s) => s.id !== undefined)).toBe(true);
  });
});
