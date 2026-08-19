/**
 * Append-only tool audit log under data/rextora/agent-tool-audit/
 */

import fs from "node:fs";

import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";

export interface ToolAuditRecord {
  toolId: string;
  sessionId: string | null;
  arguments: Record<string, unknown>;
  result: {
    ok: boolean;
    status: string;
    errorCode: string | null;
    summary?: string | null;
  };
  durationMs: number;
  approved: boolean;
  timestamp: string;
  approvalId: string | null;
}

function auditRoot(): string {
  const override = process.env.REXTORA_AGENT_TOOL_AUDIT_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "agent-tool-audit");
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    const key = k.toLowerCase();
    if (
      key.includes("secret") ||
      key.includes("apikey") ||
      key.includes("api_key") ||
      key.includes("password") ||
      key.includes("token")
    ) {
      clone[k] = "[redacted]";
    } else {
      clone[k] = v;
    }
  }
  return clone;
}

export function writeToolAudit(record: ToolAuditRecord): string {
  const root = auditRoot();
  fs.mkdirSync(root, { recursive: true });
  const day = record.timestamp.slice(0, 10);
  const file = path.join(root, `${day}.jsonl`);
  const line = JSON.stringify({
    ...record,
    arguments: sanitizeArgs(record.arguments),
  });
  fs.appendFileSync(file, `${line}\n`, "utf8");
  return file;
}

export function readToolAuditLines(day: string, limit = 100): ToolAuditRecord[] {
  const file = path.join(auditRoot(), `${day}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line) as ToolAuditRecord);
}
