import fs from "node:fs";
import path from "node:path";
import {
  assertStrategySearchIteration,
  assertStrategySearchJobId,
  createStrategySearchJobId,
  isValidStrategySearchJobId,
} from "./searchId";
import type {
  StrategySearchCheckpoint,
  StrategySearchConfig,
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobStatus,
  StrategySearchTrial,
} from "./types";
import { strategySearchRoot } from "../storage/runtimePaths";
import { projectSearchJobIndexEntry } from "./indexProjection";
import {
  DurableJsonWriteError,
  writeDurableJsonPayload,
} from "./durableJsonWrite";

export { projectSearchJobIndexEntry } from "./indexProjection";
export { writeDurableJsonPayload } from "./durableJsonWrite";

export interface StrategySearchStoreOptions {
  /** Injectable root for tests. Default: data/rextora/strategy-search */
  rootDir?: string;
}

export type StrategySearchPersistenceErrorCode =
  | "WRITE_FAILED"
  | "CORRUPTED"
  | "RECOVERY_FAILED"
  | "TRIAL_CONFLICT"
  | "INVALID_TRANSITION"
  | "INVALID_IDENTIFIER"
  | "NOT_FOUND";

export class StrategySearchPersistenceError extends Error {
  readonly code: StrategySearchPersistenceErrorCode;
  readonly targetPath?: string;

  constructor(
    code: StrategySearchPersistenceErrorCode,
    message: string,
    targetPath?: string,
  ) {
    super(message);
    this.name = "StrategySearchPersistenceError";
    this.code = code;
    this.targetPath = targetPath;
  }
}

const ALLOWED_TRANSITIONS: ReadonlyArray<
  readonly [StrategySearchJobStatus, StrategySearchJobStatus]
> = [
  ["queued", "running"],
  /** Recovery rollback when a prepared restart cannot create its worker. */
  ["queued", "interrupted"],
  ["queued", "cancel_requested"],
  ["running", "interrupted"],
  ["running", "pause_requested"],
  ["running", "cancel_requested"],
  ["running", "completed"],
  ["running", "failed"],
  ["pause_requested", "paused"],
  ["pause_requested", "cancel_requested"],
  ["paused", "queued"],
  ["paused", "cancel_requested"],
  ["interrupted", "queued"],
  ["interrupted", "cancel_requested"],
  ["interrupted", "completed"],
  ["cancel_requested", "cancelling"],
  ["cancel_requested", "cancelled"],
  ["cancelling", "cancelled"],
  /** Orchestrator: advance to next verified search space after stage completion. */
  ["completed", "queued"],
  /** Recoverable engine failure → operator retry/resume. */
  ["failed", "queued"],
];

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function jobsDir(root: string): string {
  return path.join(root, "jobs");
}

function trialsDir(root: string): string {
  return path.join(root, "trials");
}

function indexPath(root: string): string {
  return path.join(root, "index.json");
}

function assertInsideRoot(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const prefix = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new StrategySearchPersistenceError(
      "INVALID_IDENTIFIER",
      "strategy-search path escapes store root",
      candidate,
    );
  }
  return resolved;
}

function jobFilePath(root: string, jobId: string): string {
  assertStrategySearchJobId(jobId);
  const file = path.join(jobsDir(root), `${jobId}.json`);
  return assertInsideRoot(root, file);
}

function trialDirPath(root: string, jobId: string): string {
  assertStrategySearchJobId(jobId);
  const dir = path.join(trialsDir(root), jobId);
  return assertInsideRoot(root, dir);
}

function trialFilePath(root: string, jobId: string, iteration: number): string {
  assertStrategySearchIteration(iteration);
  const file = path.join(
    trialDirPath(root, jobId),
    `${String(iteration).padStart(8, "0")}.json`,
  );
  return assertInsideRoot(root, file);
}

function tmpPathFor(targetPath: string): string {
  return `${targetPath}.tmp`;
}

function bakPathFor(targetPath: string): string {
  return `${targetPath}.bak`;
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

function tryParseJsonFile(
  filePath: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    if (!fs.existsSync(filePath)) return { ok: false };
    const text = fs.readFileSync(filePath, "utf8");
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Recoverable crash-safe JSON write (not fully atomic cross-platform).
 * Uses sibling `<target>.tmp` and `<target>.bak` with fsync + rename.
 */
function recoverableWriteJson(targetPath: string, value: unknown): void {
  ensureDir(path.dirname(targetPath));
  try {
    writeDurableJsonPayload(targetPath, JSON.stringify(value, null, 2));
  } catch (error) {
    if (error instanceof StrategySearchPersistenceError) throw error;
    throw new StrategySearchPersistenceError(
      "WRITE_FAILED",
      error instanceof DurableJsonWriteError
        ? error.message
        : `strategy-search filesystem write failed for ${targetPath}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
      targetPath,
    );
  }
}

type RecoverReadOptions = {
  /** When true, absence of target/bak/tmp returns null instead of throwing. */
  allowMissing?: boolean;
  /** Job-owned callers may hook sibling promotion; other JSON files omit this. */
  onPromoted?: (source: "bak" | "tmp") => void;
};

const INDEX_SYNC_ATTEMPTS = 3;

/**
 * Read JSON with interrupted-write recovery from `.bak` / `.tmp` siblings.
 */
function recoverReadJson<T>(
  targetPath: string,
  options?: RecoverReadOptions,
): T | null {
  const tmp = tmpPathFor(targetPath);
  const bak = bakPathFor(targetPath);
  const targetExists = fs.existsSync(targetPath);
  const bakExists = fs.existsSync(bak);
  const tmpExists = fs.existsSync(tmp);

  const targetParsed = tryParseJsonFile(targetPath);
  if (targetParsed.ok) {
    safeUnlink(tmp);
    // Target is authoritative; drop leftover backup once validated.
    safeUnlink(bak);
    return targetParsed.value as T;
  }

  const bakParsed = tryParseJsonFile(bak);
  if (bakParsed.ok) {
    try {
      if (targetExists) safeUnlink(targetPath);
      fs.renameSync(bak, targetPath);
      safeUnlink(tmp);
      const restored = tryParseJsonFile(targetPath);
      if (!restored.ok) {
        throw new StrategySearchPersistenceError(
          "RECOVERY_FAILED",
          `strategy-search failed to restore backup for ${targetPath}`,
          targetPath,
        );
      }
      options?.onPromoted?.("bak");
      return restored.value as T;
    } catch (error) {
      if (error instanceof StrategySearchPersistenceError) throw error;
      throw new StrategySearchPersistenceError(
        "RECOVERY_FAILED",
        `strategy-search recovery from .bak failed for ${targetPath}`,
        targetPath,
      );
    }
  }

  const tmpParsed = tryParseJsonFile(tmp);
  if (!targetExists && tmpParsed.ok && !bakExists) {
    try {
      fs.renameSync(tmp, targetPath);
      const promoted = tryParseJsonFile(targetPath);
      if (!promoted.ok) {
        throw new StrategySearchPersistenceError(
          "RECOVERY_FAILED",
          `strategy-search failed to promote .tmp for ${targetPath}`,
          targetPath,
        );
      }
      options?.onPromoted?.("tmp");
      return promoted.value as T;
    } catch (error) {
      if (error instanceof StrategySearchPersistenceError) throw error;
      throw new StrategySearchPersistenceError(
        "RECOVERY_FAILED",
        `strategy-search recovery from .tmp failed for ${targetPath}`,
        targetPath,
      );
    }
  }

  if (!targetExists && !bakExists && !tmpExists) {
    if (options?.allowMissing) return null;
    throw new StrategySearchPersistenceError(
      "NOT_FOUND",
      `strategy-search persisted file not found: ${targetPath}`,
      targetPath,
    );
  }

  throw new StrategySearchPersistenceError(
    "CORRUPTED",
    `strategy-search corrupted persistence data at ${targetPath}`,
    targetPath,
  );
}

function emptyCheckpoint(at: string): StrategySearchCheckpoint {
  return {
    completedIterations: 0,
    nextIteration: 0,
    randomState: null,
    bestCandidate: null,
    bestPassedCandidate: null,
    bestByCompatibilityGroup: [
      {
        rankingCompatibilityGroup: "safe_execution_price_v1",
        bestCandidate: null,
        bestPassedCandidate: null,
        bestScore: null,
      },
      {
        rankingCompatibilityGroup: "event_sequence_execution_price_v1",
        bestCandidate: null,
        bestPassedCandidate: null,
        bestScore: null,
      },
      {
        rankingCompatibilityGroup: "event_sequence_ledger_v0",
        bestCandidate: null,
        bestPassedCandidate: null,
        bestScore: null,
      },
    ],
    updatedAt: at,
  };
}

function assertConfig(config: StrategySearchConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("strategy-search config is required");
  }
  if (typeof config.searchVersion !== "string" || !config.searchVersion) {
    throw new Error("strategy-search config.searchVersion is required");
  }
  if (
    typeof config.strategyTemplateId !== "string" ||
    !config.strategyTemplateId
  ) {
    throw new Error("strategy-search config.strategyTemplateId is required");
  }
  if (!Array.isArray(config.symbols) || config.symbols.length === 0) {
    throw new Error("strategy-search config.symbols must be a non-empty array");
  }
  if (
    config.maxIterations !== null &&
    (!Number.isInteger(config.maxIterations) || config.maxIterations < 0)
  ) {
    throw new Error(
      "strategy-search config.maxIterations must be null or a non-negative integer",
    );
  }
}

function canTransition(
  from: StrategySearchJobStatus,
  to: StrategySearchJobStatus,
): boolean {
  return ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

function assertTransition(
  from: StrategySearchJobStatus,
  to: StrategySearchJobStatus,
): void {
  if (!canTransition(from, to)) {
    throw new StrategySearchPersistenceError(
      "INVALID_TRANSITION",
      `invalid strategy-search status transition: ${from} → ${to}`,
    );
  }
}

function emptyIndex(): StrategySearchJobIndex {
  return { version: 1, updatedAt: nowIso(), jobs: [] };
}

function readIndex(root: string): StrategySearchJobIndex {
  const fp = indexPath(root);
  const parsed = recoverReadJson<StrategySearchJobIndex>(fp, {
    allowMissing: true,
  });
  if (parsed == null) return emptyIndex();
  if (!parsed || !Array.isArray(parsed.jobs)) {
    throw new StrategySearchPersistenceError(
      "CORRUPTED",
      `strategy-search corrupted persistence data at ${fp}`,
      fp,
    );
  }
  return parsed;
}

function syncIndexWithJob(root: string, job: StrategySearchJob): void {
  const index = readIndex(root);
  const next = index.jobs.filter((row) => row.id !== job.id);
  next.unshift(projectSearchJobIndexEntry(job));
  recoverableWriteJson(indexPath(root), {
    version: 1 as const,
    updatedAt: nowIso(),
    jobs: next,
  });
}

function syncIndexWithJobWithRetry(root: string, job: StrategySearchJob): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < INDEX_SYNC_ATTEMPTS; attempt++) {
    try {
      syncIndexWithJob(root, job);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new StrategySearchPersistenceError(
    "WRITE_FAILED",
    "strategy-search index synchronization failed",
    indexPath(root),
  );
}

function readJobFile(
  root: string,
  jobId: string,
  allowMissing: boolean,
): StrategySearchJob | null {
  assertStrategySearchJobId(jobId);
  const fp = jobFilePath(root, jobId);
  let promoted: "bak" | "tmp" | null = null;
  const job = recoverReadJson<StrategySearchJob>(fp, {
    allowMissing,
    onPromoted: (source) => {
      promoted = source;
    },
  });
  if (job && promoted) {
    const indexed = readIndex(root).jobs.some((row) => row.id === job.id);
    if (indexed) {
      syncIndexWithJobWithRetry(root, job);
    }
  }
  return job;
}

function loadJobOrThrow(root: string, jobId: string): StrategySearchJob {
  const fp = jobFilePath(root, jobId);
  const job = readJobFile(root, jobId, true);
  if (job == null) {
    throw new StrategySearchPersistenceError(
      "NOT_FOUND",
      `strategy-search job not found: ${jobId}`,
      fp,
    );
  }
  return job;
}

function persistJob(root: string, job: StrategySearchJob): StrategySearchJob {
  const fp = jobFilePath(root, job.id);
  const previousParsed = tryParseJsonFile(fp);
  const previous = previousParsed.ok
    ? (previousParsed.value as StrategySearchJob)
    : null;
  recoverableWriteJson(fp, job);
  try {
    syncIndexWithJobWithRetry(root, job);
    return job;
  } catch (error) {
    if (previous == null) {
      safeUnlink(fp);
      safeUnlink(tmpPathFor(fp));
      safeUnlink(bakPathFor(fp));
    } else {
      recoverableWriteJson(fp, previous);
    }
    throw error;
  }
}

function transitionJob(
  root: string,
  jobId: string,
  nextStatus: StrategySearchJobStatus,
  patch?: Partial<
    Pick<StrategySearchJob, "failureMessage" | "startedAt" | "finishedAt">
  >,
): StrategySearchJob {
  const current = loadJobOrThrow(root, jobId);
  assertTransition(current.status, nextStatus);
  const at = nowIso();
  const next: StrategySearchJob = {
    ...current,
    status: nextStatus,
    updatedAt: at,
    createdAt: current.createdAt,
    failureMessage:
      nextStatus === "failed"
        ? (patch?.failureMessage ?? current.failureMessage ?? "failed")
        : null,
    startedAt:
      patch?.startedAt !== undefined
        ? patch.startedAt
        : nextStatus === "running" && current.startedAt == null
          ? at
          : current.startedAt,
    finishedAt:
      patch?.finishedAt !== undefined
        ? patch.finishedAt
        : nextStatus === "completed" ||
            nextStatus === "failed" ||
            nextStatus === "cancelled"
          ? at
          : current.finishedAt,
  };
  return persistJob(root, next);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function trialsEqual(a: StrategySearchTrial, b: StrategySearchTrial): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function createSearchJob(
  config: StrategySearchConfig,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  assertConfig(config);
  const root = resolveRoot(options);
  ensureDir(jobsDir(root));
  ensureDir(trialsDir(root));
  const at = nowIso();
  const job: StrategySearchJob = {
    id: createStrategySearchJobId(),
    status: "queued",
    config,
    checkpoint: emptyCheckpoint(at),
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    finishedAt: null,
    failureMessage: null,
  };
  if (!isValidStrategySearchJobId(job.id)) {
    throw new StrategySearchPersistenceError(
      "INVALID_IDENTIFIER",
      "generated strategy-search job id failed validation",
    );
  }
  return persistJob(root, job);
}

export function getSearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob | null {
  assertStrategySearchJobId(jobId);
  const root = resolveRoot(options);
  return readJobFile(root, jobId, true);
}

export function listSearchJobs(
  options?: StrategySearchStoreOptions,
): StrategySearchJob[] {
  const root = resolveRoot(options);
  ensureDir(jobsDir(root));
  const index = readIndex(root);
  const out: StrategySearchJob[] = [];
  for (const row of index.jobs) {
    if (!isValidStrategySearchJobId(row.id)) continue;
    const job = getSearchJob(row.id, { rootDir: root });
    if (job) out.push(job);
  }
  return out;
}

export function saveSearchJob(
  job: StrategySearchJob,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  assertStrategySearchJobId(job.id);
  assertConfig(job.config);
  const root = resolveRoot(options);
  const existing = getSearchJob(job.id, { rootDir: root });
  const at = nowIso();
  const next: StrategySearchJob = {
    ...job,
    createdAt: existing?.createdAt ?? job.createdAt,
    updatedAt: at,
    failureMessage: job.status === "failed" ? job.failureMessage : null,
  };
  return persistJob(root, next);
}

export function requestPauseSearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "pause_requested");
}

export function markSearchJobPaused(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "paused");
}

export function markSearchJobInterrupted(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "interrupted");
}

export function resumeSearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const root = resolveRoot(options);
  const current = loadJobOrThrow(root, jobId);
  if (current.status === "completed" || current.status === "cancelled") {
    throw new StrategySearchPersistenceError(
      "INVALID_TRANSITION",
      `cannot resume strategy-search job in terminal status: ${current.status}`,
    );
  }
  // paused/interrupted → queued (resume) or failed → queued (recoverable retry)
  return transitionJob(root, jobId, "queued", {
    finishedAt: null,
    failureMessage: null,
  });
}

export function requestCancelSearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const root = resolveRoot(options);
  const next = transitionJob(root, jobId, "cancel_requested");
  if (next.cancelRequestedAt) return next;
  return persistJob(root, {
    ...next,
    cancelRequestedAt: next.updatedAt,
  });
}

export function markSearchJobCancelling(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "cancelling");
}

export function markSearchJobCancelled(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const root = resolveRoot(options);
  const current = loadJobOrThrow(root, jobId);
  if (current.status === "cancelled") {
    // Ensure terminal cancel stamps exist even for legacy recoveries.
    if (
      current.cancellationAcknowledgedAt &&
      current.resultsPreserved === true &&
      current.finishedAt
    ) {
      return current;
    }
    const at = nowIso();
    return persistJob(root, {
      ...current,
      finishedAt: current.finishedAt ?? at,
      cancellationAcknowledgedAt: current.cancellationAcknowledgedAt ?? at,
      resultsPreserved: true,
      updatedAt: at,
    });
  }
  // Allow cancel_requested → cancelled or cancelling → cancelled.
  const cancelled = transitionJob(root, jobId, "cancelled");
  const at = cancelled.finishedAt ?? cancelled.updatedAt;
  return persistJob(root, {
    ...cancelled,
    cancelRequestedAt: cancelled.cancelRequestedAt ?? current.cancelRequestedAt,
    cancellationAcknowledgedAt: cancelled.cancellationAcknowledgedAt ?? at,
    resultsPreserved: true,
  });
}

export function markSearchJobRunning(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "running");
}

export function markSearchJobCompleted(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "completed", {
    failureMessage: null,
  });
}

export function markSearchJobFailed(
  jobId: string,
  failureMessage: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  if (typeof failureMessage !== "string" || failureMessage.trim() === "") {
    throw new Error("strategy-search failure message is required");
  }
  return transitionJob(resolveRoot(options), jobId, "failed", {
    failureMessage,
  });
}

/**
 * Re-open a completed job so the orchestrator can run the next search space.
 * Preserves checkpoint / trials; caller updates config + seenHashes before start.
 */
export function reopenSearchJobForNextSpace(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  return transitionJob(resolveRoot(options), jobId, "queued", {
    finishedAt: null,
    failureMessage: null,
  });
}

export function saveSearchTrial(
  trial: StrategySearchTrial,
  options?: StrategySearchStoreOptions,
): StrategySearchTrial {
  assertStrategySearchJobId(trial.jobId);
  assertStrategySearchIteration(trial.iteration);
  const root = resolveRoot(options);
  loadJobOrThrow(root, trial.jobId);
  const fp = trialFilePath(root, trial.jobId, trial.iteration);
  const existing = recoverReadJson<StrategySearchTrial>(fp, {
    allowMissing: true,
  });
  if (existing != null) {
    if (trialsEqual(existing, trial)) {
      return existing;
    }
    throw new StrategySearchPersistenceError(
      "TRIAL_CONFLICT",
      `strategy-search trial already exists with different contents: ${trial.jobId}#${trial.iteration}`,
      fp,
    );
  }
  recoverableWriteJson(fp, trial);
  return trial;
}

export function getSearchTrial(
  jobId: string,
  iteration: number,
  options?: StrategySearchStoreOptions,
): StrategySearchTrial | null {
  assertStrategySearchJobId(jobId);
  assertStrategySearchIteration(iteration);
  const root = resolveRoot(options);
  const fp = trialFilePath(root, jobId, iteration);
  return recoverReadJson<StrategySearchTrial>(fp, { allowMissing: true });
}

export function listSearchTrials(
  jobId: string,
  options?: StrategySearchStoreOptions,
): StrategySearchTrial[] {
  assertStrategySearchJobId(jobId);
  const root = resolveRoot(options);
  const dir = trialDirPath(root, jobId);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort();
  const out: StrategySearchTrial[] = [];
  for (const name of files) {
    const trial = recoverReadJson<StrategySearchTrial>(path.join(dir, name), {
      allowMissing: true,
    });
    if (trial) out.push(trial);
  }
  return out;
}

export function updateSearchCheckpoint(
  jobId: string,
  checkpoint: StrategySearchCheckpoint,
  options?: StrategySearchStoreOptions,
): StrategySearchJob {
  const root = resolveRoot(options);
  const current = loadJobOrThrow(root, jobId);
  const at = nowIso();
  const next: StrategySearchJob = {
    ...current,
    checkpoint: {
      ...checkpoint,
      updatedAt: checkpoint.updatedAt || at,
    },
    updatedAt: at,
    createdAt: current.createdAt,
    failureMessage: current.status === "failed" ? current.failureMessage : null,
  };
  return persistJob(root, next);
}

function safeRmDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // best-effort cleanup
  }
}

/**
 * Delete one Strategy Search job and its owned sidecars.
 * Scoped strictly to `<root>/jobs/<jobId>*` and `<root>/trials/<jobId>/`.
 * Never touches Strategy Management or SAFE strategy files.
 */
export function deleteSearchJob(
  jobId: string,
  options?: StrategySearchStoreOptions,
): void {
  assertStrategySearchJobId(jobId);
  const root = resolveRoot(options);
  const jobPath = jobFilePath(root, jobId);
  const planPath = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.plan.json`),
  );
  const executionPath = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.execution.json`),
  );
  const generationsPath = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.generations.json`),
  );
  const top10Path = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.top10.json`),
  );
  const top10HistoryPath = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.top10.history.jsonl`),
  );
  const archivePath = assertInsideRoot(
    root,
    path.join(jobsDir(root), `${jobId}.archive.json`),
  );
  const trialsPath = trialDirPath(root, jobId);

  // Remove job-owned artifacts first (index update last keeps index parseable).
  safeRmDir(trialsPath);
  for (const target of [
    jobPath,
    planPath,
    executionPath,
    generationsPath,
    top10Path,
    top10HistoryPath,
    archivePath,
  ]) {
    safeUnlink(target);
    safeUnlink(tmpPathFor(target));
    safeUnlink(bakPathFor(target));
  }

  const index = readIndex(root);
  const nextJobs = index.jobs.filter((row) => row.id !== jobId);
  recoverableWriteJson(indexPath(root), {
    version: 1 as const,
    updatedAt: nowIso(),
    jobs: nextJobs,
  });
}
