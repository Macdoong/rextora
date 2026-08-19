import { buildMissionTimeline } from "../../missionTimeline";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { AgentResponse, FactItem } from "../../types";
import {
  sanitizePrimaryUserParagraphs,
  sanitizePrimaryUserText,
} from "../reasoning/userVisibleSanitizer";
import type {
  ConversationContextView,
  ConversationRouteDecision,
} from "./conversationTypes";
import type { StableDomainAnswer } from "./productKnowledge";

export function composeConversationResponse(input: {
  route: ConversationRouteDecision;
  answer: StableDomainAnswer;
  entities: ConversationEntityMemory;
  contextView: ConversationContextView;
  facts?: FactItem[];
  interpretationSource?: "local" | "llm";
  providerMeta?: AgentResponse["providerMeta"];
}): AgentResponse {
  const conclusionKo = sanitizePrimaryUserText(input.answer.conclusionKo);
  const explanationKo = sanitizePrimaryUserText(input.answer.explanationKo);
  const recommendedActionKo = sanitizePrimaryUserText(
    input.answer.recommendedActionKo,
  );
  const facts = input.facts ?? [];
  const entityMemory: ConversationEntityMemory = {
    ...input.entities,
    // A direct conversational turn must not clear or replace workflow state.
    pendingProposedAction: input.entities.pendingProposedAction,
    pendingPlan: input.entities.pendingPlan,
    pipelineStage: input.entities.pipelineStage,
    lifecycleStage: input.entities.lifecycleStage,
  };
  const missionTimeline = buildMissionTimeline({
    entities: entityMemory,
    pendingAction: entityMemory.pendingProposedAction,
    pendingPlan: entityMemory.pendingPlan,
  });

  return {
    intentType: input.route.legacyIntent,
    conclusionKo,
    explanationKo,
    facts,
    interpretationKo: sanitizePrimaryUserParagraphs([
      conclusionKo,
      explanationKo,
    ]),
    recommendedActionKo: recommendedActionKo || undefined,
    interpretationSource: input.interpretationSource ?? "local",
    providerMeta: input.providerMeta,
    actions: [],
    proposedAction: null,
    plan: null,
    decision: {
      situationKo: "",
      meaningKo: conclusionKo,
      whyMattersKo: explanationKo,
      recommendedActionKo: recommendedActionKo || "",
      whyBetterThanAlternativesKo: "",
      uncertaintyKo:
        input.route.mode === "CLARIFY_REFERENCE"
          ? "대상 확인 필요"
          : null,
      conclusionKo,
      explanationKo,
      evidenceKeys: facts.map((fact) => fact.labelKo),
    },
    lifecycleStage: entityMemory.pipelineStage,
    pinnedObjectiveKo: entityMemory.pinnedObjectiveKo,
    entityMemory,
    scope: {
      strategyId: entityMemory.strategyId,
      runId: entityMemory.runId,
      jobId: entityMemory.jobId,
      paperSessionId: entityMemory.paperSessionId,
      symbol: entityMemory.symbol,
      timeframe: entityMemory.timeframe,
    },
    safetyBlocked: input.route.mode === "SAFE_REFUSAL",
    safetyReasonKo:
      input.route.mode === "SAFE_REFUSAL" ? conclusionKo : undefined,
    respondedAt: new Date().toISOString(),
    followUpSuggestions:
      input.route.topic === "rextora_product"
        ? ["전략 탐색은 어떻게 해?", "백테스트가 뭐야?", "왜 승인이 필요해?"]
        : [],
    missionTimeline,
    conversationRoute: {
      mode: input.route.mode,
      topic: input.route.topic,
      confidence: input.route.confidence,
      resolvedReference: input.route.resolvedReference?.labelKo ?? null,
      needsWorkspaceFacts: input.route.needsWorkspaceFacts,
      requestedReadTools: input.route.requestedReadTools,
      requestedWriteTools: input.route.requestedWriteTools,
      requiresApproval: input.route.requiresApproval,
      providerExpected: input.route.providerExpected,
      lifecycleInfluencedRouting: input.route.lifecycleInfluencedRouting,
      reason: input.route.reason,
    },
    conversationContext: {
      currentTopic: input.contextView.currentTopic,
      previousTopic: input.contextView.previousTopic,
      clarificationState: input.contextView.clarificationState,
      confidence: input.contextView.confidence,
    },
  };
}

