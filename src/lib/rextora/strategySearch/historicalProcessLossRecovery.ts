import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { strategySearchRoot } from "../storage/runtimePaths";
import { readRunnerPayloadFromCheckpoint } from "./jobCheckpoint";
import { isSearchJobExecutionActive } from "./jobExecutionRegistry";
import { getJobExecutionProfile } from "./jobExecutionProfile";
import {
  isJobExecutionOwnedOnDisk,
  type JobExecutionOwnershipAuditRecord,
} from "./jobExecutionOwnership";
import {
  getSearchJob,
  listSearchJobs,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { transitionJobToInterrupted } from "./jobState";
import { completeInterruptedJobAtDeadline } from "./processInterruption";
import { appendRecoveryAudit, type StrategySearchRecoveryAuditRecord } from "./recoveryAudit";
import {
  activeElapsedMs,
  getSearchPlan,
  markPlanInterrupted,
  saveSearchPlan,
} from "./searchPlan";
import type { StrategySearchJob } from "./types";

export type HistoricalProcessLossClassification =
  | "SAFE_TO_MIGRATE_INTERRUPTED_AND_RESUME"
  | "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE"
  | "REQUIRES_OPERATOR_REVIEW"
  | "DO_NOT_TOUCH";

export type HistoricalBoundaryConfidence =
  | "EXACT"
  | "STRONGLY_SUPPORTED"
  | "AMBIGUOUS"
  | "UNRECOVERABLE";

export type HistoricalCheckpointVerdict =
  | "CHECKPOINT_VALID"
  | "CHECKPOINT_INVALID"
  | "CHECKPOINT_AMBIGUOUS";

export type HistoricalBudgetVerdict =
  | "ACTIVE_BUDGET_REMAINING"
  | "ACTIVE_BUDGET_EXHAUSTED"
  | "TIMING_AMBIGUOUS";

export interface CanonicalHistoricalInventoryRow {
  jobId: string;
  jobSha256: string;
  planSha256: string | null;
  checkpointFileSha256: string | null;
  status: string;
  completionReason: string | null;
}

export interface HistoricalProcessLossCandidate {
  jobId: string;
  searchName: string | null;
  classification: HistoricalProcessLossClassification;
  processLossEvidence: "CONFIRMED" | "STRONGLY_SUPPORTED" | "AMBIGUOUS";
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  lastMutationAt: string | null;
  campaignStartedAtMs: number | null;
  maxRuntimeMs: number | null;
  storedElapsedMs: number | null;
  currentComputedElapsedMs: number | null;
  currentComputedRemainingMs: number | null;
  interruptionBoundary: string | null;
  interruptionBoundaryMs: number | null;
  boundaryEvidence: string[];
  boundaryConfidence: HistoricalBoundaryConfidence;
  activeElapsedAtInterruptionMs: number | null;
  reconstructedDowntimeMs: number | null;
  remainingActiveMs: number | null;
  reconstructedRemainingMs: number | null;
  budgetVerdict: HistoricalBudgetVerdict;
  lastOwnershipAcquisition: string | null;
  lastHeartbeat: string | null;
  lastOwnershipRelease: string | null;
  staleSweep: string | null;
  processRestartAuditCount: number;
  checkpointPresent: boolean;
  checkpointVerdict: HistoricalCheckpointVerdict;
  checkpointIteration: number;
  nextIteration: number;
  checkpointPayloadVersion: number | null;
  generation: number | null;
  prngStatePresent: boolean;
  duplicatePreventionStatePresent: boolean;
  executionProfilePresent: boolean;
  latestResultEvidencePresent: boolean;
  trialAtNextIterationPresent: boolean;
  pauseCancelConflict: boolean;
  failureMessagePresent: boolean;
  proposedTransition: string;
  blockers: string[];
  evidenceToken: string;
  canonical: CanonicalHistoricalInventoryRow;
}

export interface HistoricalProcessLossDryRunResult {
  dryRun: true;
  canonicalDigest: string;
  canonicalRows: CanonicalHistoricalInventoryRow[];
  candidates: HistoricalProcessLossCandidate[];
}

export interface HistoricalProcessLossApplyResult {
  dryRun: false;
  results: Array<{
    jobId: string;
    outcome: "APPLIED_INTERRUPTED" | "APPLIED_DEADLINE" | "PRECONDITION_FAILED";
    status: string | null;
  }>;
}

type OwnershipEvidence = {
  acquired: string | null;
  heartbeat: string | null;
  released: string | null;
  staleSweep: string | null;
};

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? strategySearchRoot());
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function fileSha256(filePath: string): string | null {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? sha256(fs.readFileSync(filePath))
    : null;
}

function parseMs(value: string | number | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function readJsonLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Corrupt audit rows are ignored, never repaired by this inspector.
    }
  }
  return out;
}

function latestAt<T extends { at?: string }>(
  rows: readonly T[],
  predicate: (row: T) => boolean,
): string | null {
  return rows
    .filter(predicate)
    .map((row) => row.at ?? "")
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function loadAuditMaps(root: string): {
  ownership: Map<string, JobExecutionOwnershipAuditRecord[]>;
  recovery: Map<string, StrategySearchRecoveryAuditRecord[]>;
} {
  const ownershipRows = readJsonLines<JobExecutionOwnershipAuditRecord>(
    path.join(root, "execution-ownership-audit.jsonl"),
  );
  const recoveryRows = readJsonLines<StrategySearchRecoveryAuditRecord>(
    path.join(root, "recovery-audit.jsonl"),
  );
  const ownership = new Map<string, JobExecutionOwnershipAuditRecord[]>();
  const recovery = new Map<string, StrategySearchRecoveryAuditRecord[]>();
  for (const row of ownershipRows) {
    const rows = ownership.get(row.jobId) ?? [];
    rows.push(row);
    ownership.set(row.jobId, rows);
  }
  for (const row of recoveryRows) {
    const rows = recovery.get(row.jobId) ?? [];
    rows.push(row);
    recovery.set(row.jobId, rows);
  }
  return { ownership, recovery };
}

function ownershipEvidence(
  rows: readonly JobExecutionOwnershipAuditRecord[],
): OwnershipEvidence {
  return {
    acquired: latestAt(rows, (row) => row.event === "acquired"),
    heartbeat: latestAt(rows, (row) => row.event === "heartbeat"),
    released: latestAt(rows, (row) => row.event === "released"),
    staleSweep: latestAt(rows, (row) => row.event === "recovered_stale"),
  };
}

function canonicalRow(
  root: string,
  job: StrategySearchJob,
  completionReason: string | null,
): CanonicalHistoricalInventoryRow {
  const jobs = path.join(root, "jobs");
  return {
    jobId: job.id,
    jobSha256: fileSha256(path.join(jobs, `${job.id}.json`))!,
    planSha256: fileSha256(path.join(jobs, `${job.id}.plan.json`)),
    checkpointFileSha256: fileSha256(
      path.join(jobs, `${job.id}.checkpoint.json`),
    ),
    status: job.status,
    completionReason,
  };
}

export function canonicalHistoricalInventoryDigest(
  rows: readonly CanonicalHistoricalInventoryRow[],
): string {
  const normalized = rows
    .slice()
    .sort((a, b) => a.jobId.localeCompare(b.jobId))
    .map((row) => ({
      jobId: row.jobId,
      jobSha256: row.jobSha256,
      planSha256: row.planSha256,
      checkpointFileSha256: row.checkpointFileSha256,
      status: row.status,
      completionReason: row.completionReason,
    }));
  return sha256(JSON.stringify(normalized));
}

function generationEvidence(root: string, jobId: string): {
  generation: number | null;
  coherent: boolean;
} {
  const fp = path.join(root, "jobs", `${jobId}.generations.json`);
  if (!fs.existsSync(fp)) return { generation: null, coherent: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as {
      jobId?: string;
      generations?: Array<{ jobId?: string; generationNumber?: number }>;
    };
    if (parsed.jobId !== jobId || !Array.isArray(parsed.generations)) {
      return { generation: null, coherent: false };
    }
    const numbers = parsed.generations.map((row) => row.generationNumber);
    const coherent = parsed.generations.every(
      (row) =>
        row.jobId === jobId &&
        Number.isInteger(row.generationNumber) &&
        (row.generationNumber ?? 0) > 0,
    );
    return {
      generation:
        numbers.length === 0
          ? null
          : Math.max(...numbers.filter((n): n is number => n != null)),
      coherent,
    };
  } catch {
    return { generation: null, coherent: false };
  }
}

function trialPath(root: string, jobId: string, iteration: number): string {
  return path.join(
    root,
    "trials",
    jobId,
    `${String(iteration).padStart(8, "0")}.json`,
  );
}

function latestResultEvidence(root: string, jobId: string): boolean {
  const jobs = path.join(root, "jobs");
  const trials = path.join(root, "trials", jobId);
  return (
    (fs.existsSync(trials) && fs.readdirSync(trials).some((name) => name.endsWith(".json"))) ||
    fs.existsSync(path.join(jobs, `${jobId}.generations.json`)) ||
    fs.existsSync(path.join(jobs, `${jobId}.top10.json`))
  );
}

function inspectOne(
  root: string,
  job: StrategySearchJob,
  audits: ReturnType<typeof loadAuditMaps>,
  now: number,
): HistoricalProcessLossCandidate {
  const plan = getSearchPlan(job.id, { rootDir: root });
  const owner = ownershipEvidence(audits.ownership.get(job.id) ?? []);
  const recoveryRows = audits.recovery.get(job.id) ?? [];
  const processRestartAuditCount = recoveryRows.filter((row) =>
    /process_restart|orphan_resume/.test(row.reason),
  ).length;
  const laterReleaseAfterStaleSweep =
    owner.staleSweep != null &&
    owner.released != null &&
    owner.released >= owner.staleSweep;
  const processLossEvidence =
    owner.staleSweep && !laterReleaseAfterStaleSweep
      ? owner.heartbeat
        ? "CONFIRMED"
        : "STRONGLY_SUPPORTED"
      : "AMBIGUOUS";

  const candidates = [
    { source: "ownership_heartbeat", ms: parseMs(owner.heartbeat) },
    { source: "checkpoint_updated_at", ms: parseMs(job.checkpoint.updatedAt) },
    { source: "job_updated_at", ms: parseMs(job.updatedAt) },
  ].filter(
    (row): row is { source: string; ms: number } =>
      row.ms != null && row.ms <= now,
  );
  const boundaryMs =
    candidates.length === 0 ? null : Math.max(...candidates.map((row) => row.ms));
  const boundaryEvidence =
    boundaryMs == null
      ? []
      : candidates.filter((row) => row.ms === boundaryMs).map((row) => row.source);
  let boundaryConfidence: HistoricalBoundaryConfidence =
    processLossEvidence === "CONFIRMED"
      ? "EXACT"
      : processLossEvidence === "STRONGLY_SUPPORTED"
        ? "STRONGLY_SUPPORTED"
        : "AMBIGUOUS";
  if (!plan || boundaryMs == null || plan.campaignStartedAtMs == null) {
    boundaryConfidence = "UNRECOVERABLE";
  } else if (boundaryMs < plan.campaignStartedAtMs) {
    boundaryConfidence = "AMBIGUOUS";
  }

  let activeAtBoundary: number | null = null;
  let remainingActiveMs: number | null = null;
  let budgetVerdict: HistoricalBudgetVerdict = "TIMING_AMBIGUOUS";
  if (
    plan &&
    boundaryMs != null &&
    plan.campaignStartedAtMs != null &&
    boundaryMs >= plan.campaignStartedAtMs &&
    plan.maxRuntimeMs != null
  ) {
    const interruptedPlan = markPlanInterrupted(plan, boundaryMs, boundaryMs);
    activeAtBoundary = activeElapsedMs(interruptedPlan, boundaryMs);
    remainingActiveMs = Math.max(0, plan.maxRuntimeMs - activeAtBoundary);
    budgetVerdict =
      activeAtBoundary >= plan.maxRuntimeMs
        ? "ACTIVE_BUDGET_EXHAUSTED"
        : "ACTIVE_BUDGET_REMAINING";
  }

  let checkpointVerdict: HistoricalCheckpointVerdict = "CHECKPOINT_VALID";
  let checkpointPayloadVersion: number | null = null;
  let prngStatePresent = false;
  let duplicatePreventionStatePresent = false;
  try {
    const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
    checkpointPayloadVersion = payload?.version ?? null;
    prngStatePresent = payload?.prng != null;
    duplicatePreventionStatePresent = Array.isArray(payload?.seenHashes);
    if (
      !payload ||
      !Number.isInteger(job.checkpoint.completedIterations) ||
      job.checkpoint.completedIterations < 0 ||
      !Number.isInteger(job.checkpoint.nextIteration) ||
      job.checkpoint.nextIteration < job.checkpoint.completedIterations
    ) {
      checkpointVerdict = "CHECKPOINT_INVALID";
    }
  } catch {
    checkpointVerdict = "CHECKPOINT_INVALID";
  }
  const generation = generationEvidence(root, job.id);
  const trialAtNextIterationPresent = fs.existsSync(
    trialPath(root, job.id, job.checkpoint.nextIteration),
  );
  if (
    checkpointVerdict === "CHECKPOINT_VALID" &&
    (!generation.coherent || trialAtNextIterationPresent)
  ) {
    checkpointVerdict = "CHECKPOINT_AMBIGUOUS";
  }
  const executionProfilePresent = getJobExecutionProfile(job.id, {
    rootDir: root,
  }) != null;
  if (!executionProfilePresent) checkpointVerdict = "CHECKPOINT_INVALID";

  const pauseCancelConflict =
    plan?.pausedAtMs != null ||
    job.status === "pause_requested" ||
    job.status === "paused" ||
    job.status === "cancel_requested" ||
    job.status === "cancelling" ||
    job.status === "cancelled" ||
    job.cancelRequestedAt != null;
  const blockers: string[] = [];
  let classification: HistoricalProcessLossClassification;
  if (job.status !== "running" || plan?.completionReason != null || pauseCancelConflict) {
    classification = "DO_NOT_TOUCH";
    blockers.push("LIFECYCLE_CONFLICT");
  } else if (processLossEvidence === "AMBIGUOUS") {
    classification = "DO_NOT_TOUCH";
    blockers.push("PROCESS_LOSS_NOT_ESTABLISHED");
  } else if (
    boundaryConfidence === "AMBIGUOUS" ||
    boundaryConfidence === "UNRECOVERABLE" ||
    budgetVerdict === "TIMING_AMBIGUOUS"
  ) {
    classification = "REQUIRES_OPERATOR_REVIEW";
    blockers.push("TIMING_AMBIGUOUS");
  } else if (processLossEvidence === "STRONGLY_SUPPORTED") {
    classification = "REQUIRES_OPERATOR_REVIEW";
    blockers.push("PROCESS_LOSS_STRONGLY_SUPPORTED_ONLY");
  } else if (checkpointVerdict === "CHECKPOINT_INVALID") {
    classification = "DO_NOT_TOUCH";
    blockers.push("CHECKPOINT_INVALID");
  } else if (checkpointVerdict === "CHECKPOINT_AMBIGUOUS") {
    classification = "REQUIRES_OPERATOR_REVIEW";
    blockers.push("CHECKPOINT_AMBIGUOUS");
  } else if (budgetVerdict === "ACTIVE_BUDGET_EXHAUSTED") {
    classification = "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE";
  } else {
    classification = "SAFE_TO_MIGRATE_INTERRUPTED_AND_RESUME";
  }

  const completionReason = plan?.completionReason ?? null;
  const canonical = canonicalRow(root, job, completionReason);
  const evidenceToken = sha256(
    JSON.stringify({
      canonical,
      embeddedCheckpointSha256: sha256(JSON.stringify(job.checkpoint)),
      interruptionBoundaryMs: boundaryMs,
      processLossEvidence,
      checkpointVerdict,
      activeElapsedAtInterruptionMs: activeAtBoundary,
      remainingActiveMs,
    }),
  );

  return {
    jobId: job.id,
    searchName: plan?.searchName ?? null,
    classification,
    processLossEvidence,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    lastMutationAt: plan?.lastMutation?.appliedAt ?? null,
    campaignStartedAtMs: plan?.campaignStartedAtMs ?? null,
    maxRuntimeMs: plan?.maxRuntimeMs ?? null,
    storedElapsedMs: plan?.elapsedMs ?? null,
    currentComputedElapsedMs: plan ? activeElapsedMs(plan, now) : null,
    currentComputedRemainingMs:
      plan?.maxRuntimeMs != null
        ? Math.max(0, plan.maxRuntimeMs - activeElapsedMs(plan, now))
        : null,
    interruptionBoundary:
      boundaryMs == null ? null : new Date(boundaryMs).toISOString(),
    interruptionBoundaryMs: boundaryMs,
    boundaryEvidence,
    boundaryConfidence,
    activeElapsedAtInterruptionMs: activeAtBoundary,
    reconstructedDowntimeMs:
      boundaryMs == null ? null : Math.max(0, now - boundaryMs),
    remainingActiveMs,
    reconstructedRemainingMs: remainingActiveMs,
    budgetVerdict,
    lastOwnershipAcquisition: owner.acquired,
    lastHeartbeat: owner.heartbeat,
    lastOwnershipRelease: owner.released,
    staleSweep: owner.staleSweep,
    processRestartAuditCount,
    checkpointPresent: job.checkpoint.randomState != null,
    checkpointVerdict,
    checkpointIteration: job.checkpoint.completedIterations,
    nextIteration: job.checkpoint.nextIteration,
    checkpointPayloadVersion,
    generation: generation.generation,
    prngStatePresent,
    duplicatePreventionStatePresent,
    executionProfilePresent,
    latestResultEvidencePresent: latestResultEvidence(root, job.id),
    trialAtNextIterationPresent,
    pauseCancelConflict,
    failureMessagePresent: job.failureMessage != null,
    proposedTransition:
      classification === "SAFE_TO_MIGRATE_INTERRUPTED_AND_RESUME"
        ? "running → interrupted; later controlled recovery may queue/start"
        : classification ===
            "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE"
          ? "running → interrupted → completed (DEADLINE_REACHED; no worker)"
          : "no automatic transition",
    blockers,
    evidenceToken,
    canonical,
  };
}

function currentInventory(
  root: string,
  audits: ReturnType<typeof loadAuditMaps>,
  now: number,
): HistoricalProcessLossCandidate[] {
  return listSearchJobs({ rootDir: root })
    .filter((job) => {
      const plan = getSearchPlan(job.id, { rootDir: root });
      return (
        job.status === "running" &&
        plan?.completionReason == null &&
        !isSearchJobExecutionActive(job.id) &&
        !isJobExecutionOwnedOnDisk(job.id, { rootDir: root })
      );
    })
    .map((job) => inspectOne(root, job, audits, now))
    .sort((a, b) => a.jobId.localeCompare(b.jobId));
}

export function recoverHistoricalProcessLossOrphans(input: {
  dryRun: true;
  storeOptions?: StrategySearchStoreOptions;
  now?: number;
}): HistoricalProcessLossDryRunResult;
export function recoverHistoricalProcessLossOrphans(input: {
  dryRun: false;
  expectedCandidates: readonly HistoricalProcessLossCandidate[];
  storeOptions?: StrategySearchStoreOptions;
  now?: number;
}): HistoricalProcessLossApplyResult;
export function recoverHistoricalProcessLossOrphans(input: {
  dryRun: boolean;
  expectedCandidates?: readonly HistoricalProcessLossCandidate[];
  storeOptions?: StrategySearchStoreOptions;
  now?: number;
}): HistoricalProcessLossDryRunResult | HistoricalProcessLossApplyResult {
  const root = resolveRoot(input.storeOptions);
  const now = input.now ?? Date.now();
  const audits = loadAuditMaps(root);
  const candidates = currentInventory(root, audits, now);
  if (input.dryRun) {
    const canonicalRows = candidates.map((candidate) => candidate.canonical);
    return {
      dryRun: true,
      canonicalDigest: canonicalHistoricalInventoryDigest(canonicalRows),
      canonicalRows,
      candidates,
    };
  }

  if (!input.expectedCandidates) {
    throw new Error("historical process-loss apply requires dry-run evidence");
  }
  const currentById = new Map(candidates.map((candidate) => [candidate.jobId, candidate]));
  const results: HistoricalProcessLossApplyResult["results"] = [];
  for (const expected of input.expectedCandidates) {
    const current = currentById.get(expected.jobId);
    const liveJob = getSearchJob(expected.jobId, { rootDir: root });
    const livePlan = getSearchPlan(expected.jobId, { rootDir: root });
    const eligible =
      current != null &&
      liveJob != null &&
      livePlan != null &&
      current.evidenceToken === expected.evidenceToken &&
      current.classification === expected.classification &&
      liveJob.status === expected.canonical.status &&
      (livePlan.completionReason ?? null) === expected.canonical.completionReason &&
      current.canonical.jobSha256 === expected.canonical.jobSha256 &&
      current.canonical.planSha256 === expected.canonical.planSha256 &&
      current.canonical.checkpointFileSha256 ===
        expected.canonical.checkpointFileSha256 &&
      !current.pauseCancelConflict &&
      !isSearchJobExecutionActive(expected.jobId) &&
      !isJobExecutionOwnedOnDisk(expected.jobId, { rootDir: root }) &&
      (current.classification === "SAFE_TO_MIGRATE_INTERRUPTED_AND_RESUME" ||
        current.classification ===
          "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE");
    if (!current || !eligible || current.interruptionBoundaryMs == null) {
      results.push({
        jobId: expected.jobId,
        outcome: "PRECONDITION_FAILED",
        status: getSearchJob(expected.jobId, { rootDir: root })?.status ?? null,
      });
      continue;
    }
    const plan = getSearchPlan(expected.jobId, { rootDir: root });
    if (!plan) {
      results.push({
        jobId: expected.jobId,
        outcome: "PRECONDITION_FAILED",
        status: getSearchJob(expected.jobId, { rootDir: root })?.status ?? null,
      });
      continue;
    }
    transitionJobToInterrupted(expected.jobId, { rootDir: root });
    saveSearchPlan(
      expected.jobId,
      markPlanInterrupted(plan, current.interruptionBoundaryMs, now),
      { rootDir: root },
    );
    if (
      current.classification ===
      "SAFE_TO_MIGRATE_INTERRUPTED_AND_COMPLETE_DEADLINE"
    ) {
      completeInterruptedJobAtDeadline(expected.jobId, now, { rootDir: root });
      appendRecoveryAudit(
        {
          jobId: expected.jobId,
          previousState: "running",
          recoveredState: "completed",
          recoveryTime: new Date(now).toISOString(),
          reason: "historical_process_loss_deadline_migration",
          resumedGeneration: current.generation,
          remainingDurationMs: 0,
          autoResumed: false,
          interruptionStartedAt: current.interruptionBoundary,
        },
        { rootDir: root },
      );
      results.push({
        jobId: expected.jobId,
        outcome: "APPLIED_DEADLINE",
        status: "completed",
      });
    } else {
      appendRecoveryAudit(
        {
          jobId: expected.jobId,
          previousState: "running",
          recoveredState: "interrupted",
          recoveryTime: new Date(now).toISOString(),
          reason: "historical_process_loss_interrupted_migration",
          resumedGeneration: current.generation,
          remainingDurationMs: current.remainingActiveMs,
          autoResumed: false,
          interruptionStartedAt: current.interruptionBoundary,
        },
        { rootDir: root },
      );
      results.push({
        jobId: expected.jobId,
        outcome: "APPLIED_INTERRUPTED",
        status: "interrupted",
      });
    }
  }
  return { dryRun: false, results };
}
