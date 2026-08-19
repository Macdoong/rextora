import { describe, expect, it } from "vitest";
import {
  evaluateReasoningPolicy,
  isSafetyBlockIntent,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningPolicy";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { newReasoningId } from "../src/lib/rextora/agent/v2/reasoning/reasoningSchema";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";

describe("AgentV2ReasoningPolicy", () => {
  const baseInput = buildReasoningInput({
    query: "test",
    sessionId: null,
    intentType: "prepare_search_plan",
    goal: "plan_search",
    facts: [],
    history: [],
    context: null,
    entities: emptyEntityMemory(),
  });

  it("blocks live/order/safe intents locally", () => {
    expect(isSafetyBlockIntent("start_live")).toBe(true);
    expect(isSafetyBlockIntent("execute_trade")).toBe(true);
    expect(isSafetyBlockIntent("modify_safe")).toBe(true);
    expect(isSafetyBlockIntent("prepare_search_plan")).toBe(false);
  });

  it("blocks forbidden tool ids in plan", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "live",
      userIntent: "live start",
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "blocked",
      decisionReason: "",
      recommendedAction: "",
      toolPlan: [
        {
          stepId: "x",
          toolId: "live.start",
          arguments: {},
          dependsOn: [],
          purpose: "",
          expectedResult: "",
          requiresApproval: true,
          executionOrder: 1,
          onFailure: "abort" as const,
          status: "pending" as const,
        },
      ],
      requiresApproval: false,
      riskLevel: "high" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "openai",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const result = evaluateReasoningPolicy(artifact, baseInput);
    expect(result.allow).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it("rejects unknown tools", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "search",
      userIntent: "search",
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "go",
      decisionReason: "",
      recommendedAction: "",
      toolPlan: [
        {
          stepId: "x",
          toolId: "unknown.tool",
          arguments: {},
          dependsOn: [],
          purpose: "",
          expectedResult: "",
          requiresApproval: false,
          executionOrder: 1,
          onFailure: "abort" as const,
          status: "pending" as const,
        },
      ],
      requiresApproval: false,
      riskLevel: "low" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "openai",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const result = evaluateReasoningPolicy(artifact, baseInput);
    expect(result.allow).toBe(false);
    expect(result.issues.some((i) => i.startsWith("unknown_tool"))).toBe(true);
  });

  it("rejects a semantically empty plan for an executable intent", () => {
    const paperInput = buildReasoningInput({
      query: "이 전략 모의매매까지 준비해.",
      sessionId: null,
      intentType: "prepare_paper_plan",
      goal: "prepare_paper",
      facts: [],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "prepare_paper",
      userIntent: paperInput.query,
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "prepare",
      decisionReason: "verified candidate",
      recommendedAction: "review",
      toolPlan: [],
      requiresApproval: true,
      riskLevel: "medium" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "gemini",
      model: "test",
      createdAt: new Date().toISOString(),
    };

    const result = evaluateReasoningPolicy(artifact, paperInput);
    expect(result.allow).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.issues).toContain("missing_required_tool:paper.prepare");
  });

  it("requires persisted status lookup for a search-status intent", () => {
    const statusInput = buildReasoningInput({
      query: "현재 연구가 어디까지 진행됐어?",
      sessionId: null,
      intentType: "search_status",
      goal: "monitor_search",
      facts: [],
      history: [],
      context: { route: "/dashboard", jobId: "search_test_active" },
      entities: emptyEntityMemory(),
    });
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "monitor_search",
      userIntent: statusInput.query,
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "monitor",
      decisionReason: "active job",
      recommendedAction: "status",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "gemini",
      model: "test",
      createdAt: new Date().toISOString(),
    };

    const result = evaluateReasoningPolicy(artifact, statusInput);
    expect(result.allow).toBe(false);
    expect(result.issues).toContain("missing_required_tool:search.status");
  });

  it("allows empty toolPlan for search_status when read tools were prefetched", () => {
    const statusInput = buildReasoningInput({
      query: "현재 돌아가는 탐색을 근거로 설명해.",
      sessionId: null,
      intentType: "search_status",
      goal: "monitor_search",
      facts: [
        {
          labelKo: "최근 작업 상태",
          value: "완료",
          source: "strategy_search_jobs",
          fetchedAt: new Date().toISOString(),
        },
      ],
      history: [],
      context: { route: "/dashboard", jobId: "search_test_active" },
      entities: emptyEntityMemory(),
      conversationMode: "READ_AND_ANSWER",
      taskProfile: "READ_AND_ANSWER_SIMPLE",
    });
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "monitor_search",
      userIntent: statusInput.query,
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: ["최근 작업 상태::완료"],
      assumptions: [],
      missingInformation: [],
      decision: "설명",
      decisionReason: "근거",
      recommendedAction: "none",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "openai",
      model: "gpt-5-mini",
      createdAt: new Date().toISOString(),
      conclusionKo: "탐색이 완료되었습니다.",
      explanationKo: "최근 작업 상태가 완료로 기록되어 있습니다.",
    };

    const result = evaluateReasoningPolicy(artifact, statusInput);
    expect(result.allow).toBe(true);
    expect(result.issues).not.toContain("missing_required_tool:search.status");
  });
});
