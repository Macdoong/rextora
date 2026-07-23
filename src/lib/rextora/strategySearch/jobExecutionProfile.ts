/**
 * Persisted execution profile for Strategy Search API jobs.
 *
 * Sidecar file next to the job JSON (same store root). Does not change
 * StrategySearchCheckpoint / trial persistence format.
 *
 * Path: <root>/jobs/<jobId>.execution.json
 */

import fs from "node:fs";
import path from "node:path";
import {
  StrategySearchPersistenceError,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { assertStrategySearchJobId } from "./searchId";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchCostStressScenario,
  StrategySearchJitterConfig,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
} from "./types";

export const STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION = 1 as const;

/** Data reference — never raw candle arrays in API payloads. */
export interface StrategySearchDataReference {
  /** Inclusive available data range used by window planner (ms open times). */
  availableFrom: number;
  availableTo: number;
  /**
   * How candles are resolved at start time.
   * - binance_historical: fetch via historicalCandleLoader
   * - preloaded: tests / injected deps only (not accepted from public API create)
   */
  source: "binance_historical" | "preloaded";
}

export interface StrategySearchExecutionProfile {
  version: typeof STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION;
  balance: number;
  baseCostConfig: StrategySearchBacktestCostConfig;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
  dataRef: StrategySearchDataReference;
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

function profilePath(root: string, jobId: string): string {
  assertStrategySearchJobId(jobId);
  return path.join(root, "jobs", `${jobId}.execution.json`);
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

export function saveJobExecutionProfile(
  jobId: string,
  profile: StrategySearchExecutionProfile,
  options?: StrategySearchStoreOptions,
): StrategySearchExecutionProfile {
  const root = resolveRoot(options);
  const stored: StrategySearchExecutionProfile = {
    version: STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION,
    balance: profile.balance,
    baseCostConfig: { ...profile.baseCostConfig },
    passPolicy: {
      thresholds: { ...profile.passPolicy.thresholds },
    },
    scoreWeights: { ...profile.scoreWeights },
    costStressScenarios: profile.costStressScenarios.map((s) => ({ ...s })),
    jitterConfig: {
      ...profile.jitterConfig,
      parameterRanges: profile.jitterConfig.parameterRanges.map((r) => ({
        ...r,
      })),
    },
    dataRef: { ...profile.dataRef },
  };
  writeJsonAtomic(profilePath(root, jobId), stored);
  return stored;
}

export function getJobExecutionProfile(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchExecutionProfile | null {
  const root = resolveRoot(options);
  const fp = profilePath(root, jobId);
  if (!fs.existsSync(fp)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as
      | StrategySearchExecutionProfile
      | null;
    if (!parsed || parsed.version !== STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION) {
      throw new StrategySearchPersistenceError(
        "CORRUPTED",
        `strategy-search execution profile corrupt or unsupported version: ${jobId}`,
        fp,
      );
    }
    return parsed;
  } catch (err) {
    if (err instanceof StrategySearchPersistenceError) throw err;
    throw new StrategySearchPersistenceError(
      "CORRUPTED",
      `strategy-search execution profile unreadable: ${jobId}`,
      fp,
    );
  }
}
