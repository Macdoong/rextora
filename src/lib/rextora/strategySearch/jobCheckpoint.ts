/**
 * Checkpoint encode/decode for Phase 5 job runner.
 *
 * Persistence reuses StrategySearchCheckpoint. Opaque runner payload is stored
 * in checkpoint.randomState as JSON (PRNG + statistics + seen hashes).
 */

import type { SeededRandomState } from "./random";
import {
  createEmptyJobStatistics,
  type StrategySearchJobStatistics,
} from "./jobStatistics";
import type {
  StrategySearchBestCandidateReference,
  StrategySearchCheckpoint,
  StrategySearchJobStatus,
} from "./types";

export const RUNNER_CHECKPOINT_VERSION = 1 as const;

/** Optional stop reason — additive; old checkpoints omit it. */
export type StrategySearchRunnerStopReason =
  | "max_iterations"
  | "search_space_exhausted"
  | "cancelled"
  | "paused"
  | "failed";

export interface StrategySearchRunnerCheckpointPayload {
  version: typeof RUNNER_CHECKPOINT_VERSION;
  prng: SeededRandomState;
  statistics: StrategySearchJobStatistics;
  /** Params hashes already generated (duplicate prevention + resume). */
  seenHashes: string[];
  /** Parent candidate for local generator resume (null for random). */
  lastParentCandidateId: string | null;
  lastParentParamsHash: string | null;
  jobStatus: StrategySearchJobStatus;
  /** Present when the runner stopped for a classified reason (Phase operator UX). */
  stopReason?: StrategySearchRunnerStopReason;
}

export class StrategySearchCheckpointError extends Error {
  readonly code: "CORRUPT_CHECKPOINT" | "INVALID_CHECKPOINT";

  constructor(
    code: StrategySearchCheckpointError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StrategySearchCheckpointError";
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertPrng(value: unknown): SeededRandomState {
  if (!isObject(value)) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint prng missing",
    );
  }
  if (value.algorithm !== "mulberry32") {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint prng algorithm invalid",
    );
  }
  if (
    typeof value.seed !== "number" ||
    !Number.isInteger(value.seed) ||
    typeof value.state !== "number" ||
    !Number.isInteger(value.state)
  ) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint prng seed/state invalid",
    );
  }
  return {
    algorithm: "mulberry32",
    seed: value.seed,
    state: value.state >>> 0,
  };
}

function assertStatistics(value: unknown): StrategySearchJobStatistics {
  if (!isObject(value)) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint statistics missing",
    );
  }
  const keys: Array<keyof StrategySearchJobStatistics> = [
    "generated",
    "evaluated",
    "passed",
    "failed",
    "stressPassed",
    "jitterPassed",
    "duplicates",
    "errors",
    "scoreSum",
    "elapsedMs",
  ];
  for (const key of keys) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key] as number)) {
      throw new StrategySearchCheckpointError(
        "CORRUPT_CHECKPOINT",
        `checkpoint statistics.${key} invalid`,
      );
    }
  }
  const bestScore = value.bestScore;
  const averageScore = value.averageScore;
  const remainingEstimateMs = value.remainingEstimateMs;
  if (
    bestScore != null &&
    (typeof bestScore !== "number" || !Number.isFinite(bestScore))
  ) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint statistics.bestScore invalid",
    );
  }
  if (
    averageScore != null &&
    (typeof averageScore !== "number" || !Number.isFinite(averageScore))
  ) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint statistics.averageScore invalid",
    );
  }
  if (
    remainingEstimateMs != null &&
    (typeof remainingEstimateMs !== "number" ||
      !Number.isFinite(remainingEstimateMs))
  ) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint statistics.remainingEstimateMs invalid",
    );
  }
  return {
    generated: value.generated as number,
    evaluated: value.evaluated as number,
    passed: value.passed as number,
    failed: value.failed as number,
    stressPassed: value.stressPassed as number,
    jitterPassed: value.jitterPassed as number,
    duplicates: value.duplicates as number,
    errors: value.errors as number,
    bestScore: (bestScore as number | null) ?? null,
    averageScore: (averageScore as number | null) ?? null,
    scoreSum: value.scoreSum as number,
    elapsedMs: value.elapsedMs as number,
    remainingEstimateMs: (remainingEstimateMs as number | null) ?? null,
  };
}

export function encodeRunnerCheckpointPayload(
  payload: StrategySearchRunnerCheckpointPayload,
): string {
  if (payload.version !== RUNNER_CHECKPOINT_VERSION) {
    throw new StrategySearchCheckpointError(
      "INVALID_CHECKPOINT",
      "unsupported runner checkpoint version",
    );
  }
  return JSON.stringify({
    version: payload.version,
    prng: { ...payload.prng },
    statistics: { ...payload.statistics },
    seenHashes: [...payload.seenHashes],
    lastParentCandidateId: payload.lastParentCandidateId,
    lastParentParamsHash: payload.lastParentParamsHash,
    jobStatus: payload.jobStatus,
    ...(payload.stopReason ? { stopReason: payload.stopReason } : {}),
  });
}

export function decodeRunnerCheckpointPayload(
  raw: string | null,
): StrategySearchRunnerCheckpointPayload | null {
  if (raw == null || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint randomState is not valid JSON",
    );
  }
  if (!isObject(parsed)) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint payload is not an object",
    );
  }
  if (parsed.version !== RUNNER_CHECKPOINT_VERSION) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint version mismatch",
    );
  }
  if (!Array.isArray(parsed.seenHashes)) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint seenHashes invalid",
    );
  }
  for (const h of parsed.seenHashes) {
    if (typeof h !== "string") {
      throw new StrategySearchCheckpointError(
        "CORRUPT_CHECKPOINT",
        "checkpoint seenHashes entries must be strings",
      );
    }
  }
  if (
    typeof parsed.jobStatus !== "string" ||
    ![
      "queued",
      "running",
      "pause_requested",
      "paused",
      "cancel_requested",
      "cancelled",
      "completed",
      "failed",
    ].includes(parsed.jobStatus)
  ) {
    throw new StrategySearchCheckpointError(
      "CORRUPT_CHECKPOINT",
      "checkpoint jobStatus invalid",
    );
  }

  const stopReasonRaw = parsed.stopReason;
  const stopReason =
    stopReasonRaw === "max_iterations" ||
    stopReasonRaw === "search_space_exhausted" ||
    stopReasonRaw === "cancelled" ||
    stopReasonRaw === "paused" ||
    stopReasonRaw === "failed"
      ? stopReasonRaw
      : undefined;

  return {
    version: RUNNER_CHECKPOINT_VERSION,
    prng: assertPrng(parsed.prng),
    statistics: assertStatistics(parsed.statistics),
    seenHashes: [...(parsed.seenHashes as string[])],
    lastParentCandidateId:
      parsed.lastParentCandidateId == null
        ? null
        : String(parsed.lastParentCandidateId),
    lastParentParamsHash:
      parsed.lastParentParamsHash == null
        ? null
        : String(parsed.lastParentParamsHash),
    jobStatus: parsed.jobStatus as StrategySearchJobStatus,
    ...(stopReason ? { stopReason } : {}),
  };
}

export function createInitialRunnerPayload(input: {
  prng: SeededRandomState;
  jobStatus: StrategySearchJobStatus;
}): StrategySearchRunnerCheckpointPayload {
  return {
    version: RUNNER_CHECKPOINT_VERSION,
    prng: { ...input.prng },
    statistics: createEmptyJobStatistics(),
    seenHashes: [],
    lastParentCandidateId: null,
    lastParentParamsHash: null,
    jobStatus: input.jobStatus,
  };
}

export function buildPersistedCheckpoint(input: {
  completedIterations: number;
  nextIteration: number;
  payload: StrategySearchRunnerCheckpointPayload;
  bestCandidate: StrategySearchBestCandidateReference | null;
  bestPassedCandidate: StrategySearchBestCandidateReference | null;
  updatedAt?: string;
}): StrategySearchCheckpoint {
  return {
    completedIterations: input.completedIterations,
    nextIteration: input.nextIteration,
    randomState: encodeRunnerCheckpointPayload(input.payload),
    bestCandidate: input.bestCandidate
      ? { ...input.bestCandidate }
      : null,
    bestPassedCandidate: input.bestPassedCandidate
      ? { ...input.bestPassedCandidate }
      : null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function readRunnerPayloadFromCheckpoint(
  checkpoint: StrategySearchCheckpoint,
): StrategySearchRunnerCheckpointPayload | null {
  return decodeRunnerCheckpointPayload(checkpoint.randomState);
}
