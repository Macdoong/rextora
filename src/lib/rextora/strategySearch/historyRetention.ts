/**
 * Bounded Strategy Search history retention.
 *
 * Keeps newest terminal eligible jobs up to a fixed limit.
 * Never deletes active/transitional jobs or strategy-referenced provenance jobs.
 * Does not touch Strategy Management records or SAFE strategy files.
 */

import { getStrategyById, listStrategies } from "../strategy/strategyStore";
import { isSearchJobExecutionActive } from "./jobExecutionRegistry";
import {
  deleteSearchJob,
  getSearchJob,
  listSearchJobs,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { isTerminalJobStatus } from "./jobState";
import { getSearchPlan } from "./searchPlan";
import type { StrategySearchJob, StrategySearchJobStatus } from "./types";

/** Default maximum retained eligible (terminal, deletable) jobs on disk. */
export const STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT = 20;

/** Default maximum jobs returned/shown in history UI (newest first). */
export const STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT = 20;

export const STRATEGY_SEARCH_HISTORY_RETENTION_MIN = 10;
export const STRATEGY_SEARCH_HISTORY_RETENTION_MAX = 100;

const PROTECTED_ACTIVE_STATUSES: ReadonlySet<StrategySearchJobStatus> = new Set([
  "queued",
  "running",
  "pause_requested",
  "paused",
  "cancel_requested",
]);

const LEGACY_STATUS_MAP: Readonly<Record<string, StrategySearchJobStatus>> = {
  CREATED: "queued",
  QUEUED: "queued",
  RUNNING: "running",
  PAUSE_REQUESTED: "pause_requested",
  PAUSED: "paused",
  CANCELLING: "cancel_requested",
  CANCEL_REQUESTED: "cancel_requested",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  FAILED: "failed",
};

export type RetentionProtectReason =
  | "active_status"
  | "execution_active"
  | "open_campaign"
  | "strategy_reference"
  | "incomplete_promotion"
  | "unclassified"
  | "corrupt";

export type RetentionEligibility =
  | { eligible: true; job: StrategySearchJob }
  | {
      eligible: false;
      jobId: string;
      reason: RetentionProtectReason;
      job?: StrategySearchJob;
    };

export interface HistoryRetentionResult {
  maxRetained: number;
  eligibleBefore: number;
  deletedJobIds: string[];
  protectedJobIds: string[];
  warnings: string[];
}

export function clampHistoryRetentionLimit(
  value: number | null | undefined,
): number {
  const n =
    value == null || !Number.isFinite(value)
      ? STRATEGY_SEARCH_HISTORY_RETENTION_DEFAULT
      : Math.trunc(value);
  return Math.min(
    STRATEGY_SEARCH_HISTORY_RETENTION_MAX,
    Math.max(STRATEGY_SEARCH_HISTORY_RETENTION_MIN, n),
  );
}

export function normalizeJobStatusForRetention(
  status: unknown,
): StrategySearchJobStatus | null {
  if (typeof status !== "string" || status.trim() === "") return null;
  if (
    status === "queued" ||
    status === "running" ||
    status === "pause_requested" ||
    status === "paused" ||
    status === "cancel_requested" ||
    status === "cancelled" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  const mapped = LEGACY_STATUS_MAP[status] ?? LEGACY_STATUS_MAP[status.toUpperCase()];
  return mapped ?? null;
}

function compareCreatedAsc(a: StrategySearchJob, b: StrategySearchJob): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  const aOk = Number.isFinite(ta);
  const bOk = Number.isFinite(tb);
  if (aOk && bOk && ta !== tb) return ta - tb;
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compareJobsNewestFirst(
  a: StrategySearchJob,
  b: StrategySearchJob,
): number {
  return compareCreatedAsc(b, a);
}

function strategyStillExists(strategyId: string | null | undefined): boolean {
  if (!strategyId || typeof strategyId !== "string") return false;
  try {
    return getStrategyById(strategyId) != null;
  } catch {
    return false;
  }
}

/**
 * Legacy description matching only.
 * Requires an exact `job=<full-job-id>` token (word-boundary safe).
 * Prefer structured plan.promotions when present.
 */
export function descriptionReferencesSearchJob(
  description: string | null | undefined,
  jobId: string,
): boolean {
  if (!description || !jobId) return false;
  const escaped = jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s·,;])job=${escaped}(?=$|[\\s·,;.])`).test(
    description,
  );
}

function isReferencedByLegacyDescription(jobId: string): boolean {
  try {
    for (const strategy of listStrategies()) {
      const desc =
        strategy &&
        typeof (strategy as { description?: unknown }).description === "string"
          ? (strategy as { description: string }).description
          : "";
      if (descriptionReferencesSearchJob(desc, jobId)) return true;
    }
  } catch {
    // Strategy store unavailable — do not treat as referenced.
  }
  return false;
}

function hasIncompletePromotion(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  const plan = getSearchPlan(jobId, options);
  if (!plan) return false;
  return plan.promotions.some((p) => p.status === "pending");
}

function hasStructuredStrategyProvenance(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  const plan = getSearchPlan(jobId, options);
  if (!plan) return false;
  return plan.promotions.some(
    (p) =>
      (p.status === "promoted" || p.status === "duplicate") &&
      strategyStillExists(p.strategyId),
  );
}

function hasLiveStrategyProvenance(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  // Structured provenance first; legacy description only as fallback.
  if (hasStructuredStrategyProvenance(jobId, options)) return true;
  return isReferencedByLegacyDescription(jobId);
}

export type ManualDeleteBlockReason =
  | "not_found"
  | "active_status"
  | "execution_active"
  | "open_campaign"
  | "strategy_reference"
  | "incomplete_promotion"
  | "unclassified"
  | "corrupt";

export function manualDeleteBlockMessageKo(
  reason: ManualDeleteBlockReason,
): string {
  switch (reason) {
    case "not_found":
      return "탐색 기록을 찾을 수 없습니다.";
    case "active_status":
      return "실행 중이거나 대기 중인 탐색 기록은 삭제할 수 없습니다.";
    case "execution_active":
      return "실행 중인 탐색 기록은 삭제할 수 없습니다.";
    case "open_campaign":
      return "아직 연구가 끝나지 않은 탐색 기록은 삭제할 수 없습니다.";
    case "strategy_reference":
      return "등록된 전략의 출처 기록이라 삭제할 수 없습니다.";
    case "incomplete_promotion":
      return "등록 처리가 끝나지 않은 탐색 기록은 삭제할 수 없습니다.";
    case "corrupt":
      return "손상된 탐색 기록은 안전하게 삭제할 수 없습니다.";
    case "unclassified":
    default:
      return "이 탐색 기록은 삭제할 수 없습니다.";
  }
}

/**
 * Manual delete eligibility — terminal + not protected.
 * Returns null when deletion is allowed.
 */
export function getManualDeleteBlockReason(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ManualDeleteBlockReason | null {
  const classified = classifyJobForRetention(jobId, options);
  if (classified.eligible) return null;
  if (classified.reason === "corrupt" && !classified.job) return "not_found";
  return classified.reason;
}

/** Delete one job after re-checking eligibility. Throws on block. */
export function deleteSearchJobIfAllowed(
  jobId: string,
  options?: StrategySearchStoreOptions,
): { deleted: true; jobId: string } {
  const block = getManualDeleteBlockReason(jobId, options);
  if (block) {
    const err = new Error(manualDeleteBlockMessageKo(block)) as Error & {
      code: ManualDeleteBlockReason;
    };
    err.code = block;
    throw err;
  }
  deleteSearchJob(jobId, options);
  return { deleted: true, jobId };
}

function hasOpenCampaign(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  const plan = getSearchPlan(jobId, options);
  if (!plan) return false;
  if (plan.completionReason != null) return false;
  return plan.spaces.some(
    (s) => s.status === "active" || s.status === "pending",
  );
}

export function classifyJobForRetention(
  jobOrId: StrategySearchJob | string,
  options?: StrategySearchStoreOptions,
): RetentionEligibility {
  const jobId = typeof jobOrId === "string" ? jobOrId : jobOrId.id;
  let job: StrategySearchJob | null =
    typeof jobOrId === "string" ? getSearchJob(jobId, options) : jobOrId;

  if (job == null) {
    return { eligible: false, jobId, reason: "corrupt" };
  }

  const status = normalizeJobStatusForRetention(job.status);
  if (status == null) {
    return { eligible: false, jobId, reason: "unclassified", job };
  }

  // Normalize legacy labels onto the in-memory job for terminal checks.
  const normalized: StrategySearchJob = { ...job, status };

  if (PROTECTED_ACTIVE_STATUSES.has(status)) {
    return { eligible: false, jobId, reason: "active_status", job: normalized };
  }

  if (isSearchJobExecutionActive(jobId)) {
    return {
      eligible: false,
      jobId,
      reason: "execution_active",
      job: normalized,
    };
  }

  if (!isTerminalJobStatus(status)) {
    return { eligible: false, jobId, reason: "unclassified", job: normalized };
  }

  // Mid multi-space reopen race: completed without campaign completionReason.
  if (status === "completed" && hasOpenCampaign(jobId, options)) {
    return { eligible: false, jobId, reason: "open_campaign", job: normalized };
  }

  if (hasIncompletePromotion(jobId, options)) {
    return {
      eligible: false,
      jobId,
      reason: "incomplete_promotion",
      job: normalized,
    };
  }

  if (hasLiveStrategyProvenance(jobId, options)) {
    return {
      eligible: false,
      jobId,
      reason: "strategy_reference",
      job: normalized,
    };
  }

  return { eligible: true, job: normalized };
}

/**
 * Enforce retention: delete oldest eligible terminal jobs until count ≤ limit.
 * Failures are collected as warnings; never throws for cleanup errors.
 */
export function enforceHistoryRetention(
  options?: StrategySearchStoreOptions & {
    maxRetained?: number;
    /** Test-only injection — production always uses deleteSearchJob. */
    deleteJobForTests?: (
      jobId: string,
      opts?: StrategySearchStoreOptions,
    ) => void;
  },
): HistoryRetentionResult {
  const maxRetained = clampHistoryRetentionLimit(options?.maxRetained);
  const deleteFn = options?.deleteJobForTests ?? deleteSearchJob;
  const warnings: string[] = [];
  const deletedJobIds: string[] = [];
  const protectedJobIds: string[] = [];

  let jobs: StrategySearchJob[] = [];
  try {
    jobs = listSearchJobs(options);
  } catch (err) {
    warnings.push(
      `history retention: failed to list jobs: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    );
    return {
      maxRetained,
      eligibleBefore: 0,
      deletedJobIds,
      protectedJobIds,
      warnings,
    };
  }

  const eligible: StrategySearchJob[] = [];
  for (const job of jobs) {
    try {
      const classified = classifyJobForRetention(job, options);
      if (classified.eligible) {
        eligible.push(classified.job);
      } else {
        protectedJobIds.push(classified.jobId);
      }
    } catch (err) {
      protectedJobIds.push(job.id);
      warnings.push(
        `history retention: could not classify ${job.id}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
  }

  const eligibleBefore = eligible.length;
  eligible.sort(compareCreatedAsc);

  while (eligible.length > maxRetained) {
    const victim = eligible.shift();
    if (!victim) break;
    try {
      // Re-check immediately before delete (status may have changed).
      const again = classifyJobForRetention(victim.id, options);
      if (!again.eligible) {
        protectedJobIds.push(victim.id);
        continue;
      }
      deleteFn(victim.id, options);
      deletedJobIds.push(victim.id);
    } catch (err) {
      warnings.push(
        `history retention: failed to delete ${victim.id}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
      // Stop deleting further to avoid cascading partial failures.
      break;
    }
  }

  return {
    maxRetained,
    eligibleBefore,
    deletedJobIds,
    protectedJobIds: [...new Set(protectedJobIds)],
    warnings,
  };
}

/** Non-fatal wrapper used after successful job create. */
export function runHistoryRetentionAfterCreate(
  options?: StrategySearchStoreOptions & { maxRetained?: number },
): HistoryRetentionResult {
  try {
    const result = enforceHistoryRetention(options);
    if (result.warnings.length > 0) {
      console.warn(
        "[strategy-search] history retention warnings:",
        result.warnings.join(" | "),
      );
    }
    return result;
  } catch (err) {
    const warning = `history retention: unexpected failure: ${
      err instanceof Error ? err.message : "unknown error"
    }`;
    console.warn("[strategy-search]", warning);
    return {
      maxRetained: clampHistoryRetentionLimit(options?.maxRetained),
      eligibleBefore: 0,
      deletedJobIds: [],
      protectedJobIds: [],
      warnings: [warning],
    };
  }
}
