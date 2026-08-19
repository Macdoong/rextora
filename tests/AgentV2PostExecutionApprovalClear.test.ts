import { describe, expect, it } from "vitest";
import { buildResponseFromReasoning } from "../src/lib/rextora/agent/v2/reasoning/reasoningResponseBuilder";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import type { ReasoningArtifact } from "../src/lib/rextora/agent/v2/reasoning/reasoningTypes";
import { recoverPendingAction } from "../components/rextora/agent/agentSessionSync";
import type { AgentSessionTurn } from "../components/rextora/agent/agentPersistence";
import type { AgentResponse } from "../src/lib/rextora/agent/types";

describe("post-execution approval clearing", () => {
  it("does not resurrect pending proposed action after tool plan execution", () => {
    const pending = {
      actionId: "pa_test",
      actionType: "prepare_search_plan" as const,
      summary: "기존 탐색 취소 후 새 탐색 시작",
      reason: "test",
      targetRoute: "/strategy-search",
      strategyId: null,
      jobId: null,
      runId: null,
      symbol: null,
      timeframe: null,
      parameters: { toolPlan: [] },
      requiresApproval: true,
      riskLevel: "medium" as const,
      blockedReason: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const artifact: ReasoningArtifact = {
      reasoningId: "reason_test",
      sessionId: "sess",
      goal: "execute_approved_plan",
      userIntent: "진행해.",
      confidence: 1,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "done",
      decisionReason: "done",
      recommendedAction: "기존 탐색 취소 후 새 탐색 시작",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low",
      blockedReason: null,
      fallbackUsed: false,
      provider: "local",
      model: "approval_fast_path",
      createdAt: new Date().toISOString(),
      conclusionKo: "완료",
      explanationKo: "설명",
    };

    const response = buildResponseFromReasoning({
      intentType: "approve_pending",
      facts: [],
      artifact,
      context: null,
      entities: { ...emptyEntityMemory(), pendingProposedAction: pending },
      executionSummaryKo: "기존 탐색을 취소하고 새 1시간 탐색을 시작했습니다.",
    });

    expect(response.proposedAction).toBeNull();
    expect(response.entityMemory?.pendingProposedAction).toBeNull();
    expect(response.missionTimeline?.pendingApprovals ?? []).toHaveLength(0);
  });

  it("does not recover an executed proposal after a later read-only turn", () => {
    const proposedAction = {
      actionId: "pa_executed",
      actionType: "prepare_search_plan" as const,
      summary: "탐색 계획 검토",
      reason: "test",
      targetRoute: "/strategy-search",
      strategyId: null,
      jobId: null,
      runId: null,
      symbol: null,
      timeframe: null,
      parameters: {},
      requiresApproval: true,
      riskLevel: "medium" as const,
      blockedReason: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const response = (partial: Partial<AgentResponse>) =>
      partial as AgentResponse;
    const turn = (
      id: string,
      partial: Partial<AgentResponse>,
    ): AgentSessionTurn => ({
      id,
      query: id,
      response: response(partial),
      error: null,
      isLoading: false,
      timestamp: new Date().toISOString(),
    });

    const turns = [
      turn("plan", { intentType: "strategy_search_request", proposedAction }),
      turn("execute", {
        intentType: "approve_pending",
        executionResult: { ok: true } as AgentResponse["executionResult"],
      }),
      turn("report", { intentType: "execution_report" }),
    ];

    expect(
      recoverPendingAction({
        livePending: null,
        turns,
        entityMemory: { ...emptyEntityMemory(), pendingProposedAction: proposedAction },
      }),
    ).toBeNull();

    const newerPlan = { ...proposedAction, actionId: "pa_new" };
    expect(
      recoverPendingAction({
        livePending: null,
        turns: [...turns, turn("new-plan", { proposedAction: newerPlan })],
        entityMemory: null,
      }),
    ).toEqual(newerPlan);
  });
});
