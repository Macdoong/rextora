/**
 * Cross-process Strategy Search job execution ownership.
 *
 * The in-process registry prevents duplicate workers within one Node process.
 * This module adds a persisted owner lease so separate processes (e.g. a stray
 * tsx harness and the production server) cannot both write trials for one job.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StrategySearchStoreOptions } from "./jobStore";
import { strategySearchRoot } from "../storage/runtimePaths";

/** Heartbeat interval while a job is actively running in this process. */
export const EXECUTION_OWNERSHIP_HEARTBEAT_MS = 15_000;

/** No heartbeat within this window → owner is stale and may be recovered. */
export const EXECUTION_OWNERSHIP_STALE_MS = 90_000;

export type JobExecutionOwnershipOutcome =
  | "acquired"
  | "idempotent_same_owner"
  | "rejected_active_owner"
  | "recovered_stale_owner";

export interface JobExecutionOwnershipRecord {
  jobId: string;
  ownerId: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface JobExecutionOwnershipAuditRecord {
  jobId: string;
  ownerId: string;
  event:
    | "acquired"
    | "idempotent_attach"
    | "rejected_duplicate"
    | "recovered_stale"
    | "heartbeat"
    | "released";
  at: string;
  previousOwnerId?: string | null;
  reason?: string | null;
  pid: number;
  hostname: string;
}

export class JobExecutionOwnershipError extends Error {
  readonly code: "ALREADY_OWNED" | "NOT_OWNER" | "INVALID";

  constructor(code: JobExecutionOwnershipError["code"], message: string) {
    super(message);
    this.name = "JobExecutionOwnershipError";
    this.code = code;
  }
}

const PROCESS_OWNER_ID = `owner_${process.pid}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function ownersDir(root: string): string {
  return path.join(root, "owners");
}

function ownerFilePath(root: string, jobId: string): string {
  return path.join(ownersDir(root), `${jobId}.owner.json`);
}

function auditPath(root: string): string {
  return path.join(root, "execution-ownership-audit.jsonl");
}

function nowIso(): string {
  return new Date().toISOString();
}

function hostname(): string {
  try {
    return os.hostname();
  } catch {
    return "unknown";
  }
}

function readOwnerRecord(
  root: string,
  jobId: string,
): JobExecutionOwnershipRecord | null {
  const fp = ownerFilePath(root, jobId);
  if (!fs.existsSync(fp)) return null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(fp, "utf8"),
    ) as JobExecutionOwnershipRecord;
    if (!parsed?.ownerId || !parsed?.heartbeatAt) return null;
    if (parsed.releasedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOwnerRecord(root: string, record: JobExecutionOwnershipRecord): void {
  const dir = ownersDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const fp = ownerFilePath(root, record.jobId);
  const tmp = `${fp}.tmp`;
  const payload = JSON.stringify(record, null, 2);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, fp);
}

function appendOwnershipAudit(
  root: string,
  record: JobExecutionOwnershipAuditRecord,
): void {
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(auditPath(root), `${JSON.stringify(record)}\n`, "utf8");
}

function isHeartbeatFresh(record: JobExecutionOwnershipRecord): boolean {
  const age = Date.now() - Date.parse(record.heartbeatAt);
  return Number.isFinite(age) && age >= 0 && age <= EXECUTION_OWNERSHIP_STALE_MS;
}

export function getProcessExecutionOwnerId(): string {
  return PROCESS_OWNER_ID;
}

export function getJobExecutionOwnership(
  jobId: string,
  options?: StrategySearchStoreOptions,
): JobExecutionOwnershipRecord | null {
  return readOwnerRecord(resolveRoot(options), jobId);
}

export function isJobExecutionOwnedOnDisk(
  jobId: string,
  options?: StrategySearchStoreOptions,
): boolean {
  const record = getJobExecutionOwnership(jobId, options);
  return record != null && isHeartbeatFresh(record);
}

export function listJobExecutionOwnershipAudits(
  options?: StrategySearchStoreOptions & { limit?: number },
): JobExecutionOwnershipAuditRecord[] {
  const root = resolveRoot(options);
  const fp = auditPath(root);
  if (!fs.existsSync(fp)) return [];
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
  const out: JobExecutionOwnershipAuditRecord[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    try {
      out.push(JSON.parse(lines[i]!) as JobExecutionOwnershipAuditRecord);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

export interface AcquireJobExecutionOwnershipResult {
  outcome: JobExecutionOwnershipOutcome;
  ownerId: string;
  record: JobExecutionOwnershipRecord;
}

/**
 * Atomically acquire execution ownership for a job.
 * Same ownerId re-entry is idempotent. Fresh foreign owners are rejected.
 * Stale foreign owners are recovered with audit evidence.
 */
export function acquireJobExecutionOwnership(
  jobId: string,
  ownerId: string = PROCESS_OWNER_ID,
  options?: StrategySearchStoreOptions,
): AcquireJobExecutionOwnershipResult {
  const root = resolveRoot(options);
  const existing = readOwnerRecord(root, jobId);

  if (existing) {
    if (existing.ownerId === ownerId) {
      const refreshed: JobExecutionOwnershipRecord = {
        ...existing,
        heartbeatAt: nowIso(),
      };
      writeOwnerRecord(root, refreshed);
      appendOwnershipAudit(root, {
        jobId,
        ownerId,
        event: "idempotent_attach",
        at: refreshed.heartbeatAt,
        pid: process.pid,
        hostname: hostname(),
      });
      return {
        outcome: "idempotent_same_owner",
        ownerId,
        record: refreshed,
      };
    }
    if (isHeartbeatFresh(existing)) {
      appendOwnershipAudit(root, {
        jobId,
        ownerId,
        event: "rejected_duplicate",
        at: nowIso(),
        previousOwnerId: existing.ownerId,
        reason: "active_owner",
        pid: process.pid,
        hostname: hostname(),
      });
      throw new JobExecutionOwnershipError(
        "ALREADY_OWNED",
        `strategy-search job already owned by ${existing.ownerId} (pid ${existing.pid}): ${jobId}`,
      );
    }
    appendOwnershipAudit(root, {
      jobId,
      ownerId,
      event: "recovered_stale",
      at: nowIso(),
      previousOwnerId: existing.ownerId,
      reason: "stale_heartbeat",
      pid: process.pid,
      hostname: hostname(),
    });
  }

  const acquiredAt = nowIso();
  const record: JobExecutionOwnershipRecord = {
    jobId,
    ownerId,
    pid: process.pid,
    hostname: hostname(),
    acquiredAt,
    heartbeatAt: acquiredAt,
    releasedAt: null,
    releaseReason: null,
  };
  writeOwnerRecord(root, record);
  appendOwnershipAudit(root, {
    jobId,
    ownerId,
    event: existing ? "recovered_stale" : "acquired",
    at: acquiredAt,
    previousOwnerId: existing?.ownerId ?? null,
    reason: existing ? "stale_heartbeat" : null,
    pid: process.pid,
    hostname: hostname(),
  });
  return {
    outcome: existing ? "recovered_stale_owner" : "acquired",
    ownerId,
    record,
  };
}

export function touchJobExecutionOwnershipHeartbeat(
  jobId: string,
  ownerId: string = PROCESS_OWNER_ID,
  options?: StrategySearchStoreOptions,
): void {
  const root = resolveRoot(options);
  const existing = readOwnerRecord(root, jobId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new JobExecutionOwnershipError(
      "NOT_OWNER",
      `cannot heartbeat strategy-search ownership: ${jobId}`,
    );
  }
  const heartbeatAt = nowIso();
  writeOwnerRecord(root, { ...existing, heartbeatAt });
  appendOwnershipAudit(root, {
    jobId,
    ownerId,
    event: "heartbeat",
    at: heartbeatAt,
    pid: process.pid,
    hostname: hostname(),
  });
}

export function releaseJobExecutionOwnership(
  jobId: string,
  ownerId: string = PROCESS_OWNER_ID,
  reason: string = "completed",
  options?: StrategySearchStoreOptions,
): void {
  const root = resolveRoot(options);
  const existing = readOwnerRecord(root, jobId);
  if (!existing) return;
  if (existing.ownerId !== ownerId) return;

  const releasedAt = nowIso();
  const released: JobExecutionOwnershipRecord = {
    ...existing,
    releasedAt,
    releaseReason: reason,
    heartbeatAt: releasedAt,
  };
  writeOwnerRecord(root, released);
  appendOwnershipAudit(root, {
    jobId,
    ownerId,
    event: "released",
    at: releasedAt,
    reason,
    pid: process.pid,
    hostname: hostname(),
  });
  const fp = ownerFilePath(root, jobId);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* best-effort — released record remains in audit only */
  }
}

/** Remove stale owner leases before orphan resume. Returns recovered job IDs. */
export function recoverStaleJobExecutionOwnership(
  options?: StrategySearchStoreOptions,
): string[] {
  const root = resolveRoot(options);
  const dir = ownersDir(root);
  if (!fs.existsSync(dir)) return [];
  const recovered: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".owner.json")) continue;
    const jobId = name.slice(0, -".owner.json".length);
    const record = readOwnerRecord(root, jobId);
    if (!record) continue;
    if (isHeartbeatFresh(record)) continue;
    appendOwnershipAudit(root, {
      jobId,
      ownerId: getProcessExecutionOwnerId(),
      event: "recovered_stale",
      at: nowIso(),
      previousOwnerId: record.ownerId,
      reason: "startup_stale_sweep",
      pid: process.pid,
      hostname: hostname(),
    });
    try {
      fs.unlinkSync(ownerFilePath(root, jobId));
    } catch {
      /* ignore */
    }
    recovered.push(jobId);
  }
  return recovered;
}

export function resetJobExecutionOwnershipForTests(
  options?: StrategySearchStoreOptions,
): void {
  const root = resolveRoot(options);
  const dir = ownersDir(root);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".owner.json")) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
  const fp = auditPath(root);
  if (fs.existsSync(fp)) {
    try {
      fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
}
