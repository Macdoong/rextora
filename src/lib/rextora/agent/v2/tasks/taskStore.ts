import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";
import { sanitizeSessionId } from "../session/sessionPersistence";
import type { TaskLedger } from "./taskTypes";

export function taskStoreRoot(): string {
  const override = process.env.REXTORA_AGENT_TASKS_DIR?.trim();
  return override ? path.resolve(override) : path.join(rextoraDataRoot(), "agent-tasks");
}

function ledgerPath(sessionId: string): string {
  return path.join(taskStoreRoot(), `${sanitizeSessionId(sessionId)}.json`);
}

export function readTaskLedger(sessionId: string): TaskLedger {
  const file = ledgerPath(sessionId);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as TaskLedger;
    if (parsed.sessionId === sessionId && Array.isArray(parsed.tasks)) return parsed;
  } catch {
    // Missing or invalid ledgers recover as an empty server record.
  }
  return { sessionId, revision: 0, tasks: [] };
}

export function writeTaskLedger(
  next: TaskLedger,
  expectedRevision: number,
): TaskLedger {
  const current = readTaskLedger(next.sessionId);
  if (current.revision !== expectedRevision) throw new Error("STALE_TASK_LEDGER");
  const saved = { ...next, revision: expectedRevision + 1 };
  const file = ledgerPath(next.sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(saved, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return saved;
}

export function mutateTaskLedger(
  sessionId: string,
  mutate: (ledger: TaskLedger) => TaskLedger,
): TaskLedger {
  const current = readTaskLedger(sessionId);
  return writeTaskLedger(mutate(current), current.revision);
}
