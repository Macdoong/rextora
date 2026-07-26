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
  areStructurallyNearDuplicates,
  buildResearchResultsSummary,
  buildStructureFingerprint,
  registerTrialForBacktest,
} from "../src/lib/rextora/strategySearch/researchResultsSummary";
import { resolveResearchOutcome } from "../src/lib/rextora/strategySearch/researchOutcome";
import { listStrategies } from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("research outcome presentation", () => {
  it("1. DEADLINE_REACHED displays normal completion", () => {
    const o = resolveResearchOutcome({
      status: "completed",
      completionReason: "DEADLINE_REACHED",
      preservedResultCount: 10,
    });
    expect(o.titleKo).toBe("AI 연구 완료");
    expect(o.isPresentedAsCompleted).toBe(true);
  });

  it("2. cancel_requested with preserved results displays partial results", () => {
    const o = resolveResearchOutcome({
      status: "cancel_requested",
      completionReason: "PAUSED",
      preservedResultCount: 1112,
    });
    expect(o.titleKo).toBe("중지 요청 중");
    expect(o.detailKo).toContain("중지 요청");
    expect(o.isPresentedAsCompleted).toBe(false);
  });

  it("3. PAUSED displays paused state", () => {
    const o = resolveResearchOutcome({
      status: "paused",
      completionReason: "PAUSED",
      preservedResultCount: 5,
    });
    expect(o.titleKo).toBe("일시정지");
    expect(o.isPresentedAsCompleted).toBe(false);
  });

  it("4. failed with preserved results displays partial results", () => {
    const o = resolveResearchOutcome({
      status: "failed",
      preservedResultCount: 3,
    });
    expect(o.titleKo).toBe("부분 결과");
    expect(o.detailKo).toContain("오류");
  });
});

describe("structural clustering", () => {
  it("16-18. exact hash / structural rules; performance alone never clusters", () => {
    const base = {
      ema_fast: 20,
      ema_mid: 48,
      ema_slow: 96,
      rsi_period: 14,
      sl_atr_mult: 1.5,
      tp_atr_mult: 2.5,
      vol_ratio_min: 1.1,
      pullback_max_dist: 0.02,
      confirm_bull: false,
      break_margin: 0.001,
      use_trailing: false,
      max_hold_bars: 24,
      allow_in_range: true,
    };
    const near = { ...base, ema_fast: 21, sl_atr_mult: 1.52 };
    const differentLogic = {
      ...base,
      confirm_bull: true,
      break_margin: 0.01,
    };
    expect(buildStructureFingerprint(base)).toBe(
      buildStructureFingerprint(near),
    );
    expect(buildStructureFingerprint(base)).not.toBe(
      buildStructureFingerprint(differentLogic),
    );
    expect(
      areStructurallyNearDuplicates(base, near, {
        aRet: 0.2,
        bRet: 0.21,
        aMdd: -0.05,
        bMdd: -0.05,
      }).ok,
    ).toBe(true);
    // Same performance, different structure → never cluster.
    expect(
      areStructurallyNearDuplicates(base, differentLogic, {
        aRet: 0.5,
        bRet: 0.5,
        aMdd: -0.1,
        bMdd: -0.1,
      }).ok,
    ).toBe(false);
  });
});

describe("register then backtest", () => {
  function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-rbt-"));
    tempRoots.push(root);
    return { rootDir: root };
  }

  function trial(
    jobId: string,
    iteration: number,
    hash: string,
    params: Record<string, number | boolean>,
    withRobustness = true,
  ): StrategySearchTrial {
    return {
      jobId,
      iteration,
      candidateId: `c_${iteration}`,
      params,
      paramsHash: hash,
      generatorType: "random",
      parentCandidateIds: [],
      score: 0.7,
      passed: true,
      failureReasons: [],
      windowResults: [
        {
          totalReturn: 0.2,
          mdd: -0.05,
          trades: 40,
          profitFactor: 1.5,
          totalCost: 10,
          winRate: 0.5,
        },
      ],
      costStressResults: withRobustness ? [{ passed: true }] : [],
      jitterResults: withRobustness ? [{ passed: true }] : [],
      durationMs: 1,
      createdAt: new Date().toISOString(),
    };
  }

  it("5-13. register-for-backtest creates identity and preserves handoff fields", () => {
    const store = makeRoot();
    const isolated = installIsolatedStrategyStore();
    cleanups.push(isolated.cleanup);
    const safeBefore = hashFile(canonicalSafeSourcePath());

    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "rbt",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 5,
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
    const plan = createEmptySearchPlan({
      searchName: "rbt",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 10,
      stageBatchSize: 5,
      maxRuntimeMs: null,
      spaces: [{ id: "a", labelKo: "a" }],
    });
    plan.uniqueEvaluatedCount = 1;
    plan.qualifiedHashes = ["hash_rbt_1"];
    saveSearchPlan(job.id, plan, store);
    saveSearchTrial(
      trial(job.id, 1, "hash_rbt_1", {
        ema_fast: 22,
        ema_mid: 48,
        ema_slow: 96,
        rsi_period: 14,
        sl_atr_mult: 1.5,
        tp_atr_mult: 2.5,
        vol_ratio_min: 1.1,
        pullback_max_dist: 0.02,
        confirm_bull: false,
      }),
      store,
    );

    const summary0 = buildResearchResultsSummary(job.id, store);
    expect(summary0.counts.registeredStrategies).toBe(0);
    expect(summary0.liveSearchBest.labelKo).toBe("실시간 탐색 최고");
    expect(summary0.finalizedBest.labelKo).toBe("최종 정리 후 최고");

    const first = registerTrialForBacktest(job.id, 1, store);
    expect(first.result.strategyId).not.toBe(SAFE_STRATEGY_ID);
    expect(first.backtestHref).toContain(`strategyId=${first.result.strategyId}`);
    expect(first.backtestHref).toContain(`strategyHash=${first.result.paramsHash}`);
    expect(first.backtestHref).toContain("symbol=BTCUSDT");
    expect(first.backtestHref).toContain("timeframe=15m");
    expect(first.backtestHref).toContain(`sourceResearchJobId=${job.id}`);
    expect(first.backtestHref).toContain("sourceTrialIteration=1");
    expect(first.backtestHref).not.toContain("backtestFrom=");

    const after = buildResearchResultsSummary(job.id, store);
    expect(after.counts.registeredStrategies).toBe(1);
    const fromJob = listStrategies().filter((s) =>
      (s.description ?? "").includes(`sourceResearchJobId=${job.id}`),
    );
    expect(fromJob).toHaveLength(1);

    const second = registerTrialForBacktest(job.id, 1, store);
    expect(second.result.alreadyExists).toBe(true);
    expect(second.result.strategyId).toBe(first.result.strategyId);
    expect(listStrategies().filter((s) => !s.locked)).toHaveLength(1);

    expect(hashFile(canonicalSafeSourcePath())).toBe(safeBefore);
  });
});
