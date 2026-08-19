/**
 * Agent V2 session store — server read/write API.
 * No execution; persistence only.
 */

import type { SessionPatchRequest, SessionSnapshotResponse } from "./sessionTypes";
import {
  appendSessionEvent,
  createSessionOnDisk,
  deleteSessionRecord,
  loadSessionRecord,
  sanitizeSessionId,
  saveSessionRecord,
  sessionExists,
} from "./sessionPersistence";
import { mergeSessionPatch } from "./workspaceMerge";

export function getAgentSession(sessionId: string) {
  const id = sanitizeSessionId(sessionId);
  return loadSessionRecord(id);
}

export function patchAgentSession(
  patch: SessionPatchRequest,
): SessionSnapshotResponse {
  const id = sanitizeSessionId(patch.sessionId);
  const now = new Date().toISOString();

  let server = loadSessionRecord(id);
  const isNew = !server;
  if (!server) {
    server = createSessionOnDisk(id);
  }

  const clientTs = Date.parse(patch.updatedAt);
  const serverTs = Date.parse(server.updatedAt);
  const clientHasTurns = (patch.conversationTurns?.length ?? 0) > 0;
  const serverEmpty =
    server.conversationTurns.length === 0 &&
    !server.entityMemory &&
    !server.pendingPlan;

  const bootstrap =
    isNew ||
    (serverEmpty && clientHasTurns) ||
    (Number.isFinite(clientTs) && clientTs > serverTs);

  if (!bootstrap) {
    appendSessionEvent(id, {
      type: "conflict_server_wins",
      at: now,
      clientUpdatedAt: patch.updatedAt,
      serverUpdatedAt: server.updatedAt,
      applied: false,
    });
    return { ok: true, session: server, applied: false, source: "server" };
  }

  const { record } = mergeSessionPatch(server, patch, now, bootstrap);
  saveSessionRecord(record);

  appendSessionEvent(id, {
    type: "patched",
    at: now,
    clientUpdatedAt: patch.updatedAt,
    serverUpdatedAt: server.updatedAt,
    applied: true,
  });

  return { ok: true, session: record, applied: true, source: "merged" };
}

export function resetAgentSession(sessionId: string) {
  const id = sanitizeSessionId(sessionId);
  if (sessionExists(id)) {
    deleteSessionRecord(id);
  }
  const record = createSessionOnDisk(id);
  appendSessionEvent(id, { type: "reset", at: record.updatedAt });
  return record;
}

export function ensureAgentSession(sessionId: string) {
  const id = sanitizeSessionId(sessionId);
  const existing = loadSessionRecord(id);
  if (existing) return existing;
  return createSessionOnDisk(id);
}
