/**
 * Filesystem persistence for Agent V2 sessions.
 * Layout: data/rextora/agent-sessions/{sessionId}/
 */

import fs from "node:fs";

import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";
import type { AgentPlanDraft } from "../../planDrafts";
import type {
  AgentSessionMetadata,
  AgentSessionRecord,
  AgentWorkspaceSnapshot,
  PersistedConversationTurn,
  SessionEventRecord,
} from "./sessionTypes";
import { AGENT_SESSION_SCHEMA_VERSION, createEmptySession } from "./sessionTypes";

export function agentSessionsRoot(): string {
  const override = process.env.REXTORA_AGENT_SESSIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "agent-sessions");
}

function sessionDir(sessionId: string): string {
  return path.join(agentSessionsRoot(), sanitizeSessionId(sessionId));
}

function metadataPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "metadata.json");
}

function workspacePath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "workspace.json");
}

function turnsPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "turns.jsonl");
}

function eventsPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "events.jsonl");
}

function plansDir(sessionId: string): string {
  return path.join(sessionDir(sessionId), "plans");
}

function pendingPlanPath(sessionId: string): string {
  return path.join(plansDir(sessionId), "pending.json");
}

export function sanitizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!/^agent_[a-z0-9_-]{8,64}$/i.test(trimmed)) {
    throw new Error("INVALID_SESSION_ID");
  }
  return trimmed;
}

function ensureSessionDir(sessionId: string): void {
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(plansDir(sessionId), { recursive: true });
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function sessionExists(sessionId: string): boolean {
  try {
    return fs.existsSync(metadataPath(sessionId));
  } catch {
    return false;
  }
}

export function readTurnsJsonl(sessionId: string): PersistedConversationTurn[] {
  const file = turnsPath(sessionId);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const turns: PersistedConversationTurn[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as PersistedConversationTurn;
      if (row && typeof row.query === "string") turns.push(row);
    } catch {
      // skip corrupt line
    }
  }
  return turns.slice(-20);
}

export function writeTurnsJsonl(
  sessionId: string,
  turns: PersistedConversationTurn[],
): void {
  ensureSessionDir(sessionId);
  const payload = turns
    .slice(-20)
    .map((t) => JSON.stringify({ ...t, isLoading: undefined }))
    .join("\n");
  const file = turnsPath(sessionId);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, payload ? `${payload}\n` : "", "utf8");
  fs.renameSync(tmp, file);
}

export function appendSessionEvent(
  sessionId: string,
  event: SessionEventRecord,
): void {
  ensureSessionDir(sessionId);
  fs.appendFileSync(eventsPath(sessionId), `${JSON.stringify(event)}\n`, "utf8");
}

export function readPendingPlan(sessionId: string): AgentPlanDraft | null {
  return readJsonFile<AgentPlanDraft>(pendingPlanPath(sessionId));
}

export function writePendingPlan(
  sessionId: string,
  plan: AgentPlanDraft | null,
): void {
  ensureSessionDir(sessionId);
  const file = pendingPlanPath(sessionId);
  if (!plan) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
    return;
  }
  writeJsonAtomic(file, plan);
}

export function loadSessionRecord(sessionId: string): AgentSessionRecord | null {
  const meta = readJsonFile<
    AgentSessionMetadata & {
      pendingApproval?: AgentSessionRecord["pendingApproval"];
      entityMemory?: AgentSessionRecord["entityMemory"];
      currentLifecycle?: AgentSessionRecord["currentLifecycle"];
      missionTimeline?: AgentSessionRecord["missionTimeline"];
      taskQueueSummary?: AgentSessionRecord["taskQueueSummary"];
      reasoningContext?: AgentSessionRecord["reasoningContext"];
      lastExecution?: AgentSessionRecord["lastExecution"];
      lastRecommendation?: AgentSessionRecord["lastRecommendation"];
    }
  >(metadataPath(sessionId));
  if (!meta) return null;

  const workspace =
    readJsonFile<AgentWorkspaceSnapshot>(workspacePath(sessionId)) ??
    createEmptySession(sessionId, meta.createdAt).workspace;

  return {
    sessionId: meta.sessionId,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    conversationTurns: readTurnsJsonl(sessionId),
    workspace,
    pendingPlan: readPendingPlan(sessionId),
    pendingApproval: meta.pendingApproval ?? null,
    entityMemory: meta.entityMemory ?? null,
    currentLifecycle: meta.currentLifecycle ?? null,
    missionTimeline: meta.missionTimeline ?? null,
    taskQueueSummary: meta.taskQueueSummary ?? null,
    reasoningContext: meta.reasoningContext ?? null,
    lastExecution: meta.lastExecution ?? null,
    lastRecommendation: meta.lastRecommendation ?? null,
  };
}

export function saveSessionRecord(record: AgentSessionRecord): AgentSessionRecord {
  ensureSessionDir(record.sessionId);
  const metadata = {
    sessionId: record.sessionId,
    schemaVersion: AGENT_SESSION_SCHEMA_VERSION,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pendingApproval: record.pendingApproval,
    entityMemory: record.entityMemory,
    currentLifecycle: record.currentLifecycle,
    missionTimeline: record.missionTimeline,
    taskQueueSummary: record.taskQueueSummary,
    reasoningContext: record.reasoningContext,
    lastExecution: record.lastExecution,
    lastRecommendation: record.lastRecommendation,
  };
  writeJsonAtomic(metadataPath(record.sessionId), metadata);
  writeJsonAtomic(workspacePath(record.sessionId), record.workspace);
  writeTurnsJsonl(record.sessionId, record.conversationTurns);
  writePendingPlan(record.sessionId, record.pendingPlan);
  return record;
}

export function deleteSessionRecord(sessionId: string): void {
  const dir = sessionDir(sessionId);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

export function createSessionOnDisk(sessionId: string): AgentSessionRecord {
  const record = createEmptySession(sessionId);
  saveSessionRecord(record);
  appendSessionEvent(sessionId, { type: "created", at: record.createdAt });
  return record;
}
