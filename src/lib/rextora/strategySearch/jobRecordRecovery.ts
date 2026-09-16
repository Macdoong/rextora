/**
 * Recover a missing job.json when plan/execution/trials still exist.
 * Never deletes sidecars or trials. Does not auto-resume execution.
 */

import fs from "node:fs";
import path from "node:path";
import {
  getSearchJob,
  listSearchTrials,
  saveSearchJob,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { activeElapsedMs, getSearchPlan, type StrategySearchPlan } from "./searchPlan";
import { isNormalSearchCompletionReason } from "./jobExecutionRegistry";
import { getJobExecutionProfile } from "./jobExecutionProfile";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
} from "./jobCheckpoint";
import { reconstructGroupBestFromTrials } from "./researchEvaluationIdentity";
import { createSeededRandom } from "./random";
import type {
  StrategySearchConfig,
  StrategySearchJob,
  StrategySearchJobStatus,
} from "./types";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { appendRecoveryAudit } from "./recoveryAudit";
import { strategySearchRoot } from "../storage/runtimePaths";
import { cloneSearchParameterRanges } from "./searchSpaceMutation";

export interface JobRecordRecoveryResult {
  jobId: string;
  recovered: boolean;
  reason: string;
  previousStatus: string | null;
  recoveredStatus: StrategySearchJobStatus | null;
  completedIterations: number;
  trialCount: number;
}

export const MISSING_JOB_RECOVERY_REASON = {
  TERMINAL_COMPLETION: "terminal_completion_proven",
  TERMINAL_CANCELLED: "terminal_cancelled_proven",
  TERMINAL_FAILED: "terminal_failed_proven",
  INTERRUPTED: "process_loss_interrupted_proven",
  QUEUED: "queued_state_proven",
  COOPERATIVE_PAUSE: "cooperative_pause_proven",
  INSUFFICIENT: "insufficient_lifecycle_evidence",
} as const;

const FAILED_COMPLETION_REASONS = new Set([
  "FATAL_ERROR",
  "ENGINE_ERROR",
  "RECOVERY_FAILED",
  "CONFIGURATION_INVALID",
  "DATA_UNAVAILABLE",
  "RESOURCE_SAFETY_LIMIT",
]);

type MissingJobClassification =
  | {
      ok: true;
      status: StrategySearchJobStatus;
      reason: string;
    }
  | { ok: false; reason: string };

function planIsIdle(plan: StrategySearchPlan | null): boolean {
  if (!plan) return false;
  return (
    plan.completionReason == null &&
    plan.pausedAtMs == null &&
    plan.interruptedAtMs == null
  );
}

/**
 * Proven lifecycle only. Index status is corroboration, never sole authority.
 */
function classifyMissingJobLifecycle(input: {
  plan: StrategySearchPlan | null;
  indexStatus: string | null;
  indexFinishedAt: string | null | undefined;
}): MissingJobClassification {
  const { plan, indexStatus, indexFinishedAt } = input;
  if (plan) {
    if (plan.pausedAtMs != null && plan.interruptedAtMs != null) {
      return { ok: false, reason: MISSING_JOB_RECOVERY_REASON.INSUFFICIENT };
    }
    if (isNormalSearchCompletionReason(plan.completionReason)) {
      return {
        ok: true,
        status: "completed",
        reason: MISSING_JOB_RECOVERY_REASON.TERMINAL_COMPLETION,
      };
    }
    if (
      plan.completionReason === "USER_CANCELLED" ||
      plan.completionReason === "USER_STOPPED"
    ) {
      return {
        ok: true,
        status: "cancelled",
        reason: MISSING_JOB_RECOVERY_REASON.TERMINAL_CANCELLED,
      };
    }
    if (
      plan.completionReason != null &&
      FAILED_COMPLETION_REASONS.has(plan.completionReason)
    ) {
      return {
        ok: true,
        status: "failed",
        reason: MISSING_JOB_RECOVERY_REASON.TERMINAL_FAILED,
      };
    }
    if (plan.interruptedAtMs != null) {
      return {
        ok: true,
        status: "interrupted",
        reason: MISSING_JOB_RECOVERY_REASON.INTERRUPTED,
      };
    }
    if (plan.pausedAtMs != null || plan.completionReason === "PAUSED") {
      return {
        ok: true,
        status: "paused",
        reason: MISSING_JOB_RECOVERY_REASON.COOPERATIVE_PAUSE,
      };
    }
  }
  if (
    planIsIdle(plan) &&
    indexStatus === "queued" &&
    (indexFinishedAt == null || indexFinishedAt === "")
  ) {
    return {
      ok: true,
      status: "queued",
      reason: MISSING_JOB_RECOVERY_REASON.QUEUED,
    };
  }
  return { ok: false, reason: MISSING_JOB_RECOVERY_REASON.INSUFFICIENT };
}

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function indexPath(root: string): string {
  return path.join(root, "index.json");
}

function readIndexJobs(root: string): Array<{
  id: string;
  status: string;
  strategyTemplateId?: string;
  generatorType?: string;
  createdAt?: string;
  updatedAt?: string;
  completedIterations?: number;
  finishedAt?: string | null;
}> {
  const fp = indexPath(root);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as {
      jobs?: Array<Record<string, unknown>>;
    };
    return Array.isArray(raw.jobs)
      ? (raw.jobs as Array<{
          id: string;
          status: string;
          strategyTemplateId?: string;
          generatorType?: string;
          createdAt?: string;
          updatedAt?: string;
          completedIterations?: number;
          finishedAt?: string | null;
        }>)
      : [];
  } catch {
    return [];
  }
}

function buildFallbackConfig(input: {
  strategyTemplateId: string;
  symbol: string;
  timeframe: string;
  seed: number;
  maxIterations: number | null;
  parameterRanges: StrategySearchConfig["parameterRanges"];
  dataFrom: number;
  dataTo: number;
}): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: input.strategyTemplateId,
    symbols: [input.symbol],
    timeframe: input.timeframe,
    dataVersion: "binance-v1",
    seed: input.seed,
    generatorType: "random",
    maxIterations: input.maxIterations,
    parameterRanges: cloneSearchParameterRanges(input.parameterRanges),
    evaluationWindows: [
      {
        id: "w1",
        label: "primary",
        fromOpenTime: input.dataFrom,
        toOpenTime: input.dataTo,
        requiredForPass: true,
      },
    ],
    passCriteria: {
      minTradeCount: 10,
      maxMdd: -0.25,
      minTotalReturn: 0,
    },
    costStress: { enabled: true, multipliers: [1.5] },
    jitter: { enabled: true, samples: 2, relativeAmplitude: 0.2 },
  };
}

function defaultParameterRanges(): StrategySearchConfig["parameterRanges"] {
  const keys = [
    "ema_fast",
    "ema_mid",
    "ema_slow",
    "rsi_period",
    "sl_atr_mult",
    "tp_atr_mult",
    "vol_ratio_min",
    "pullback_max_dist",
  ] as const;
  return keys.map((key) => {
    const v = CONTEXT_FALLBACK_PARAMS[key as keyof typeof CONTEXT_FALLBACK_PARAMS];
    const n = typeof v === "number" ? v : 1;
    const isInt = Number.isInteger(n);
    return {
      key,
      min: n * 0.5,
      max: n * 1.5,
      step: isInt ? 1 : 0.01,
      valueType: isInt ? ("integer" as const) : ("float" as const),
    };
  });
}

/**
 * If job.json is missing but durable artifacts remain, rebuild the job only
 * when lifecycle state is positively proven. Does not auto-resume execution.
 */
export function recoverMissingJobRecord(
  jobId: string,
  options?: StrategySearchStoreOptions,
): JobRecordRecoveryResult {
  const existing = getSearchJob(jobId, options);
  if (existing) {
    return {
      jobId,
      recovered: false,
      reason: "job_record_present",
      previousStatus: existing.status,
      recoveredStatus: null,
      completedIterations: existing.checkpoint.completedIterations,
      trialCount: 0,
    };
  }

  const root = resolveRoot(options);
  const indexRow = readIndexJobs(root).find((j) => j.id === jobId) ?? null;
  const plan = getSearchPlan(jobId, options);
  const profile = getJobExecutionProfile(jobId, options);
  const trials = listSearchTrials(jobId, options);

  if (!plan && !profile && trials.length === 0 && !indexRow) {
    return {
      jobId,
      recovered: false,
      reason: "no_artifacts",
      previousStatus: null,
      recoveredStatus: null,
      completedIterations: 0,
      trialCount: 0,
    };
  }

  const previousStatus = indexRow?.status ?? null;
  const classified = classifyMissingJobLifecycle({
    plan,
    indexStatus: previousStatus,
    indexFinishedAt: indexRow?.finishedAt,
  });
  if (!classified.ok) {
    return {
      jobId,
      recovered: false,
      reason: classified.reason,
      previousStatus,
      recoveredStatus: null,
      completedIterations: 0,
      trialCount: trials.length,
    };
  }

  const maxTrialIter =
    trials.length > 0
      ? Math.max(...trials.map((t) => t.iteration))
      : -1;
  const completedIterations = Math.max(
    indexRow?.completedIterations ?? 0,
    maxTrialIter + 1,
    plan?.uniqueEvaluatedCount ?? 0,
  );
  const nextIteration = completedIterations;

  const seen = new Set<string>();
  for (const h of plan?.globalSeenHashes ?? []) {
    if (typeof h === "string" && h) seen.add(h);
  }
  for (const t of trials) {
    if (t.paramsHash && !t.paramsHash.startsWith("invalid_")) {
      seen.add(t.paramsHash);
    }
  }

  const groupBest = reconstructGroupBestFromTrials(trials);

  const symbol =
    plan?.symbolSelection?.selectedSymbol ??
    "BTCUSDT";
  const seed = 42;
  const ranges =
    profile?.jitterConfig?.parameterRanges?.length
      ? profile.jitterConfig.parameterRanges
      : plan?.mutatedParameterRanges?.length
        ? plan.mutatedParameterRanges
        : defaultParameterRanges();

  const config = buildFallbackConfig({
    strategyTemplateId:
      indexRow?.strategyTemplateId ?? plan?.searchName ?? `${symbol} 15m 탐색`,
    symbol,
    timeframe: "15m",
    seed,
    maxIterations: plan?.candidateBudget ?? null,
    parameterRanges: ranges,
    dataFrom: profile?.dataRef.availableFrom ?? 0,
    dataTo: profile?.dataRef.availableTo ?? Date.now(),
  });

  const prng = createSeededRandom(seed);
  const payload = createInitialRunnerPayload({
    prng: prng.getState(),
    jobStatus: classified.status,
  });
  payload.seenHashes = [...seen];
  payload.statistics.evaluated = Math.max(
    payload.statistics.evaluated,
    plan?.uniqueEvaluatedCount ?? trials.length,
  );
  payload.statistics.passed = Math.max(
    payload.statistics.passed,
    plan?.qualifiedHashes?.length ?? trials.filter((t) => t.passed).length,
  );

  const at = new Date().toISOString();
  const terminal =
    classified.status === "completed" ||
    classified.status === "cancelled" ||
    classified.status === "failed";
  const job: StrategySearchJob = {
    id: jobId,
    status: classified.status,
    config,
    checkpoint: buildPersistedCheckpoint({
      completedIterations,
      nextIteration,
      payload,
      bestCandidate: null,
      bestPassedCandidate: null,
      bestByCompatibilityGroup: groupBest,
      updatedAt: at,
    }),
    createdAt: indexRow?.createdAt ?? at,
    updatedAt: at,
    startedAt: indexRow?.createdAt ?? at,
    finishedAt: terminal ? (indexRow?.finishedAt ?? at) : null,
    failureMessage:
      classified.status === "failed"
        ? "전략 탐색이 실패 상태로 복구되었습니다."
        : null,
  };

  saveSearchJob(job, options);

  appendRecoveryAudit(
    {
      jobId,
      previousState: previousStatus,
      recoveredState: classified.status,
      recoveryTime: at,
      reason: classified.reason,
      resumedGeneration: completedIterations,
      remainingDurationMs:
        plan?.maxRuntimeMs != null
          ? Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan))
          : null,
      trialCount: trials.length,
      autoResumed: false,
    },
    options,
  );

  return {
    jobId,
    recovered: true,
    reason: classified.reason,
    previousStatus,
    recoveredStatus: classified.status,
    completedIterations,
    trialCount: trials.length,
  };
}

/** Scan index for running/queued rows missing job.json and recover them. */
export function recoverOrphanIndexEntries(
  options?: StrategySearchStoreOptions,
): JobRecordRecoveryResult[] {
  const root = resolveRoot(options);
  const rows = readIndexJobs(root);
  const out: JobRecordRecoveryResult[] = [];
  for (const row of rows) {
    if (!row.id?.startsWith("search_")) continue;
    if (getSearchJob(row.id, options)) continue;
    const jobPath = path.join(root, "jobs", `${row.id}.json`);
    if (fs.existsSync(jobPath)) continue;
    out.push(recoverMissingJobRecord(row.id, options));
  }
  return out;
}
