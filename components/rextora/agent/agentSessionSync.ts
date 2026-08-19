"use client";

/**
 * Client-side Agent V2 session sync — server-first, local cache second.
 * Never executes engines.
 */

import type { ConversationEntityMemory } from "@/src/lib/rextora/agent/conversationContext";
import type { MissionTimeline } from "@/src/lib/rextora/agent/missionTimeline";
import type { ProposedAction } from "@/src/lib/rextora/agent/proposedAction";
import type { ResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import type { AgentLifecycleContext } from "@/src/lib/rextora/agent/types";
import type {
  AgentSessionRecord,
  PersistedConversationTurn,
  SessionPatchRequest,
  SessionSnapshotResponse,
} from "@/src/lib/rextora/agent/v2/session/sessionTypes";
import { buildWorkspaceSnapshot } from "@/src/lib/rextora/agent/v2/session/workspaceMerge";
import {
  type AgentSessionTurn,
  type PersistedAgentWorkspace,
  persistEntityMemory,
  persistTurns,
  persistWorkspaceBundle,
} from "./agentPersistence";

export const SESSION_ID_KEY = "rextora.agent.v2.sessionId";

export function loadSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  } catch {
    // ignore
  }
}

export function generateSessionId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `agent_${rand}`;
}

export function ensureClientSessionId(): string {
  const existing = loadSessionId();
  if (existing) return existing;
  const id = generateSessionId();
  saveSessionId(id);
  return id;
}

export function turnsToPersisted(turns: AgentSessionTurn[]): PersistedConversationTurn[] {
  return turns
    .filter((t) => !t.isLoading)
    .map((t) => ({
      id: t.id,
      query: t.query,
      response: t.response,
      error: t.error,
      timestamp: t.timestamp,
    }))
    .slice(-20);
}

export function persistedToTurns(turns: PersistedConversationTurn[]): AgentSessionTurn[] {
  return turns.map((t) => ({ ...t, isLoading: false }));
}

/**
 * Recover only an approval that is newer than the latest terminal action.
 * A completed execution/cancel is a history barrier: older proposals must not
 * be restored by a later read-only turn and persisted again on refresh.
 */
export function recoverPendingAction(input: {
  livePending: ProposedAction | null;
  turns: AgentSessionTurn[];
  entityMemory: ConversationEntityMemory | null;
}): ProposedAction | null {
  if (input.livePending) return input.livePending;

  for (let index = input.turns.length - 1; index >= 0; index -= 1) {
    const response = input.turns[index]?.response;
    if (!response) continue;
    if (response.executionResult || response.intentType === "cancel_pending") {
      return null;
    }
    if (response.proposedAction) return response.proposedAction;
  }

  return input.entityMemory?.pendingProposedAction ?? null;
}

export function applyServerRecordToCache(record: AgentSessionRecord): void {
  persistTurns(persistedToTurns(record.conversationTurns));
  persistEntityMemory(record.entityMemory);
  persistWorkspaceBundle({
    entityMemory: record.entityMemory,
    workspace: record.workspace.researchWorkspace,
    missionTimeline: record.missionTimeline,
    lastRoute: record.workspace.lastRoute ?? record.workspace.currentPage,
    updatedAt: record.updatedAt,
  });
}

export function buildSessionPatch(input: {
  sessionId: string;
  updatedAt: string;
  turns: AgentSessionTurn[];
  entityMemory: ConversationEntityMemory | null;
  pendingApproval: ProposedAction | null;
  workspace: ResearchWorkspaceSummary | null;
  missionTimeline: MissionTimeline | null;
  context?: AgentLifecycleContext;
}): SessionPatchRequest {
  const ws = buildWorkspaceSnapshot({
    context: input.context,
    entityMemory: input.entityMemory,
    researchWorkspace: input.workspace,
    pendingApproval: input.pendingApproval,
    missionTimeline: input.missionTimeline,
    now: input.updatedAt,
  });
  const latestResponse = [...input.turns]
    .reverse()
    .find((turn) => Boolean(turn.response))?.response;

  return {
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
    conversationTurns: turnsToPersisted(input.turns),
    entityMemory: input.entityMemory,
    pendingPlan: input.entityMemory?.pendingPlan ?? null,
    pendingApproval: input.pendingApproval,
    missionTimeline: input.missionTimeline,
    currentLifecycle:
      input.entityMemory?.pipelineStage ??
      input.missionTimeline?.lifecycleStage ??
      null,
    lastRecommendation: input.entityMemory?.previousRecommendation ?? null,
    reasoningContext: {
      lastIntentType: latestResponse?.intentType ?? null,
      lastGoal: latestResponse?.goal ?? null,
      pinnedObjectiveKo: input.entityMemory?.pinnedObjectiveKo ?? null,
      followUpKind: latestResponse?.conversationRoute?.mode ?? null,
      currentTopic:
        latestResponse?.conversationContext?.currentTopic ?? null,
      previousTopic:
        latestResponse?.conversationContext?.previousTopic ?? null,
      clarificationState:
        latestResponse?.conversationContext?.clarificationState ?? "none",
      conversationalConfidence:
        latestResponse?.conversationContext?.confidence ?? 0,
      updatedAt: input.updatedAt,
    },
    workspace: ws,
  };
}

export async function fetchAgentSession(
  sessionId: string,
): Promise<{ ok: true; session: AgentSessionRecord } | { ok: false; status: number }> {
  const res = await fetch(
    `/api/rextora/agent/session?sessionId=${encodeURIComponent(sessionId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (res.status === 404) return { ok: false, status: 404 };
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as { ok: boolean; session: AgentSessionRecord };
  if (!data.ok || !data.session) return { ok: false, status: 500 };
  return { ok: true, session: data.session };
}

export async function patchAgentSessionClient(
  patch: SessionPatchRequest,
): Promise<SessionSnapshotResponse | null> {
  const res = await fetch("/api/rextora/agent/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return (await res.json()) as SessionSnapshotResponse;
}

export async function resetAgentSessionClient(
  sessionId: string,
): Promise<AgentSessionRecord | null> {
  const res = await fetch("/api/rextora/agent/session/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { ok: boolean; session: AgentSessionRecord };
  return data.ok ? data.session : null;
}

export function hydrateStateFromRecord(record: AgentSessionRecord): {
  turns: AgentSessionTurn[];
  entityMemory: ConversationEntityMemory | null;
  pendingProposedAction: ProposedAction | null;
  pinnedObjective: string | null;
  workspace: ResearchWorkspaceSummary | null;
  missionTimeline: MissionTimeline | null;
  serverUpdatedAt: string;
} {
  return {
    turns: persistedToTurns(record.conversationTurns),
    entityMemory: record.entityMemory,
    pendingProposedAction:
      record.pendingApproval ?? record.entityMemory?.pendingProposedAction ?? null,
    pinnedObjective:
      record.workspace.pinnedObjective ??
      record.entityMemory?.pinnedObjectiveKo ??
      null,
    workspace: record.workspace.researchWorkspace,
    missionTimeline: record.missionTimeline,
    serverUpdatedAt: record.updatedAt,
  };
}

export type { PersistedAgentWorkspace };
