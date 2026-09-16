/**
 * P2-G7 read-only diagnosis of queued-continuation runtime-budget accounting.
 * Never writes production jobs, plans, index, audits, ownership, or SAFE.
 * Artifact writes are allowed only to a caller-provided directory.
 */

import fs from "node:fs";
import path from "node:path";
import { collectStaleQueuedReadonlyHashes } from "./staleQueuedJobForensic";
import {
  activeElapsedMs,
  markPlanInterrupted,
  markPlanInterruptionResumed,
  type StrategySearchPlan,
} from "./searchPlan";
import type { StrategySearchJob } from "./types";

export const RUNTIME_BUDGET_FORMULA =
  "campaignStartedAtMs==null ? max(0, elapsedMs) : max(0, now - campaignStartedAtMs - accumulatedPauseMs - openPause - accumulatedInterruptionMs - openInterruption)" as const;

export const RUNTIME_AUTHORITY =
  "activeElapsedMs(plan, now=Date.now()); campaignStartedAtMs is required for wall-clock mode; elapsedMs is fallback only when campaignStartedAtMs is null; resumedAtMs is written but not read" as const;

export const INTERRUPTED_DOWNTIME_ACCOUNTING =
  "interruptRunningJobFromStaleOwnership (running only) stamps interruptedAtMs at max(heartbeatAt, checkpoint.updatedAt, job.updatedAt) <= recoveredAt; open interruption is excluded from activeElapsedMs; prepareInterruptedJobForRecovery / markPlanInterruptionResumed folds (now - interruptedAtMs) into accumulatedInterruptionMs and clears interruptedAtMs" as const;

export const NORMAL_REOPEN_QUEUE_TIME_COUNTS_AS_ACTIVE = "YES" as const;

export const CURRENT_REPRODUCTION = "FALSE_DEADLINE_REACHED" as const;

export const QUEUED_PROCESS_LOSS_DETECTION_SIGNAL = "PARTIAL" as const;

export const QUEUED_TO_INTERRUPTED_CURRENTLY_LEGAL = true;

export const QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY =
  "max(job.updatedAt, checkpoint.updatedAt) [, owner heartbeatAt if still available and <= recoveredAt] — same durable-work clocks as resolveProcessInterruptionBoundaryMs" as const;

export const RECOMMENDED_MODEL = "MODEL_B" as const;

export const CORRECT_OPERATOR_ACTION = "Start" as const;

export const EXISTING_TARGET_AFTER_FIX = "SAFE_WITHOUT_DATA_REWRITE" as const;

export const IS_QUEUED_CONTINUATION_PREDICATE =
  "job.status==='queued' && job.startedAt!=null && job.finishedAt==null && plan.campaignStartedAtMs!=null && plan.completionReason==null && job.checkpoint.completedIterations>0" as const;

export const THREE_HOURS_MS = 3 * 60 * 60 * 1_000;
export const TWENTY_TWO_DAYS_MS = 22 * 24 * 60 * 60 * 1_000;

export function isQueuedContinuation(
  job: Pick<
    StrategySearchJob,
    "status" | "startedAt" | "finishedAt" | "checkpoint"
  >,
  plan: Pick<
    StrategySearchPlan,
    "campaignStartedAtMs" | "completionReason"
  > | null,
): boolean {
  return (
    job.status === "queued" &&
    job.startedAt != null &&
    job.finishedAt == null &&
    plan != null &&
    plan.campaignStartedAtMs != null &&
    plan.completionReason == null &&
    job.checkpoint.completedIterations > 0
  );
}

export function isFreshQueued(
  job: Pick<StrategySearchJob, "status" | "startedAt" | "checkpoint">,
  plan: Pick<StrategySearchPlan, "campaignStartedAtMs"> | null,
): boolean {
  return (
    job.status === "queued" &&
    job.startedAt == null &&
    job.checkpoint.completedIterations === 0 &&
    (plan == null || plan.campaignStartedAtMs == null)
  );
}

export function resolveQueuedContinuationBoundaryMs(input: {
  jobUpdatedAt: string;
  checkpointUpdatedAt?: string | null;
  heartbeatAt?: string | null;
}): number {
  const values = [
    Date.parse(input.jobUpdatedAt),
    input.checkpointUpdatedAt ? Date.parse(input.checkpointUpdatedAt) : NaN,
    input.heartbeatAt ? Date.parse(input.heartbeatAt) : NaN,
  ].filter((n) => Number.isFinite(n));
  if (values.length === 0) {
    throw new Error("queued continuation has no durable timestamp");
  }
  return Math.max(...values);
}

/** Current Start path: no downtime fold. */
export function currentActiveElapsedMs(
  plan: StrategySearchPlan,
  now: number,
): number {
  return activeElapsedMs(plan, now);
}

export function currentDeadlineReached(
  plan: StrategySearchPlan,
  now: number,
): boolean {
  if (plan.maxRuntimeMs == null || plan.campaignStartedAtMs == null) return false;
  return currentActiveElapsedMs(plan, now) >= plan.maxRuntimeMs;
}

/**
 * MODEL B: fold unaccounted continuation downtime using the existing
 * markPlanInterrupted + markPlanInterruptionResumed pair, without changing status.
 */
export function modelBNormalizedPlan(
  plan: StrategySearchPlan,
  boundaryMs: number,
  now: number,
): StrategySearchPlan {
  return markPlanInterruptionResumed(
    markPlanInterrupted(plan, boundaryMs, now),
    now,
  );
}

export function modelBActiveElapsedMs(
  plan: StrategySearchPlan,
  boundaryMs: number,
  now: number,
): number {
  return activeElapsedMs(modelBNormalizedPlan(plan, boundaryMs, now), now);
}

export function remainingMs(
  plan: StrategySearchPlan,
  activeMs: number,
): number | null {
  if (plan.maxRuntimeMs == null) return null;
  return Math.max(0, plan.maxRuntimeMs - activeMs);
}

export function deadlineCase(input: {
  id: "A" | "B" | "C" | "D" | "E" | "F";
  campaignStartedAtMs: number | null;
  activeBeforeLossMs: number;
  downtimeMs: number;
  maxRuntimeMs: number;
  continuation: boolean;
}): {
  id: typeof input.id;
  currentDeadline: boolean;
  modelBDeadline: boolean;
  modelBRemainingMs: number | null;
  currentActiveMs: number;
  modelBActiveMs: number;
} {
  const now = (input.campaignStartedAtMs ?? 0) + input.activeBeforeLossMs + input.downtimeMs;
  const plan: StrategySearchPlan = {
    campaignStartedAtMs: input.continuation ? input.campaignStartedAtMs : null,
    maxRuntimeMs: input.maxRuntimeMs,
    elapsedMs: input.activeBeforeLossMs,
    accumulatedPauseMs: 0,
    accumulatedInterruptionMs: 0,
    pausedAtMs: null,
    interruptedAtMs: null,
    resumedAtMs: null,
  } as StrategySearchPlan;
  const boundary = (input.campaignStartedAtMs ?? 0) + input.activeBeforeLossMs;
  const currentActive = input.continuation
    ? currentActiveElapsedMs(plan, now)
    : 0;
  const modelBActive = input.continuation
    ? modelBActiveElapsedMs(plan, boundary, now)
    : 0;
  return {
    id: input.id,
    currentDeadline: input.continuation && currentDeadlineReached(plan, now),
    modelBDeadline:
      input.continuation &&
      input.maxRuntimeMs != null &&
      modelBActive >= input.maxRuntimeMs,
    modelBRemainingMs: input.continuation
      ? remainingMs(plan, modelBActive)
      : input.maxRuntimeMs,
    currentActiveMs: currentActive,
    modelBActiveMs: modelBActive,
  };
}

export function evaluateModels(): Record<
  "A" | "B" | "C" | "D" | "E" | "F" | "G",
  {
    lifecycleCorrectness: string;
    recurrencePrevention: string;
    existingTarget: string;
    freshQueued: string;
    inProcessReopen: string;
    interruptedJobs: string;
    deadlineCorrectness: string;
    dataMigration: string;
    scope: string;
    extraRuntimeRisk: string;
    falseDeadlineRisk: string;
    operatorSemantics: string;
    rejected?: string;
  }
> {
  return {
    A: {
      lifecycleCorrectness:
        "Best future-loss shape: process-lost continuation becomes interrupted like running.",
      recurrencePrevention:
        "Only if a stale owner file still exists at sweep. Existing target owner is already gone.",
      existingTarget:
        "Does not fire; Start still false-deadlines unless a separate historical rewrite.",
      freshQueued: "Unchanged if predicate excludes startedAt==null.",
      inProcessReopen: "Unchanged; owner is fresh during the milliseconds of queued continue.",
      interruptedJobs: "Unchanged.",
      deadlineCorrectness: "Correct after conversion+Resume; not for today's target without rewrite.",
      dataMigration: "Required for the existing target.",
      scope: "orphan sweep + interruptRunningJobFromStaleOwnership + predicate.",
      extraRuntimeRisk: "Low if boundary uses last durable work, not sweep time.",
      falseDeadlineRisk: "High for the existing target if only MODEL A ships.",
      operatorSemantics: "Resume after conversion.",
      rejected: "Does not recover the current historical target without a production rewrite.",
    },
    B: {
      lifecycleCorrectness:
        "Status stays the proven queued continuation. Timing is folded with the existing interruption pair at Start/orphan-start.",
      recurrencePrevention:
        "startStrategySearchJobApi is the queued Start and orphan auto-start path.",
      existingTarget: "SAFE_WITHOUT_DATA_REWRITE — normalize at next Start.",
      freshQueued: "Predicate excludes never-started jobs; campaign clock still starts at first Start.",
      inProcessReopen: "Does not hit Start; milliseconds of queued time stay active.",
      interruptedJobs: "Resume path unchanged.",
      deadlineCorrectness:
        "After fold, active elapsed equals last-work elapsed; remaining budget preserved; already-expired still terminals.",
      dataMigration: "None.",
      scope: "predicate + boundary + startStrategySearchJobApi queued branch.",
      extraRuntimeRisk:
        "Only the gap from last persist to Start is excluded (actual downtime). Immediate Start after reopen adds ~0.",
      falseDeadlineRisk: "Removed for continuation Starts.",
      operatorSemantics: "Existing queued Start, now safe.",
    },
    C: {
      lifecycleCorrectness: "Blocks the unsafe Start; does not restore remaining budget.",
      recurrencePrevention: "Partial — override=100 would also need a block.",
      existingTarget: "Stuck; cannot continue.",
      freshQueued: "Must not block fresh queued.",
      inProcessReopen: "Unchanged.",
      interruptedJobs: "Unchanged.",
      deadlineCorrectness: "Avoids false terminal only by refusing work.",
      dataMigration: "None.",
      scope: "start-path reject.",
      extraRuntimeRisk: "None.",
      falseDeadlineRisk: "Avoided by refusal, not by correct accounting.",
      operatorSemantics: "Blocked.",
      rejected: "Does not make the target or future continuations recoverable.",
    },
    D: {
      lifecycleCorrectness: "Duplicates interrupted timing with new fields.",
      recurrencePrevention: "Possible but large.",
      existingTarget: "Would need a write of new fields.",
      freshQueued: "Must ignore new fields.",
      inProcessReopen: "Must not suspend in-process queued.",
      interruptedJobs: "Two clocks to keep in sync.",
      deadlineCorrectness: "Can be made correct.",
      dataMigration: "Schema + existing target write.",
      scope: "plan schema, orchestrator, start, resume, UI.",
      extraRuntimeRisk: "Depends on new formula.",
      falseDeadlineRisk: "Depends on new formula.",
      operatorSemantics: "New state to explain.",
      rejected: "Unnecessary architecture vs existing interruption pair.",
    },
    E: {
      lifecycleCorrectness: "Wrong — discards consumed active time.",
      recurrencePrevention: "Prevents false deadline by granting a new budget.",
      existingTarget: "Would get a fresh 3 hours.",
      freshQueued: "Same as today if only applied to continuation.",
      inProcessReopen: "Must not reset mid-loop.",
      interruptedJobs: "Must not reset.",
      deadlineCorrectness: "Incorrect extra runtime.",
      dataMigration: "Would rewrite campaignStartedAtMs.",
      scope: "start path.",
      extraRuntimeRisk: "Full remaining 3 hours — rejected.",
      falseDeadlineRisk: "None.",
      operatorSemantics: "Looks like a new campaign.",
      rejected: "Silently grants a fresh 3-hour budget.",
    },
    F: {
      lifecycleCorrectness:
        "elapsedMs is not authoritative while campaignStartedAtMs is set; live running would freeze until sync.",
      recurrencePrevention: "Would hide wall-clock age.",
      existingTarget: "Would use persisted ~10m elapsed and look correct, but breaks live accounting.",
      freshQueued: "campaignStartedAtMs null already uses elapsedMs.",
      inProcessReopen: "Loop-head deadline would ignore live wall time.",
      interruptedJobs: "Open interruption windows would stop working.",
      deadlineCorrectness: "Incorrect for in-flight jobs.",
      dataMigration: "None if only changing the formula.",
      scope: "activeElapsedMs — high blast radius.",
      extraRuntimeRisk: "Live jobs could under-count.",
      falseDeadlineRisk: "Paused/interrupted open intervals would be ignored.",
      operatorSemantics: "Deadline stops tracking live time.",
      rejected: "Breaks the proven live/pause/interrupt clock.",
    },
    G: {
      lifecycleCorrectness: "No existing helper covers queued continuation downtime.",
      recurrencePrevention: "n/a",
      existingTarget: "n/a",
      freshQueued: "n/a",
      inProcessReopen: "n/a",
      interruptedJobs: "n/a",
      deadlineCorrectness: "n/a",
      dataMigration: "n/a",
      scope: "n/a",
      extraRuntimeRisk: "n/a",
      falseDeadlineRisk: "n/a",
      operatorSemantics: "n/a",
      rejected: "prepareInterruptedJobForRecovery requires interrupted; markPlanResumed is pause-only.",
    },
  };
}

export function standardDeadlineCases(maxRuntimeMs = THREE_HOURS_MS) {
  const t0 = Date.UTC(2026, 7, 11, 16, 20, 43);
  return {
    A: deadlineCase({
      id: "A",
      campaignStartedAtMs: t0,
      activeBeforeLossMs: 10 * 60_000,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      maxRuntimeMs,
      continuation: true,
    }),
    B: deadlineCase({
      id: "B",
      campaignStartedAtMs: t0,
      activeBeforeLossMs: 179 * 60_000,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      maxRuntimeMs,
      continuation: true,
    }),
    C: deadlineCase({
      id: "C",
      campaignStartedAtMs: t0,
      activeBeforeLossMs: 181 * 60_000,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      maxRuntimeMs,
      continuation: true,
    }),
    D: deadlineCase({
      id: "D",
      campaignStartedAtMs: t0,
      activeBeforeLossMs: 200 * 60_000,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      maxRuntimeMs,
      continuation: true,
    }),
    E: deadlineCase({
      id: "E",
      campaignStartedAtMs: t0,
      activeBeforeLossMs: 10 * 60_000,
      downtimeMs: 0,
      maxRuntimeMs,
      continuation: true,
    }),
    F: deadlineCase({
      id: "F",
      campaignStartedAtMs: null,
      activeBeforeLossMs: 0,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      maxRuntimeMs,
      continuation: false,
    }),
  };
}

export function writeQueuedContinuationRuntimeArtifacts(artifactDir: string): void {
  const hashes = collectStaleQueuedReadonlyHashes();
  const cases = standardDeadlineCases();
  fs.mkdirSync(artifactDir, { recursive: true });
  const write = (name: string, value: unknown) => {
    fs.writeFileSync(
      path.join(artifactDir, name),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  };
  write("runtime-equation.json", {
    formula: RUNTIME_BUDGET_FORMULA,
    authority: RUNTIME_AUTHORITY,
    source: "src/lib/rextora/strategySearch/searchPlan.ts#activeElapsedMs",
    deadlineCheck: "src/lib/rextora/strategySearch/searchOrchestrator.ts#runtimeExceeded",
    resumedAtMsReadByActiveElapsed: false,
    elapsedMsAuthoritativeWhenCampaignSet: false,
  });
  write("interrupted-timing-contract.json", {
    contract: INTERRUPTED_DOWNTIME_ACCOUNTING,
    boundary: "resolveProcessInterruptionBoundaryMs",
    crashToDetection:
      "Excluded when boundary is last heartbeat/job/checkpoint, not recoveredAt",
    detectionToResume:
      "Excluded: open interruptedAtMs until markPlanInterruptionResumed folds it into accumulatedInterruptionMs",
  });
  write("queued-continuation-contract.json", {
    predicate: IS_QUEUED_CONTINUATION_PREDICATE,
    freshQueued: "startedAt==null && completedIterations==0 && campaignStartedAtMs==null",
    inProcessQueuedCountsAsActive: NORMAL_REOPEN_QUEUE_TIME_COUNTS_AS_ACTIVE,
    queuedToInterruptedLegal: QUEUED_TO_INTERRUPTED_CURRENTLY_LEGAL,
    detectionSignal: QUEUED_PROCESS_LOSS_DETECTION_SIGNAL,
  });
  write("failure-reproduction.json", {
    result: CURRENT_REPRODUCTION,
    cause:
      "queued continuation has no interruptedAtMs/accumulatedInterruptionMs, so activeElapsedMs uses raw now-campaignStartedAtMs after downtime",
  });
  write("timestamp-authority.json", {
    authority: QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY,
    confidence: "HIGH when job.updatedAt and checkpoint.updatedAt exist; heartbeat optional",
    doNotUse: ["Date.now() as interruption start", "stale-sweep recoveredAt as interruption start"],
  });
  write("model-comparison.json", evaluateModels());
  write("recommended-model.json", {
    recommended: RECOMMENDED_MODEL,
    operatorAction: CORRECT_OPERATOR_ACTION,
    existingTarget: EXISTING_TARGET_AFTER_FIX,
    productionRewriteRequired: false,
    deadlineCases: cases,
    g8: {
      recurrencePrevention:
        "startStrategySearchJobApi queued branch: if isQueuedContinuation, fold downtime then if still expired complete at deadline else start",
      existingTargetHandling:
        "No production rewrite. Next operator/orphan Start uses the same normalize.",
      files: [
        "src/lib/rextora/strategySearch/processInterruption.ts",
        "src/lib/rextora/strategySearch/jobApiService.ts",
        "tests/queuedContinuationRuntime.test.ts",
      ],
    },
  });
  write("existing-target-plan.json", {
    afterFix: EXISTING_TARGET_AFTER_FIX,
    rewriteRequired: false,
    fields: [],
    timestampAuthority: QUEUED_CONTINUATION_INTERRUPTION_TIMESTAMP_AUTHORITY,
  });
  write("production-readonly-hashes.json", hashes);
}
