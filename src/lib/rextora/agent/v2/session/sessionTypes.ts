/**
 * Agent V2 session & workspace types — server-authoritative employee state.
 * Read/write only; never executes engines.
 */

import type { ConversationEntityMemory } from "../../conversationContext";
import type { AgentPlanDraft } from "../../planDrafts";
import type { MissionTimeline } from "../../missionTimeline";
import type { ProposedAction } from "../../proposedAction";
import type { ResearchWorkspaceSummary } from "../../researchWorkspace";
import type { PipelineLifecycleStage } from "../../lifecycleStage";
import type { AgentResponse } from "../../types";

export const AGENT_SESSION_SCHEMA_VERSION = 1;

/** Persisted conversation turn (never includes isLoading). */
export interface PersistedConversationTurn {
  id: string;
  query: string;
  response: AgentResponse | null;
  error: string | null;
  timestamp: string;
}

export interface TaskQueueSummary {
  pendingCommandCount: number;
  activeJobId: string | null;
  lastCommandId: string | null;
  summaryKo: string | null;
}

export interface ReasoningContext {
  lastIntentType: string | null;
  lastGoal: string | null;
  pinnedObjectiveKo: string | null;
  followUpKind: string | null;
  /** Conversation topic is independent from workflow lifecycle state. */
  currentTopic?: string | null;
  previousTopic?: string | null;
  clarificationState?: "none" | "needed" | "resolved";
  conversationalConfidence?: number;
  updatedAt: string;
}

export interface LastExecutionRef {
  commandId: string | null;
  commandType: string | null;
  executionStatus: string | null;
  jobId: string | null;
  runId: string | null;
  summaryKo: string | null;
  executedAt: string | null;
}

/** Operator workspace snapshot — canonical server record. */
export interface AgentWorkspaceSnapshot {
  currentPage: string | null;
  currentStrategyId: string | null;
  currentStrategyLabel: string | null;
  currentSearchJobId: string | null;
  currentBacktestRunId: string | null;
  currentPaperSessionId: string | null;
  currentLiveCandidateId: string | null;
  pinnedObjective: string | null;
  pendingApprovals: ProposedAction[];
  currentRecommendation: string | null;
  currentBlockers: string[];
  currentSymbol: string | null;
  currentTimeframe: string | null;
  currentPatterns: string[];
  currentLeverage: number | null;
  /** Legacy research workspace bundle for UI parity. */
  researchWorkspace: ResearchWorkspaceSummary | null;
  lastRoute: string | null;
  updatedAt: string;
}

export interface AgentSessionMetadata {
  sessionId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Full server session record. */
export interface AgentSessionRecord {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  conversationTurns: PersistedConversationTurn[];
  workspace: AgentWorkspaceSnapshot;
  pendingPlan: AgentPlanDraft | null;
  pendingApproval: ProposedAction | null;
  entityMemory: ConversationEntityMemory | null;
  currentLifecycle: PipelineLifecycleStage | null;
  missionTimeline: MissionTimeline | null;
  taskQueueSummary: TaskQueueSummary | null;
  reasoningContext: ReasoningContext | null;
  lastExecution: LastExecutionRef | null;
  lastRecommendation: string | null;
}

export interface SessionPatchRequest {
  sessionId: string;
  /** Client's last known session updatedAt (ISO). */
  updatedAt: string;
  workspace?: Partial<AgentWorkspaceSnapshot>;
  conversationTurns?: PersistedConversationTurn[];
  entityMemory?: ConversationEntityMemory | null;
  pendingPlan?: AgentPlanDraft | null;
  pendingApproval?: ProposedAction | null;
  missionTimeline?: MissionTimeline | null;
  currentLifecycle?: PipelineLifecycleStage | null;
  taskQueueSummary?: TaskQueueSummary | null;
  reasoningContext?: ReasoningContext | null;
  lastExecution?: LastExecutionRef | null;
  lastRecommendation?: string | null;
}

export interface SessionSnapshotResponse {
  ok: true;
  session: AgentSessionRecord;
  /** True when the client patch was applied to the server record. */
  applied: boolean;
  source: "server" | "merged";
}

export interface SessionEventRecord {
  type: "created" | "patched" | "reset" | "conflict_server_wins";
  at: string;
  clientUpdatedAt?: string | null;
  serverUpdatedAt?: string | null;
  applied?: boolean;
}

export function emptyWorkspaceSnapshot(now = new Date().toISOString()): AgentWorkspaceSnapshot {
  return {
    currentPage: null,
    currentStrategyId: null,
    currentStrategyLabel: null,
    currentSearchJobId: null,
    currentBacktestRunId: null,
    currentPaperSessionId: null,
    currentLiveCandidateId: null,
    pinnedObjective: null,
    pendingApprovals: [],
    currentRecommendation: null,
    currentBlockers: [],
    currentSymbol: null,
    currentTimeframe: null,
    currentPatterns: [],
    currentLeverage: null,
    researchWorkspace: null,
    lastRoute: null,
    updatedAt: now,
  };
}

export function emptyTaskQueueSummary(): TaskQueueSummary {
  return {
    pendingCommandCount: 0,
    activeJobId: null,
    lastCommandId: null,
    summaryKo: null,
  };
}

export function emptyReasoningContext(now = new Date().toISOString()): ReasoningContext {
  return {
    lastIntentType: null,
    lastGoal: null,
    pinnedObjectiveKo: null,
    followUpKind: null,
    currentTopic: null,
    previousTopic: null,
    clarificationState: "none",
    conversationalConfidence: 0,
    updatedAt: now,
  };
}

export function createEmptySession(sessionId: string, now = new Date().toISOString()): AgentSessionRecord {
  return {
    sessionId,
    createdAt: now,
    updatedAt: now,
    conversationTurns: [],
    workspace: emptyWorkspaceSnapshot(now),
    pendingPlan: null,
    pendingApproval: null,
    entityMemory: null,
    currentLifecycle: null,
    missionTimeline: null,
    taskQueueSummary: emptyTaskQueueSummary(),
    reasoningContext: emptyReasoningContext(now),
    lastExecution: null,
    lastRecommendation: null,
  };
}
