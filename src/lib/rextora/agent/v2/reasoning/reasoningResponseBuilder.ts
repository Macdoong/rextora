/**
 * Map validated reasoning artifact → Agent response surfaces.
 */

import type { AgentResponse, AgentIntentType } from "../../types";
import type { AgentLifecycleContext } from "../../types";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { FactItem } from "../../types";
import type { AgentPlanDraft } from "../../planDrafts";
import type { ProposedAction } from "../../proposedAction";
import { buildAgentResponse } from "../../agentResponseBuilder";
import type { ReasoningArtifact } from "./reasoningTypes";
import { fallbackPlanFromReasoning } from "./reasoningFallback";
import { createProposedAction } from "../../proposedAction";
import {
  sanitizePrimaryUserText,
  sanitizePrimaryUserParagraphs,
} from "./userVisibleSanitizer";

export function reasoningToProposedAction(
  artifact: ReasoningArtifact,
): ProposedAction | null {
  if (artifact.riskLevel === "blocked" || !artifact.requiresApproval) {
    return null;
  }
  const writeStep = artifact.toolPlan.find((s) => s.requiresApproval);
  const sanitizedRecommendation = sanitizePrimaryUserText(
    artifact.recommendedAction,
  );
  const summary =
    sanitizedRecommendation ||
    sanitizePrimaryUserText(writeStep?.purpose) ||
    "승인 후 진행";
  const toolId = writeStep?.toolId ?? "";
  const actionType = toolId.startsWith("search")
    ? "prepare_search_plan"
    : toolId === "backtest.run"
      ? "open_backtest"
      : toolId === "paper.prepare"
        ? "open_paper_approval"
        : toolId === "results.promote"
          ? "open_results"
          : "navigate";
  const targetRoute = toolId.startsWith("search")
    ? "/strategy-search"
    : toolId === "backtest.run"
      ? "/backtest"
      : toolId === "paper.prepare"
        ? "/paper-trading"
        : toolId === "results.promote"
          ? "/results"
          : "/dashboard";
  const args = writeStep?.arguments ?? {};
  return createProposedAction({
    actionType,
    summary,
    reason: sanitizePrimaryUserText(artifact.decisionReason),
    targetRoute,
    strategyId: typeof args.strategyId === "string" ? args.strategyId : null,
    jobId: typeof args.jobId === "string" ? args.jobId : null,
    runId: typeof args.runId === "string" ? args.runId : null,
    symbol: typeof args.symbol === "string" ? args.symbol : null,
    timeframe: typeof args.timeframe === "string" ? args.timeframe : null,
    parameters: {
      reasoningId: artifact.reasoningId,
      requestHash: artifact.requestHash,
      planId: artifact.planId,
      toolPlan: artifact.toolPlan,
    },
    requiresApproval: true,
    riskLevel: artifact.riskLevel === "high" ? "high" : "medium",
    blockedReason: null,
  });
}

export function buildResponseFromReasoning(input: {
  intentType: AgentIntentType;
  facts: FactItem[];
  artifact: ReasoningArtifact;
  context: AgentLifecycleContext | null;
  entities: ConversationEntityMemory;
  explicitPlan?: AgentPlanDraft | null;
  providerErrorKo?: string | null;
  executionSummaryKo?: string | null;
  validationOk?: boolean;
  latencyMs?: number;
}): AgentResponse {
  const conclusionKo = sanitizePrimaryUserText(
    input.executionSummaryKo ??
      input.artifact.conclusionKo ??
      input.artifact.decision,
  );
  const explanationKo = sanitizePrimaryUserText(
    input.executionSummaryKo
      ? null
      : input.artifact.explanationKo ?? input.artifact.decisionReason,
  );

  const proposedAction =
    input.executionSummaryKo || input.artifact.riskLevel === "blocked"
      ? null
      : reasoningToProposedAction(input.artifact);

  const plan =
    input.executionSummaryKo
      ? null
      : input.explicitPlan ?? fallbackPlanFromReasoning(input.artifact, input.facts);

  const response = buildAgentResponse(
    { type: input.intentType, params: {}, confidence: input.artifact.confidence, rawQuery: input.artifact.userIntent },
    input.facts,
    {
      interpretationKo: sanitizePrimaryUserParagraphs([conclusionKo, explanationKo]),
      source: input.artifact.fallbackUsed ? "local" : "llm",
      providerMeta: {
        provider: input.artifact.provider,
        model: input.artifact.model,
        latencyMs: 0,
        errorKo: input.providerErrorKo ?? undefined,
      },
    },
    input.context,
    {
      entities: input.entities,
      explicitProposedAction: proposedAction,
      explicitPlan: plan,
      safetyBlocked: input.artifact.riskLevel === "blocked",
      safetyReasonKo: input.artifact.blockedReason ?? undefined,
      goal: input.artifact.goal as AgentResponse["goal"],
      decisionOverride: {
        conclusionKo,
        explanationKo,
        recommendedActionKo: sanitizePrimaryUserText(input.artifact.recommendedAction),
        situationKo: undefined,
        uncertaintyKo:
          input.artifact.missingInformation.join(" ") || null,
      },
    },
  );

  response.reasoningMeta = {
    reasoningId: input.artifact.reasoningId,
    fallbackUsed: input.artifact.fallbackUsed,
    provider: input.artifact.provider,
    model: input.artifact.model,
    validationOk: input.validationOk ?? !input.artifact.fallbackUsed,
    toolIds: input.artifact.toolPlan.map((s) => s.toolId),
    verifiedFactRefs: input.artifact.verifiedFactRefs,
    requestHash: input.artifact.requestHash ?? null,
    latencyMs: input.latencyMs ?? 0,
  };

  return response;
}
