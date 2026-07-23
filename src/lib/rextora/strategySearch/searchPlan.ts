/**
 * Versioned Strategy Search campaign plan (multi-space progression).
 * Sidecar: <root>/jobs/<jobId>.plan.json — additive; legacy jobs have no plan.
 */

import fs from "node:fs";
import path from "node:path";
import {
  StrategySearchPersistenceError,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { assertStrategySearchJobId } from "./searchId";
import type { SearchDepthProfileId, QualificationProfileId } from "./operatorProfiles";

export const STRATEGY_SEARCH_PLAN_VERSION = 1 as const;

/** Operator-facing / API completion reasons (additive). */
export type StrategySearchCompletionReason =
  | "QUALIFIED_TARGET_REACHED"
  | "MAX_CANDIDATE_BUDGET"
  | "MAX_RUNTIME"
  | "SEARCH_SPACE_EXHAUSTED"
  | "USER_CANCELLED"
  | "FATAL_ERROR"
  | "MAX_ITERATIONS"
  | "PAUSED"
  | null;

export type StrategyPromotionStatus =
  | "pending"
  | "promoted"
  | "duplicate"
  | "failed"
  | "skipped";

export interface StrategySearchPlanSpaceState {
  id: string;
  labelKo: string;
  status: "pending" | "active" | "exhausted" | "completed" | "failed" | "skipped";
  uniqueEvaluated: number;
  /** Additive: candidates allocated to this family from remaining global budget. */
  budgetAllocated?: number;
  /** Additive: unique candidates spent while this family was active. */
  budgetSpent?: number;
}

export interface StrategySearchPromotionRecord {
  paramsHash: string;
  iteration: number;
  status: StrategyPromotionStatus;
  strategyId: string | null;
  strategyName: string | null;
  error: string | null;
  updatedAt: string;
}

export interface StrategySearchPlan {
  version: typeof STRATEGY_SEARCH_PLAN_VERSION;
  searchName: string;
  depthProfile: SearchDepthProfileId;
  qualificationProfile: QualificationProfileId;
  qualifiedTarget: number;
  candidateBudget: number;
  /** Per-stage batch size from depth profile. */
  stageBatchSize: number;
  maxRuntimeMs: number | null;
  /** Absolute ms timestamp when campaign started (first start). */
  campaignStartedAtMs: number | null;
  currentSpaceIndex: number;
  spaces: StrategySearchPlanSpaceState[];
  /** Global hashes already evaluated across spaces. */
  globalSeenHashes: string[];
  qualifiedHashes: string[];
  uniqueEvaluatedCount: number;
  duplicateSkippedCount: number;
  exhaustedSpaceCount: number;
  candidateBudgetUsed: number;
  elapsedMs: number;
  completionReason: StrategySearchCompletionReason;
  promotions: StrategySearchPromotionRecord[];
  /** Optional min score gate applied after Final PASS (operator). */
  minScore: number | null;
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "strategy-search",
  );
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function planPath(root: string, jobId: string): string {
  assertStrategySearchJobId(jobId);
  return path.join(root, "jobs", `${jobId}.plan.json`);
}

function writeJsonAtomic(targetPath: string, value: unknown): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${targetPath}.tmp`;
  const payload = JSON.stringify(value, null, 2);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, targetPath);
}

export function createEmptySearchPlan(input: {
  searchName: string;
  depthProfile: SearchDepthProfileId;
  qualificationProfile: QualificationProfileId;
  qualifiedTarget: number;
  candidateBudget: number;
  stageBatchSize: number;
  maxRuntimeMs: number | null;
  spaces: Array<{ id: string; labelKo: string }>;
  minScore?: number | null;
}): StrategySearchPlan {
  return {
    version: STRATEGY_SEARCH_PLAN_VERSION,
    searchName: input.searchName,
    depthProfile: input.depthProfile,
    qualificationProfile: input.qualificationProfile,
    qualifiedTarget: Math.max(1, Math.trunc(input.qualifiedTarget)),
    candidateBudget: Math.max(1, Math.trunc(input.candidateBudget)),
    stageBatchSize: Math.max(1, Math.trunc(input.stageBatchSize)),
    maxRuntimeMs: input.maxRuntimeMs,
    campaignStartedAtMs: null,
    currentSpaceIndex: 0,
    spaces: input.spaces.map((s, i) => ({
      id: s.id,
      labelKo: s.labelKo,
      status: i === 0 ? "active" : "pending",
      uniqueEvaluated: 0,
    })),
    globalSeenHashes: [],
    qualifiedHashes: [],
    uniqueEvaluatedCount: 0,
    duplicateSkippedCount: 0,
    exhaustedSpaceCount: 0,
    candidateBudgetUsed: 0,
    elapsedMs: 0,
    completionReason: null,
    promotions: [],
    minScore: input.minScore ?? null,
  };
}

export function saveSearchPlan(
  jobId: string,
  plan: StrategySearchPlan,
  options?: StrategySearchStoreOptions,
): StrategySearchPlan {
  const root = resolveRoot(options);
  if (plan.version !== STRATEGY_SEARCH_PLAN_VERSION) {
    throw new StrategySearchPersistenceError(
      "CORRUPTED",
      `unsupported strategy-search plan version: ${String((plan as { version?: unknown }).version)}`,
    );
  }
  writeJsonAtomic(planPath(root, jobId), plan);
  return plan;
}

export function getSearchPlan(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchPlan | null {
  const root = resolveRoot(options);
  const fp = planPath(root, jobId);
  if (!fs.existsSync(fp)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as StrategySearchPlan;
    if (!parsed || parsed.version !== STRATEGY_SEARCH_PLAN_VERSION) return null;
    if (!Array.isArray(parsed.spaces)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function markSpaceExhausted(
  plan: StrategySearchPlan,
): StrategySearchPlan {
  const spaces = plan.spaces.map((s, i) =>
    i === plan.currentSpaceIndex
      ? { ...s, status: "exhausted" as const }
      : s,
  );
  return {
    ...plan,
    spaces,
    exhaustedSpaceCount: spaces.filter((s) => s.status === "exhausted").length,
  };
}

/** Mark current family finished (budget used or completed) without combinatorial exhaustion. */
export function markSpaceCompleted(
  plan: StrategySearchPlan,
): StrategySearchPlan {
  const spaces = plan.spaces.map((s, i) =>
    i === plan.currentSpaceIndex
      ? { ...s, status: "completed" as const }
      : s,
  );
  return { ...plan, spaces };
}

/**
 * Allocate a fair share of remaining global budget to the active family.
 * Ensures one family cannot consume the entire campaign budget.
 * remainingFamilyBudget = ceil(remainingGlobal / remainingFamiliesIncludingCurrent)
 */
export function allocateCurrentFamilyBudget(
  plan: StrategySearchPlan,
): StrategySearchPlan {
  const remGlobal = Math.max(0, plan.candidateBudget - plan.candidateBudgetUsed);
  if (remGlobal <= 0) return plan;
  const remainingFamilyCount = Math.max(
    1,
    plan.spaces.length - plan.currentSpaceIndex,
  );
  const fairShare = Math.max(1, Math.ceil(remGlobal / remainingFamilyCount));
  const spaces = plan.spaces.map((s, i) => {
    if (i !== plan.currentSpaceIndex) return s;
    const alreadySpent = s.budgetSpent ?? s.uniqueEvaluated ?? 0;
    // Re-allocate only when entering a family or allocation missing.
    if (s.budgetAllocated != null && s.status === "active") {
      return s;
    }
    return {
      ...s,
      budgetAllocated: fairShare,
      budgetSpent: alreadySpent,
      status: "active" as const,
    };
  });
  return { ...plan, spaces };
}

export function familyBudgetRemaining(plan: StrategySearchPlan): number {
  const space = plan.spaces[plan.currentSpaceIndex];
  if (!space) return 0;
  const allocated = space.budgetAllocated ?? 0;
  const spent = space.budgetSpent ?? space.uniqueEvaluated ?? 0;
  if (allocated <= 0) {
    // Legacy plans without allocation: fall back to global remaining.
    return Math.max(0, plan.candidateBudget - plan.candidateBudgetUsed);
  }
  return Math.max(0, allocated - spent);
}

export function updateCurrentFamilySpent(
  plan: StrategySearchPlan,
  spentUnique: number,
): StrategySearchPlan {
  const spaces = plan.spaces.map((s, i) =>
    i === plan.currentSpaceIndex
      ? {
          ...s,
          uniqueEvaluated: Math.max(s.uniqueEvaluated, spentUnique),
          budgetSpent: Math.max(s.budgetSpent ?? 0, spentUnique),
        }
      : s,
  );
  return { ...plan, spaces };
}

export function advanceToNextSpace(
  plan: StrategySearchPlan,
): StrategySearchPlan {
  const nextIndex = plan.currentSpaceIndex + 1;
  if (nextIndex >= plan.spaces.length) {
    return {
      ...plan,
      completionReason: "SEARCH_SPACE_EXHAUSTED",
    };
  }
  const spaces = plan.spaces.map((s, i) => {
    if (i === plan.currentSpaceIndex) {
      if (s.status === "active") return { ...s, status: "exhausted" as const };
      return s; // keep exhausted/completed/failed
    }
    if (i === nextIndex) {
      return {
        ...s,
        status: "active" as const,
        budgetAllocated: undefined,
        budgetSpent: s.budgetSpent ?? 0,
      };
    }
    return s;
  });
  return {
    ...plan,
    currentSpaceIndex: nextIndex,
    spaces,
    exhaustedSpaceCount: spaces.filter((s) => s.status === "exhausted").length,
  };
}

export function mergeSeenHashes(
  plan: StrategySearchPlan,
  hashes: string[],
): StrategySearchPlan {
  const set = new Set(plan.globalSeenHashes);
  let added = 0;
  for (const h of hashes) {
    if (!h || h.startsWith("duplicate_exhausted_")) continue;
    if (!set.has(h)) {
      set.add(h);
      added += 1;
    }
  }
  return {
    ...plan,
    globalSeenHashes: [...set],
    uniqueEvaluatedCount: set.size,
    candidateBudgetUsed: set.size,
  };
}
