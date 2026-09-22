/**
 * P2-F2C apply: historical MODEL B correction for the exact 13 IDs.
 * Writes only allowlisted job.json files and index.json via writeDurableJsonPayload.
 * Never calls persistJob, syncIndexWithJob, nowIso(), runner, or orchestrator.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeDurableJsonPayload } from "./durableJsonWrite";
import { RETIRED_SAFE_FILE_NAME } from "../strategy/retiredSafeBaseline";
import {
  APPROVED_P2_F2B_IDS,
  lastTrialCreatedAt,
  projectHistoricalDeadlineCompletion,
  sha256File,
  sha256Text,
} from "./historicalDeadlineCompletionDryRun";
import { projectIndexInPlace } from "./indexReconciliationPlan";
import {
  isNormalSearchCompletionReason,
  listActiveSearchJobExecutions,
} from "./jobExecutionRegistry";
import type { StrategySearchPlan } from "./searchPlan";
import type { StrategySearchJob, StrategySearchJobIndex } from "./types";

export const F2B_ARTIFACT_DIR =
  ".validation/research-p2-f2b-historical-correction-dry-run/2026-09-03T02-20-00-000Z";

export const EXPECTED_F2B_MANIFEST_SHA256 =
  "5455ce3b4f4a4cdfa72a07ccab4342636221e0beeebc08d9576e6d7304e50a50";
export const EXPECTED_PRE_APPLY_INDEX_SHA256 =
  "db1a02d5b8e0d0c163e331cb10a68bb716f26c5c8b2b2e829fe6fbe40e5d8dcb";
export const EXPECTED_POST_APPLY_INDEX_SHA256 =
  "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437";
export const EXPECTED_ROOT_UPDATED_AT = "2026-08-27T15:12:30.273Z";

export const APPROVED_HISTORICAL_FINISHED_AT: Readonly<
  Record<(typeof APPROVED_P2_F2B_IDS)[number], string>
> = {
  "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4": "2026-08-11T00:41:52.554Z",
  "search_1683a734-341d-4da8-99c7-476ad80c078d": "2026-08-11T00:41:52.630Z",
  "search_32bc4514-085c-4351-95d0-aa553f3c2884": "2026-08-11T00:41:53.564Z",
  "search_5bedd873-2e89-4604-ab27-07a9dff27e74": "2026-08-11T01:50:21.712Z",
  "search_6b0b920d-e45b-4101-8f2d-2013380d86a5": "2026-08-11T00:41:53.246Z",
  "search_6b527e08-d01d-49b8-b398-1ad27482182f": "2026-08-11T00:41:52.471Z",
  "search_747c28e9-c250-47ca-acfb-06eba1ed9c69": "2026-08-11T00:41:53.169Z",
  "search_78e8dd3f-5fea-4955-8535-7578338a18e1": "2026-08-11T00:41:53.477Z",
  "search_bd7a9043-1ed1-42a7-8bdc-c70ff22d249d": "2026-08-11T00:41:53.316Z",
  "search_d15a7b41-867a-40da-a065-28256ffaf88e": "2026-08-11T00:41:52.717Z",
  "search_e47a902f-5ee3-484f-88ca-73313de44cc6": "2026-08-11T00:41:53.095Z",
  "search_e4fe7b86-5140-40a9-b098-f6fe1eaa3027": "2026-08-11T01:50:21.629Z",
  "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8": "2026-08-11T00:41:53.395Z",
};

function rawReadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function serializeJob(job: StrategySearchJob): string {
  return JSON.stringify(job, null, 2);
}

function serializeIndex(index: StrategySearchJobIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function listDirNames(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => !name.startsWith("."));
}

function topLevelDiffs(before: StrategySearchJob, after: StrategySearchJob): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    const left = JSON.stringify((before as unknown as Record<string, unknown>)[key]);
    const right = JSON.stringify((after as unknown as Record<string, unknown>)[key]);
    if (left !== right) changed.push(key);
  }
  return changed.sort();
}

export function resolveF2BArtifactDir(cwd = process.cwd()): string {
  return path.join(cwd, F2B_ARTIFACT_DIR);
}

export function inspectQueuedPlusNormalTerminal(
  rootDir: string,
): string[] {
  const index = rawReadJson<StrategySearchJobIndex>(path.join(rootDir, "index.json"));
  const found: string[] = [];
  for (const row of index.jobs) {
    const jobPath = path.join(rootDir, "jobs", `${row.id}.json`);
    const planPath = path.join(rootDir, "jobs", `${row.id}.plan.json`);
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) continue;
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    if (job.status === "queued" && isNormalSearchCompletionReason(plan.completionReason)) {
      found.push(row.id);
    }
  }
  return found.sort();
}

export function countIndexJobStatusMismatches(rootDir: string): number {
  const index = rawReadJson<StrategySearchJobIndex>(path.join(rootDir, "index.json"));
  let desync = 0;
  for (const row of index.jobs) {
    const jobPath = path.join(rootDir, "jobs", `${row.id}.json`);
    if (!fs.existsSync(jobPath)) {
      desync += 1;
      continue;
    }
    const job = rawReadJson<StrategySearchJob>(jobPath);
    if (row.status !== job.status) desync += 1;
  }
  return desync;
}

export interface HistoricalDeadlineApplyGate {
  ok: boolean;
  code: string | null;
  reasons: string[];
  liveComboIds: string[];
  extraCombo: string[];
  missingApproved: string[];
  indexHash: string | null;
  rootUpdatedAt: string | null;
  manifestSha256: string | null;
  proposedIndexSha256: string | null;
}

export function evaluateHistoricalDeadlineApplyGates(input: {
  rootDir: string;
  artifactDir: string;
}): HistoricalDeadlineApplyGate {
  const reasons: string[] = [];
  const root = path.resolve(input.rootDir);
  const artifactDir = path.resolve(input.artifactDir);
  const manifestPath = path.join(artifactDir, "manifest.json");
  const proposedIndexPath = path.join(artifactDir, "proposed-index.json");
  const beforeHashesPath = path.join(artifactDir, "before-hashes.json");

  if (!fs.existsSync(manifestPath) || !fs.existsSync(proposedIndexPath)) {
    return {
      ok: false,
      code: "FAILED_PRECONDITION",
      reasons: ["missing_f2b_artifact"],
      liveComboIds: [],
      extraCombo: [],
      missingApproved: [...APPROVED_P2_F2B_IDS],
      indexHash: null,
      rootUpdatedAt: null,
      manifestSha256: null,
      proposedIndexSha256: null,
    };
  }

  const manifestSha256 = sha256File(manifestPath);
  const proposedIndexSha256 = sha256File(proposedIndexPath);
  if (manifestSha256 !== EXPECTED_F2B_MANIFEST_SHA256) {
    reasons.push("manifest_sha_mismatch");
  }
  if (proposedIndexSha256 !== EXPECTED_POST_APPLY_INDEX_SHA256) {
    reasons.push("proposed_index_sha_mismatch");
  }

  const manifest = rawReadJson<{
    targets: Array<{
      jobId: string;
      proposedFinishedAt: string | null;
      checkpointHash: string | null;
      finishedAtEvidence: { trialCount: number; lastTrialAt: string | null };
    }>;
  }>(manifestPath);
  for (const id of APPROVED_P2_F2B_IDS) {
    const target = manifest.targets.find((row) => row.jobId === id);
    if (!target || target.proposedFinishedAt !== APPROVED_HISTORICAL_FINISHED_AT[id]) {
      reasons.push(`finishedAt_table_mismatch:${id}`);
    }
  }

  if (listActiveSearchJobExecutions().length) {
    reasons.push("registry_active");
  }

  const indexPath = path.join(root, "index.json");
  const indexHash = sha256File(indexPath);
  const index = rawReadJson<StrategySearchJobIndex>(indexPath);
  if (indexHash !== EXPECTED_PRE_APPLY_INDEX_SHA256) {
    reasons.push("production_index_hash_mismatch");
  }
  if (index.updatedAt !== EXPECTED_ROOT_UPDATED_AT) {
    reasons.push("root_updatedAt_mismatch");
  }

  const owners = listDirNames(path.join(root, "owners"));
  const locks = listDirNames(path.join(root, "locks"));
  const execution = listDirNames(path.join(root, "execution"));
  if (owners.length) reasons.push("owners_present");
  if (locks.length) reasons.push("locks_present");
  if (execution.length) reasons.push("execution_dir_present");

  const liveComboIds = inspectQueuedPlusNormalTerminal(root);
  const extraCombo = liveComboIds.filter(
    (id) => !(APPROVED_P2_F2B_IDS as readonly string[]).includes(id),
  );
  const missingApproved = APPROVED_P2_F2B_IDS.filter((id) => !liveComboIds.includes(id));
  if (extraCombo.length) reasons.push("unapproved_queued_terminal");
  if (missingApproved.length) reasons.push("missing_approved_live_set");
  if (liveComboIds.length !== 13) reasons.push("live_combo_count");
  if (countIndexJobStatusMismatches(root) !== 0) reasons.push("index_job_mirror_mismatch");

  const beforeHashes = rawReadJson<{
    jobs: Record<string, string | null>;
    plans: Record<string, string | null>;
    sidecars: Record<string, { execution: string | null; generations: string | null; top10: string | null }>;
    ownershipAudit: string | null;
    recoveryAudit: string | null;
  }>(beforeHashesPath);

  for (const id of APPROVED_P2_F2B_IDS) {
    const jobPath = path.join(root, "jobs", `${id}.json`);
    const planPath = path.join(root, "jobs", `${id}.plan.json`);
    if (!fs.existsSync(jobPath) || !fs.existsSync(planPath)) {
      reasons.push(`job_or_plan_missing:${id}`);
      continue;
    }
    const job = rawReadJson<StrategySearchJob>(jobPath);
    const plan = rawReadJson<StrategySearchPlan>(planPath);
    if (job.status !== "queued") reasons.push(`job_not_queued:${id}`);
    if (job.finishedAt !== null) reasons.push(`job_has_finishedAt:${id}`);
    if (plan.completionReason !== "DEADLINE_REACHED") {
      reasons.push(`plan_reason:${id}`);
    }
    if (sha256File(jobPath) !== beforeHashes.jobs[id]) reasons.push(`job_hash:${id}`);
    if (sha256File(planPath) !== beforeHashes.plans[id]) reasons.push(`plan_hash:${id}`);
    const manifestTarget = manifest.targets.find((row) => row.jobId === id);
    if (
      manifestTarget &&
      sha256Text(JSON.stringify(job.checkpoint)) !== manifestTarget.checkpointHash
    ) {
      reasons.push(`checkpoint_hash:${id}`);
    }
    const trialMeta = lastTrialCreatedAt(path.join(root, "trials", id));
    if (
      manifestTarget &&
      (trialMeta.count !== manifestTarget.finishedAtEvidence.trialCount ||
        trialMeta.lastCreatedAt !== manifestTarget.finishedAtEvidence.lastTrialAt)
    ) {
      reasons.push(`trial_fingerprint:${id}`);
    }
    const sidecar = beforeHashes.sidecars[id];
    if (
      sidecar &&
      (sha256File(path.join(root, "jobs", `${id}.execution.json`)) !== sidecar.execution ||
        sha256File(path.join(root, "jobs", `${id}.generations.json`)) !== sidecar.generations ||
        sha256File(path.join(root, "jobs", `${id}.top10.json`)) !== sidecar.top10)
    ) {
      reasons.push(`sidecar_hash:${id}`);
    }
  }

  if (sha256File(path.join(root, "execution-ownership-audit.jsonl")) !== beforeHashes.ownershipAudit) {
    reasons.push("ownership_audit_hash");
  }
  if (sha256File(path.join(root, "recovery-audit.jsonl")) !== beforeHashes.recoveryAudit) {
    reasons.push("recovery_audit_hash");
  }

  return {
    ok: reasons.length === 0,
    code: reasons.length === 0 ? null : "FAILED_PRECONDITION",
    reasons,
    liveComboIds,
    extraCombo,
    missingApproved,
    indexHash,
    rootUpdatedAt: index.updatedAt,
    manifestSha256,
    proposedIndexSha256,
  };
}

export function buildHistoricalDeadlineApplyProposal(input: {
  rootDir: string;
  artifactDir: string;
}): {
  ok: boolean;
  reasons: string[];
  proposedJobs: Map<string, StrategySearchJob>;
  proposedIndex: StrategySearchJobIndex;
  proposedIndexPayload: string;
  proposedIndexSha256: string;
  jobPayloads: Record<string, string>;
} {
  const reasons: string[] = [];
  const root = path.resolve(input.rootDir);
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const proposedJobs = new Map<string, StrategySearchJob>();
  const jobPayloads: Record<string, string> = {};

  for (const id of APPROVED_P2_F2B_IDS) {
    const current = rawReadJson<StrategySearchJob>(path.join(root, "jobs", `${id}.json`));
    const plan = rawReadJson<StrategySearchPlan>(
      path.join(root, "jobs", `${id}.plan.json`),
    );
    const finishedAt = APPROVED_HISTORICAL_FINISHED_AT[id];
    const projected = projectHistoricalDeadlineCompletion({
      currentJob: current,
      currentPlan: plan,
      provenFinishedAt: finishedAt,
    });
    const changed = topLevelDiffs(current, projected.proposedJob);
    if (changed.join(",") !== "finishedAt,status,updatedAt") {
      reasons.push(`unexpected_job_fields:${id}:${changed.join(",")}`);
    }
    if (projected.proposedJob.status !== "completed") {
      reasons.push(`proposed_status:${id}`);
    }
    if (
      projected.proposedJob.updatedAt !== finishedAt ||
      projected.proposedJob.finishedAt !== finishedAt
    ) {
      reasons.push(`proposed_timestamp:${id}`);
    }
    if (projected.proposedPlan.completionReason !== "DEADLINE_REACHED") {
      reasons.push(`plan_reason_changed:${id}`);
    }
    proposedJobs.set(id, projected.proposedJob);
    jobPayloads[id] = serializeJob(projected.proposedJob);
  }

  const proposedIndex = projectIndexInPlace(index, proposedJobs, APPROVED_P2_F2B_IDS);
  if (proposedIndex.updatedAt !== EXPECTED_ROOT_UPDATED_AT) {
    reasons.push("proposed_root_updatedAt");
  }
  if (proposedIndex.jobs.length !== index.jobs.length) reasons.push("row_count");
  if (proposedIndex.jobs.map((row) => row.id).join("\n") !== index.jobs.map((row) => row.id).join("\n")) {
    reasons.push("row_order_or_ids");
  }
  let changedRows = 0;
  const changedIds: string[] = [];
  for (let i = 0; i < index.jobs.length; i += 1) {
    const before = index.jobs[i]!;
    const after = proposedIndex.jobs[i]!;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changedRows += 1;
      changedIds.push(after.id);
    }
  }
  if (changedRows !== 13) reasons.push(`changed_row_count:${changedRows}`);
  if (changedIds.sort().join(",") !== [...APPROVED_P2_F2B_IDS].sort().join(",")) {
    reasons.push("changed_id_set");
  }

  const proposedIndexPayload = serializeIndex(proposedIndex);
  const proposedIndexSha256 = sha256Text(proposedIndexPayload);
  const artifactIndex = fs.readFileSync(
    path.join(input.artifactDir, "proposed-index.json"),
  );
  if (proposedIndexSha256 !== EXPECTED_POST_APPLY_INDEX_SHA256) {
    reasons.push("in_memory_index_sha_mismatch");
  }
  if (Buffer.compare(Buffer.from(proposedIndexPayload, "utf8"), artifactIndex) !== 0) {
    reasons.push("in_memory_index_bytes_mismatch");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    proposedJobs,
    proposedIndex,
    proposedIndexPayload,
    proposedIndexSha256,
    jobPayloads,
  };
}

function copyFilePreserve(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

export function writeDedicatedApplyBackup(input: {
  rootDir: string;
  backupDir: string;
  artifactDir: string;
  gate: HistoricalDeadlineApplyGate;
}): void {
  const root = path.resolve(input.rootDir);
  const backupDir = path.resolve(input.backupDir);
  fs.mkdirSync(path.join(backupDir, "jobs"), { recursive: true });
  copyFilePreserve(path.join(root, "index.json"), path.join(backupDir, "index.json"));
  const jobHashes: Record<string, string | null> = {};
  const planHashes: Record<string, string | null> = {};
  const checkpointHashes: Record<string, string> = {};
  const trialFingerprints: Record<
    string,
    { count: number; lastCreatedAt: string | null }
  > = {};
  const sidecarHashes: Record<string, Record<string, string | null>> = {};
  for (const id of APPROVED_P2_F2B_IDS) {
    copyFilePreserve(
      path.join(root, "jobs", `${id}.json`),
      path.join(backupDir, "jobs", `${id}.json`),
    );
    const job = rawReadJson<StrategySearchJob>(path.join(root, "jobs", `${id}.json`));
    jobHashes[id] = sha256File(path.join(root, "jobs", `${id}.json`));
    planHashes[id] = sha256File(path.join(root, "jobs", `${id}.plan.json`));
    checkpointHashes[id] = sha256Text(JSON.stringify(job.checkpoint));
    trialFingerprints[id] = lastTrialCreatedAt(path.join(root, "trials", id));
    sidecarHashes[id] = {
      execution: sha256File(path.join(root, "jobs", `${id}.execution.json`)),
      generations: sha256File(path.join(root, "jobs", `${id}.generations.json`)),
      top10: sha256File(path.join(root, "jobs", `${id}.top10.json`)),
    };
  }
  const preApply = {
    approvedIds: [...APPROVED_P2_F2B_IDS],
    indexHash: input.gate.indexHash,
    rootUpdatedAt: input.gate.rootUpdatedAt,
    jobHashes,
    planHashes,
    checkpointHashes,
    trialFingerprints,
    sidecarHashes,
    ownershipAudit: sha256File(path.join(root, "execution-ownership-audit.jsonl")),
    recoveryAudit: sha256File(path.join(root, "recovery-audit.jsonl")),
    safeHash: sha256File(
      path.join(process.cwd(), "data", "strategies", RETIRED_SAFE_FILE_NAME),
    ),
    proposedFinishedAt: { ...APPROVED_HISTORICAL_FINISHED_AT },
    artifactDir: input.artifactDir,
    manifestSha256: input.gate.manifestSha256,
    proposedIndexSha256: input.gate.proposedIndexSha256,
  };
  fs.writeFileSync(
    path.join(backupDir, "pre-apply-manifest.json"),
    `${JSON.stringify(preApply, null, 2)}\n`,
  );
}

export function restoreHistoricalDeadlineApplyBackup(
  rootDir: string,
  backupDir: string,
): void {
  const root = path.resolve(rootDir);
  const backup = path.resolve(backupDir);
  writeDurableJsonPayload(
    path.join(root, "index.json"),
    fs.readFileSync(path.join(backup, "index.json"), "utf8"),
  );
  for (const id of APPROVED_P2_F2B_IDS) {
    writeDurableJsonPayload(
      path.join(root, "jobs", `${id}.json`),
      fs.readFileSync(path.join(backup, "jobs", `${id}.json`), "utf8"),
    );
  }
}

export function applyApprovedHistoricalDeadlineCompletion(input: {
  rootDir: string;
  artifactDir: string;
  backupDir: string;
}): {
  wrote: boolean;
  rolledBack: boolean;
  rollbackOk: boolean | null;
  preconditionCode: string | null;
  reasons: string[];
  backupDir: string;
  jobWrites: number;
  indexWrites: number;
  afterIndexHash: string | null;
  proposedIndexSha256: string | null;
} {
  const gate = evaluateHistoricalDeadlineApplyGates({
    rootDir: input.rootDir,
    artifactDir: input.artifactDir,
  });
  if (!gate.ok) {
    return {
      wrote: false,
      rolledBack: false,
      rollbackOk: null,
      preconditionCode: "FAILED_PRECONDITION",
      reasons: gate.reasons,
      backupDir: input.backupDir,
      jobWrites: 0,
      indexWrites: 0,
      afterIndexHash: gate.indexHash,
      proposedIndexSha256: gate.proposedIndexSha256,
    };
  }

  writeDedicatedApplyBackup({
    rootDir: input.rootDir,
    backupDir: input.backupDir,
    artifactDir: input.artifactDir,
    gate,
  });

  const proposal = buildHistoricalDeadlineApplyProposal({
    rootDir: input.rootDir,
    artifactDir: input.artifactDir,
  });
  if (!proposal.ok) {
    return {
      wrote: false,
      rolledBack: false,
      rollbackOk: null,
      preconditionCode: "FAILED_PRECONDITION",
      reasons: proposal.reasons,
      backupDir: input.backupDir,
      jobWrites: 0,
      indexWrites: 0,
      afterIndexHash: gate.indexHash,
      proposedIndexSha256: proposal.proposedIndexSha256,
    };
  }

  const root = path.resolve(input.rootDir);
  let jobWrites = 0;
  try {
    for (const id of APPROVED_P2_F2B_IDS) {
      writeDurableJsonPayload(
        path.join(root, "jobs", `${id}.json`),
        proposal.jobPayloads[id]!,
      );
      jobWrites += 1;
      const written = rawReadJson<StrategySearchJob>(path.join(root, "jobs", `${id}.json`));
      if (
        written.status !== "completed" ||
        written.updatedAt !== APPROVED_HISTORICAL_FINISHED_AT[id] ||
        written.finishedAt !== APPROVED_HISTORICAL_FINISHED_AT[id]
      ) {
        throw new Error(`job_verify_failed:${id}`);
      }
    }
  } catch (error) {
    restoreHistoricalDeadlineApplyBackup(root, input.backupDir);
    const restored = sha256File(path.join(root, "index.json")) === EXPECTED_PRE_APPLY_INDEX_SHA256
      && APPROVED_P2_F2B_IDS.every(
        (id) =>
          sha256File(path.join(root, "jobs", `${id}.json`)) ===
          sha256File(path.join(input.backupDir, "jobs", `${id}.json`)),
      );
    return {
      wrote: false,
      rolledBack: true,
      rollbackOk: restored,
      preconditionCode: "FAILED",
      reasons: [
        error instanceof Error ? error.message : "job_write_failed",
      ],
      backupDir: input.backupDir,
      jobWrites,
      indexWrites: 0,
      afterIndexHash: sha256File(path.join(root, "index.json")),
      proposedIndexSha256: proposal.proposedIndexSha256,
    };
  }

  try {
    writeDurableJsonPayload(path.join(root, "index.json"), proposal.proposedIndexPayload);
    const afterIndexHash = sha256File(path.join(root, "index.json"));
    if (afterIndexHash !== EXPECTED_POST_APPLY_INDEX_SHA256) {
      throw new Error("index_hash_mismatch_after_write");
    }
    return {
      wrote: true,
      rolledBack: false,
      rollbackOk: null,
      preconditionCode: null,
      reasons: [],
      backupDir: input.backupDir,
      jobWrites,
      indexWrites: 1,
      afterIndexHash,
      proposedIndexSha256: proposal.proposedIndexSha256,
    };
  } catch (error) {
    restoreHistoricalDeadlineApplyBackup(root, input.backupDir);
    const restored =
      sha256File(path.join(root, "index.json")) === EXPECTED_PRE_APPLY_INDEX_SHA256 &&
      APPROVED_P2_F2B_IDS.every(
        (id) =>
          sha256File(path.join(root, "jobs", `${id}.json`)) ===
          sha256File(path.join(input.backupDir, "jobs", `${id}.json`)),
      );
    return {
      wrote: false,
      rolledBack: true,
      rollbackOk: restored,
      preconditionCode: "FAILED",
      reasons: [error instanceof Error ? error.message : "index_write_failed"],
      backupDir: input.backupDir,
      jobWrites,
      indexWrites: 1,
      afterIndexHash: sha256File(path.join(root, "index.json")),
      proposedIndexSha256: proposal.proposedIndexSha256,
    };
  }
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
