/**
 * Raw trial retention policy and protected cleanup.
 * Default: keep 30 days (safest compatible default when no prior policy existed).
 */

import fs from "node:fs";
import path from "node:path";
import {
  listSearchJobs,
  listSearchTrials,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { getResearchTop10 } from "./researchTop10";
import { getSearchPlan } from "./searchPlan";
import { listStrategies } from "../strategy/strategyStore";
import { parseSourceResearchJobId, parseSourceTrialIteration } from "./researchResultsSummary";
import { writeDeletionAudit } from "./deletionSafety";
import { strategySearchRoot } from "../storage/runtimePaths";

export type RawTrialRetentionPolicy =
  | "keep_indefinitely"
  | "keep_30_days"
  | "keep_7_days"
  | "cleanup_after_top10";

/** Safest compatible default — no prior product policy existed. */
export const DEFAULT_RAW_TRIAL_RETENTION: RawTrialRetentionPolicy = "keep_30_days";

export interface RawTrialCleanupPreview {
  jobId: string;
  policy: RawTrialRetentionPolicy;
  retainedTrialCount: number;
  protectedTrialCount: number;
  deletableTrialCount: number;
  storageBytes: number;
  protectedIterations: number[];
  deletableIterations: number[];
}

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function policyPath(root: string): string {
  return path.join(root, "raw-trial-retention.json");
}

export function getRawTrialRetentionPolicy(
  options?: StrategySearchStoreOptions,
): RawTrialRetentionPolicy {
  const fp = policyPath(resolveRoot(options));
  if (!fs.existsSync(fp)) return DEFAULT_RAW_TRIAL_RETENTION;
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as {
      policy?: RawTrialRetentionPolicy;
    };
    return parsed.policy ?? DEFAULT_RAW_TRIAL_RETENTION;
  } catch {
    return DEFAULT_RAW_TRIAL_RETENTION;
  }
}

export function setRawTrialRetentionPolicy(
  policy: RawTrialRetentionPolicy,
  options?: StrategySearchStoreOptions,
): void {
  const root = resolveRoot(options);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    policyPath(root),
    JSON.stringify({ policy, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

function protectedIterationsForJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): Set<number> {
  const protectedSet = new Set<number>();
  const top10 = getResearchTop10(jobId, options);
  for (const e of top10?.entries ?? []) {
    if (e.sourceResearchJobId === jobId) {
      protectedSet.add(e.sourceTrialIteration);
    }
  }
  const plan = getSearchPlan(jobId, options);
  for (const p of plan?.promotions ?? []) {
    if (typeof p.iteration === "number") protectedSet.add(p.iteration);
  }
  for (const s of listStrategies()) {
    if (parseSourceResearchJobId(s.description) !== jobId) continue;
    const iter = parseSourceTrialIteration(s.description);
    if (iter != null) protectedSet.add(iter);
  }
  return protectedSet;
}

function trialFileBytes(jobId: string, iteration: number, root: string): number {
  const fp = path.join(
    root,
    "trials",
    jobId,
    `${String(iteration).padStart(8, "0")}.json`,
  );
  try {
    return fs.existsSync(fp) ? fs.statSync(fp).size : 0;
  } catch {
    return 0;
  }
}

export function previewRawTrialCleanup(
  jobId: string,
  options?: StrategySearchStoreOptions & { policy?: RawTrialRetentionPolicy },
): RawTrialCleanupPreview {
  const root = resolveRoot(options);
  const policy = options?.policy ?? getRawTrialRetentionPolicy(options);
  const trials = listSearchTrials(jobId, options);
  const protectedSet = protectedIterationsForJob(jobId, options);
  const job = listSearchJobs(options).find((j) => j.id === jobId);
  const finishedAt = job?.finishedAt ? Date.parse(job.finishedAt) : null;
  const now = Date.now();

  const deletable: number[] = [];
  const retained: number[] = [];
  let storageBytes = 0;

  for (const t of trials) {
    storageBytes += trialFileBytes(jobId, t.iteration, root);
    if (protectedSet.has(t.iteration)) {
      retained.push(t.iteration);
      continue;
    }
    let canDelete = false;
    if (policy === "keep_indefinitely") {
      canDelete = false;
    } else if (policy === "cleanup_after_top10") {
      canDelete = getResearchTop10(jobId, options) != null;
    } else if (policy === "keep_7_days" || policy === "keep_30_days") {
      const days = policy === "keep_7_days" ? 7 : 30;
      const ageMs =
        finishedAt != null && Number.isFinite(finishedAt)
          ? now - finishedAt
          : now - Date.parse(t.createdAt);
      canDelete = ageMs > days * 24 * 60 * 60 * 1000;
    }
    if (canDelete) deletable.push(t.iteration);
    else retained.push(t.iteration);
  }

  return {
    jobId,
    policy,
    retainedTrialCount: retained.length,
    protectedTrialCount: protectedSet.size,
    deletableTrialCount: deletable.length,
    storageBytes,
    protectedIterations: [...protectedSet].sort((a, b) => a - b),
    deletableIterations: deletable.sort((a, b) => a - b),
  };
}

export function executeRawTrialCleanup(
  jobId: string,
  options?: StrategySearchStoreOptions & {
    policy?: RawTrialRetentionPolicy;
    /** Default true — must pass dryRun:false to delete. */
    dryRun?: boolean;
  },
): RawTrialCleanupPreview & { deleted: number } {
  const preview = previewRawTrialCleanup(jobId, options);
  if (options?.dryRun !== false) {
    return { ...preview, deleted: 0 };
  }
  const root = resolveRoot(options);
  let deleted = 0;
  for (const iter of preview.deletableIterations) {
    const fp = path.join(
      root,
      "trials",
      jobId,
      `${String(iter).padStart(8, "0")}.json`,
    );
    if (!fs.existsSync(fp)) continue;
    // Never delete protected (double-check)
    if (preview.protectedIterations.includes(iter)) continue;
    fs.unlinkSync(fp);
    deleted += 1;
  }
  writeDeletionAudit(
    {
      action: "raw_trial_cleanup",
      jobId,
      policy: preview.policy,
      deleted,
      protected: preview.protectedTrialCount,
    },
    options,
  );
  return { ...preview, deleted };
}
