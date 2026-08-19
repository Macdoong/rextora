import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";
import { sanitizeSessionId } from "../session/sessionPersistence";
import type { AgentEvent } from "./eventTypes";

export function agentEventsRoot(): string {
  const override = process.env.REXTORA_AGENT_EVENTS_DIR?.trim();
  return override ? path.resolve(override) : path.join(rextoraDataRoot(), "agent-events");
}

function eventFile(sessionId: string): string {
  return path.join(agentEventsRoot(), `${sanitizeSessionId(sessionId)}.jsonl`);
}

function eventArchives(sessionId: string): string[] {
  const root = agentEventsRoot();
  const safeId = sanitizeSessionId(sessionId);
  const pattern = new RegExp(`^${safeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+\\.jsonl$`);
  try {
    return fs.readdirSync(root).filter((name) => pattern.test(name)).sort().map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

function readEventFile(file: string): AgentEvent[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as AgentEvent]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

export function readAgentEvents(sessionId: string): AgentEvent[] {
  return [...eventArchives(sessionId).flatMap(readEventFile), ...readEventFile(eventFile(sessionId))];
}

function rotateEventLogIfNeeded(sessionId: string): void {
  const configured = Number.parseInt(process.env.REXTORA_AGENT_EVENT_ACTIVE_LIMIT ?? "2000", 10);
  const limit = Number.isFinite(configured) ? Math.max(50, configured) : 2000;
  const file = eventFile(sessionId);
  if (readEventFile(file).length < limit) return;
  const root = agentEventsRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.renameSync(file, path.join(root, `${sanitizeSessionId(sessionId)}.${Date.now()}.jsonl`));
  const archives = eventArchives(sessionId);
  for (const stale of archives.slice(0, Math.max(0, archives.length - 3))) fs.unlinkSync(stale);
}

export function appendAgentEvent(event: AgentEvent): { appended: boolean; event: AgentEvent } {
  const events = readAgentEvents(event.sessionId);
  if (events.some((item) => item.eventId === event.eventId)) return { appended: false, event };
  rotateEventLogIfNeeded(event.sessionId);
  const file = eventFile(event.sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return { appended: true, event };
}

export function replayAgentEvents(
  sessionId: string,
  handler: (event: AgentEvent) => void,
): number {
  const events = readAgentEvents(sessionId);
  for (const event of events) handler(event);
  return events.length;
}
