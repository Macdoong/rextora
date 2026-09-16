/**
 * P2-E2B / P2-E2C index reconciliation planner.
 *
 * Pure: never writes production index, jobs, plans, audits, or ownership.
 * Canonical row projection is projectSearchJobIndexEntry (jobStore).
 */

import crypto from "node:crypto";
import type {
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobIndexEntry,
  StrategySearchJobStatus,
} from "./types";
import { projectSearchJobIndexEntry } from "./indexProjection";
import type { StrategySearchCompletionReason } from "./searchPlan";

export const APPROVED_P2_E2B_RECONCILE_IDS = [
  "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
  "search_1683a734-341d-4da8-99c7-476ad80c078d",
  "search_1697e585-9324-4a2b-8dde-95bcbc08a674",
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

export type ApprovedP2E2BReconcileId =
  (typeof APPROVED_P2_E2B_RECONCILE_IDS)[number];

export const INDEX_PROJECTION_FIELDS = [
  "id",
  "status",
  "strategyTemplateId",
  "generatorType",
  "createdAt",
  "updatedAt",
  "completedIterations",
  "finishedAt",
] as const;

export type IndexProjectionField = (typeof INDEX_PROJECTION_FIELDS)[number];

export const LEGAL_JOB_STATUSES: ReadonlySet<StrategySearchJobStatus> = new Set([
  "queued",
  "running",
  "interrupted",
  "pause_requested",
  "paused",
  "cancel_requested",
  "cancelling",
  "cancelled",
  "completed",
  "failed",
]);

const ACTIVE_JOB_STATUSES: ReadonlySet<StrategySearchJobStatus> = new Set([
  "running",
  "pause_requested",
  "cancel_requested",
  "cancelling",
]);

export interface StatusDesyncRow {
  jobId: string;
  indexStatus: StrategySearchJobStatus | null;
  jobStatus: StrategySearchJobStatus | null;
}

export interface IndexReconciliationPlanEvidence {
  completionReason: StrategySearchCompletionReason | undefined;
  pausedAtMs: number | null | undefined;
  interruptedAtMs: number | null | undefined;
  campaignStartedAtMs: number | null | undefined;
}

export interface JobCatalogAuthorityInput {
  jobId: string;
  job: StrategySearchJob | null;
  parseError: string | null;
  jobFileNameId: string;
  indexId: string;
  ownedOnDisk: boolean;
  executionActive: boolean;
  registryActive: boolean;
  plan: IndexReconciliationPlanEvidence | null;
  planParseError: string | null;
}

export interface JobCatalogAuthorityResult {
  safeToReconcile: boolean;
  reasons: string[];
  lifecycleDebt: string[];
}

export interface IndexReconciliationTarget {
  jobId: string;
  currentIndexRow: StrategySearchJobIndexEntry;
  currentJobProjection: StrategySearchJobIndexEntry;
  changedFields: IndexProjectionField[];
  currentIndexRowHash: string;
  proposedIndexRowHash: string;
  jobFileHash: string;
  planFileHash: string | null;
  safeToReconcile: boolean;
  evidenceSummary: string;
  authorityReasons: string[];
  lifecycleDebt: string[];
}

export type IndexReconciliationPreconditionCode =
  | "STATUS_DESYNC_SET_MISMATCH"
  | "UNAPPROVED_DESYNC"
  | "MISSING_APPROVED_DESYNC"
  | "JOB_HASH_CHANGED"
  | "INDEX_HASH_CHANGED"
  | "UNSAFE_AUTHORITY"
  | "PROPOSED_ROW_COUNT_MISMATCH"
  | "UNAPPROVED_ROW_CHANGED"
  | "ID_SET_CHANGED"
  | "ORDER_CHANGED"
  | "DISK_ONLY_ADDED";

export interface IndexReconciliationPlanInput {
  allowlist: readonly string[];
  index: StrategySearchJobIndex;
  jobsById: ReadonlyMap<string, StrategySearchJob>;
  authorities: ReadonlyMap<string, JobCatalogAuthorityResult>;
  jobFileHashes: Readonly<Record<string, string>>;
  planFileHashes: Readonly<Record<string, string | null>>;
  expectedJobFileHashes?: Readonly<Record<string, string>>;
  expectedIndexHash?: string;
  currentIndexHash: string;
  diskJobIds?: readonly string[];
}

export interface IndexReconciliationPlanResult {
  ok: boolean;
  preconditionCode: IndexReconciliationPreconditionCode | null;
  preconditionMessage: string | null;
  approvedTargetCount: number;
  actualDesyncCount: number;
  unapprovedDesyncCount: number;
  statusDesyncs: StatusDesyncRow[];
  targets: IndexReconciliationTarget[];
  safeCount: number;
  unsafeCount: number;
  proposedIndex: StrategySearchJobIndex;
  changedRowCount: number;
  unapprovedChangedRowCount: number;
  idSetUnchanged: boolean;
  rowCountUnchanged: boolean;
  orderUnchanged: boolean;
  diskOnlyJobsAdded: boolean;
  postProposalStatusDesyncCount: number;
  postProposalProjectionMismatchCount: number;
}

export { projectSearchJobIndexEntry };

export function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function stableIndexRowHash(row: StrategySearchJobIndexEntry): string {
  return sha256Text(JSON.stringify(row));
}

export function diffIndexProjectionFields(
  current: StrategySearchJobIndexEntry,
  projected: StrategySearchJobIndexEntry,
): IndexProjectionField[] {
  const changed: IndexProjectionField[] = [];
  for (const field of INDEX_PROJECTION_FIELDS) {
    if (current[field] !== projected[field]) changed.push(field);
  }
  return changed;
}

export function listStatusDesyncs(
  index: StrategySearchJobIndex,
  jobsById: ReadonlyMap<string, StrategySearchJob>,
): StatusDesyncRow[] {
  const rows: StatusDesyncRow[] = [];
  for (const entry of index.jobs) {
    const job = jobsById.get(entry.id);
    if (!job) {
      rows.push({
        jobId: entry.id,
        indexStatus: entry.status,
        jobStatus: null,
      });
      continue;
    }
    if (entry.status !== job.status) {
      rows.push({
        jobId: entry.id,
        indexStatus: entry.status,
        jobStatus: job.status,
      });
    }
  }
  return rows;
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isLegalStatus(value: unknown): value is StrategySearchJobStatus {
  return typeof value === "string" && LEGAL_JOB_STATUSES.has(value as StrategySearchJobStatus);
}

export function assessJobCatalogAuthority(
  input: JobCatalogAuthorityInput,
): JobCatalogAuthorityResult {
  const reasons: string[] = [];
  const lifecycleDebt: string[] = [];
  const { job, jobId } = input;

  if (input.parseError) {
    reasons.push(`invalid_json:${input.parseError}`);
  }
  if (!job) {
    reasons.push("missing_job");
    return { safeToReconcile: false, reasons, lifecycleDebt };
  }
  if (job.id !== jobId || job.id !== input.jobFileNameId || job.id !== input.indexId) {
    reasons.push("job_id_mismatch");
  }
  if (!isLegalStatus(job.status)) {
    reasons.push("illegal_status");
  }
  if (!job.config || typeof job.config.strategyTemplateId !== "string") {
    reasons.push("missing_strategy_template");
  }
  if (!job.config || typeof job.config.generatorType !== "string") {
    reasons.push("missing_generator_type");
  }
  if (!job.checkpoint || typeof job.checkpoint.completedIterations !== "number") {
    reasons.push("missing_checkpoint");
  }
  const createdMs = parseIsoMs(job.createdAt);
  const updatedMs = parseIsoMs(job.updatedAt);
  const finishedMs = parseIsoMs(job.finishedAt);
  if (createdMs == null || updatedMs == null) {
    reasons.push("invalid_timestamps");
  } else if (updatedMs < createdMs) {
    reasons.push("updated_before_created");
  }
  if (job.finishedAt != null && finishedMs == null) {
    reasons.push("invalid_finished_at");
  }
  if (finishedMs != null && createdMs != null && finishedMs < createdMs) {
    reasons.push("finished_before_created");
  }
  if (job.status === "completed" && job.finishedAt == null) {
    reasons.push("completed_without_finished_at");
  }
  if (job.status === "queued" && job.finishedAt != null) {
    reasons.push("queued_with_finished_at");
  }
  if (ACTIVE_JOB_STATUSES.has(job.status)) {
    reasons.push(`active_job_status:${job.status}`);
  }
  if (input.ownedOnDisk) reasons.push("owner_present");
  if (input.executionActive) reasons.push("execution_active");
  if (input.registryActive) reasons.push("registry_active");
  if (input.planParseError) reasons.push(`plan_invalid_json:${input.planParseError}`);

  const plan = input.plan;
  if (plan && updatedMs != null) {
    const pausedAfterJob =
      typeof plan.pausedAtMs === "number" && plan.pausedAtMs > updatedMs;
    const interruptedAfterJob =
      typeof plan.interruptedAtMs === "number" &&
      plan.interruptedAtMs > updatedMs;

    if (job.status === "queued" && plan.completionReason === "DEADLINE_REACHED") {
      lifecycleDebt.push("queued_plus_deadline_reached");
    } else if (
      job.status === "queued" &&
      plan.completionReason &&
      plan.completionReason !== "PAUSED" &&
      plan.completionReason !== null
    ) {
      reasons.push(`plan_terminal_reason_vs_queued:${plan.completionReason}`);
    }

    if (job.status === "queued" && interruptedAfterJob) {
      reasons.push("plan_interrupted_after_job_updated_at");
    }
    if (job.status === "queued" && pausedAfterJob) {
      reasons.push("plan_paused_after_job_updated_at");
    }

    if (job.status === "completed") {
      const finishedAtMs = finishedMs ?? updatedMs;
      if (
        typeof plan.interruptedAtMs === "number" &&
        plan.interruptedAtMs > finishedAtMs
      ) {
        reasons.push("completed_job_has_later_interruption");
      }
      if (typeof plan.pausedAtMs === "number" && plan.pausedAtMs > finishedAtMs) {
        reasons.push("completed_job_has_later_pause");
      }
      if (
        plan.completionReason &&
        plan.completionReason !== null &&
        ["USER_CANCELLED", "FATAL_ERROR", "ENGINE_ERROR", "RECOVERY_FAILED"].includes(
          plan.completionReason,
        )
      ) {
        reasons.push(`completed_job_contradicting_plan:${plan.completionReason}`);
      }
    }
  }

  return {
    safeToReconcile: reasons.length === 0,
    reasons,
    lifecycleDebt,
  };
}

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export function projectIndexInPlace(
  index: StrategySearchJobIndex,
  jobsById: ReadonlyMap<string, StrategySearchJob>,
  allowlist: readonly string[],
): StrategySearchJobIndex {
  const allowed = new Set(allowlist);
  return {
    version: index.version,
    updatedAt: index.updatedAt,
    jobs: index.jobs.map((row) => {
      if (!allowed.has(row.id)) return row;
      const job = jobsById.get(row.id);
      if (!job) return row;
      return projectSearchJobIndexEntry(job);
    }),
  };
}

export function countProjectionMismatches(
  index: StrategySearchJobIndex,
  jobsById: ReadonlyMap<string, StrategySearchJob>,
): number {
  let mismatches = 0;
  for (const row of index.jobs) {
    const job = jobsById.get(row.id);
    if (!job) {
      mismatches += 1;
      continue;
    }
    if (diffIndexProjectionFields(row, projectSearchJobIndexEntry(job)).length > 0) {
      mismatches += 1;
    }
  }
  return mismatches;
}

export function buildIndexReconciliationPlan(
  input: IndexReconciliationPlanInput,
): IndexReconciliationPlanResult {
  const allowlist = [...input.allowlist];
  const allowSet = new Set(allowlist);
  const statusDesyncs = listStatusDesyncs(input.index, input.jobsById);
  const desyncIds = statusDesyncs.map((row) => row.jobId).sort();
  const approvedSorted = [...allowlist].sort();
  const unapprovedDesyncs = statusDesyncs.filter((row) => !allowSet.has(row.jobId));
  const missingApproved = allowlist.filter(
    (id) => !statusDesyncs.some((row) => row.jobId === id),
  );

  const targets: IndexReconciliationTarget[] = [];
  for (const jobId of allowlist) {
    const currentIndexRow = input.index.jobs.find((row) => row.id === jobId);
    const job = input.jobsById.get(jobId);
    if (!currentIndexRow || !job) continue;
    const currentJobProjection = projectSearchJobIndexEntry(job);
    const changedFields = diffIndexProjectionFields(
      currentIndexRow,
      currentJobProjection,
    );
    const authority = input.authorities.get(jobId) ?? {
      safeToReconcile: false,
      reasons: ["missing_authority"],
      lifecycleDebt: [],
    };
    const evidenceParts = [
      `index.status=${currentIndexRow.status}`,
      `job.status=${job.status}`,
      changedFields.length > 0
        ? `changed=${changedFields.join(",")}`
        : "changed=none",
      ...authority.lifecycleDebt,
    ];
    targets.push({
      jobId,
      currentIndexRow,
      currentJobProjection,
      changedFields,
      currentIndexRowHash: stableIndexRowHash(currentIndexRow),
      proposedIndexRowHash: stableIndexRowHash(currentJobProjection),
      jobFileHash: input.jobFileHashes[jobId] ?? "",
      planFileHash: input.planFileHashes[jobId] ?? null,
      safeToReconcile: authority.safeToReconcile,
      evidenceSummary: evidenceParts.join("; "),
      authorityReasons: authority.reasons,
      lifecycleDebt: authority.lifecycleDebt,
    });
  }

  const proposedIndex = projectIndexInPlace(
    input.index,
    input.jobsById,
    allowlist,
  );
  const beforeIds = input.index.jobs.map((row) => row.id);
  const afterIds = proposedIndex.jobs.map((row) => row.id);
  const changedRowIds = input.index.jobs
    .filter((row, i) => {
      const next = proposedIndex.jobs[i];
      return next != null && stableIndexRowHash(row) !== stableIndexRowHash(next);
    })
    .map((row) => row.id);
  const unapprovedChanged = changedRowIds.filter((id) => !allowSet.has(id));
  const diskOnlyJobsAdded =
    (input.diskJobIds ?? []).some((id) => afterIds.includes(id) && !beforeIds.includes(id));

  const postProposalStatusDesyncCount = listStatusDesyncs(
    proposedIndex,
    input.jobsById,
  ).length;
  const postProposalProjectionMismatchCount = countProjectionMismatches(
    proposedIndex,
    input.jobsById,
  );

  const safeCount = targets.filter((row) => row.safeToReconcile).length;
  const unsafeCount = targets.length - safeCount;

  let preconditionCode: IndexReconciliationPreconditionCode | null = null;
  let preconditionMessage: string | null = null;

  if (input.expectedIndexHash && input.expectedIndexHash !== input.currentIndexHash) {
    preconditionCode = "INDEX_HASH_CHANGED";
    preconditionMessage = "production index hash no longer matches the expected gate";
  } else if (input.expectedJobFileHashes) {
    const drifted = allowlist.filter(
      (id) =>
        input.expectedJobFileHashes?.[id] &&
        input.expectedJobFileHashes[id] !== input.jobFileHashes[id],
    );
    if (drifted.length > 0) {
      preconditionCode = "JOB_HASH_CHANGED";
      preconditionMessage = `job hash changed after manifest: ${drifted.join(",")}`;
    }
  }

  if (!preconditionCode && unapprovedDesyncs.length > 0) {
    preconditionCode = "UNAPPROVED_DESYNC";
    preconditionMessage = `unapproved status desync: ${unapprovedDesyncs
      .map((row) => row.jobId)
      .join(",")}`;
  } else if (!preconditionCode && missingApproved.length > 0) {
    preconditionCode = "MISSING_APPROVED_DESYNC";
    preconditionMessage = `approved id no longer desynced: ${missingApproved.join(",")}`;
  } else if (
    !preconditionCode &&
    (desyncIds.length !== approvedSorted.length ||
      desyncIds.some((id, i) => id !== approvedSorted[i]))
  ) {
    preconditionCode = "STATUS_DESYNC_SET_MISMATCH";
    preconditionMessage = "status desync set is not exactly the approved allowlist";
  } else if (!preconditionCode && unsafeCount > 0) {
    preconditionCode = "UNSAFE_AUTHORITY";
    preconditionMessage = "one or more approved jobs are not safe catalog authorities";
  } else if (!preconditionCode && changedRowIds.length !== allowlist.length) {
    preconditionCode = "PROPOSED_ROW_COUNT_MISMATCH";
    preconditionMessage = `CHANGED_ROW_COUNT=${changedRowIds.length} expected ${allowlist.length}`;
  } else if (!preconditionCode && unapprovedChanged.length > 0) {
    preconditionCode = "UNAPPROVED_ROW_CHANGED";
    preconditionMessage = `unapproved rows changed: ${unapprovedChanged.join(",")}`;
  } else if (
    !preconditionCode &&
    (beforeIds.length !== afterIds.length ||
      [...beforeIds].sort().join("\n") !== [...afterIds].sort().join("\n"))
  ) {
    preconditionCode = "ID_SET_CHANGED";
    preconditionMessage = "proposed index ID set changed";
  } else if (!preconditionCode && !sameIdOrder(beforeIds, afterIds)) {
    preconditionCode = "ORDER_CHANGED";
    preconditionMessage = "proposed index order changed";
  } else if (!preconditionCode && diskOnlyJobsAdded) {
    preconditionCode = "DISK_ONLY_ADDED";
    preconditionMessage = "proposed index added a disk-only job";
  }

  return {
    ok: preconditionCode == null,
    preconditionCode,
    preconditionMessage,
    approvedTargetCount: allowlist.length,
    actualDesyncCount: statusDesyncs.length,
    unapprovedDesyncCount: unapprovedDesyncs.length,
    statusDesyncs,
    targets,
    safeCount,
    unsafeCount,
    proposedIndex,
    changedRowCount: changedRowIds.length,
    unapprovedChangedRowCount: unapprovedChanged.length,
    idSetUnchanged:
      beforeIds.length === afterIds.length &&
      [...beforeIds].sort().join("\n") === [...afterIds].sort().join("\n"),
    rowCountUnchanged: beforeIds.length === afterIds.length,
    orderUnchanged: sameIdOrder(beforeIds, afterIds),
    diskOnlyJobsAdded,
    postProposalStatusDesyncCount,
    postProposalProjectionMismatchCount,
  };
}
