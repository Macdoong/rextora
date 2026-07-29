/**
 * Deterministic demo fixture initializer.
 * Uses public store APIs where possible. Never touches SAFE.
 * Never starts Paper. Never marks Live eligible.
 * Idempotent: second call returns existing demo records.
 */

import {
  getSearchJob,
  listSearchJobs,
  markSearchJobCompleted,
  markSearchJobRunning,
  saveSearchJob,
  saveSearchTrial,
  deleteSearchJob,
  type StrategySearchStoreOptions,
} from "../strategySearch/jobStore";
import { createStrategySearchCandidateId } from "../strategySearch/searchId";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../strategySearch/searchPlan";
import {
  saveResearchTop10,
  getResearchTop10,
  type ResearchTop10Snapshot,
} from "../strategySearch/researchTop10";
import type { StrategySearchConfig, StrategySearchTrial } from "../strategySearch/types";
import {
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  listStrategies,
  updateStrategyLastBacktest,
} from "../strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../strategy/strategyTypes";
import {
  listSavedBacktests,
  saveBacktestResult,
  deleteSavedBacktest,
} from "../backtest/backtestStore";
import { saveChartEvidence } from "../backtest/chartEvidenceStore";
import type { SavedBacktestResult } from "../backtest/backtestTypes";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import {
  DEMO_BACKTEST_ALIAS,
  DEMO_BUNDLE_ID,
  DEMO_DATA_VERSION,
  DEMO_JOB_ID,
  DEMO_JOB_NAME,
  DEMO_STRATEGY_DESCRIPTION,
  DEMO_STRATEGY_ID,
  DEMO_STRATEGY_NAME,
  isDemoBacktestRecord,
  isDemoStrategyRecord,
} from "./demoIdentity";
import { saveFirstRunState, clearFirstRunDemoPointers } from "./firstRunStateStore";
import { classifyFirstRunStatus } from "./firstRunStatus";

export interface DemoInitResult {
  created: boolean;
  alreadyPresent: boolean;
  jobId: string;
  strategyId: string;
  runId: string;
  paperDeepLink: string;
  resultsDeepLink: string;
  backtestDeepLink: string;
}

function demoConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: DEMO_JOB_NAME,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: DEMO_DATA_VERSION,
    seed: 20260728,
    generatorType: "random",
    maxIterations: 5,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 30, step: 1 }],
    evaluationWindows: [
      {
        id: "demo_w1",
        label: "demo-window",
        fromOpenTime: 1_704_067_200_000,
        toOpenTime: 1_706_745_600_000,
      },
    ],
    passCriteria: {
      minTradeCount: 1,
      requireAllWindowsPass: false,
    },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function demoTrial(jobId: string, iteration: number): StrategySearchTrial {
  const now = new Date().toISOString();
  return {
    jobId,
    iteration,
    candidateId: createStrategySearchCandidateId(jobId, iteration),
    params: { ema_fast: 16 + iteration, demo: true },
    paramsHash: `demo_params_${iteration.toString(16).padStart(8, "0")}`,
    generatorType: "random",
    parentCandidateIds: [],
    score: 0.42 - iteration * 0.02,
    passed: iteration === 0,
    failureReasons:
      iteration === 0
        ? []
        : [{ code: "demo_below_threshold", message: "demo non-qualified sample" }],
    windowResults: [
      {
        windowId: "demo_w1",
        totalReturn: 0.042 - iteration * 0.01,
        mdd: -0.085,
        trades: 18 - iteration,
        winRate: 0.55,
        profitFactor: 1.15,
      },
    ],
    costStressResults: [],
    jitterResults: [],
    durationMs: 40,
    createdAt: now,
  };
}

function buildDemoCandles(): OhlcvCandle[] {
  const start = 1_704_067_200_000;
  const candles: OhlcvCandle[] = [];
  let price = 42_000;
  for (let i = 0; i < 48; i += 1) {
    const open = price;
    const close = price + ((i % 5) - 2) * 12;
    const high = Math.max(open, close) + 18;
    const low = Math.min(open, close) - 18;
    candles.push({
      openTime: start + i * 15 * 60_000,
      open,
      high,
      low,
      close,
      volume: 100 + i,
      closeTime: start + (i + 1) * 15 * 60_000 - 1,
    });
    price = close;
  }
  return candles;
}

function findExistingDemoStrategyId(): string | null {
  ensureStrategyStore();
  const found = listStrategies().find((s) => isDemoStrategyRecord(s));
  return found?.id ?? null;
}

function findExistingDemoRunId(strategyId: string | null): string | null {
  const runs = listSavedBacktests(100);
  const match = runs.find(
    (r) =>
      isDemoBacktestRecord(r) ||
      (strategyId != null &&
        (r.strategyId === strategyId || r.report.strategyId === strategyId)),
  );
  return match?.id ?? null;
}

export function initializeDemoWorkspace(
  options?: StrategySearchStoreOptions,
): DemoInitResult {
  const store = options;
  const existingJob = getSearchJob(DEMO_JOB_ID, store);
  let strategyId = findExistingDemoStrategyId();
  let runId = findExistingDemoRunId(strategyId);

  if (existingJob && strategyId && runId) {
    saveFirstRunState({
      demoInitializedAt: new Date().toISOString(),
      demoBundleId: DEMO_BUNDLE_ID,
      demoJobId: DEMO_JOB_ID,
      demoStrategyId: strategyId,
      demoRunId: runId,
    });
    return {
      created: false,
      alreadyPresent: true,
      jobId: DEMO_JOB_ID,
      strategyId,
      runId,
      paperDeepLink: `/paper-trading?strategyId=${encodeURIComponent(strategyId)}&demo=1`,
      resultsDeepLink: `/results?jobId=${encodeURIComponent(DEMO_JOB_ID)}&demo=1`,
      backtestDeepLink: `/backtest?strategyId=${encodeURIComponent(strategyId)}&runId=${encodeURIComponent(runId)}&demo=1`,
    };
  }

  // Job
  if (!existingJob) {
    const at = new Date().toISOString();
    saveSearchJob(
      {
        id: DEMO_JOB_ID,
        status: "queued",
        config: demoConfig(),
        checkpoint: {
          completedIterations: 0,
          nextIteration: 0,
          randomState: null,
          bestCandidate: null,
          bestPassedCandidate: null,
          updatedAt: at,
        },
        createdAt: at,
        updatedAt: at,
        startedAt: null,
        finishedAt: null,
        failureMessage: null,
      },
      store,
    );
    markSearchJobRunning(DEMO_JOB_ID, store);
    for (let i = 0; i < 3; i += 1) {
      saveSearchTrial(demoTrial(DEMO_JOB_ID, i), store);
    }
    markSearchJobCompleted(DEMO_JOB_ID, store);
  }

  const plan = createEmptySearchPlan({
    searchName: DEMO_JOB_NAME,
    depthProfile: "fast",
    qualificationProfile: "balanced",
    qualifiedTarget: 1,
    candidateBudget: 5,
    stageBatchSize: 5,
    maxRuntimeMs: 60_000,
    spaces: [{ id: "ema_core", labelKo: "데모 공간" }],
  });
  saveSearchPlan(DEMO_JOB_ID, plan, store);

  // Top-10 shortlist (illustrative)
  if (!getResearchTop10(DEMO_JOB_ID, store)) {
    const now = new Date().toISOString();
    const snapshot: ResearchTop10Snapshot = {
      version: 1,
      jobId: DEMO_JOB_ID,
      scopeKey: "BTCUSDT|15m|demo|fast|balanced",
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          rank: 1,
          roleBadges: [],
          strategyHash: "demo_hash_0001",
          sourceResearchJobId: DEMO_JOB_ID,
          sourceTrialIteration: 0,
          sourceClusterId: "demo_cluster_1",
          symbol: "BTCUSDT",
          timeframe: "15m",
          candidateId: createStrategySearchCandidateId(DEMO_JOB_ID, 0),
          readableName: DEMO_STRATEGY_NAME,
          displayAlias: `${DEMO_STRATEGY_NAME} · 데모`,
          strategyFamily: "ema_trend",
          netReturn: 0.042,
          maxDrawdown: -0.085,
          tradeCount: 18,
          profitFactor: 1.15,
          winRate: 0.55,
          sharpe: null,
          score: 0.42,
          costStatus: "비용 데이터 없음",
          sampleConfidence: "표본 충분",
          sampleConfidenceDetail: "거래 18회",
          robustnessStatus: "데모 예시",
          overfittingRisk: "알 수 없음",
          eligibilityStatus: "데모 전용",
          recommendable: false,
          finalRecommendable: false,
          registrationState: "등록됨",
          registeredStrategyId: null,
          rankReason: "demo fixture",
          leverageLabel: "데모",
          movementReasonKo: "데모 데이터",
          createdAt: now,
          updatedAt: now,
        },
      ],
      previousEntries: null,
      rankChanges: [],
    };
    saveResearchTop10(snapshot, store);
  }

  // Strategy (never SAFE, never liveEligible)
  if (!strategyId) {
    const existingFixed = listStrategies().find((s) => s.id === DEMO_STRATEGY_ID);
    if (existingFixed) {
      strategyId = existingFixed.id;
    } else {
      const created = createStrategy({
        id: DEMO_STRATEGY_ID,
        name: DEMO_STRATEGY_NAME,
        displayAlias: DEMO_STRATEGY_NAME,
        displayName: DEMO_STRATEGY_NAME,
        description: DEMO_STRATEGY_DESCRIPTION,
        timeframe: "15m",
        params: { ema_fast: 16, ema_slow: 48 },
      });
      if (created.id === SAFE_STRATEGY_ID || created.id !== DEMO_STRATEGY_ID) {
        throw new Error("demo fixture refused unexpected strategy id");
      }
      strategyId = created.id;
    }
    try {
      updateStrategyLastBacktest(strategyId, {
        totalReturn: 0.042,
        mdd: -0.085,
        trades: 18,
        winRate: 0.55,
      });
    } catch {
      /* non-fatal */
    }
  }

  // Backtest + chart evidence
  if (!runId) {
    const candles = buildDemoCandles();
    const equity = candles.map((_, i) => 10_000 * (1 + 0.042 * (i / candles.length)));
    const payload: Omit<SavedBacktestResult, "id" | "createdAt"> = {
      config: {
        strategyId,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        balance: 10_000,
        feeRate: 0.0004,
        slippageRate: 0.0002,
        fundingRate: 0,
        applyFunding: false,
        applySpread: false,
        spreadRate: 0,
        costStressMultipliers: [1],
        costGuardK: 1,
        dataMode: "synthetic-test",
      },
      report: {
        strategyName: DEMO_STRATEGY_NAME,
        strategyHash: "demo_strategy_hash_v1",
        sourceParamsHash: "demo_params_00000000",
        strategyId,
        sourceStatus: "user_created",
        symbol: "BTCUSDT",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        fromDate: "2024-01-01",
        toDate: "2024-01-02",
        requestedFrom: "2024-01-01T00:00:00.000Z",
        requestedTo: "2024-01-02T00:00:00.000Z",
        actualFirstCandleTime: new Date(candles[0]!.openTime).toISOString(),
        actualLastCandleTime: new Date(candles.at(-1)!.openTime).toISOString(),
        candleCount: candles.length,
        processedCandleCount: candles.length,
        dataSource: "synthetic-test",
        totalReturn: 0.042,
        mdd: -0.085,
        tradeCount: 18,
        winRate: 0.55,
        averageTrade: 0.002,
        profitFactor: 1.15,
        maxConsecutiveLosses: 3,
        feeImpact: 0.004,
        feeTotal: 12,
        slippageTotal: 4,
        fundingTotal: 0,
        spreadTotal: 0,
        costs: {
          fees: 12,
          slippage: 4,
          funding: 0,
          spread: 0,
          totalTradingCost: 16,
          totalCostUsdt: 16,
          totalCostPctOfInitialCapital: 0.0016,
          grossPnLBeforeCosts: 436,
          netPnLAfterCosts: 420,
        },
        monthlyReturns: [],
        negativeMonths: 0,
        startingBalance: 10_000,
        endingBalance: 10_420,
        validation: {
          paramsHashVerified: true,
          feesApplied: true,
          slippageApplied: true,
          fundingApplied: false,
          spreadApplied: false,
          noRealOrders: true,
        },
      },
      trades: [],
      strategyId,
      strategyHash: "demo_strategy_hash_v1",
      sourceParamsHash: "demo_params_00000000",
      displayAliasSnapshot: DEMO_BACKTEST_ALIAS,
      displayNameSnapshot: DEMO_BACKTEST_ALIAS,
      sourceType: "user_backtest_run",
      status: "completed",
      engineVersion: "rextora-demo-fixture-1",
      dataVersion: DEMO_DATA_VERSION,
      hasChartEvidence: true,
      chartEvidenceSchemaVersion: 1,
    };
    const saved = saveBacktestResult(payload);
    runId = saved.id;
    saveChartEvidence({
      runId,
      symbol: "BTCUSDT",
      timeframe: "15m",
      dataVersion: DEMO_DATA_VERSION,
      actualFirstCandleTime: payload.report.actualFirstCandleTime,
      actualLastCandleTime: payload.report.actualLastCandleTime,
      processedCandleCount: candles.length,
      candles,
      equityCurve: equity,
      chartSamplingApplied: false,
    });
  }

  // Patch top10 registered strategy id
  const top = getResearchTop10(DEMO_JOB_ID, store);
  if (top?.entries[0] && strategyId) {
    top.entries[0].registeredStrategyId = strategyId;
    top.updatedAt = new Date().toISOString();
    saveResearchTop10(top, store);
  }

  saveFirstRunState({
    demoInitializedAt: new Date().toISOString(),
    demoBundleId: DEMO_BUNDLE_ID,
    demoJobId: DEMO_JOB_ID,
    demoStrategyId: strategyId,
    demoRunId: runId,
    setupCompletedAt: null,
  });

  return {
    created: true,
    alreadyPresent: false,
    jobId: DEMO_JOB_ID,
    strategyId,
    runId,
    paperDeepLink: `/paper-trading?strategyId=${encodeURIComponent(strategyId)}&demo=1`,
    resultsDeepLink: `/results?jobId=${encodeURIComponent(DEMO_JOB_ID)}&demo=1`,
    backtestDeepLink: `/backtest?strategyId=${encodeURIComponent(strategyId)}&runId=${encodeURIComponent(runId)}&demo=1`,
  };
}

/**
 * Reset ONLY demo-owned records. Never deletes SAFE or real user data.
 */
export function resetDemoWorkspace(
  options?: StrategySearchStoreOptions,
): { removedJob: boolean; removedStrategies: number; removedRuns: number } {
  let removedJob = false;
  let removedStrategies = 0;
  let removedRuns = 0;

  // Backtests first (by demo marker)
  for (const run of listSavedBacktests(200)) {
    if (!isDemoBacktestRecord(run)) continue;
    const res = deleteSavedBacktest(run.id);
    if (res.ok) removedRuns += 1;
  }

  // Strategies
  ensureStrategyStore();
  for (const s of listStrategies()) {
    if (!isDemoStrategyRecord(s)) continue;
    if (s.id === SAFE_STRATEGY_ID) continue;
    try {
      deleteStrategy(s.id);
      removedStrategies += 1;
    } catch {
      /* skip protected */
    }
  }

  // Job + trials + top10
  if (getSearchJob(DEMO_JOB_ID, options) || listSearchJobs(options).some((j) => j.id === DEMO_JOB_ID)) {
    try {
      deleteSearchJob(DEMO_JOB_ID, options);
      removedJob = true;
    } catch {
      removedJob = false;
    }
  }

  clearFirstRunDemoPointers();
  return { removedJob, removedStrategies, removedRuns };
}

export function dismissFirstRunSetup(): void {
  saveFirstRunState({
    setupDismissedAt: new Date().toISOString(),
  });
}

export function markFirstRunSetupComplete(): void {
  saveFirstRunState({
    setupCompletedAt: new Date().toISOString(),
  });
}

export function getDemoDeepLinks(): {
  results: string | null;
  backtest: string | null;
  paper: string | null;
} {
  const status = classifyFirstRunStatus();
  if (!status.demoJobId && !status.demoStrategyId) {
    return { results: null, backtest: null, paper: null };
  }
  return {
    results: status.demoJobId
      ? `/results?jobId=${encodeURIComponent(status.demoJobId)}&demo=1`
      : null,
    backtest:
      status.demoStrategyId && status.demoRunId
        ? `/backtest?strategyId=${encodeURIComponent(status.demoStrategyId)}&runId=${encodeURIComponent(status.demoRunId)}&demo=1`
        : status.demoStrategyId
          ? `/backtest?strategyId=${encodeURIComponent(status.demoStrategyId)}&demo=1`
          : null,
    paper: status.demoStrategyId
      ? `/paper-trading?strategyId=${encodeURIComponent(status.demoStrategyId)}&demo=1`
      : null,
  };
}
