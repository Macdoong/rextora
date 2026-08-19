/**
 * Reasoning prompt builder — bounded, server-authoritative input only.
 */

import type { ReasoningInput } from "./reasoningTypes";
import type { ReasoningTaskProfile } from "./reasoningTaskProfile";

function compactValue(value: string, max = 320): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildReasoningSystemPrompt(
  profile: ReasoningTaskProfile = "DIRECT_ANSWER",
): string {
  const readOnly =
    profile === "READ_AND_ANSWER_SIMPLE" ||
    profile === "READ_AND_ANSWER_COMPLEX";
  return `You are Rextora AI Trading Employee reasoning planner (Phase 3).
Respond ONLY with valid JSON matching the schema. No markdown outside JSON.

Rules:
- Select toolId ONLY from the provided availableToolIds list. Never invent tools.
- verifiedFactRefs must reference labels/values from provided facts only.
- Write tools require requiresApproval=true on the artifact and each write step.
- Never plan Live trading, exchange orders, or SAFE mutation.
- If evidence is insufficient, set missingInformation and do not fabricate metrics or job IDs.
- conclusionKo and explanationKo must be natural Korean for a trader colleague — no raw tool IDs, enums, or internal IDs in prose.
- confidence is 0-1 reflecting evidence quality.
${readOnly ? "- This is READ_AND_ANSWER: toolPlan MUST be empty []. requiresApproval MUST be false. Do not propose writes." : ""}
${profile === "DIRECT_ANSWER" ? "- This is DIRECT_ANSWER: toolPlan MUST be empty []. Keep JSON concise." : ""}

JSON schema fields:
reasoningId, sessionId, goal, userIntent, confidence, currentStateSummary,
verifiedFactRefs[], assumptions[], missingInformation[], decision, decisionReason,
recommendedAction, toolPlan[{stepId,toolId,arguments,dependsOn,purpose,expectedResult,requiresApproval,executionOrder,onFailure,status}],
requiresApproval, riskLevel, blockedReason, fallbackUsed, provider, model, createdAt,
conclusionKo, explanationKo, requestHash, planId`;
}

export function buildReasoningUserPrompt(
  input: ReasoningInput,
  profile: ReasoningTaskProfile = "DIRECT_ANSWER",
): string {
  const factLimit =
    profile === "READ_AND_ANSWER_COMPLEX"
      ? 16
      : profile.startsWith("READ_AND_ANSWER")
        ? 12
        : input.facts.length;
  const valueLimit =
    profile === "DIRECT_ANSWER" ? 240 : profile.startsWith("READ_AND_ANSWER") ? 360 : 320;

  const facts = input.facts.slice(0, factLimit).map((f) => ({
    labelKo: f.labelKo,
    value: compactValue(String(f.value ?? ""), valueLimit),
    source: f.source,
  }));

  const history = input.history.slice(-6).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 200),
  }));

  const payload = {
    query: input.query,
    sessionId: input.sessionId,
    intentType: input.intentType,
    goal: input.goal,
    lifecycleStage: input.lifecycleStage,
    taskProfile: profile,
    context: input.context
      ? {
          route: input.context.route,
          jobId: input.context.jobId,
          runId: input.context.runId,
          strategyId: input.context.strategyId,
          symbol: input.context.symbol,
          timeframe: input.context.timeframe,
        }
      : null,
    entities: {
      strategyId: input.entities.strategyId,
      jobId: input.entities.jobId,
      runId: input.entities.runId,
      symbol: input.entities.symbol,
      timeframe: input.entities.timeframe,
      pendingPlanKind: input.pendingPlan?.kind ?? null,
    },
    workspace: input.workspace
      ? {
          currentSearchJobId: input.workspace.currentSearchJobId,
          currentBacktestRunId: input.workspace.currentBacktestRunId,
          currentSymbol: input.workspace.currentSymbol,
          currentTimeframe: input.workspace.currentTimeframe,
          currentPatterns: input.workspace.currentPatterns,
          currentBlockers: input.workspace.currentBlockers,
        }
      : null,
    facts,
    history,
    availableToolIds: input.availableToolIds,
    toolMetadata:
      profile.startsWith("READ_AND_ANSWER") || profile === "DIRECT_ANSWER"
        ? input.toolMetadata.slice(0, 12)
        : input.toolMetadata,
    policiesKo: input.policiesKo,
    pendingPlanSummary: input.pendingPlan
      ? {
          kind: input.pendingPlan.kind,
          titleKo: input.pendingPlan.titleKo,
          requiresApproval: input.pendingPlan.requiresApproval,
        }
      : null,
  };

  return JSON.stringify(payload);
}
