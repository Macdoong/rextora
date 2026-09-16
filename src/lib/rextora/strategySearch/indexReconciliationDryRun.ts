/**
 * P2-E2B dry-run snapshot + artifact writer.
 * Reads a store with raw fs only. Writes only to a caller-provided directory.
 * Never writes index.json, job.json, or plans in the store root.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { productionRextoraDataRootCanonical } from "../storage/runtimePaths";
import {
  APPROVED_P2_E2B_RECONCILE_IDS,
  assessJobCatalogAuthority,
  buildIndexReconciliationPlan,
  sha256Text,
  type IndexReconciliationPlanResult,
  type JobCatalogAuthorityResult,
} from "./indexReconciliationPlan";
import type {
  StrategySearchJob,
  StrategySearchJobIndex,
} from "./types";

const SIDECAR_MARKERS = [
  ".plan.json",
  ".execution.json",
  ".generations.json",
  ".top10.json",
  ".top10.history.jsonl",
  ".archive.json",
];

export function productionStrategySearchRootCanonical(): string {
  return path.join(productionRextoraDataRootCanonical(), "strategy-search");
}

export function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isPrimaryJobFileName(name: string): boolean {
  if (!name.startsWith("search_") || !name.endsWith(".json")) return false;
  return SIDECAR_MARKERS.every((marker) => !name.includes(marker));
}

function rawReadJson<T>(filePath: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "parse_failed",
    };
  }
}

export interface RawIndexReconciliationSnapshot {
  rootDir: string;
  index: StrategySearchJobIndex;
  indexHash: string;
  indexText: string;
  jobsById: Map<string, StrategySearchJob>;
  jobFileHashes: Record<string, string>;
  planFileHashes: Record<string, string | null>;
  authorities: Map<string, JobCatalogAuthorityResult>;
  diskJobIds: string[];
  owners: string[];
  ownershipAuditHash: string | null;
  recoveryAuditHash: string | null;
  activeExecutions: string[];
}

export function loadRawIndexReconciliationSnapshot(
  rootDir: string,
): RawIndexReconciliationSnapshot {
  const root = path.resolve(rootDir);
  const indexPath = path.join(root, "index.json");
  const indexText = fs.readFileSync(indexPath, "utf8");
  const indexParsed = rawReadJson<StrategySearchJobIndex>(indexPath);
  if (!indexParsed.ok) {
    throw new Error(`cannot parse index.json: ${indexParsed.error}`);
  }
  const index = indexParsed.value;
  const jobsDir = path.join(root, "jobs");
  const ownersDir = path.join(root, "owners");
  const diskJobIds = fs.existsSync(jobsDir)
    ? fs.readdirSync(jobsDir).filter(isPrimaryJobFileName).map((name) => name.slice(0, -".json".length))
    : [];
  const owners = fs.existsSync(ownersDir) ? fs.readdirSync(ownersDir).sort() : [];
  // Process-local registry is empty in a dry-run process; durable owners are authoritative.
  const activeExecutions: string[] = [];
  const jobsById = new Map<string, StrategySearchJob>();
  const jobFileHashes: Record<string, string> = {};
  const planFileHashes: Record<string, string | null> = {};
  const authorities = new Map<string, JobCatalogAuthorityResult>();

  for (const row of index.jobs) {
    const jobPath = path.join(jobsDir, `${row.id}.json`);
    const planPath = path.join(jobsDir, `${row.id}.plan.json`);
    const jobRead = rawReadJson<StrategySearchJob>(jobPath);
    const planRead = fs.existsSync(planPath)
      ? rawReadJson<Record<string, unknown>>(planPath)
      : null;
    if (jobRead.ok) {
      jobsById.set(row.id, jobRead.value);
      jobFileHashes[row.id] = sha256File(jobPath) ?? "";
    }
    planFileHashes[row.id] = fs.existsSync(planPath) ? sha256File(planPath) : null;

    const job = jobRead.ok ? jobRead.value : null;
    const plan = planRead?.ok
      ? {
          completionReason: (planRead.value.completionReason ?? null) as
            | "DEADLINE_REACHED"
            | null
            | undefined,
          pausedAtMs:
            typeof planRead.value.pausedAtMs === "number"
              ? planRead.value.pausedAtMs
              : null,
          interruptedAtMs:
            typeof planRead.value.interruptedAtMs === "number"
              ? planRead.value.interruptedAtMs
              : null,
          campaignStartedAtMs:
            typeof planRead.value.campaignStartedAtMs === "number"
              ? planRead.value.campaignStartedAtMs
              : null,
        }
      : null;

    authorities.set(
      row.id,
      assessJobCatalogAuthority({
        jobId: row.id,
        job,
        parseError: jobRead.ok ? null : jobRead.error,
        jobFileNameId: row.id,
        indexId: row.id,
        ownedOnDisk: owners.some((name) => name.startsWith(`${row.id}.`)),
        executionActive: activeExecutions.includes(row.id),
        registryActive: activeExecutions.includes(row.id),
        plan,
        planParseError: planRead && !planRead.ok ? planRead.error : null,
      }),
    );
  }

  return {
    rootDir: root,
    index,
    indexHash: sha256Text(indexText),
    indexText,
    jobsById,
    jobFileHashes,
    planFileHashes,
    authorities,
    diskJobIds,
    owners,
    ownershipAuditHash: sha256File(path.join(root, "execution-ownership-audit.jsonl")),
    recoveryAuditHash: sha256File(path.join(root, "recovery-audit.jsonl")),
    activeExecutions,
  };
}

export function writeIndexReconciliationArtifacts(input: {
  outputDir: string;
  snapshot: RawIndexReconciliationSnapshot;
  plan: IndexReconciliationPlanResult;
  allowlist: readonly string[];
}): {
  manifestPath: string;
  proposedIndexPath: string;
  manifestSha256: string;
  proposedIndexSha256: string;
} {
  const outputDir = path.resolve(input.outputDir);
  const tmpRoot = path.resolve(os.tmpdir());
  const underValidation = outputDir.includes(`${path.sep}.validation${path.sep}`);
  const underTmp =
    outputDir === tmpRoot || outputDir.startsWith(tmpRoot + path.sep);
  if (!underValidation && !underTmp) {
    throw new Error("dry-run artifacts must be written under .validation or a temp directory");
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const beforeIndexShaPath = path.join(outputDir, "before-index.sha256");
  const proposedIndexPath = path.join(outputDir, "proposed-index.json");
  const manifestPath = path.join(outputDir, "manifest.json");
  const diffSummaryPath = path.join(outputDir, "diff-summary.json");

  fs.writeFileSync(beforeIndexShaPath, `${input.snapshot.indexHash}\n`, "utf8");
  const proposedText = `${JSON.stringify(input.plan.proposedIndex, null, 2)}\n`;
  fs.writeFileSync(proposedIndexPath, proposedText, "utf8");

  const queuedTargets = input.plan.targets.filter(
    (row) => row.currentJobProjection.status === "queued",
  );
  const completedTargets = input.plan.targets.filter(
    (row) => row.currentJobProjection.status === "completed",
  );

  const manifest = {
    phase: "P2-E2B",
    mode: "DRY-RUN",
    generatedAt: new Date().toISOString(),
    storeRoot: input.snapshot.rootDir,
    approvedTargetCount: input.plan.approvedTargetCount,
    actualDesyncCount: input.plan.actualDesyncCount,
    unapprovedDesyncCount: input.plan.unapprovedDesyncCount,
    safeCount: input.plan.safeCount,
    unsafeCount: input.plan.unsafeCount,
    ok: input.plan.ok,
    preconditionCode: input.plan.preconditionCode,
    preconditionMessage: input.plan.preconditionMessage,
    changedRowCount: input.plan.changedRowCount,
    unapprovedChangedRowCount: input.plan.unapprovedChangedRowCount,
    idSetUnchanged: input.plan.idSetUnchanged,
    rowCountUnchanged: input.plan.rowCountUnchanged,
    orderUnchanged: input.plan.orderUnchanged,
    diskOnlyJobsAdded: input.plan.diskOnlyJobsAdded,
    postProposalStatusDesyncCount: input.plan.postProposalStatusDesyncCount,
    postProposalProjectionMismatchCount: input.plan.postProposalProjectionMismatchCount,
    beforeIndexSha256: input.snapshot.indexHash,
    owners: input.snapshot.owners,
    activeExecutions: input.snapshot.activeExecutions,
    ownershipAuditSha256: input.snapshot.ownershipAuditHash,
    recoveryAuditSha256: input.snapshot.recoveryAuditHash,
    allowlist: [...input.allowlist],
    queuedPlusDeadlineReachedCount: queuedTargets.filter((row) =>
      row.lifecycleDebt.includes("queued_plus_deadline_reached"),
    ).length,
    targets: input.plan.targets.map((row) => ({
      jobId: row.jobId,
      currentIndexRow: row.currentIndexRow,
      currentJobProjection: row.currentJobProjection,
      changedFields: row.changedFields,
      currentIndexRowHash: row.currentIndexRowHash,
      proposedIndexRowHash: row.proposedIndexRowHash,
      jobFileHash: row.jobFileHash,
      planFileHash: row.planFileHash,
      safeToReconcile: row.safeToReconcile,
      evidenceSummary: row.evidenceSummary,
      authorityReasons: row.authorityReasons,
      lifecycleDebt: row.lifecycleDebt,
    })),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, manifestText, "utf8");

  const diffSummary = {
    changedRowCount: input.plan.changedRowCount,
    unapprovedChangedRowCount: input.plan.unapprovedChangedRowCount,
    queuedChangedFields: uniqueFields(queuedTargets.flatMap((row) => row.changedFields)),
    completedChangedFields: uniqueFields(
      completedTargets.flatMap((row) => row.changedFields),
    ),
    queuedTargetIds: queuedTargets.map((row) => row.jobId),
    completedTargetIds: completedTargets.map((row) => row.jobId),
    statusDesyncs: input.plan.statusDesyncs,
  };
  fs.writeFileSync(
    diffSummaryPath,
    `${JSON.stringify(diffSummary, null, 2)}\n`,
    "utf8",
  );

  return {
    manifestPath,
    proposedIndexPath,
    manifestSha256: sha256Text(manifestText),
    proposedIndexSha256: sha256Text(proposedText),
  };
}

function uniqueFields(fields: string[]): string[] {
  return [...new Set(fields)];
}

export function runIndexReconciliationDryRun(input: {
  rootDir: string;
  outputDir: string;
  allowlist?: readonly string[];
  expectedJobFileHashes?: Readonly<Record<string, string>>;
  expectedIndexHash?: string;
}): {
  snapshot: RawIndexReconciliationSnapshot;
  plan: IndexReconciliationPlanResult;
  artifacts: ReturnType<typeof writeIndexReconciliationArtifacts>;
} {
  const allowlist = input.allowlist ?? APPROVED_P2_E2B_RECONCILE_IDS;
  const snapshot = loadRawIndexReconciliationSnapshot(input.rootDir);
  const plan = buildIndexReconciliationPlan({
    allowlist,
    index: snapshot.index,
    jobsById: snapshot.jobsById,
    authorities: snapshot.authorities,
    jobFileHashes: snapshot.jobFileHashes,
    planFileHashes: snapshot.planFileHashes,
    expectedJobFileHashes: input.expectedJobFileHashes,
    expectedIndexHash: input.expectedIndexHash,
    currentIndexHash: snapshot.indexHash,
    diskJobIds: snapshot.diskJobIds,
  });
  const artifacts = writeIndexReconciliationArtifacts({
    outputDir: input.outputDir,
    snapshot,
    plan,
    allowlist,
  });
  return { snapshot, plan, artifacts };
}
