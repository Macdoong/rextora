/**
 * P2-F2B dry-run: historical MODEL B correction for queued + DEADLINE_REACHED.
 * Pure projection + raw-fs reads. Writes only to a caller-provided directory.
 * Never writes production jobs, plans, index, audits, or ownership.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionRextoraDataRootCanonical } from "../storage/runtimePaths";
import { projectIndexInPlace } from "./indexReconciliationPlan";
import { projectSearchJobIndexEntry } from "./indexProjection";
import { isNormalSearchCompletionReason } from "./jobExecutionRegistry";
import { resolveResearchOutcome } from "./researchOutcome";
import type { StrategySearchPlan } from "./searchPlan";
import type {
  StrategySearchCheckpoint,
  StrategySearchJob,
  StrategySearchJobIndex,
} from "./types";

export const APPROVED_P2_F2B_IDS = [
  "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
  "search_1683a734-341d-4da8-99c7-476ad80c078d",
  "search_32bc4514-085c-4351-95d0-aa553f3c2884",
  "search_5bedd873-2e89-4604-ab27-07a9dff27e74",
  "search_6b0b920d-e45b-4101-8f2d-2013380d86a5",
  "search_6b527e08-d01d-49b8-b398-1ad27482182f",
  "search_747c28e9-c250-47ca-acfb-06eba1ed9c69",
  "search_78e8dd3f-5fea-4955-8535-7578338a18e1",
  "search_bd7a9043-1ed1-42a7-8bdc-c70ff22d249d",
  "search_d15a7b41-867a-40da-a065-28256ffaf88e",
  "search_e47a902f-5ee3-484f-88ca-73313de44cc6",
  "search_e4fe7b86-5140-40a9-b098-f6fe1eaa3027",
  "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8",
] as const;

export type ApprovedP2F2BId = (typeof APPROVED_P2_F2B_IDS)[number];

/** Proven from transitionJob / markSearchJobCompleted: same nowIso() as updatedAt. */
export const FINISHED_AT_CONTRACT =
  "JOB_TRANSITION_TO_COMPLETED_NOWISO" as const;

export const CANONICAL_COMPLETION_WRITE_SET = [
  "job.status",
  "job.updatedAt",
  "job.finishedAt",
  "index.row.status",
  "index.row.updatedAt",
  "index.row.finishedAt",
] as const;

export const SAME_BURST_MAX_MS = 1_000;

export function productionStrategySearchRootCanonical(): string {
  return path.join(productionRextoraDataRootCanonical(), "strategy-search");
}

export function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function rawReadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface OwnershipReleaseEvidence {
  at: string;
  reason: string | null;
  event: string;
}

export interface HistoricalDeadlineEvidence {
  jobId: string;
  lastTrialAt: string | null;
  trialCount: number;
  jobUpdatedAt: string;
  checkpointUpdatedAt: string | null;
  planMtime: string | null;
  ownershipReleaseAt: string | null;
  ownershipReleaseReason: string | null;
  elapsedMinusMaxMs: number | null;
}

export function lastRunnerFinishedRelease(
  auditPath: string,
  jobId: string,
): OwnershipReleaseEvidence | null {
  if (!fs.existsSync(auditPath)) return null;
  const lines = fs.readFileSync(auditPath, "utf8").split("\n");
  let last: OwnershipReleaseEvidence | null = null;
  for (const line of lines) {
    if (!line.includes(jobId)) continue;
    try {
      const rec = JSON.parse(line) as {
        jobId?: string;
        event?: string;
        reason?: string | null;
        at?: string;
      };
      if (
        rec.jobId === jobId &&
        rec.event === "released" &&
        rec.reason === "runner_finished" &&
        typeof rec.at === "string"
      ) {
        last = { at: rec.at, reason: rec.reason, event: rec.event };
      }
    } catch {
      /* skip */
    }
  }
  return last;
}

export function lastTrialCreatedAt(trialsDir: string): {
  count: number;
  lastCreatedAt: string | null;
} {
  if (!fs.existsSync(trialsDir)) return { count: 0, lastCreatedAt: null };
  const names = fs
    .readdirSync(trialsDir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort();
  if (!names.length) return { count: 0, lastCreatedAt: null };
  const last = rawReadJson<{ createdAt?: string }>(
    path.join(trialsDir, names[names.length - 1]!),
  );
  return { count: names.length, lastCreatedAt: last.createdAt ?? null };
}

export function decodeRunnerCheckpoint(job: StrategySearchJob): {
  jobStatus: string | null;
  stopReason: string | null;
  seenHashCount: number | null;
  hasPrng: boolean;
} {
  const raw = job.checkpoint?.randomState;
  if (!raw || typeof raw !== "string") {
    return { jobStatus: null, stopReason: null, seenHashCount: null, hasPrng: false };
  }
  try {
    const payload = JSON.parse(raw) as {
      jobStatus?: string;
      stopReason?: string | null;
      seenHashes?: unknown[];
      prng?: unknown;
    };
    return {
      jobStatus: payload.jobStatus ?? null,
      stopReason: payload.stopReason ?? null,
      seenHashCount: Array.isArray(payload.seenHashes) ? payload.seenHashes.length : null,
      hasPrng: payload.prng != null,
    };
  } catch {
    return { jobStatus: "DECODE_ERROR", stopReason: null, seenHashCount: null, hasPrng: false };
  }
}

/**
 * Reconstruct the lost markSearchJobCompleted nowIso().
 * Source order: plan DEADLINE write → finalize nowIso() → ownership release nowIso().
 * The release audit `at` is the first persisted nowIso() after the lost finalize.
 */
export function reconstructHistoricalFinishedAt(input: {
  jobUpdatedAt: string;
  lastTrialAt: string | null;
  ownershipReleaseAt: string | null;
  nowMs?: never;
}): {
  proposedFinishedAt: string | null;
  confidence: "STRONGLY_SUPPORTED_TERMINAL_TIMESTAMP" | "UNSAFE_TO_RECONSTRUCT";
  safeToApply: boolean;
  reason: string;
} {
  const releaseAt = input.ownershipReleaseAt;
  if (!releaseAt || Number.isNaN(Date.parse(releaseAt))) {
    return {
      proposedFinishedAt: null,
      confidence: "UNSAFE_TO_RECONSTRUCT",
      safeToApply: false,
      reason: "missing_runner_finished_release",
    };
  }
  const jobMs = Date.parse(input.jobUpdatedAt);
  const releaseMs = Date.parse(releaseAt);
  if (releaseMs < jobMs) {
    return {
      proposedFinishedAt: null,
      confidence: "UNSAFE_TO_RECONSTRUCT",
      safeToApply: false,
      reason: "release_before_queued_write",
    };
  }
  if (releaseMs - jobMs > SAME_BURST_MAX_MS) {
    return {
      proposedFinishedAt: null,
      confidence: "UNSAFE_TO_RECONSTRUCT",
      safeToApply: false,
      reason: "release_outside_same_burst",
    };
  }
  if (input.lastTrialAt) {
    const trialMs = Date.parse(input.lastTrialAt);
    if (!Number.isNaN(trialMs) && trialMs > releaseMs) {
      return {
        proposedFinishedAt: null,
        confidence: "UNSAFE_TO_RECONSTRUCT",
        safeToApply: false,
        reason: "trial_after_release",
      };
    }
  }
  return {
    proposedFinishedAt: releaseAt,
    confidence: "STRONGLY_SUPPORTED_TERMINAL_TIMESTAMP",
    safeToApply: true,
    reason: "runner_finished_release_after_queued_write_same_burst",
  };
}

export function projectHistoricalDeadlineCompletion(input: {
  currentJob: StrategySearchJob;
  currentPlan: StrategySearchPlan;
  provenFinishedAt: string;
}): {
  proposedJob: StrategySearchJob;
  proposedPlan: StrategySearchPlan;
  proposedCheckpoint: StrategySearchCheckpoint;
  jobFieldsChanged: string[];
  planFieldsChanged: string[];
  checkpointFieldsChanged: string[];
} {
  const proposedJob: StrategySearchJob = {
    ...cloneJson(input.currentJob),
    status: "completed",
    updatedAt: input.provenFinishedAt,
    finishedAt: input.provenFinishedAt,
    failureMessage: null,
  };
  const proposedPlan = cloneJson(input.currentPlan);
  const proposedCheckpoint = cloneJson(input.currentJob.checkpoint);
  return {
    proposedJob,
    proposedPlan,
    proposedCheckpoint,
    jobFieldsChanged: ["status", "updatedAt", "finishedAt"],
    planFieldsChanged: [],
    checkpointFieldsChanged: [],
  };
}

export interface HistoricalDeadlineDryRunTarget {
  jobId: string;
  jobHash: string | null;
  planHash: string | null;
  checkpointHash: string | null;
  currentState: string;
  completionReason: string | null;
  finishedAtContract: typeof FINISHED_AT_CONTRACT;
  finishedAtEvidence: HistoricalDeadlineEvidence;
  proposedFinishedAt: string | null;
  finishedAtConfidence: string;
  safeToApply: boolean;
  changedArtifacts: string[];
  changedFields: string[];
  jobFieldsChanged: string[];
  planFieldsChanged: string[];
  checkpointFieldsChanged: string[];
  indexFieldsChanged: string[];
}

export interface HistoricalDeadlineDryRunResult {
  rootDir: string;
  approvedExact: boolean;
  extraCombo: string[];
  missingApproved: string[];
  liveComboIds: string[];
  safeToApplyCount: number;
  unsafeToApplyCount: number;
  usedCurrentWallClock: false;
  targets: HistoricalDeadlineDryRunTarget[];
  proposedIndex: StrategySearchJobIndex;
  beforeHashes: Record<string, unknown>;
  healthyExamples: Array<{
    id: string;
    finishedAt: string | null;
    updatedAt: string;
    finishedEqUpdated: boolean;
    checkpointJobStatus: string | null;
    checkpointStopReason: string | null;
  }>;
}

export function loadHistoricalDeadlineDryRun(rootDir: string): HistoricalDeadlineDryRunResult {
  const root = path.resolve(rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const ownersDir = path.join(root, "owners");
  const owners = fs.existsSync(ownersDir)
    ? fs.readdirSync(ownersDir).filter((name) => !name.startsWith("."))
    : [];
  const auditPath = path.join(root, "execution-ownership-audit.jsonl");
  const recoveryPath = path.join(root, "recovery-audit.jsonl");

  const liveComboIds: string[] = [];
  const extraCombo: string[] = [];
  for (const row of index.jobs) {
    const jobPath = path.join(root, "jobs", `${row.id}.json`);
    const planPath = path.join(root, "jobs", `${row.id}.plan.json`);
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) continue;
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    if (
      job.status === "queued" &&
      isNormalSearchCompletionReason(plan.completionReason)
    ) {
      if ((APPROVED_P2_F2B_IDS as readonly string[]).includes(row.id)) {
        liveComboIds.push(row.id);
      } else {
        extraCombo.push(row.id);
      }
    }
  }

  const missingApproved = APPROVED_P2_F2B_IDS.filter(
    (id) => !liveComboIds.includes(id),
  );
  const approvedExact =
    extraCombo.length === 0 &&
    missingApproved.length === 0 &&
    liveComboIds.length === APPROVED_P2_F2B_IDS.length;

  const proposedJobs = new Map<string, StrategySearchJob>();
  const targets: HistoricalDeadlineDryRunTarget[] = [];
  const jobHashes: Record<string, string | null> = {};
  const planHashes: Record<string, string | null> = {};
  const sidecarHashes: Record<string, Record<string, string | null>> = {};

  for (const jobId of APPROVED_P2_F2B_IDS) {
    const jobPath = path.join(root, "jobs", `${jobId}.json`);
    const planPath = path.join(root, "jobs", `${jobId}.plan.json`);
    jobHashes[jobId] = sha256File(jobPath);
    planHashes[jobId] = sha256File(planPath);
    sidecarHashes[jobId] = {
      execution: sha256File(path.join(root, "jobs", `${jobId}.execution.json`)),
      generations: sha256File(path.join(root, "jobs", `${jobId}.generations.json`)),
      top10: sha256File(path.join(root, "jobs", `${jobId}.top10.json`)),
    };
    // Current verified baseline: some approved IDs are index-only historical
    // fossils with no job.json / plan.json. Skip them fail-closed; never throw
    // ENOENT and never invent a projection.
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) {
      continue;
    }
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    const trialMeta = lastTrialCreatedAt(path.join(root, "trials", jobId));
    const release = lastRunnerFinishedRelease(auditPath, jobId);
    const evidence: HistoricalDeadlineEvidence = {
      jobId,
      lastTrialAt: trialMeta.lastCreatedAt,
      trialCount: trialMeta.count,
      jobUpdatedAt: job.updatedAt,
      checkpointUpdatedAt: job.checkpoint?.updatedAt ?? null,
      planMtime: fs.existsSync(planPath)
        ? fs.statSync(planPath).mtime.toISOString()
        : null,
      ownershipReleaseAt: release?.at ?? null,
      ownershipReleaseReason: release?.reason ?? null,
      elapsedMinusMaxMs:
        typeof plan.elapsedMs === "number" && typeof plan.maxRuntimeMs === "number"
          ? plan.elapsedMs - plan.maxRuntimeMs
          : null,
    };
    const reconstructed = reconstructHistoricalFinishedAt({
      jobUpdatedAt: job.updatedAt,
      lastTrialAt: trialMeta.lastCreatedAt,
      ownershipReleaseAt: release?.at ?? null,
    });
    const jobHash = jobHashes[jobId];
    const planHash = planHashes[jobId];

    let jobFieldsChanged: string[] = [];
    let planFieldsChanged: string[] = [];
    let checkpointFieldsChanged: string[] = [];
    let indexFieldsChanged: string[] = [];
    let changedArtifacts: string[] = [];
    if (reconstructed.safeToApply && reconstructed.proposedFinishedAt) {
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: reconstructed.proposedFinishedAt,
      });
      proposedJobs.set(jobId, projected.proposedJob);
      jobFieldsChanged = projected.jobFieldsChanged;
      planFieldsChanged = projected.planFieldsChanged;
      checkpointFieldsChanged = projected.checkpointFieldsChanged;
      const currentRow = index.jobs.find((row) => row.id === jobId);
      const proposedRow = projectSearchJobIndexEntry(projected.proposedJob);
      if (currentRow) {
        if (currentRow.status !== proposedRow.status) indexFieldsChanged.push("status");
        if (currentRow.updatedAt !== proposedRow.updatedAt) {
          indexFieldsChanged.push("updatedAt");
        }
        if (currentRow.finishedAt !== proposedRow.finishedAt) {
          indexFieldsChanged.push("finishedAt");
        }
      }
      changedArtifacts = ["job.json", "index.json"];
    }

    targets.push({
      jobId,
      jobHash,
      planHash,
      checkpointHash: sha256Text(JSON.stringify(job.checkpoint)),
      currentState: job.status,
      completionReason: plan.completionReason ?? null,
      finishedAtContract: FINISHED_AT_CONTRACT,
      finishedAtEvidence: evidence,
      proposedFinishedAt: reconstructed.proposedFinishedAt,
      finishedAtConfidence: reconstructed.confidence,
      safeToApply: reconstructed.safeToApply,
      changedArtifacts,
      changedFields: [...jobFieldsChanged, ...indexFieldsChanged.map((f) => `index.${f}`)],
      jobFieldsChanged,
      planFieldsChanged,
      checkpointFieldsChanged,
      indexFieldsChanged,
    });
  }

  const proposedIndex = projectIndexInPlace(index, proposedJobs, APPROVED_P2_F2B_IDS);

  const healthyExamples: HistoricalDeadlineDryRunResult["healthyExamples"] = [];
  for (const row of index.jobs) {
    const jobPath = path.join(root, "jobs", `${row.id}.json`);
    const planPath = path.join(root, "jobs", `${row.id}.plan.json`);
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) continue;
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    if (job.status !== "completed" || plan.completionReason !== "DEADLINE_REACHED") {
      continue;
    }
    const ck = decodeRunnerCheckpoint(job);
    healthyExamples.push({
      id: job.id,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
      finishedEqUpdated: job.finishedAt === job.updatedAt,
      checkpointJobStatus: ck.jobStatus,
      checkpointStopReason: ck.stopReason ?? null,
    });
  }

  return {
    rootDir: root,
    approvedExact,
    extraCombo,
    missingApproved,
    liveComboIds: liveComboIds.sort(),
    safeToApplyCount: targets.filter((t) => t.safeToApply).length,
    unsafeToApplyCount: targets.filter((t) => !t.safeToApply).length,
    usedCurrentWallClock: false,
    targets,
    proposedIndex,
    beforeHashes: {
      index: sha256File(path.join(root, "index.json")),
      ownershipAudit: sha256File(auditPath),
      recoveryAudit: sha256File(recoveryPath),
      owners,
      jobs: jobHashes,
      plans: planHashes,
      sidecars: sidecarHashes,
    },
    healthyExamples,
  };
}

export function expectedPendingAfterProposal(
  result: HistoricalDeadlineDryRunResult,
): { before: number; after: number } {
  let before = 0;
  let after = 0;
  for (const target of result.targets) {
    if (target.currentState === "queued") before += 1;
    if (!target.safeToApply && target.currentState === "queued") after += 1;
  }
  return { before, after };
}

export function expectedOutcomeAfterProposal(): ReturnType<
  typeof resolveResearchOutcome
> {
  return resolveResearchOutcome({
    status: "completed",
    completionReason: "DEADLINE_REACHED",
    preservedResultCount: 1,
  });
}

export function writeHistoricalDeadlineDryRunArtifacts(
  result: HistoricalDeadlineDryRunResult,
  outDir: string,
): { manifestPath: string; manifestSha256: string; proposedIndexSha256: string } {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "proposed-jobs"), { recursive: true });

  const root = result.rootDir;
  for (const target of result.targets) {
    if (!target.safeToApply || !target.proposedFinishedAt) continue;
    const jobPath = path.join(root, "jobs", `${target.jobId}.json`);
    const planPath = path.join(root, "jobs", `${target.jobId}.plan.json`);
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) continue;
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    const projected = projectHistoricalDeadlineCompletion({
      currentJob: job,
      currentPlan: plan,
      provenFinishedAt: target.proposedFinishedAt,
    });
    fs.writeFileSync(
      path.join(outDir, "proposed-jobs", `${target.jobId}.json`),
      `${JSON.stringify(projected.proposedJob, null, 2)}\n`,
    );
  }

  const proposedIndexText = `${JSON.stringify(result.proposedIndex, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, "proposed-index.json"), proposedIndexText);
  fs.writeFileSync(
    path.join(outDir, "before-hashes.json"),
    `${JSON.stringify(result.beforeHashes, null, 2)}\n`,
  );

  const pending = expectedPendingAfterProposal(result);
  const diffSummary = {
    usedCurrentWallClock: false,
    finishedAtContract: FINISHED_AT_CONTRACT,
    canonicalWriteSet: CANONICAL_COMPLETION_WRITE_SET,
    approvedExact: result.approvedExact,
    safeToApplyCount: result.safeToApplyCount,
    unsafeToApplyCount: result.unsafeToApplyCount,
    pendingBefore: pending.before,
    pendingAfter: pending.after,
    planChangeRequired: false,
    checkpointCorrectionRequired: false,
    trialsModified: false,
    generationsTop10Modified: false,
    prngSeenHashesModified: false,
    targets: result.targets.map((t) => ({
      jobId: t.jobId,
      safeToApply: t.safeToApply,
      proposedFinishedAt: t.proposedFinishedAt,
      finishedAtConfidence: t.finishedAtConfidence,
      jobFieldsChanged: t.jobFieldsChanged,
      planFieldsChanged: t.planFieldsChanged,
      checkpointFieldsChanged: t.checkpointFieldsChanged,
      indexFieldsChanged: t.indexFieldsChanged,
      elapsedMinusMaxMs: t.finishedAtEvidence.elapsedMinusMaxMs,
    })),
    healthyExamples: result.healthyExamples,
  };
  fs.writeFileSync(
    path.join(outDir, "diff-summary.json"),
    `${JSON.stringify(diffSummary, null, 2)}\n`,
  );

  const manifest = {
    phase: "P2-F2B",
    finishedAtContract: FINISHED_AT_CONTRACT,
    usedCurrentWallClock: false,
    approvedIds: [...APPROVED_P2_F2B_IDS],
    approvedExact: result.approvedExact,
    extraCombo: result.extraCombo,
    missingApproved: result.missingApproved,
    safeToApplyCount: result.safeToApplyCount,
    unsafeToApplyCount: result.unsafeToApplyCount,
    targets: result.targets,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, "manifest.json"), manifestText);
  return {
    manifestPath: path.join(outDir, "manifest.json"),
    manifestSha256: sha256Text(manifestText),
    proposedIndexSha256: sha256Text(proposedIndexText),
  };
}
