/**
 * In-process Strategy Search execution registry (single-process only).
 *
 * Does not use Redis/BullMQ/queues. Duplicate starts for the same jobId are
 * rejected while an active runner promise is registered.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { loadHistoricalCandles } from "../data/historicalCandleLoader";
import { assertHistoricalDataCoverage } from "../data/historicalDataCoverage";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import {
  classifyEngineError,
  isResearchMarketDataError,
} from "./engineErrorClassification";
import { applyLeverageModeToParams } from "./leverageMode";
import { getSearchPlan, saveSearchPlan } from "./searchPlan";
import {
  buildEvaluationWindowPlans,
  type BuildEvaluationWindowPlansInput,
} from "./windowPlanner";
import {
  getJobExecutionProfile,
  saveJobExecutionProfile,
  type StrategySearchExecutionProfile,
} from "./jobExecutionProfile";
import {
  getSearchJob,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  type RunSearchJobInput,
  type RunSearchJobResult,
} from "./jobRunner";
import {
  acquireJobExecutionOwnership,
  EXECUTION_OWNERSHIP_HEARTBEAT_MS,
  getProcessExecutionOwnerId,
  isJobExecutionOwnedOnDisk,
  JobExecutionOwnershipError,
  releaseJobExecutionOwnership,
  touchJobExecutionOwnershipHeartbeat,
} from "./jobExecutionOwnership";
import { runOrchestratedSearchJob } from "./searchOrchestrator";
import {
  transitionJobToCancelled,
  transitionJobToCompleted,
  transitionJobToFailed,
  transitionJobToPaused,
  transitionJobToRunning,
} from "./jobState";
import type { StrategySearchCompletionReason } from "./searchPlan";
import type {
  StrategySearchEvaluationWindowPlan,
  StrategySearchJob,
} from "./types";

export class StrategySearchExecutionRegistryError extends Error {
  readonly code:
    | "ALREADY_RUNNING"
    | "ALREADY_OWNED"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "MISSING_PROFILE"
    | "FATAL";

  constructor(
    code: StrategySearchExecutionRegistryError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StrategySearchExecutionRegistryError";
    this.code = code;
  }
}

/** Fixed operator-safe text; escaped exceptions are never persisted verbatim. */
export const UNEXPECTED_EXECUTION_FAILURE_MESSAGE =
  "전략 탐색 실행 중 오류가 발생했습니다. 안전하게 다시 시도해 주세요.";

const DATA_UNAVAILABLE_FAILURE_MESSAGE =
  "요청한 기간의 시장 데이터를 사용할 수 없습니다. 확인 후 다시 시도해 주세요.";

const FAILURE_PERSISTENCE_ERROR_MESSAGE =
  "전략 탐색 오류 상태를 저장하지 못했습니다.";

export interface SearchJobExecutionDeps {
  storeOptions?: StrategySearchStoreOptions;
  evaluate?: RunSearchJobInput["evaluate"];
  /** Inject candles for tests — bypasses Binance fetch. */
  preloadedCandlesByKey?: Record<string, OhlcvCandle[]>;
  loadCandles?: (
    job: StrategySearchJob,
    profile: StrategySearchExecutionProfile,
  ) => Promise<Record<string, OhlcvCandle[]>>;
}

type ActiveEntry = {
  jobId: string;
  ownerId: string;
  promise: Promise<RunSearchJobResult | void>;
  startedAt: string;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
};

const activeRuns = new Map<string, ActiveEntry>();

/** Optional defaults for tests / local harness (null in production). */
let defaultExecutionDeps: SearchJobExecutionDeps | null = null;

export function setDefaultSearchJobExecutionDepsForTests(
  deps: SearchJobExecutionDeps | null,
): void {
  defaultExecutionDeps = deps;
}

function mergeDeps(deps: SearchJobExecutionDeps): SearchJobExecutionDeps {
  return {
    ...(defaultExecutionDeps ?? {}),
    ...deps,
    storeOptions: deps.storeOptions ?? defaultExecutionDeps?.storeOptions,
    evaluate: deps.evaluate ?? defaultExecutionDeps?.evaluate,
    preloadedCandlesByKey:
      deps.preloadedCandlesByKey ?? defaultExecutionDeps?.preloadedCandlesByKey,
    loadCandles: deps.loadCandles ?? defaultExecutionDeps?.loadCandles,
  };
}

export function isSearchJobExecutionActive(jobId: string): boolean {
  return activeRuns.has(jobId);
}

/** True when any process holds an active in-memory or on-disk execution lease. */
export function isSearchJobExecutionWorkerActive(
  jobId: string,
  storeOptions?: StrategySearchStoreOptions,
): boolean {
  return (
    isSearchJobExecutionActive(jobId) ||
    isJobExecutionOwnedOnDisk(jobId, storeOptions)
  );
}

export function listActiveSearchJobExecutions(): string[] {
  return [...activeRuns.keys()];
}

/** Reasons that represent a normal, terminal orchestrator outcome. */
export function isNormalSearchCompletionReason(
  reason: StrategySearchCompletionReason,
): boolean {
  switch (reason) {
    case "QUALIFIED_TARGET_REACHED":
    case "MAX_CANDIDATE_BUDGET":
    case "MAX_RUNTIME":
    case "DEADLINE_REACHED":
    case "HARD_SAFETY_LIMIT":
    case "SEARCH_SPACE_EXHAUSTED":
    case "MAX_ITERATIONS":
      return true;
    case "USER_CANCELLED":
    case "FATAL_ERROR":
    case "PAUSED":
    case "CONFIGURATION_INVALID":
    case "DATA_UNAVAILABLE":
    case "RECOVERY_FAILED":
    case "USER_STOPPED":
    case "ENGINE_ERROR":
    case "RESOURCE_SAFETY_LIMIT":
    case null:
      return false;
  }
}

/** Canonical plan-level check. Does not invent a second terminal-reason list. */
export function planHasNormalTerminalCompletionReason(
  plan:
    | { completionReason?: StrategySearchCompletionReason | null }
    | null
    | undefined,
): boolean {
  return isNormalSearchCompletionReason(plan?.completionReason ?? null);
}

/**
 * Close the lifecycle gap where the orchestrator stops normally without the
 * inner runner performing its own running → completed transition.
 */
export function finalizeNormalSearchCompletion(
  jobId: string,
  reason: StrategySearchCompletionReason,
  store?: StrategySearchStoreOptions,
): StrategySearchJob | null {
  const current = getSearchJob(jobId, store);
  if (!current || !isNormalSearchCompletionReason(reason)) return current;
  if (current.status === "completed") return current;
  if (current.status === "running") {
    return transitionJobToCompleted(jobId, store);
  }
  // Queued is the orchestrator's transient next-space state. Complete it only
  // when THIS process holds the live runner — never for idle historical rows.
  if (current.status === "queued" && isSearchJobExecutionActive(jobId)) {
    transitionJobToRunning(jobId, store);
    return transitionJobToCompleted(jobId, store);
  }
  return current;
}

/**
 * Own only unexpected registry/bootstrap failures that escape lower layers.
 * A current-state read protects terminal and operator-controlled lifecycle
 * states from a stale execution promise racing their durable transition.
 */
export function persistUnexpectedExecutionFailure(
  jobId: string,
  store?: StrategySearchStoreOptions,
): {
  outcome: "persisted" | "protected" | "unavailable";
  job: StrategySearchJob | null;
} {
  const current = getSearchJob(jobId, store);
  if (!current || current.status === "queued") {
    return { outcome: "unavailable", job: current };
  }
  if (current.status !== "running") {
    return { outcome: "protected", job: current };
  }

  const plan = getSearchPlan(jobId, store);
  if (plan) {
    saveSearchPlan(
      jobId,
      {
        ...plan,
        completionReason: "ENGINE_ERROR",
        expectedCompletionAtMs: null,
      },
      store,
    );
  }
  return {
    outcome: "persisted",
    job: transitionJobToFailed(
      jobId,
      UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
      store,
    ),
  };
}

function persistDataUnavailableFailure(
  jobId: string,
  err: unknown,
  store?: StrategySearchStoreOptions,
): {
  outcome: "persisted" | "protected" | "unavailable";
  job: StrategySearchJob | null;
} {
  const current = getSearchJob(jobId, store);
  if (!current || current.status === "queued") {
    return { outcome: "unavailable", job: current };
  }
  if (current.status !== "running") {
    return { outcome: "protected", job: current };
  }

  const classified = classifyEngineError(err, "data_preflight");
  const sourceCode = classified.code || "DATA_UNAVAILABLE";
  const failureMessage = `${sourceCode}: ${DATA_UNAVAILABLE_FAILURE_MESSAGE}`;

  const plan = getSearchPlan(jobId, store);
  if (plan) {
    saveSearchPlan(
      jobId,
      {
        ...plan,
        completionReason: "DATA_UNAVAILABLE",
        expectedCompletionAtMs: null,
      },
      store,
    );
  }
  return {
    outcome: "persisted",
    job: transitionJobToFailed(jobId, failureMessage, store),
  };
}

function assertResolvedResearchCandleCoverage(input: {
  candlesByKey: Record<string, OhlcvCandle[]>;
  symbols: readonly string[];
  timeframe: string;
  windows: readonly StrategySearchEvaluationWindowPlan[];
}): void {
  for (const symbol of input.symbols) {
    for (const window of input.windows) {
      const key = `${symbol}|${window.id}`;
      const candles = input.candlesByKey[key];
      if (candles == null) continue;
      assertHistoricalDataCoverage({
        timeframe: input.timeframe,
        requestedStartMs: window.requestedFrom,
        requestedEndMs: window.requestedTo,
        candles,
      });
    }
  }
}

/** Test helper — clear registry between tests. */
export function resetSearchJobExecutionRegistryForTests(): void {
  activeRuns.clear();
}

export async function waitForSearchJobExecution(
  jobId: string,
): Promise<RunSearchJobResult | void> {
  const entry = activeRuns.get(jobId);
  if (!entry) return;
  return entry.promise;
}

async function resolveCandles(
  job: StrategySearchJob,
  profile: StrategySearchExecutionProfile,
  deps: SearchJobExecutionDeps,
): Promise<Record<string, OhlcvCandle[]> | undefined> {
  if (deps.preloadedCandlesByKey) {
    return { ...deps.preloadedCandlesByKey };
  }
  if (deps.loadCandles) {
    return deps.loadCandles(job, profile);
  }
  if (profile.dataRef.source === "preloaded") {
    throw new StrategySearchExecutionRegistryError(
      "FATAL",
      "preloaded dataRef requires injected candles",
    );
  }

  const plans = buildEvaluationWindowPlans({
    availableFrom: profile.dataRef.availableFrom,
    availableTo: profile.dataRef.availableTo,
    windows: job.config.evaluationWindows,
  } satisfies BuildEvaluationWindowPlansInput);

  const out: Record<string, OhlcvCandle[]> = {};
  for (const symbol of job.config.symbols) {
    for (const plan of plans) {
      const key = `${symbol}|${plan.id}`;
      const loaded = await loadHistoricalCandles({
        symbol,
        timeframe: job.config.timeframe,
        fromOpenTime: plan.requestedFrom,
        toOpenTime: plan.requestedTo,
      });
      out[key] = loaded.candles;
    }
  }
  return out;
}

/**
 * Start runSearchJob in the background for a queued (or orphaned running) job.
 * Returns immediately after registering the active run.
 */
export function startSearchJobExecution(
  jobId: string,
  deps: SearchJobExecutionDeps = {},
): { jobId: string; accepted: true; ownerId: string } {
  const resolved = mergeDeps(deps);
  if (activeRuns.has(jobId)) {
    throw new StrategySearchExecutionRegistryError(
      "ALREADY_RUNNING",
      `strategy-search job already running in-process: ${jobId}`,
    );
  }

  const store = resolved.storeOptions;
  const existing = getSearchJob(jobId, store);
  if (
    existing?.status === "queued" &&
    planHasNormalTerminalCompletionReason(getSearchPlan(jobId, store))
  ) {
    throw new StrategySearchExecutionRegistryError(
      "INVALID_STATE",
      "Research job is already terminal by its recorded completion reason and requires lifecycle reconciliation.",
    );
  }
  const ownerId = getProcessExecutionOwnerId();
  try {
    acquireJobExecutionOwnership(jobId, ownerId, store);
  } catch (err) {
    if (err instanceof JobExecutionOwnershipError && err.code === "ALREADY_OWNED") {
      throw new StrategySearchExecutionRegistryError(
        "ALREADY_OWNED",
        err.message,
      );
    }
    throw err;
  }

  const job = getSearchJob(jobId, store);
  if (!job) {
    releaseJobExecutionOwnership(jobId, ownerId, "start_rejected_not_found", store);
    throw new StrategySearchExecutionRegistryError(
      "NOT_FOUND",
      `strategy-search job not found: ${jobId}`,
    );
  }

  if (job.status === "queued" || job.status === "running") {
    // ok — queued starts fresh; running without registry is orphan recovery
  } else {
    releaseJobExecutionOwnership(jobId, ownerId, "start_rejected_invalid_state", store);
    throw new StrategySearchExecutionRegistryError(
      "INVALID_STATE",
      `cannot start strategy-search job in status: ${job.status}`,
    );
  }

  const profile = getJobExecutionProfile(jobId, store);
  if (!profile) {
    releaseJobExecutionOwnership(jobId, ownerId, "start_rejected_missing_profile", store);
    throw new StrategySearchExecutionRegistryError(
      "MISSING_PROFILE",
      `strategy-search execution profile missing for job: ${jobId}`,
    );
  }

  // Repair placeholder jitter ranges (ema_fast) left by older create paths so
  // pattern candidates are not rejected as UNKNOWN_PARAMETER during jitter.
  const jitterKeys = profile.jitterConfig.parameterRanges.map((r) => r.key);
  const looksLikePlaceholder =
    profile.jitterConfig.enabled &&
    (jitterKeys.length === 0 ||
      (jitterKeys.length === 1 && jitterKeys[0] === "ema_fast") ||
      !jitterKeys.some((k) =>
        job.config.parameterRanges.some((r) => r.key === k),
      ));
  let effectiveProfile: StrategySearchExecutionProfile;
  try {
    effectiveProfile = looksLikePlaceholder
      ? saveJobExecutionProfile(
          jobId,
          {
            ...profile,
            jitterConfig: {
              ...profile.jitterConfig,
              parameterRanges: job.config.parameterRanges.map((r) => ({ ...r })),
            },
          },
          store,
        )
      : profile;

    // An accepted attempt is durably running before any asynchronous bootstrap
    // work. This preserves running → failed without inventing queued → failed.
    if (job.status === "queued") transitionJobToRunning(jobId, store);
  } catch {
    releaseJobExecutionOwnership(
      jobId,
      ownerId,
      "start_rejected_setup_failed",
      store,
    );
    throw new StrategySearchExecutionRegistryError(
      "FATAL",
      "strategy-search execution setup failed",
    );
  }

  const startedAt = new Date().toISOString();
  const heartbeatTimer = setInterval(() => {
    try {
      touchJobExecutionOwnershipHeartbeat(jobId, ownerId, store);
    } catch {
      /* runner will exit and release ownership */
    }
  }, EXECUTION_OWNERSHIP_HEARTBEAT_MS);

  let releaseReason = "runner_finished";
  const promise = (async (): Promise<RunSearchJobResult | void> => {
    const plans = buildEvaluationWindowPlans({
      availableFrom: effectiveProfile.dataRef.availableFrom,
      availableTo: effectiveProfile.dataRef.availableTo,
      windows: job.config.evaluationWindows,
    });
    let preloadedCandlesByKey: Record<string, OhlcvCandle[]> | undefined;
    try {
      preloadedCandlesByKey = await resolveCandles(
        job,
        effectiveProfile,
        resolved,
      );
      if (preloadedCandlesByKey) {
        assertResolvedResearchCandleCoverage({
          candlesByKey: preloadedCandlesByKey,
          symbols: job.config.symbols,
          timeframe: job.config.timeframe,
          windows: plans,
        });
      }
    } catch (err) {
      if (isResearchMarketDataError(err)) {
        persistDataUnavailableFailure(jobId, err, store);
        return;
      }
      throw err;
    }

    // Cancel may arrive while candles load (running → cancel_requested).
    // Settle to cancelled before runSearchJob, which would otherwise reject and
    // leave the job stuck in cancel_requested with executionActive cleared.
    const afterLoad = getSearchJob(jobId, store);
    if (!afterLoad) {
      throw new StrategySearchExecutionRegistryError(
        "NOT_FOUND",
        `strategy-search job disappeared after candle load: ${jobId}`,
      );
    }
    if (
      afterLoad.status === "cancel_requested" ||
      afterLoad.status === "cancelling"
    ) {
      transitionJobToCancelled(jobId, store);
      return;
    }
    if (afterLoad.status === "pause_requested") {
      transitionJobToPaused(jobId, store);
      const pausedPlan = getSearchPlan(jobId, store);
      if (pausedPlan) {
        saveSearchPlan(
          jobId,
          { ...pausedPlan, completionReason: "PAUSED" },
          store,
        );
      }
      return;
    }
    if (
      afterLoad.status === "cancelled" ||
      afterLoad.status === "completed" ||
      afterLoad.status === "failed"
    ) {
      return;
    }

    const planForLev = getSearchPlan(jobId, store);
    const baseParams = applyLeverageModeToParams(
      CONTEXT_FALLBACK_PARAMS,
      planForLev,
    );
    const orch = await runOrchestratedSearchJob({
      jobId,
      storeOptions: store,
      windows: plans,
      balance: effectiveProfile.balance,
      baseCostConfig: effectiveProfile.baseCostConfig,
      passPolicy: effectiveProfile.passPolicy,
      scoreWeights: effectiveProfile.scoreWeights,
      costStressScenarios: effectiveProfile.costStressScenarios,
      jitterConfig: effectiveProfile.jitterConfig,
      baseParams,
      preloadedCandlesByKey,
      evaluate: resolved.evaluate,
    });
    finalizeNormalSearchCompletion(jobId, orch.finalStopReason, store);
    const after = getSearchJob(jobId, store);
    const afterPlan = getSearchPlan(jobId, store);
    if (
      after?.status === "queued" &&
      planHasNormalTerminalCompletionReason(afterPlan)
    ) {
      transitionJobToRunning(jobId, store);
      finalizeNormalSearchCompletion(jobId, orch.finalStopReason, store);
    }
    return orch.lastRun ?? undefined;
  })()
    .catch(() => {
      let failure: ReturnType<typeof persistUnexpectedExecutionFailure>;
      try {
        failure = persistUnexpectedExecutionFailure(jobId, store);
      } catch {
        releaseReason = "runner_failed";
        throw new StrategySearchExecutionRegistryError(
          "FATAL",
          FAILURE_PERSISTENCE_ERROR_MESSAGE,
        );
      }
      // A terminal/operator transition that won the race remains authoritative.
      if (failure.outcome === "protected") return undefined;
      releaseReason = "runner_failed";
      if (failure.outcome === "unavailable") {
        throw new StrategySearchExecutionRegistryError(
          "FATAL",
          FAILURE_PERSISTENCE_ERROR_MESSAGE,
        );
      }
      throw new StrategySearchExecutionRegistryError(
        "FATAL",
        UNEXPECTED_EXECUTION_FAILURE_MESSAGE,
      );
    })
    .finally(() => {
      const current = activeRuns.get(jobId);
      if (current?.startedAt === startedAt) {
        if (current.heartbeatTimer) clearInterval(current.heartbeatTimer);
        activeRuns.delete(jobId);
        releaseJobExecutionOwnership(jobId, ownerId, releaseReason, store);
      }
    });

  activeRuns.set(jobId, {
    jobId,
    ownerId,
    promise,
    startedAt,
    heartbeatTimer,
  });
  void promise;
  return { jobId, accepted: true, ownerId };
}
