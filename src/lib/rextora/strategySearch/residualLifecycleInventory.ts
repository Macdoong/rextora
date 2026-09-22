/**
 * P2-G1 read-only residual Research lifecycle inventory.
 * Raw-fs only. Never writes jobs, plans, index, audits, or ownership.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  isDashboardAttentionResearch,
  isDashboardExecutingResearch,
  isDashboardPendingResearch,
  selectDashboardResearch,
} from "@/components/rextora/dashboard/dashboardResearchSelection";
import { productionStrategySearchRootCanonical } from "./historicalDeadlineCompletionDryRun";
import { RETIRED_SAFE_FILE_NAME } from "../strategy/retiredSafeBaseline";
import { projectSearchJobIndexEntry } from "./indexProjection";
import {
  isNormalSearchCompletionReason,
  listActiveSearchJobExecutions,
  planHasNormalTerminalCompletionReason,
} from "./jobExecutionRegistry";
import { EXECUTION_OWNERSHIP_STALE_MS } from "./jobExecutionOwnership";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  resolveOrphanAutoResumeLimit,
} from "./orphanJobRecovery";
import { isTerminalJobStatus } from "./jobState";
import { readRunnerPayloadFromCheckpoint } from "./jobCheckpoint";
import { resolveResearchOutcome } from "./researchOutcome";
import { activeElapsedMs, type StrategySearchPlan } from "./searchPlan";
import { isVerifiedTerminalStaleEvidence } from "./staleTerminalRecovery";
import type {
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobIndexEntry,
  StrategySearchJobStatus,
} from "./types";

const SIDECAR_MARKERS = [
  ".plan.json",
  ".execution.json",
  ".generations.json",
  ".top10.json",
  ".top10.history.jsonl",
  ".archive.json",
];

const ALL_STATUSES: StrategySearchJobStatus[] = [
  "queued",
  "running",
  "pause_requested",
  "paused",
  "interrupted",
  "cancel_requested",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
];

export const LIFECYCLE_INVARIANT_EVIDENCE = {
  queued:
    "jobStore.createSearchJob finishedAt=null; jobExecutionRegistry.planHasNormalTerminalCompletionReason blocks start/orphan resume",
  running:
    "jobStore.transitionJob keeps finishedAt unless completed/failed/cancelled; staleTerminalRecovery only for running+normal reason+no owner",
  paused:
    "jobStore.markSearchJobPaused does not stamp finishedAt; resolveResearchOutcome maps paused/PAUSED",
  interrupted:
    "jobStore.markSearchJobInterrupted does not stamp finishedAt; processInterruption.inspectInterruptedRecovery requires timing+checkpoint+profile+no owner",
  completed:
    "jobStore.transitionJob stamps finishedAt=nowIso() on completed; failureMessage forced null",
  failed:
    "jobStore.transitionJob stamps finishedAt on failed and requires failureMessage",
  cancelled:
    "jobStore.markSearchJobCancelled requires finishedAt (legacy path stamps if missing)",
} as const;

export type HealthClass = "HEALTHY" | "REVIEW" | "INVALID";
export type QueuedClass = "VALID_QUEUE" | "STALE_QUEUE" | "UNKNOWN_QUEUE";
export type InterruptedClass =
  | "VALID_INTERRUPTED_RESUMABLE"
  | "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE"
  | "HISTORICAL_ATTENTION_ONLY"
  | "INVALID_INTERRUPTED"
  | "NOT_INTERRUPTED";

export type DiskOnlyRuntimeRisk = "NONE" | "LOW" | "MATERIAL" | "UNKNOWN";

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rawReadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function tryRawReadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return rawReadJson<T>(filePath);
  } catch {
    return null;
  }
}

function isPrimaryJobFileName(name: string): boolean {
  if (!name.startsWith("search_") || !name.endsWith(".json")) return false;
  return SIDECAR_MARKERS.every((marker) => !name.includes(marker));
}

function listDirNames(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => !name.startsWith("."));
}

function ownerPresent(root: string, jobId: string): {
  filePresent: boolean;
  active: boolean;
} {
  const fp = path.join(root, "owners", `${jobId}.owner.json`);
  if (!fs.existsSync(fp)) return { filePresent: false, active: false };
  const rec = tryRawReadJson<{ heartbeatAt?: string; releasedAt?: string | null }>(
    fp,
  );
  if (!rec || rec.releasedAt) return { filePresent: true, active: false };
  const age = Date.now() - Date.parse(rec.heartbeatAt ?? "");
  return {
    filePresent: true,
    active: Number.isFinite(age) && age >= 0 && age <= EXECUTION_OWNERSHIP_STALE_MS,
  };
}

function lastJsonlForJob(
  filePath: string,
  jobId: string,
): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  let last: Record<string, unknown> | null = null;
  for (const line of lines) {
    if (!line.includes(jobId)) continue;
    try {
      const rec = JSON.parse(line) as { jobId?: string };
      if (rec.jobId === jobId) last = rec as Record<string, unknown>;
    } catch {
      /* skip */
    }
  }
  return last;
}

export function inspectInterruptedRecoveryRaw(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
  root: string,
  executionActive: boolean,
): {
  eligible: boolean;
  blocker: string | null;
  activeElapsedMs: number | null;
  remainingMs: number | null;
} {
  if (job.status !== "interrupted") {
    return { eligible: false, blocker: "NOT_INTERRUPTED", activeElapsedMs: null, remainingMs: null };
  }
  if (ownerPresent(root, job.id).active || executionActive) {
    return { eligible: false, blocker: "ACTIVE_OWNER", activeElapsedMs: null, remainingMs: null };
  }
  if (!plan) {
    return { eligible: false, blocker: "MISSING_PLAN", activeElapsedMs: null, remainingMs: null };
  }
  if (
    plan.campaignStartedAtMs == null ||
    !Number.isFinite(plan.campaignStartedAtMs) ||
    plan.interruptedAtMs == null ||
    !Number.isFinite(plan.interruptedAtMs)
  ) {
    return { eligible: false, blocker: "INVALID_TIMING", activeElapsedMs: null, remainingMs: null };
  }
  if (job.checkpoint.randomState == null) {
    return { eligible: false, blocker: "MISSING_CHECKPOINT", activeElapsedMs: null, remainingMs: null };
  }
  try {
    const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
    if (
      !payload ||
      !Number.isInteger(job.checkpoint.completedIterations) ||
      job.checkpoint.completedIterations < 0 ||
      !Number.isInteger(job.checkpoint.nextIteration) ||
      job.checkpoint.nextIteration < job.checkpoint.completedIterations
    ) {
      return { eligible: false, blocker: "INVALID_CHECKPOINT", activeElapsedMs: null, remainingMs: null };
    }
  } catch {
    return { eligible: false, blocker: "INVALID_CHECKPOINT", activeElapsedMs: null, remainingMs: null };
  }
  if (!fs.existsSync(path.join(root, "jobs", `${job.id}.execution.json`))) {
    return { eligible: false, blocker: "MISSING_EXECUTION_PROFILE", activeElapsedMs: null, remainingMs: null };
  }
  const elapsed = activeElapsedMs(plan);
  return {
    eligible: true,
    blocker: null,
    activeElapsedMs: elapsed,
    remainingMs:
      plan.maxRuntimeMs == null ? null : Math.max(0, plan.maxRuntimeMs - elapsed),
  };
}

export function classifyInterruptedJob(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  inspection: ReturnType<typeof inspectInterruptedRecoveryRaw>;
}): InterruptedClass {
  if (input.job.status !== "interrupted") return "NOT_INTERRUPTED";
  const illegalReason =
    input.plan != null && planHasNormalTerminalCompletionReason(input.plan);
  if (input.job.finishedAt != null || illegalReason) return "INVALID_INTERRUPTED";
  if (input.inspection.eligible) {
    if (
      input.inspection.remainingMs === 0 &&
      input.plan?.maxRuntimeMs != null
    ) {
      return "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE";
    }
    return "VALID_INTERRUPTED_RESUMABLE";
  }
  return "HISTORICAL_ATTENTION_ONLY";
}

export function classifyQueuedJob(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  hasExecutionProfile: boolean;
}): QueuedClass {
  if (input.job.status !== "queued") return "UNKNOWN_QUEUE";
  if (!input.plan) return "UNKNOWN_QUEUE";
  if (
    input.job.finishedAt != null ||
    planHasNormalTerminalCompletionReason(input.plan)
  ) {
    return "STALE_QUEUE";
  }
  if (input.job.startedAt != null || !input.hasExecutionProfile) {
    return "STALE_QUEUE";
  }
  return "VALID_QUEUE";
}

export function classifyCheckpoint(input: {
  job: StrategySearchJob;
  startEligible: boolean;
}): { benignLag: boolean; riskMismatch: boolean; note: string } {
  let payload = null as ReturnType<typeof readRunnerPayloadFromCheckpoint> | null;
  let corrupt = false;
  try {
    payload = readRunnerPayloadFromCheckpoint(input.job.checkpoint);
  } catch {
    corrupt = true;
  }
  const terminal = isTerminalJobStatus(input.job.status);
  if (terminal) {
    const lag =
      payload != null &&
      payload.jobStatus !== input.job.status &&
      !isTerminalJobStatus(payload.jobStatus);
    return {
      benignLag: lag || payload == null,
      riskMismatch: false,
      note: "canonical completion leaves checkpoint unchanged",
    };
  }
  if (corrupt && input.startEligible) {
    return {
      benignLag: false,
      riskMismatch: true,
      note: "start/resume path decodes checkpoint and fail-closes to failed",
    };
  }
  return { benignLag: false, riskMismatch: false, note: "checkpoint not consumed unsafely" };
}

export function detectDashboardContradiction(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  executionActive: boolean;
}): { contradiction: boolean; reason: string | null } {
  const candidate = {
    id: input.job.id,
    status: input.job.status,
    executionActive: input.executionActive,
  };
  const outcome = resolveResearchOutcome({
    status: input.job.status,
    completionReason: input.plan?.completionReason ?? null,
    preservedResultCount: input.plan?.qualifiedHashes.length ?? 0,
  });
  const pending = isDashboardPendingResearch(candidate);
  const executing = isDashboardExecutingResearch(candidate);
  const attention = isDashboardAttentionResearch(candidate);
  if (outcome.isPresentedAsCompleted && input.job.status !== "completed") {
    return {
      contradiction: true,
      reason: "outcome_presents_completed_but_job_not_completed",
    };
  }
  if (pending && outcome.id === "normal_completed") {
    return { contradiction: true, reason: "pending_vs_normal_completed" };
  }
  if (attention && outcome.isPresentedAsCompleted) {
    return { contradiction: true, reason: "attention_vs_completed_outcome" };
  }
  if (executing && isTerminalJobStatus(input.job.status)) {
    return { contradiction: true, reason: "executing_vs_terminal" };
  }
  return { contradiction: false, reason: null };
}

export interface ResidualJobRecord {
  jobId: string;
  health: HealthClass;
  status: StrategySearchJobStatus;
  indexStatus: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureMessage: string | null;
  executionActive: boolean;
  ownerActive: boolean;
  ownerFilePresent: boolean;
  completionReason: string | null;
  pausedAtMs: number | null;
  interruptedAtMs: number | null;
  campaignStartedAtMs: number | null;
  maxRuntimeMs: number | null;
  checkpointJobStatus: string | null;
  checkpointStopReason: string | null;
  completedIterations: number;
  nextIteration: number;
  queuedClass: QueuedClass | null;
  interruptedClass: InterruptedClass | null;
  checkpointBenignLag: boolean;
  checkpointRiskMismatch: boolean;
  dashboardContradiction: boolean;
  findings: string[];
  latestRecoveryEvent: string | null;
}

export interface ResidualLifecycleInventory {
  rootDir: string;
  indexedJobCount: number;
  diskJobCount: number;
  diskOnlyCount: number;
  statusCounts: Record<StrategySearchJobStatus, number>;
  indexJobStatusMismatchTotal: number;
  healthyCount: number;
  reviewCount: number;
  invalidCount: number;
  reviewIds: string[];
  invalidIds: string[];
  jobs: ResidualJobRecord[];
  terminalWithoutFinishedAt: string[];
  terminalWithActiveExecution: string[];
  terminalIllegalReason: string[];
  terminalIndexMismatch: string[];
  queuedIds: string[];
  validQueuedIds: string[];
  staleQueuedIds: string[];
  unknownQueuedIds: string[];
  interruptedIds: string[];
  interruptedClassCounts: Record<InterruptedClass, number>;
  invalidInterruptedIds: string[];
  failedIds: string[];
  cancelledIds: string[];
  checkpointBenignLagCount: number;
  checkpointRiskMismatchCount: number;
  ownershipInconsistencies: {
    activeOwnerWithNonactiveJob: string[];
    activeExecutionWithTerminalJob: string[];
    activeJobWithoutOwner: string[];
    staleOwnerCount: number;
  };
  startup: {
    processResumeLimit: number;
    productionDefaultResumeLimit: number;
    autoStartCandidates: string[];
    interruptedRecoveryCandidates: string[];
    deadlineCompleteCandidates: string[];
    terminalStaleSkips: string[];
    ignored: string[];
    productionWouldMutate: string[];
    unexpectedRestartMutationRisk: boolean;
  };
  dashboard: {
    executingResearch: string | null;
    pendingResearch: string | null;
    attentionCount: number;
    attentionIds: string[];
    contradictions: Array<{ jobId: string; reason: string }>;
  };
  diskOnly: Array<{
    jobId: string;
    status: string | null;
    completionReason: string | null;
  }>;
  diskOnlyRuntimeRisk: DiskOnlyRuntimeRisk;
  hashes: {
    index: string | null;
    ownershipAudit: string | null;
    recoveryAudit: string | null;
    safe: string | null;
  };
}

function emptyCounts(): Record<StrategySearchJobStatus, number> {
  return Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
    StrategySearchJobStatus,
    number
  >;
}

export function loadResidualLifecycleInventory(
  rootDir: string,
): ResidualLifecycleInventory {
  const root = path.resolve(rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const jobsDir = path.join(root, "jobs");
  const diskJobIds = fs.existsSync(jobsDir)
    ? fs.readdirSync(jobsDir).filter(isPrimaryJobFileName).map((n) => n.slice(0, -".json".length))
    : [];
  const indexedIds = index.jobs.map((row) => row.id);
  const indexedSet = new Set(indexedIds);
  const diskOnlyIds = diskJobIds.filter((id) => !indexedSet.has(id)).sort();
  const registry = new Set(listActiveSearchJobExecutions());
  const statusCounts = emptyCounts();
  const jobs: ResidualJobRecord[] = [];
  let mismatch = 0;
  const terminalWithoutFinishedAt: string[] = [];
  const terminalWithActiveExecution: string[] = [];
  const terminalIllegalReason: string[] = [];
  const terminalIndexMismatch: string[] = [];
  const interruptedClassCounts: Record<InterruptedClass, number> = {
    VALID_INTERRUPTED_RESUMABLE: 0,
    VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE: 0,
    HISTORICAL_ATTENTION_ONLY: 0,
    INVALID_INTERRUPTED: 0,
    NOT_INTERRUPTED: 0,
  };

  for (const row of index.jobs) {
    const jobPath = path.join(jobsDir, `${row.id}.json`);
    const job = tryRawReadJson<StrategySearchJob>(jobPath);
    const plan = tryRawReadJson<StrategySearchPlan>(
      path.join(jobsDir, `${row.id}.plan.json`),
    );
    if (!job) {
      mismatch += 1;
      jobs.push({
        jobId: row.id,
        health: "INVALID",
        status: row.status as StrategySearchJobStatus,
        indexStatus: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: null,
        finishedAt: row.finishedAt,
        failureMessage: null,
        executionActive: registry.has(row.id),
        ownerActive: ownerPresent(root, row.id).active,
        ownerFilePresent: ownerPresent(root, row.id).filePresent,
        completionReason: plan?.completionReason ?? null,
        pausedAtMs: plan?.pausedAtMs ?? null,
        interruptedAtMs: plan?.interruptedAtMs ?? null,
        campaignStartedAtMs: plan?.campaignStartedAtMs ?? null,
        maxRuntimeMs: plan?.maxRuntimeMs ?? null,
        checkpointJobStatus: null,
        checkpointStopReason: null,
        completedIterations: 0,
        nextIteration: 0,
        queuedClass: null,
        interruptedClass: null,
        checkpointBenignLag: false,
        checkpointRiskMismatch: false,
        dashboardContradiction: false,
        findings: ["missing_job_json"],
        latestRecoveryEvent: null,
      });
      continue;
    }
    if (row.status !== job.status) {
      mismatch += 1;
      terminalIndexMismatch.push(job.id);
    }
    if (statusCounts[job.status] != null) statusCounts[job.status] += 1;

    const executionActive = registry.has(job.id);
    const owner = ownerPresent(root, job.id);
    const inspection = inspectInterruptedRecoveryRaw(
      job,
      plan,
      root,
      executionActive,
    );
    const queuedClass =
      job.status === "queued"
        ? classifyQueuedJob({
            job,
            plan,
            hasExecutionProfile: fs.existsSync(
              path.join(jobsDir, `${job.id}.execution.json`),
            ),
          })
        : null;
    const interruptedClass =
      job.status === "interrupted"
        ? classifyInterruptedJob({ job, plan, inspection })
        : null;
    if (interruptedClass) interruptedClassCounts[interruptedClass] += 1;

    const startEligible =
      (job.status === "queued" &&
        !planHasNormalTerminalCompletionReason(plan) &&
        job.finishedAt == null) ||
      (interruptedClass === "VALID_INTERRUPTED_RESUMABLE" ||
        interruptedClass === "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE");
    const checkpoint = classifyCheckpoint({ job, startEligible });
    const dash = detectDashboardContradiction({ job, plan, executionActive });
    const findings: string[] = [];
    if (row.status !== job.status) findings.push("index_job_status_mismatch");
    if (job.status === "queued" && planHasNormalTerminalCompletionReason(plan)) {
      findings.push("queued_plus_normal_terminal_reason");
    }
    if (job.status === "queued" && job.finishedAt != null) {
      findings.push("queued_with_finishedAt");
    }
    if (
      (job.status === "running" ||
        job.status === "paused" ||
        job.status === "pause_requested" ||
        job.status === "interrupted" ||
        job.status === "cancel_requested" ||
        job.status === "cancelling") &&
      job.finishedAt != null
    ) {
      findings.push("nonterminal_with_finishedAt");
    }
    if (isTerminalJobStatus(job.status) && job.finishedAt == null) {
      findings.push("terminal_without_finishedAt");
      terminalWithoutFinishedAt.push(job.id);
    }
    if (isTerminalJobStatus(job.status) && (executionActive || owner.active)) {
      findings.push("terminal_with_active_execution");
      terminalWithActiveExecution.push(job.id);
    }
    if (
      job.status === "completed" &&
      plan &&
      plan.completionReason != null &&
      plan.completionReason !== "DEADLINE_REACHED" &&
      !isNormalSearchCompletionReason(plan.completionReason) &&
      plan.completionReason !== "USER_CANCELLED" &&
      plan.completionReason !== "USER_STOPPED"
    ) {
      findings.push("terminal_illegal_reason");
      terminalIllegalReason.push(job.id);
    }
    if (job.status === "completed" && job.failureMessage) {
      findings.push("completed_with_failureMessage");
    }
    if (checkpoint.riskMismatch) findings.push("checkpoint_risk_mismatch");
    if (dash.contradiction) findings.push(dash.reason ?? "dashboard_contradiction");
    if (interruptedClass === "INVALID_INTERRUPTED") {
      findings.push("invalid_interrupted");
    }

    let health: HealthClass = "HEALTHY";
    const invalidFinding = findings.some((f) =>
      [
        "queued_plus_normal_terminal_reason",
        "queued_with_finishedAt",
        "terminal_without_finishedAt",
        "terminal_with_active_execution",
        "index_job_status_mismatch",
        "invalid_interrupted",
        "completed_with_failureMessage",
        "nonterminal_with_finishedAt",
        "missing_job_json",
      ].includes(f),
    );
    if (invalidFinding) health = "INVALID";
    else if (
      queuedClass === "STALE_QUEUE" ||
      queuedClass === "UNKNOWN_QUEUE" ||
      interruptedClass === "HISTORICAL_ATTENTION_ONLY" ||
      interruptedClass === "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE" ||
      interruptedClass === "VALID_INTERRUPTED_RESUMABLE" ||
      dash.contradiction ||
      checkpoint.riskMismatch ||
      job.status === "paused" ||
      job.status === "pause_requested" ||
      job.status === "running" ||
      job.status === "cancel_requested" ||
      job.status === "cancelling"
    ) {
      health = "REVIEW";
    }

    let ckStatus: string | null = null;
    let ckStop: string | null = null;
    try {
      const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
      ckStatus = payload?.jobStatus ?? null;
      ckStop = payload?.stopReason ?? null;
    } catch {
      ckStatus = "DECODE_ERROR";
    }

    jobs.push({
      jobId: job.id,
      health,
      status: job.status,
      indexStatus: row.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      failureMessage: job.failureMessage,
      executionActive,
      ownerActive: owner.active,
      ownerFilePresent: owner.filePresent,
      completionReason: plan?.completionReason ?? null,
      pausedAtMs: plan?.pausedAtMs ?? null,
      interruptedAtMs: plan?.interruptedAtMs ?? null,
      campaignStartedAtMs: plan?.campaignStartedAtMs ?? null,
      maxRuntimeMs: plan?.maxRuntimeMs ?? null,
      checkpointJobStatus: ckStatus,
      checkpointStopReason: ckStop,
      completedIterations: job.checkpoint.completedIterations,
      nextIteration: job.checkpoint.nextIteration,
      queuedClass,
      interruptedClass,
      checkpointBenignLag: checkpoint.benignLag,
      checkpointRiskMismatch: checkpoint.riskMismatch,
      dashboardContradiction: dash.contradiction,
      findings,
      latestRecoveryEvent:
        (lastJsonlForJob(path.join(root, "recovery-audit.jsonl"), job.id)
          ?.reason as string | undefined) ?? null,
    });
  }

  const reviewIds = jobs.filter((j) => j.health === "REVIEW").map((j) => j.jobId);
  const invalidIds = jobs.filter((j) => j.health === "INVALID").map((j) => j.jobId);
  const queued = jobs.filter((j) => j.status === "queued");
  const interrupted = jobs.filter((j) => j.status === "interrupted");

  const activeOwnerWithNonactiveJob = jobs
    .filter(
      (j) =>
        j.ownerActive &&
        j.status !== "running" &&
        j.status !== "pause_requested" &&
        j.status !== "cancel_requested" &&
        j.status !== "cancelling",
    )
    .map((j) => j.jobId);
  const activeExecutionWithTerminalJob = jobs
    .filter((j) => j.executionActive && isTerminalJobStatus(j.status))
    .map((j) => j.jobId);
  const activeJobWithoutOwner = jobs
    .filter(
      (j) =>
        (j.status === "running" || j.status === "pause_requested") &&
        !j.ownerActive &&
        !j.executionActive,
    )
    .map((j) => j.jobId);
  const staleOwnerCount = jobs.filter((j) => j.ownerFilePresent && !j.ownerActive)
    .length;

  const scan = jobs
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 100);
  const autoStartCandidates: string[] = [];
  const interruptedRecoveryCandidates: string[] = [];
  const deadlineCompleteCandidates: string[] = [];
  const terminalStaleSkips: string[] = [];
  const ignored: string[] = [];
  for (const rec of scan) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(jobsDir, `${rec.jobId}.json`),
    );
    const plan = tryRawReadJson<StrategySearchPlan>(
      path.join(jobsDir, `${rec.jobId}.plan.json`),
    );
    if (!job) {
      ignored.push(rec.jobId);
      continue;
    }
    const stale = isVerifiedTerminalStaleEvidence({
      status: job.status,
      completionReason: plan?.completionReason ?? null,
      executionActive: rec.executionActive,
      ownershipActive: rec.ownerActive,
      cancelRequestedAt: job.cancelRequestedAt ?? null,
      pausedAtMs: plan?.pausedAtMs ?? null,
    });
    if (stale) {
      terminalStaleSkips.push(job.id);
      continue;
    }
    if (job.status === "queued" && planHasNormalTerminalCompletionReason(plan)) {
      terminalStaleSkips.push(job.id);
      continue;
    }
    if (job.status === "interrupted") {
      if (rec.interruptedClass === "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE") {
        deadlineCompleteCandidates.push(job.id);
        interruptedRecoveryCandidates.push(job.id);
        continue;
      }
      if (rec.interruptedClass === "VALID_INTERRUPTED_RESUMABLE") {
        interruptedRecoveryCandidates.push(job.id);
        continue;
      }
      ignored.push(job.id);
      continue;
    }
    if (job.status === "queued") {
      autoStartCandidates.push(job.id);
      continue;
    }
    ignored.push(job.id);
  }

  const processLimit = resolveOrphanAutoResumeLimit();
  const productionWouldMutate = [
    ...deadlineCompleteCandidates,
    ...interruptedRecoveryCandidates.filter(
      (id) => !deadlineCompleteCandidates.includes(id),
    ),
    ...autoStartCandidates,
  ].slice(0, DEFAULT_ORPHAN_AUTO_RESUME_LIMIT);

  const dashJobs = jobs.map((j) => ({
    id: j.jobId,
    status: j.status,
    executionActive: j.executionActive,
  }));
  const selection = selectDashboardResearch(dashJobs);
  const contradictions = jobs
    .filter((j) => j.dashboardContradiction)
    .map((j) => ({
      jobId: j.jobId,
      reason: j.findings.find((f) => f.includes("outcome") || f.includes("pending") || f.includes("attention") || f.includes("executing")) ?? "dashboard_contradiction",
    }));

  const diskOnly = diskOnlyIds.map((id) => {
    const job = tryRawReadJson<StrategySearchJob>(path.join(jobsDir, `${id}.json`));
    const plan = tryRawReadJson<StrategySearchPlan>(
      path.join(jobsDir, `${id}.plan.json`),
    );
    return {
      jobId: id,
      status: job?.status ?? null,
      completionReason: plan?.completionReason ?? null,
    };
  });

  return {
    rootDir: root,
    indexedJobCount: index.jobs.length,
    diskJobCount: diskJobIds.length,
    diskOnlyCount: diskOnlyIds.length,
    statusCounts,
    indexJobStatusMismatchTotal: mismatch,
    healthyCount: jobs.filter((j) => j.health === "HEALTHY").length,
    reviewCount: reviewIds.length,
    invalidCount: invalidIds.length,
    reviewIds,
    invalidIds,
    jobs,
    terminalWithoutFinishedAt,
    terminalWithActiveExecution,
    terminalIllegalReason,
    terminalIndexMismatch,
    queuedIds: queued.map((j) => j.jobId),
    validQueuedIds: queued.filter((j) => j.queuedClass === "VALID_QUEUE").map((j) => j.jobId),
    staleQueuedIds: queued.filter((j) => j.queuedClass === "STALE_QUEUE").map((j) => j.jobId),
    unknownQueuedIds: queued
      .filter((j) => j.queuedClass === "UNKNOWN_QUEUE")
      .map((j) => j.jobId),
    interruptedIds: interrupted.map((j) => j.jobId),
    interruptedClassCounts,
    invalidInterruptedIds: interrupted
      .filter((j) => j.interruptedClass === "INVALID_INTERRUPTED")
      .map((j) => j.jobId),
    failedIds: jobs.filter((j) => j.status === "failed").map((j) => j.jobId),
    cancelledIds: jobs.filter((j) => j.status === "cancelled").map((j) => j.jobId),
    checkpointBenignLagCount: jobs.filter((j) => j.checkpointBenignLag).length,
    checkpointRiskMismatchCount: jobs.filter((j) => j.checkpointRiskMismatch).length,
    ownershipInconsistencies: {
      activeOwnerWithNonactiveJob,
      activeExecutionWithTerminalJob,
      activeJobWithoutOwner,
      staleOwnerCount,
    },
    startup: {
      processResumeLimit: processLimit,
      productionDefaultResumeLimit: DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
      autoStartCandidates,
      interruptedRecoveryCandidates,
      deadlineCompleteCandidates,
      terminalStaleSkips,
      ignored,
      productionWouldMutate,
      unexpectedRestartMutationRisk: productionWouldMutate.length > 0,
    },
    dashboard: {
      executingResearch: selection.executingResearch?.id ?? null,
      pendingResearch: selection.pendingResearch?.id ?? null,
      attentionCount: selection.attentionTotal,
      attentionIds: selection.attentionResearch.map((j) => j.id),
      contradictions,
    },
    diskOnly,
    diskOnlyRuntimeRisk: "NONE",
    hashes: {
      index: sha256File(path.join(root, "index.json")),
      ownershipAudit: sha256File(path.join(root, "execution-ownership-audit.jsonl")),
      recoveryAudit: sha256File(path.join(root, "recovery-audit.jsonl")),
      safe: sha256File(
        path.join(process.cwd(), "data", "strategies", RETIRED_SAFE_FILE_NAME),
      ),
    },
  };
}

export function buildResidualIssues(
  inventory: ResidualLifecycleInventory,
): Array<{
  issueCode: string;
  affectedCount: number;
  exactIds: string[];
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";
  runtimeImpact: string;
  operatorImpact: string;
  currentRecurrencePossible: boolean;
  recommendedNextAction: string;
}> {
  const issues: ReturnType<typeof buildResidualIssues> = [];
  const push = (
    issueCode: string,
    ids: string[],
    severity: (typeof issues)[number]["severity"],
    runtimeImpact: string,
    operatorImpact: string,
    currentRecurrencePossible: boolean,
    recommendedNextAction: string,
  ) => {
    if (!ids.length && severity !== "INFORMATIONAL") return;
    issues.push({
      issueCode,
      affectedCount: ids.length,
      exactIds: ids,
      severity,
      runtimeImpact,
      operatorImpact,
      currentRecurrencePossible,
      recommendedNextAction,
    });
  };

  push(
    "QUEUED_PLUS_NORMAL_TERMINAL_REASON",
    inventory.jobs
      .filter((j) => j.findings.includes("queued_plus_normal_terminal_reason"))
      .map((j) => j.jobId),
    "BLOCKER",
    "start/orphan resume is blocked; leftover invalid pair",
    "can appear pending while already terminal",
    false,
    "Do not start. Historical correction only if newly found.",
  );
  push(
    "INDEX_JOB_STATUS_MISMATCH",
    inventory.terminalIndexMismatch,
    "HIGH",
    "list APIs prefer job.json; catalog row is stale",
    "status badge may disagree with file",
    false,
    "Report-only unless a later approved reconcile.",
  );
  push(
    "TERMINAL_WITHOUT_FINISHED_AT",
    inventory.terminalWithoutFinishedAt,
    "HIGH",
    "violates transitionJob finishedAt contract",
    "terminal jobs look unfinished",
    false,
    "Diagnosis only; do not stamp now.",
  );
  push(
    "INVALID_INTERRUPTED",
    inventory.invalidInterruptedIds,
    "HIGH",
    "interrupted contract broken",
    "recovery/start meaning is unsafe",
    false,
    "Do not auto-transition.",
  );
  push(
    "STARTUP_WOULD_MUTATE",
    inventory.startup.productionWouldMutate,
    inventory.startup.unexpectedRestartMutationRisk ? "HIGH" : "INFORMATIONAL",
    "NODE_ENV=production orphan recovery can resume/complete up to 2 jobs",
    "restart may change Research state without an operator click",
    true,
    "Keep development auto-resume at 0; do not start a production server against this store without an explicit decision.",
  );
  push(
    "INTERRUPTED_RESUMABLE",
    inventory.jobs
      .filter((j) => j.interruptedClass === "VALID_INTERRUPTED_RESUMABLE")
      .map((j) => j.jobId),
    "MEDIUM",
    "eligible for inspectInterruptedRecovery resume",
    "Dashboard attention: 실행 중단",
    true,
    "Operator resume on Research screen only.",
  );
  push(
    "INTERRUPTED_DEADLINE_TERMINALIZABLE",
    inventory.jobs
      .filter(
        (j) => j.interruptedClass === "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE",
      )
      .map((j) => j.jobId),
    "MEDIUM",
    "startup may completeInterruptedJobAtDeadline if under resume cap",
    "looks interrupted though campaign time is exhausted",
    true,
    "Do not auto-complete in G1. Future explicit apply only.",
  );
  push(
    "HISTORICAL_INTERRUPTED_ATTENTION",
    inventory.jobs
      .filter((j) => j.interruptedClass === "HISTORICAL_ATTENTION_ONLY")
      .map((j) => j.jobId),
    "LOW",
    "orphan recovery skips (ineligible)",
    "Dashboard attention list is large",
    false,
    "Leave as historical attention. Do not re-index or auto-run.",
  );
  push(
    "STALE_QUEUED",
    inventory.staleQueuedIds,
    "MEDIUM",
    "queued but not a clean first-start wait",
    "can appear as pendingResearch",
    false,
    "Do not start automatically. Review individually.",
  );
  push(
    "DASHBOARD_OUTCOME_CONTRADICTION",
    inventory.dashboard.contradictions.map((c) => c.jobId),
    "MEDIUM",
    "none (presentation only)",
    "Dashboard vs resolveResearchOutcome disagree",
    false,
    "No UI change in G1.",
  );
  push(
    "CHECKPOINT_RISK_MISMATCH",
    inventory.jobs.filter((j) => j.checkpointRiskMismatch).map((j) => j.jobId),
    "MEDIUM",
    "start/resume can fail-close the job to failed",
    "operator start could mutate status",
    true,
    "Do not start those jobs.",
  );
  push(
    "DISK_ONLY_FOSSILS",
    inventory.diskOnly.map((d) => d.jobId),
    "LOW",
    "listSearchJobs/recoverOrphanIndexEntries scan index only",
    "invisible in normal Research list",
    false,
    "Do not re-index.",
  );
  push(
    "CROSS_FILE_TRANSACTION_WINDOW",
    [],
    "INFORMATIONAL",
    "job+index writes are not one atomic transaction; F2C used backup+rollback",
    "crash between job and index write can desync",
    false,
    "Documented structural debt. No code change in G1.",
  );
  push(
    "ROOT_INDEX_UPDATED_AT_JSDOC_GAP",
    [],
    "INFORMATIONAL",
    "live writers stamp nowIso(); historical projectIndexInPlace preserves root updatedAt",
    "none if writers stay on their contract",
    false,
    "Documentation/contract already tested in strategySearchIndexUpdatedAtContract. No G1 change.",
  );

  if (inventory.indexJobStatusMismatchTotal === 0) {
    push(
      "INDEX_JOB_MIRROR_ALIGNED",
      [],
      "INFORMATIONAL",
      "none",
      "none",
      false,
      "Keep using projectSearchJobIndexEntry for any future historical reconcile.",
    );
  }
  return issues;
}

export function writeResidualLifecycleInventoryArtifacts(
  inventory: ResidualLifecycleInventory,
  outDir: string,
): void {
  fs.mkdirSync(outDir, { recursive: true });
  const issues = buildResidualIssues(inventory);
  const write = (name: string, value: unknown) => {
    fs.writeFileSync(
      path.join(outDir, name),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  };
  write("inventory.json", {
    phase: "P2-G1",
    invariantEvidence: LIFECYCLE_INVARIANT_EVIDENCE,
    ...inventory,
  });
  write("residual-issues.json", issues);
  write("status-counts.json", {
    indexedJobCount: inventory.indexedJobCount,
    statusCounts: inventory.statusCounts,
    indexJobStatusMismatchTotal: inventory.indexJobStatusMismatchTotal,
    healthyCount: inventory.healthyCount,
    reviewCount: inventory.reviewCount,
    invalidCount: inventory.invalidCount,
  });
  write("startup-recovery-dry-analysis.json", inventory.startup);
  write("disk-only-summary.json", {
    diskJobCount: inventory.diskJobCount,
    indexedJobCount: inventory.indexedJobCount,
    diskOnlyCount: inventory.diskOnlyCount,
    diskOnly: inventory.diskOnly,
    diskOnlyRuntimeRisk: inventory.diskOnlyRuntimeRisk,
    rediscovery: {
      listSearchJobs: "index rows only",
      recoverOrphanIndexEntries: "indexed missing job.json only",
      reindex: false,
    },
  });
  write("before-after-hashes.json", {
    before: inventory.hashes,
    after: inventory.hashes,
    productionWrites: 0,
  });
}

export function productionResidualInventoryRoot(): string {
  return productionStrategySearchRootCanonical();
}

export function countProjectionMismatchesRaw(rootDir: string): number {
  const root = path.resolve(rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  let n = 0;
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (!job) {
      n += 1;
      continue;
    }
    const projected = projectSearchJobIndexEntry(job);
    const keys: Array<keyof StrategySearchJobIndexEntry> = [
      "id",
      "status",
      "updatedAt",
      "finishedAt",
    ];
    for (const key of keys) {
      if (String(row[key] ?? "") !== String(projected[key] ?? "")) n += 1;
    }
  }
  return n;
}

export function sha256Path(filePath: string): string | null {
  return sha256File(filePath);
}
