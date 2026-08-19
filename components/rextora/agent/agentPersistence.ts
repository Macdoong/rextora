/**
 * Dual persistence for the AI Trading Employee session.
 * - localStorage: durable workspace / mission / entity memory (continue where left off)
 * - sessionStorage: hot conversation turns + mirrored memory for same-tab speed
 * Never executes engines.
 */

import type { ConversationEntityMemory } from "@/src/lib/rextora/agent/conversationContext";
import type { ResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import type { MissionTimeline } from "@/src/lib/rextora/agent/missionTimeline";
import type { AgentResponse } from "@/src/lib/rextora/agent/types";

export const MEMORY_KEY = "rextora.agent.entityMemory";
export const TURNS_KEY = "rextora.agent.sessionTurns";
export const WORKSPACE_KEY = "rextora.agent.workspace";
export const OPEN_EVENT = "rextora.agent.open";
export const RESUME_EVENT = "rextora.agent.resume";

export interface AgentSessionTurn {
  id: string;
  query: string;
  response: AgentResponse | null;
  error: string | null;
  isLoading: boolean;
  timestamp: string;
}

export interface PersistedAgentWorkspace {
  entityMemory: ConversationEntityMemory | null;
  workspace: ResearchWorkspaceSummary | null;
  missionTimeline: MissionTimeline | null;
  lastRoute: string | null;
  updatedAt: string;
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // quota / private mode
  }
}

function safeClear(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadEntityMemory(): ConversationEntityMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const hot = safeGet(sessionStorage, MEMORY_KEY);
    if (hot) return JSON.parse(hot) as ConversationEntityMemory;
    const durable = safeGet(localStorage, WORKSPACE_KEY);
    if (!durable) return null;
    const parsed = JSON.parse(durable) as PersistedAgentWorkspace;
    return parsed.entityMemory ?? null;
  } catch {
    return null;
  }
}

export function loadSessionTurns(): AgentSessionTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const hot = safeGet(sessionStorage, TURNS_KEY);
    if (hot) {
      const parsed = JSON.parse(hot) as AgentSessionTurn[];
      return Array.isArray(parsed)
        ? parsed.filter((t) => t && typeof t.query === "string").slice(-20)
        : [];
    }
    const durable = safeGet(localStorage, TURNS_KEY);
    if (!durable) return [];
    const parsed = JSON.parse(durable) as AgentSessionTurn[];
    return Array.isArray(parsed)
      ? parsed.filter((t) => t && typeof t.query === "string").slice(-20)
      : [];
  } catch {
    return [];
  }
}

export function loadPersistedWorkspace(): PersistedAgentWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const durable = safeGet(localStorage, WORKSPACE_KEY);
    if (!durable) return null;
    return JSON.parse(durable) as PersistedAgentWorkspace;
  } catch {
    return null;
  }
}

export function persistTurns(turns: AgentSessionTurn[]): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(
    turns
      .filter((t) => !t.isLoading)
      .map((t) => ({ ...t, isLoading: false }))
      .slice(-20),
  );
  safeSet(sessionStorage, TURNS_KEY, payload);
  safeSet(localStorage, TURNS_KEY, payload);
}

export function persistEntityMemory(
  memory: ConversationEntityMemory | null,
): void {
  if (typeof window === "undefined") return;
  if (memory) {
    const json = JSON.stringify(memory);
    safeSet(sessionStorage, MEMORY_KEY, json);
  } else {
    safeClear(sessionStorage, MEMORY_KEY);
  }
}

export function persistWorkspaceBundle(bundle: PersistedAgentWorkspace): void {
  if (typeof window === "undefined") return;
  safeSet(localStorage, WORKSPACE_KEY, JSON.stringify(bundle));
  if (bundle.entityMemory) {
    safeSet(sessionStorage, MEMORY_KEY, JSON.stringify(bundle.entityMemory));
  }
}

export function clearAgentPersistence(): void {
  if (typeof window === "undefined") return;
  safeClear(sessionStorage, MEMORY_KEY);
  safeClear(sessionStorage, TURNS_KEY);
  safeClear(localStorage, TURNS_KEY);
  safeClear(localStorage, WORKSPACE_KEY);
}

export function requestOpenAssistant(opts?: {
  resume?: boolean;
  query?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, {
      detail: { resume: Boolean(opts?.resume), query: opts?.query ?? null },
    }),
  );
}

export function hasResumableSession(): boolean {
  const turns = loadSessionTurns();
  const memory = loadEntityMemory();
  return turns.length > 0 || Boolean(memory?.pinnedObjectiveKo || memory?.pendingProposedAction);
}
