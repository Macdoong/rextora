/** Persisted lifecycle evidence for one bounded reasoning request. */

import fs from "node:fs";
import path from "node:path";

export interface ReasoningLifecycleAuditRecord {
  at: string;
  phase: "started" | "completed" | "failed";
  reasoningRequestId: string;
  turnId: string | null;
  providerAttempt: number;
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean | null;
  latencyMs: number | null;
  errorCategory: string | null;
}

function auditRoot(): string {
  const override = process.env.REXTORA_REASONING_AUDIT_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "reasoning-shadow",
  );
}

export function writeReasoningLifecycleAudit(
  record: ReasoningLifecycleAuditRecord,
): void {
  const root = auditRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(
    path.join(root, "reasoning-requests.jsonl"),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}

export function readReasoningLifecycleAudit(
  limit = 100,
): ReasoningLifecycleAuditRecord[] {
  const file = path.join(auditRoot(), "reasoning-requests.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line) as ReasoningLifecycleAuditRecord);
}
