import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";
import { sanitizeSessionId } from "../session/sessionPersistence";
import type { VerifiedMemoryRecord } from "./memoryTypes";

const ACTIVE_RECORD_LIMIT = 500;
const ARCHIVE_LIMIT = 3;
const SECRET_KEY = /(api.?key|secret|token|password|credential|private.?key|env)/i;
const SECRET_VALUE = /(sk-[a-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

export function agentMemoryRoot(): string {
  const override = process.env.REXTORA_AGENT_MEMORY_DIR?.trim();
  return override ? path.resolve(override) : path.join(rextoraDataRoot(), "agent-memory-v2");
}

function activeFile(sessionId: string): string {
  return path.join(agentMemoryRoot(), `${sanitizeSessionId(sessionId)}.jsonl`);
}

function archiveFiles(sessionId: string): string[] {
  const root = agentMemoryRoot();
  const safeId = sanitizeSessionId(sessionId);
  const pattern = new RegExp(`^${safeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+\\.jsonl$`);
  try {
    return fs.readdirSync(root)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(root, name))
      .sort();
  } catch {
    return [];
  }
}

function readFile(file: string): VerifiedMemoryRecord[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as VerifiedMemoryRecord]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

function assertSafe(record: VerifiedMemoryRecord): void {
  if (!record.statementKo.trim()) throw new Error("memory_statement_required");
  if (record.evidenceRefs.length === 0 || record.evidenceRefs.some((ref) => !ref.id.trim())) {
    throw new Error("memory_evidence_required");
  }
  if (SECRET_VALUE.test(record.statementKo) || Object.entries(record.metadata).some(([key, value]) =>
    SECRET_KEY.test(key) || (typeof value === "string" && SECRET_VALUE.test(value)))) {
    throw new Error("memory_secret_rejected");
  }
}

function rotateIfNeeded(sessionId: string): void {
  const file = activeFile(sessionId);
  if (readFile(file).length < ACTIVE_RECORD_LIMIT) return;
  const root = agentMemoryRoot();
  fs.mkdirSync(root, { recursive: true });
  const archive = path.join(root, `${sanitizeSessionId(sessionId)}.${Date.now()}.jsonl`);
  fs.renameSync(file, archive);
  const archives = archiveFiles(sessionId);
  for (const stale of archives.slice(0, Math.max(0, archives.length - ARCHIVE_LIMIT))) {
    fs.unlinkSync(stale);
  }
}

export function readMemoryRecords(sessionId: string): VerifiedMemoryRecord[] {
  const archived = archiveFiles(sessionId).flatMap(readFile);
  return [...archived, ...readFile(activeFile(sessionId))];
}

export function appendVerifiedMemory(
  input: Omit<VerifiedMemoryRecord, "memoryId"> & { memoryId?: string },
): { appended: boolean; record: VerifiedMemoryRecord } {
  const memoryId = input.memoryId ?? `memory_${crypto.createHash("sha256")
    .update(`${input.sessionId}:${input.kind}:${input.sourceEventId ?? ""}:${input.statementKo}:${JSON.stringify(input.evidenceRefs)}`)
    .digest("hex").slice(0, 20)}`;
  const record: VerifiedMemoryRecord = { ...input, memoryId };
  assertSafe(record);
  const existing = readMemoryRecords(record.sessionId).find((item) => item.memoryId === memoryId);
  if (existing) return { appended: false, record: existing };
  rotateIfNeeded(record.sessionId);
  const file = activeFile(record.sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
  return { appended: true, record };
}

export function exportVerifiedMemory(sessionId: string): {
  version: 1;
  sessionId: string;
  exportedAt: string;
  records: VerifiedMemoryRecord[];
} {
  return { version: 1, sessionId, exportedAt: new Date().toISOString(), records: readMemoryRecords(sessionId) };
}

export function resetVerifiedMemory(sessionId: string): number {
  const files = [activeFile(sessionId), ...archiveFiles(sessionId)];
  let removed = 0;
  for (const file of files) {
    try { fs.unlinkSync(file); removed += 1; } catch { /* already absent */ }
  }
  return removed;
}
