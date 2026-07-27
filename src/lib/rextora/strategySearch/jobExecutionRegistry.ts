/**
 * In-process Strategy Search execution registry (single-process only).
 *
 * Does not use Redis/BullMQ/queues. Duplicate starts for the same jobId are
 * rejected while an active runner promise is registered.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { loadHistoricalCandles } from "../data/historicalCandleLoader";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { applyLeverageModeToParams } from "./leverageMode";
import { getSearchPlan } from "./searchPlan";
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
import { transitionJobToCancelled } from "./jobState";
import type { StrategySearchJob } from "./types";

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
  const effectiveProfile = looksLikePlaceholder
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

  const startedAt = new Date().toISOString();
  const heartbeatTimer = setInterval(() => {
    try {
      touchJobExecutionOwnershipHeartbeat(jobId, ownerId, store);
    } catch {
      /* runner will exit and release ownership */
    }
  }, EXECUTION_OWNERSHIP_HEARTBEAT_MS);

  const promise = (async (): Promise<RunSearchJobResult | void> => {
    const plans = buildEvaluationWindowPlans({
      availableFrom: effectiveProfile.dataRef.availableFrom,
      availableTo: effectiveProfile.dataRef.availableTo,
      windows: job.config.evaluationWindows,
    });
    const preloadedCandlesByKey = await resolveCandles(
      job,
      effectiveProfile,
      resolved,
    );

    // Cancel may arrive while candles load (status stays queued→cancel_requested).
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
    return orch.lastRun ?? undefined;
  })()
    .catch(() => undefined as unknown as RunSearchJobResult)
    .finally(() => {
      const current = activeRuns.get(jobId);
      if (current?.startedAt === startedAt) {
        if (current.heartbeatTimer) clearInterval(current.heartbeatTimer);
        activeRuns.delete(jobId);
        releaseJobExecutionOwnership(jobId, ownerId, "runner_finished", store);
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
