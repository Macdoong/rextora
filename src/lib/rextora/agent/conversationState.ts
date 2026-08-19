/**
 * Conversation state machine for the AI Trading Employee working session.
 * Tracks phase transitions; never executes engines.
 */

import type { PipelineLifecycleStage } from "./lifecycleStage";
import type { ConversationEntityMemory } from "./conversationContext";
import type { AgentPlanDraft } from "./planDrafts";
import type { ProposedAction } from "./proposedAction";
import type { AgentGoal } from "./goalDetector";

export type ConversationPhase =
  | "idle"
  | "orienting"
  | "planning"
  | "awaiting_approval"
  | "explaining"
  | "navigating"
  | "blocked"
  | "cancelled";

export interface ConversationWorkingState {
  phase: ConversationPhase;
  currentObjectiveKo: string | null;
  lifecycleStage: PipelineLifecycleStage | null;
  pendingTask: string | null;
  pendingApproval: boolean;
  currentStrategyId: string | null;
  currentStrategyLabel: string | null;
  currentSymbol: string | null;
  currentTimeframe: string | null;
  previousRecommendation: string | null;
  previousExplanation: string | null;
  lastGoal: AgentGoal | null;
  updatedAt: string;
}

export function emptyWorkingState(): ConversationWorkingState {
  return {
    phase: "idle",
    currentObjectiveKo: null,
    lifecycleStage: null,
    pendingTask: null,
    pendingApproval: false,
    currentStrategyId: null,
    currentStrategyLabel: null,
    currentSymbol: null,
    currentTimeframe: null,
    previousRecommendation: null,
    previousExplanation: null,
    lastGoal: null,
    updatedAt: new Date().toISOString(),
  };
}

export function phaseFromGoal(
  goal: AgentGoal,
  hasPending: boolean,
): ConversationPhase {
  switch (goal) {
    case "blocked_execute":
    case "blocked_safe":
    case "blocked_live":
      return "blocked";
    case "cancel":
      return "cancelled";
    case "explain_why":
    case "explain_approval":
    case "explain_waiting":
    case "explain_rejection":
    case "explain_strategy":
      return "explaining";
    case "approve":
      return hasPending ? "navigating" : "orienting";
    case "prepare_search":
    case "prepare_backtest":
    case "prepare_paper":
      return "planning";
    case "continue_session":
      return hasPending ? "awaiting_approval" : "orienting";
    case "recommend_next":
    case "research_status":
    case "lifecycle_fallback":
      return hasPending ? "awaiting_approval" : "orienting";
    default:
      return hasPending ? "awaiting_approval" : "orienting";
  }
}

export function advanceConversationState(input: {
  prior?: ConversationWorkingState | null;
  goal: AgentGoal;
  lifecycleStage?: PipelineLifecycleStage | null;
  entities?: ConversationEntityMemory | null;
  plan?: AgentPlanDraft | null;
  proposedAction?: ProposedAction | null;
  objectiveKo?: string | null;
  conclusionKo?: string | null;
  explanationKo?: string | null;
  recommendationKo?: string | null;
}): ConversationWorkingState {
  const prior = input.prior ?? emptyWorkingState();
  const pending =
    Boolean(input.proposedAction?.requiresApproval) ||
    Boolean(input.plan?.requiresApproval) ||
    Boolean(input.entities?.pendingProposedAction);
  const phase =
    input.goal === "cancel"
      ? "cancelled"
      : phaseFromGoal(input.goal, pending);

  const cleared = input.goal === "cancel";

  return {
    phase,
    currentObjectiveKo:
      input.objectiveKo ??
      input.entities?.pinnedObjectiveKo ??
      prior.currentObjectiveKo,
    lifecycleStage:
      input.lifecycleStage ??
      input.entities?.pipelineStage ??
      prior.lifecycleStage,
    pendingTask: cleared
      ? null
      : (input.proposedAction?.summary ??
        input.plan?.titleKo ??
        input.entities?.pendingProposedAction?.summary ??
        prior.pendingTask),
    pendingApproval: cleared ? false : pending,
    currentStrategyId:
      input.entities?.strategyId ?? prior.currentStrategyId,
    currentStrategyLabel:
      input.entities?.strategyLabel ?? prior.currentStrategyLabel,
    currentSymbol: input.entities?.symbol ?? prior.currentSymbol,
    currentTimeframe: input.entities?.timeframe ?? prior.currentTimeframe,
    previousRecommendation:
      input.recommendationKo ??
      input.entities?.previousRecommendation ??
      prior.previousRecommendation,
    previousExplanation:
      input.explanationKo ??
      input.entities?.previousReason ??
      prior.previousExplanation,
    lastGoal: input.goal,
    updatedAt: new Date().toISOString(),
  };
}

export function workingStateFromEntities(
  entities: ConversationEntityMemory | null | undefined,
): ConversationWorkingState {
  if (!entities) return emptyWorkingState();
  return {
    phase: entities.pendingProposedAction ? "awaiting_approval" : "orienting",
    currentObjectiveKo: entities.pinnedObjectiveKo,
    lifecycleStage: entities.pipelineStage,
    pendingTask: entities.pendingProposedAction?.summary ?? null,
    pendingApproval: Boolean(entities.pendingProposedAction),
    currentStrategyId: entities.strategyId,
    currentStrategyLabel: entities.strategyLabel,
    currentSymbol: entities.symbol,
    currentTimeframe: entities.timeframe,
    previousRecommendation: entities.previousRecommendation,
    previousExplanation: entities.previousReason,
    lastGoal: null,
    updatedAt: new Date().toISOString(),
  };
}
