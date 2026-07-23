/**
 * In-process Strategy Search execution registry (single-process only).
 *
 * Does not use Redis/BullMQ/queues. Duplicate starts for the same jobId are
 * rejected while an active runner promise is registered.
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import { loadHistoricalCandles } from "../data/historicalCandleLoader";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import {
  buildEvaluationWindowPlans,
  type BuildEvaluationWindowPlansInput,
} from "./windowPlanner";
import {
  getJobExecutionProfile,
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
import { runOrchestratedSearchJob } from "./searchOrchestrator";
import { transitionJobToCancelled } from "./jobState";
import type { StrategySearchJob } from "./types";

export class StrategySearchExecutionRegistryError extends Error {
  readonly code:
    | "ALREADY_RUNNING"
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
  promise: Promise<RunSearchJobResult | void>;
  startedAt: string;
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
): { jobId: string; accepted: true } {
  const resolved = mergeDeps(deps);
  if (activeRuns.has(jobId)) {
    throw new StrategySearchExecutionRegistryError(
      "ALREADY_RUNNING",
      `strategy-search job already running in-process: ${jobId}`,
    );
  }

  const store = resolved.storeOptions;
  const job = getSearchJob(jobId, store);
  if (!job) {
    throw new StrategySearchExecutionRegistryError(
      "NOT_FOUND",
      `strategy-search job not found: ${jobId}`,
    );
  }

  if (job.status === "queued" || job.status === "running") {
    // ok — queued starts fresh; running without registry is orphan recovery
  } else {
    throw new StrategySearchExecutionRegistryError(
      "INVALID_STATE",
      `cannot start strategy-search job in status: ${job.status}`,
    );
  }

  const profile = getJobExecutionProfile(jobId, store);
  if (!profile) {
    throw new StrategySearchExecutionRegistryError(
      "MISSING_PROFILE",
      `strategy-search execution profile missing for job: ${jobId}`,
    );
  }

  const startedAt = new Date().toISOString();
  const promise = (async (): Promise<RunSearchJobResult | void> => {
    const plans = buildEvaluationWindowPlans({
      availableFrom: profile.dataRef.availableFrom,
      availableTo: profile.dataRef.availableTo,
      windows: job.config.evaluationWindows,
    });
    const preloadedCandlesByKey = await resolveCandles(job, profile, resolved);

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
    if (afterLoad.status === "cancel_requested") {
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

    const orch = await runOrchestratedSearchJob({
      jobId,
      storeOptions: store,
      windows: plans,
      balance: profile.balance,
      baseCostConfig: profile.baseCostConfig,
      passPolicy: profile.passPolicy,
      scoreWeights: profile.scoreWeights,
      costStressScenarios: profile.costStressScenarios,
      jitterConfig: profile.jitterConfig,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      preloadedCandlesByKey,
      evaluate: resolved.evaluate,
    });
    return orch.lastRun ?? undefined;
  })()
    .catch(() => undefined as unknown as RunSearchJobResult)
    .finally(() => {
      const current = activeRuns.get(jobId);
      if (current?.startedAt === startedAt) {
        activeRuns.delete(jobId);
      }
    });

  activeRuns.set(jobId, { jobId, promise, startedAt });
  void promise;
  return { jobId, accepted: true };
}
