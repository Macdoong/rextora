import { describe, expect, it } from "vitest";
import { normalizeProviderToolPlan } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import type { ReasoningArtifact, ReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningTypes";

function baseInput(overrides: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    query: "test",
    sessionId: "agent_test",
    intentType: "prepare_backtest_plan",
    goal: null,
    facts: [{ labelKo: "후보 전략 ID", value: "demo_strategy_btc_v1", source: "strategy_store", fetchedAt: "2026-01-01T00:00:00.000Z" }],
    history: [],
    context: { strategyId: "demo_strategy_btc_v1" },
    entities: { strategyId: "demo_strategy_btc_v1" },
    workspace: { currentStrategyId: "demo_strategy_btc_v1" } as ReasoningInput["workspace"],
    lifecycleStage: null,
    availableToolIds: [],
    toolMetadata: [],
    pendingPlan: null,
    pendingProposedAction: null,
    policiesKo: [],
    taskProfile: "PLAN_AND_APPROVE",
    ...overrides,
  };
}

function baseArtifact(toolPlan: ReasoningArtifact["toolPlan"]): ReasoningArtifact {
  return {
    reasoningId: "rsn_test",
    sessionId: "agent_test",
    goal: "backtest",
    userIntent: "backtest",
    confidence: 0.9,
    currentStateSummary: "",
    verifiedFactRefs: [],
    assumptions: [],
    missingInformation: [],
    decision: "run backtest",
    decisionReason: "approved",
    recommendedAction: "approve",
    toolPlan,
    requiresApproval: true,
    riskLevel: "medium",
    blockedReason: null,
    fallbackUsed: false,
    provider: "openai",
    model: "gpt-5-mini",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("AgentV2ProviderPlanNormalization", () => {
  it("collapses placeholder strategy lookup into direct backtest.run", () => {
    const artifact = baseArtifact([
      {
        stepId: "list",
        toolId: "strategy.list",
        arguments: {},
        dependsOn: [],
        purpose: "",
        expectedResult: "",
        requiresApproval: true,
        executionOrder: 1,
        onFailure: "abort",
        status: "pending",
      },
      {
        stepId: "detail",
        toolId: "strategy.detail",
        arguments: { strategyId: "<확정된_strategyId>" },
        dependsOn: ["list"],
        purpose: "",
        expectedResult: "",
        requiresApproval: true,
        executionOrder: 2,
        onFailure: "abort",
        status: "pending",
      },
      {
        stepId: "run",
        toolId: "backtest.run",
        arguments: { strategyId: "<확정된_strategyId>" },
        dependsOn: ["detail"],
        purpose: "",
        expectedResult: "",
        requiresApproval: true,
        executionOrder: 3,
        onFailure: "abort",
        status: "pending",
      },
    ]);

    const normalized = normalizeProviderToolPlan(artifact, baseInput());
    expect(normalized.toolPlan.map((step) => step.toolId)).toEqual(["backtest.run"]);
    expect(normalized.toolPlan[0]?.arguments.strategyId).toBe("demo_strategy_btc_v1");
  });

  it("injects search.start when provider omits it", () => {
    const artifact = baseArtifact([
      {
        stepId: "create_search",
        toolId: "search.create",
        arguments: { createBody: { symbols: ["BTCUSDT"], timeframe: "15m" } },
        dependsOn: [],
        purpose: "",
        expectedResult: "",
        requiresApproval: true,
        executionOrder: 1,
        onFailure: "abort",
        status: "pending",
      },
    ]);

    const normalized = normalizeProviderToolPlan(
      artifact,
      baseInput({
        intentType: "prepare_search_plan",
        query: "BTCUSDT 15분봉 탐색 계획",
      }),
    );
    expect(normalized.toolPlan.map((step) => step.toolId)).toEqual([
      "search.create",
      "search.start",
    ]);
    expect(normalized.toolPlan[1]?.arguments.jobId).toBe("$create_search.jobId");
  });

  it("rebuilds prepare_search_plan when provider returns no create step", () => {
    const artifact = baseArtifact([
      {
        stepId: "workspace",
        toolId: "workspace.current",
        arguments: {},
        dependsOn: [],
        purpose: "",
        expectedResult: "",
        requiresApproval: false,
        executionOrder: 1,
        onFailure: "continue",
        status: "pending",
      },
    ]);

    const normalized = normalizeProviderToolPlan(
      artifact,
      baseInput({
        intentType: "prepare_search_plan",
        query: "BTCUSDT 15분봉 탐색 계획",
        entities: { symbol: "BTCUSDT", timeframe: "15m" },
      }),
    );
    expect(normalized.toolPlan.some((step) => step.toolId === "search.create")).toBe(true);
    expect(normalized.toolPlan.some((step) => step.toolId === "search.start")).toBe(true);
  });
});
