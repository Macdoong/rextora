/**
 * P2-G2 read-only startup auto-resume planner.
 * Mirrors recoverOrphanSearchJobs selection without writes, ownership, or start.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionStrategySearchRootCanonical } from "./historicalDeadlineCompletionDryRun";
import {
  inspectInterruptedRecoveryRaw,
} from "./residualLifecycleInventory";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  resolveOrphanAutoResumeLimit,
} from "./orphanJobRecovery";
import {
  isNormalSearchCompletionReason,
  planHasNormalTerminalCompletionReason,
} from "./jobExecutionRegistry";
import { isVerifiedTerminalStaleEvidence } from "./staleTerminalRecovery";
import type { StrategySearchPlan } from "./searchPlan";
import type { StrategySearchJob, StrategySearchJobIndex } from "./types";

export const STARTUP_SCAN_CAP = 100;

export const STARTUP_CANDIDATE_ORDER =
  "listSearchJobs(index order) → sort String(b.updatedAt).localeCompare(String(a.updatedAt)) → slice(0, 100) → single combined walk" as const;

export const EXPLICIT_RESUME_PATH = "PARTIAL" as const;

export type StartupSkipReason =
  | "terminal_stale_running"
  | "queued_plus_normal_terminal"
  | "status_not_queued_or_interrupted"
  | "record_recovered_paused"
  | "worker_active"
  | "cap_exhausted"
  | "interrupted_ineligible"
  | "deadline_completed_no_start"
  | "start_would_fail";

export interface StartupSelectionStep {
  jobId: string;
  status: string;
  updatedAt: string;
  action: "start" | "deadline_complete" | "skip";
  reason: string;
  capConsumed: boolean;
  selected: boolean;
}

export interface StartupSelectionPlan {
  resumeLimit: number;
  scanned: number;
  selected: StartupSelectionStep[];
  deadlineCompleted: string[];
  skipped: Array<{ jobId: string; reason: StartupSkipReason }>;
  remainingEligibleAfterCap: string[];
  queuedCandidates: string[];
  interruptedCandidates: string[];
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

function hasExecutionProfile(root: string, jobId: string): boolean {
  return fs.existsSync(path.join(root, "jobs", `${jobId}.execution.json`));
}

export function sortStartupScan(jobs: StrategySearchJob[]): StrategySearchJob[] {
  return jobs
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, STARTUP_SCAN_CAP);
}

export function planOrphanStartupSelection(input: {
  rootDir: string;
  resumeLimit: number;
  recordRecovered?: string[];
  workerActiveIds?: string[];
}): StartupSelectionPlan {
  const root = path.resolve(input.rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const jobs: StrategySearchJob[] = [];
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (job) jobs.push(job);
  }
  const scan = sortStartupScan(jobs);
  const recovered = new Set(input.recordRecovered ?? []);
  const workers = new Set(input.workerActiveIds ?? []);
  const selected: StartupSelectionStep[] = [];
  const deadlineCompleted: string[] = [];
  const skipped: Array<{ jobId: string; reason: StartupSkipReason }> = [];
  const queuedCandidates: string[] = [];
  const interruptedCandidates: string[] = [];
  let resumed = 0;

  for (const job of scan) {
    const plan = tryRawReadJson<StrategySearchPlan>(
      path.join(root, "jobs", `${job.id}.plan.json`),
    );
    const terminalStale = isVerifiedTerminalStaleEvidence({
      status: job.status,
      completionReason: plan?.completionReason ?? null,
      executionActive: workers.has(job.id),
      ownershipActive: false,
      cancelRequestedAt: job.cancelRequestedAt ?? null,
      pausedAtMs: plan?.pausedAtMs ?? null,
    });
    if (terminalStale) {
      skipped.push({ jobId: job.id, reason: "terminal_stale_running" });
      continue;
    }
    if (job.status === "queued" && planHasNormalTerminalCompletionReason(plan)) {
      skipped.push({ jobId: job.id, reason: "queued_plus_normal_terminal" });
      continue;
    }
    if (job.status !== "interrupted" && job.status !== "queued") {
      skipped.push({ jobId: job.id, reason: "status_not_queued_or_interrupted" });
      continue;
    }
    if (job.status === "queued") queuedCandidates.push(job.id);
    if (job.status === "interrupted") interruptedCandidates.push(job.id);
    if (recovered.has(job.id)) {
      skipped.push({ jobId: job.id, reason: "record_recovered_paused" });
      continue;
    }
    if (workers.has(job.id)) {
      skipped.push({ jobId: job.id, reason: "worker_active" });
      continue;
    }
    if (resumed >= input.resumeLimit) {
      skipped.push({ jobId: job.id, reason: "cap_exhausted" });
      continue;
    }
    if (job.status === "interrupted") {
      const inspection = inspectInterruptedRecoveryRaw(job, plan, root, false);
      if (!inspection.eligible) {
        skipped.push({ jobId: job.id, reason: "interrupted_ineligible" });
        continue;
      }
      if (
        plan?.maxRuntimeMs != null &&
        inspection.activeElapsedMs != null &&
        inspection.activeElapsedMs >= plan.maxRuntimeMs
      ) {
        deadlineCompleted.push(job.id);
        selected.push({
          jobId: job.id,
          status: job.status,
          updatedAt: job.updatedAt,
          action: "deadline_complete",
          reason: "process_loss_active_deadline_reached",
          capConsumed: false,
          selected: false,
        });
        skipped.push({ jobId: job.id, reason: "deadline_completed_no_start" });
        continue;
      }
    }
    if (job.status === "queued" && !hasExecutionProfile(root, job.id)) {
      skipped.push({ jobId: job.id, reason: "start_would_fail" });
      continue;
    }
    const reason =
      job.status === "interrupted"
        ? "process_loss_interrupted_resume"
        : "queued_startup_resume";
    selected.push({
      jobId: job.id,
      status: job.status,
      updatedAt: job.updatedAt,
      action: "start",
      reason,
      capConsumed: true,
      selected: true,
    });
    resumed += 1;
  }

  const remainingEligibleAfterCap = [
    ...interruptedCandidates,
    ...queuedCandidates,
  ].filter((id) => !selected.some((s) => s.jobId === id && s.selected));

  return {
    resumeLimit: input.resumeLimit,
    scanned: scan.length,
    selected: selected.filter((s) => s.selected),
    deadlineCompleted,
    skipped,
    remainingEligibleAfterCap,
    queuedCandidates,
    interruptedCandidates,
  };
}

export function capConsumptionTruthTable(): Array<{
  className: string;
  consumesCap: boolean;
  evidence: string;
}> {
  return [
    {
      className: "queued_successful_start",
      consumesCap: true,
      evidence: "resumed.push after startStrategySearchJobApi",
    },
    {
      className: "interrupted_successful_start",
      consumesCap: true,
      evidence: "resumed.push after startStrategySearchJobApi",
    },
    {
      className: "interrupted_deadline_complete",
      consumesCap: false,
      evidence: "continue after completeInterruptedJobAtDeadline; no resumed.push; still requires resumed.length < limit gate",
    },
    {
      className: "terminal_stale_skip",
      consumesCap: false,
      evidence: "continue before cap check",
    },
    {
      className: "queued_plus_terminal_skip",
      consumesCap: false,
      evidence: "continue before cap check",
    },
    {
      className: "ineligible_interrupted",
      consumesCap: false,
      evidence: "continue after cap gate without resumed.push",
    },
    {
      className: "ownership_or_worker_conflict",
      consumesCap: false,
      evidence: "continue before cap check",
    },
    {
      className: "failed_start",
      consumesCap: false,
      evidence: "catch block; no resumed.push",
    },
  ];
}

export function resolveLimitMatrix(): {
  developmentUnset: number;
  productionUnset: number;
  testUnset: number;
  explicit0: number;
  invalid: number;
  empty: number;
} {
  return {
    developmentUnset: resolveOrphanAutoResumeLimit({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv),
    productionUnset: resolveOrphanAutoResumeLimit({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv),
    testUnset: resolveOrphanAutoResumeLimit({
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv),
    explicit0: resolveOrphanAutoResumeLimit({
      NODE_ENV: "production",
      REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "0",
    } as NodeJS.ProcessEnv),
    invalid: resolveOrphanAutoResumeLimit({
      NODE_ENV: "production",
      REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "nope",
    } as NodeJS.ProcessEnv),
    empty: resolveOrphanAutoResumeLimit({
      NODE_ENV: "production",
      REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "  ",
    } as NodeJS.ProcessEnv),
  };
}

export function countInterruptedInHistoryWindow(
  rootDir: string,
  window = 20,
): { visible: string[]; hidden: string[] } {
  const root = path.resolve(rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const jobs: StrategySearchJob[] = [];
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (job) jobs.push(job);
  }
  const newest = jobs
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      if (ta !== tb) return tb - ta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, window);
  const visibleSet = new Set(newest.map((j) => j.id));
  const interrupted = jobs.filter((j) => j.status === "interrupted");
  return {
    visible: interrupted.filter((j) => visibleSet.has(j.id)).map((j) => j.id),
    hidden: interrupted.filter((j) => !visibleSet.has(j.id)).map((j) => j.id),
  };
}

export function collectProductionReadonlyHashes(rootDir: string): {
  index: string | null;
  ownershipAudit: string | null;
  recoveryAudit: string | null;
  safe: string | null;
  nonTerminalJobs: Record<string, string | null>;
} {
  const root = path.resolve(rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const nonTerminalJobs: Record<string, string | null> = {};
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (!job) continue;
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

export function productionStartupRoot(): string {
  return productionStrategySearchRootCanonical();
}

export { DEFAULT_ORPHAN_AUTO_RESUME_LIMIT, resolveOrphanAutoResumeLimit };

export function isNormalReasonForSkip(
  reason: StrategySearchPlan["completionReason"],
): boolean {
  return isNormalSearchCompletionReason(reason);
}
