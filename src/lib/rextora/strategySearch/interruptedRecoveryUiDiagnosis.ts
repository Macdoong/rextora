/**
 * P2-G4 read-only interrupted operator-recovery UI diagnosis.
 * Never writes jobs, plans, index, audits, or ownership.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionStrategySearchRootCanonical } from "./historicalDeadlineCompletionDryRun";
import {
  classifyInterruptedJob,
  classifyQueuedJob,
  inspectInterruptedRecoveryRaw,
} from "./residualLifecycleInventory";
import {
  compareJobsNewestFirst,
  STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT,
} from "./historyRetention";
import type { StrategySearchPlan } from "./searchPlan";
import type { StrategySearchJob, StrategySearchJobIndex } from "./types";

export const API_LIST_MAX_LIMIT = 100;
export const RESEARCH_HISTORY_FETCH_LIMIT = STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT;
export const RESEARCH_HISTORY_SELECT_VISIBLE = 12;
export const DASHBOARD_ATTENTION_VISIBLE_CAP = 3;
export const DASHBOARD_FULL_LIST_DESTINATION = "DOES_NOT_EXIST" as const;
export const RESUME_UX = "RESUME_UX_PARTIAL" as const;
export const RECOMMENDED_DATA_MODEL = "MODEL_D" as const;
export const RECOMMENDED_INFORMATION_ARCHITECTURE =
  "RESEARCH_RECOVERY_SECTION_ABOVE_HISTORY" as const;
export const RECOVERY_SCOPE = "INTERRUPTED_ONLY" as const;
export const RESUME_CONFIRMATION = "EXISTING_SUFFICIENT" as const;

export type RecoveryClass =
  | "RESUMABLE"
  | "DEADLINE_TERMINALIZABLE"
  | "NOT_RESUMABLE"
  | "REVIEW_REQUIRED";

export interface InterruptedRecoveryRow {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedIterations: number;
  completionReason: StrategySearchPlan["completionReason"] | null;
  interruptedAtMs: number | null;
  checkpointPresent: boolean;
  eligible: boolean;
  blocker: string | null;
  remainingMs: number | null;
  recoveryClass: RecoveryClass;
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

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadIndexedJobs(root: string): StrategySearchJob[] {
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const jobs: StrategySearchJob[] = [];
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (job) jobs.push(job);
  }
  return jobs;
}

function toRecoveryClass(
  classified: ReturnType<typeof classifyInterruptedJob>,
): RecoveryClass {
  if (classified === "VALID_INTERRUPTED_RESUMABLE") return "RESUMABLE";
  if (classified === "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE") {
    return "DEADLINE_TERMINALIZABLE";
  }
  if (classified === "INVALID_INTERRUPTED") return "REVIEW_REQUIRED";
  return "NOT_RESUMABLE";
}

export function classifyRecoveryRow(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
  root: string,
): InterruptedRecoveryRow {
  const inspection = inspectInterruptedRecoveryRaw(job, plan, root, false);
  const recoveryClass = toRecoveryClass(
    classifyInterruptedJob({ job, plan, inspection }),
  );
  return {
    jobId: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedIterations: job.checkpoint.completedIterations,
    completionReason: plan?.completionReason ?? null,
    interruptedAtMs: plan?.interruptedAtMs ?? null,
    checkpointPresent: job.checkpoint.randomState != null,
    eligible: inspection.eligible,
    blocker: inspection.blocker,
    remainingMs: inspection.remainingMs,
    recoveryClass,
  };
}

export function newestWindow(jobs: StrategySearchJob[], window: number): string[] {
  return jobs
    .slice()
    .sort(compareJobsNewestFirst)
    .slice(0, window)
    .map((j) => j.id);
}

export function loadInterruptedRecoveryUiDiagnosis(rootDir?: string): {
  root: string;
  indexed: number;
  interruptedTotal: number;
  queuedTotal: number;
  runningTotal: number;
  rows: InterruptedRecoveryRow[];
  resumableIds: string[];
  deadlineIds: string[];
  notResumableIds: string[];
  reviewIds: string[];
  historyFetchIds: string[];
  historySelectIds: string[];
  interruptedInHistoryFetch: string[];
  interruptedHiddenFromHistoryFetch: string[];
  interruptedInHistorySelect: string[];
  interruptedHiddenFromHistorySelect: string[];
  modelATodayComplete: boolean;
  staleQueuedIds: string[];
  queuedNotInterrupted: boolean;
} {
  const root = path.resolve(rootDir ?? productionStrategySearchRootCanonical());
  const jobs = loadIndexedJobs(root);
  const interrupted = jobs.filter((j) => j.status === "interrupted");
  const queued = jobs.filter((j) => j.status === "queued");
  const rows = interrupted.map((job) => {
    const plan = tryRawReadJson<StrategySearchPlan>(
      path.join(root, "jobs", `${job.id}.plan.json`),
    );
    return classifyRecoveryRow(job, plan, root);
  });
  const historyFetchIds = newestWindow(jobs, RESEARCH_HISTORY_FETCH_LIMIT);
  const historySelectIds = newestWindow(jobs, RESEARCH_HISTORY_SELECT_VISIBLE);
  const fetchSet = new Set(historyFetchIds);
  const selectSet = new Set(historySelectIds);
  const newest100 = new Set(newestWindow(jobs, API_LIST_MAX_LIMIT));
  const staleQueuedIds = queued
    .filter((job) => {
      const plan = tryRawReadJson<StrategySearchPlan>(
        path.join(root, "jobs", `${job.id}.plan.json`),
      );
      return (
        classifyQueuedJob({
          job,
          plan,
          hasExecutionProfile: fs.existsSync(
            path.join(root, "jobs", `${job.id}.execution.json`),
          ),
        }) === "STALE_QUEUE"
      );
    })
    .map((j) => j.id);

  return {
    root,
    indexed: jobs.length,
    interruptedTotal: interrupted.length,
    queuedTotal: queued.length,
    runningTotal: jobs.filter((j) => j.status === "running").length,
    rows,
    resumableIds: rows.filter((r) => r.recoveryClass === "RESUMABLE").map((r) => r.jobId),
    deadlineIds: rows
      .filter((r) => r.recoveryClass === "DEADLINE_TERMINALIZABLE")
      .map((r) => r.jobId),
    notResumableIds: rows
      .filter((r) => r.recoveryClass === "NOT_RESUMABLE")
      .map((r) => r.jobId),
    reviewIds: rows
      .filter((r) => r.recoveryClass === "REVIEW_REQUIRED")
      .map((r) => r.jobId),
    historyFetchIds,
    historySelectIds,
    interruptedInHistoryFetch: interrupted
      .filter((j) => fetchSet.has(j.id))
      .map((j) => j.id),
    interruptedHiddenFromHistoryFetch: interrupted
      .filter((j) => !fetchSet.has(j.id))
      .map((j) => j.id),
    interruptedInHistorySelect: interrupted
      .filter((j) => selectSet.has(j.id))
      .map((j) => j.id),
    interruptedHiddenFromHistorySelect: interrupted
      .filter((j) => !selectSet.has(j.id))
      .map((j) => j.id),
    modelATodayComplete: interrupted.every((j) => newest100.has(j.id)),
    staleQueuedIds,
    queuedNotInterrupted: queued.every((j) => j.status === "queued"),
  };
}

export function collectProductionReadonlyHashes(rootDir?: string): {
  index: string | null;
  ownershipAudit: string | null;
  recoveryAudit: string | null;
  safe: string | null;
  nonTerminalJobs: Record<string, string | null>;
} {
  const root = path.resolve(rootDir ?? productionStrategySearchRootCanonical());
  const jobs = loadIndexedJobs(root);
  const nonTerminalJobs: Record<string, string | null> = {};
  for (const job of jobs) {
    if (
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "pause_requested" ||
      job.status === "paused" ||
      job.status === "interrupted" ||
      job.status === "cancel_requested" ||
      job.status === "cancelling"
    ) {
      nonTerminalJobs[job.id] = sha256File(path.join(root, "jobs", `${job.id}.json`));
    }
  }
  return {
    index: sha256File(path.join(root, "index.json")),
    ownershipAudit: sha256File(path.join(root, "execution-ownership-audit.jsonl")),
    recoveryAudit: sha256File(path.join(root, "recovery-audit.jsonl")),
    safe: sha256File(
      path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json"),
    ),
    nonTerminalJobs,
  };
}

export function productionRecoveryUiRoot(): string {
  return productionStrategySearchRootCanonical();
}
