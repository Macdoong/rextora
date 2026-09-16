/**
 * Persist Strategy Search recovery audit records (startup / missing job.json).
 * Append-only JSONL under the store root. Never deletes jobs/trials.
 */

import fs from "node:fs";
import path from "node:path";
import type { StrategySearchStoreOptions } from "./jobStore";
import { strategySearchRoot } from "../storage/runtimePaths";

export interface StrategySearchRecoveryAuditRecord {
  jobId: string;
  previousState: string | null;
  recoveredState: string | null;
  recoveryTime: string;
  reason: string;
  resumedGeneration: number | null;
  remainingDurationMs: number | null;
  trialCount?: number;
  autoResumed?: boolean;
  interruptionStartedAt?: string | null;
  recoveryBlocker?: string | null;
}

function defaultRoot(): string {
  return strategySearchRoot();
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function auditPath(root: string): string {
  return path.join(root, "recovery-audit.jsonl");
}

export function appendRecoveryAudit(
  record: StrategySearchRecoveryAuditRecord,
  options?: StrategySearchStoreOptions,
): void {
  const root = resolveRoot(options);
  fs.mkdirSync(root, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(auditPath(root), line, "utf8");
}

export function listRecoveryAudits(
  options?: StrategySearchStoreOptions & { limit?: number },
): StrategySearchRecoveryAuditRecord[] {
  const root = resolveRoot(options);
  const fp = auditPath(root);
  if (!fs.existsSync(fp)) return [];
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
  const out: StrategySearchRecoveryAuditRecord[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    try {
      out.push(JSON.parse(lines[i]!) as StrategySearchRecoveryAuditRecord);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}
