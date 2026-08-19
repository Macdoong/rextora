/**
 * Workspace merge & snapshot builders for Agent V2.
 * Server wins on equal updatedAt; newest updatedAt wins otherwise.
 */

import type { ConversationEntityMemory } from "../../conversationContext";
import type { MissionTimeline } from "../../missionTimeline";
import type { ProposedAction } from "../../proposedAction";
import type { ResearchWorkspaceSummary } from "../../researchWorkspace";
import type { AgentLifecycleContext } from "../../types";
import type {
  AgentSessionRecord,
  AgentWorkspaceSnapshot,
  SessionPatchRequest,
} from "./sessionTypes";
import { emptyWorkspaceSnapshot } from "./sessionTypes";

function parseTs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

/** Merge workspace fields when client patch is accepted. */
export function mergeWorkspaceSnapshot(
  server: AgentWorkspaceSnapshot,
  patch: Partial<AgentWorkspaceSnapshot> | undefined,
  now: string,
): AgentWorkspaceSnapshot {
  if (!patch) return { ...server, updatedAt: now };
  return {
    ...server,
    ...patch,
    pendingApprovals:
      patch.pendingApprovals !== undefined
        ? patch.pendingApprovals
        : server.pendingApprovals,
    currentBlockers:
      patch.currentBlockers !== undefined
        ? patch.currentBlockers
        : server.currentBlockers,
    currentPatterns:
      patch.currentPatterns !== undefined
        ? patch.currentPatterns
        : server.currentPatterns,
    researchWorkspace:
      patch.researchWorkspace !== undefined
        ? patch.researchWorkspace
        : server.researchWorkspace,
    updatedAt: now,
  };
}

export interface MergeSessionResult {
  record: AgentSessionRecord;
  applied: boolean;
  source: "server" | "merged";
}

/**
 * Conflict resolution:
 * - client.updatedAt > server.updatedAt → apply patch (merged)
 * - else → server wins (applied=false)
 */
export function mergeSessionPatch(
  server: AgentSessionRecord,
  patch: SessionPatchRequest,
  now = new Date().toISOString(),
  forceApply = false,
): MergeSessionResult {
  const clientTs = parseTs(patch.updatedAt);
  const serverTs = parseTs(server.updatedAt);

  if (!forceApply && clientTs <= serverTs) {
    return { record: server, applied: false, source: "server" };
  }

  const merged: AgentSessionRecord = {
    ...server,
    updatedAt: now,
    conversationTurns:
      patch.conversationTurns !== undefined
        ? patch.conversationTurns.slice(-20)
        : server.conversationTurns,
    workspace: mergeWorkspaceSnapshot(server.workspace, patch.workspace, now),
    pendingPlan:
      patch.pendingPlan !== undefined ? patch.pendingPlan : server.pendingPlan,
    pendingApproval:
      patch.pendingApproval !== undefined
        ? patch.pendingApproval
        : server.pendingApproval,
    entityMemory:
      patch.entityMemory !== undefined ? patch.entityMemory : server.entityMemory,
    currentLifecycle:
      patch.currentLifecycle !== undefined
        ? patch.currentLifecycle
        : server.currentLifecycle,
    missionTimeline:
      patch.missionTimeline !== undefined
        ? patch.missionTimeline
        : server.missionTimeline,
    taskQueueSummary:
      patch.taskQueueSummary !== undefined
        ? patch.taskQueueSummary
        : server.taskQueueSummary,
    reasoningContext:
      patch.reasoningContext !== undefined
        ? patch.reasoningContext
        : server.reasoningContext,
    lastExecution:
      patch.lastExecution !== undefined
        ? patch.lastExecution
        : server.lastExecution,
    lastRecommendation:
      patch.lastRecommendation !== undefined
        ? patch.lastRecommendation
        : server.lastRecommendation,
  };

  return { record: merged, applied: true, source: "merged" };
}

/** Build workspace snapshot from client lifecycle + entity memory. */
export function buildWorkspaceSnapshot(input: {
  context?: AgentLifecycleContext | null;
  entityMemory?: ConversationEntityMemory | null;
  researchWorkspace?: ResearchWorkspaceSummary | null;
  pendingApproval?: ProposedAction | null;
  missionTimeline?: MissionTimeline | null;
  now?: string;
}): AgentWorkspaceSnapshot {
  const now = input.now ?? new Date().toISOString();
  const ctx = input.context ?? {};
  const em = input.entityMemory ?? null;
  const mt = input.missionTimeline ?? null;

  const pendingApprovals: ProposedAction[] = [];
  if (input.pendingApproval) pendingApprovals.push(input.pendingApproval);
  else if (em?.pendingProposedAction) pendingApprovals.push(em.pendingProposedAction);

  return {
    ...emptyWorkspaceSnapshot(now),
    currentPage: ctx.route ?? null,
    lastRoute: ctx.route ?? null,
    currentStrategyId: ctx.strategyId ?? em?.strategyId ?? null,
    currentStrategyLabel: em?.strategyLabel ?? null,
    currentSearchJobId: ctx.jobId ?? em?.jobId ?? null,
    currentBacktestRunId: ctx.runId ?? em?.runId ?? null,
    currentPaperSessionId: ctx.paperSessionId ?? em?.paperSessionId ?? null,
    currentLiveCandidateId: null,
    pinnedObjective: em?.pinnedObjectiveKo ?? mt?.currentObjectiveKo ?? null,
    pendingApprovals,
    currentRecommendation:
      em?.previousRecommendation ?? mt?.nextRecommendation?.labelKo ?? null,
    currentBlockers: mt?.blockersKo ?? [],
    currentSymbol: ctx.symbol ?? em?.symbol ?? null,
    currentTimeframe: ctx.timeframe ?? em?.timeframe ?? null,
    currentPatterns: [],
    currentLeverage: null,
    researchWorkspace: input.researchWorkspace ?? null,
    updatedAt: now,
  };
}

export function sessionRecordToPersistedBundle(record: AgentSessionRecord): {
  entityMemory: ConversationEntityMemory | null;
  workspace: ResearchWorkspaceSummary | null;
  missionTimeline: MissionTimeline | null;
  lastRoute: string | null;
  updatedAt: string;
} {
  return {
    entityMemory: record.entityMemory,
    workspace: record.workspace.researchWorkspace,
    missionTimeline: record.missionTimeline,
    lastRoute: record.workspace.lastRoute ?? record.workspace.currentPage,
    updatedAt: record.updatedAt,
  };
}
