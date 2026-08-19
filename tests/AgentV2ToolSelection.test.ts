import { describe, expect, it } from "vitest";
import { listToolIds } from "../src/lib/rextora/agent/v2/tools";
import { validateToolPlanArguments } from "../src/lib/rextora/agent/v2/reasoning/reasoningValidator";
import { newReasoningId } from "../src/lib/rextora/agent/v2/reasoning/reasoningSchema";

describe("AgentV2ToolSelection", () => {
  it("only allows registered tool ids", () => {
    const registered = new Set(listToolIds());
    expect(registered.has("search.create")).toBe(true);
    expect(registered.has("backtest.run")).toBe(true);
    expect(registered.has("live.start")).toBe(false);
    expect(registered.has("safe.modify")).toBe(false);
  });

  it("validates search.create arguments against schema", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "search",
      userIntent: "search",
      confidence: 0.8,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "d",
      decisionReason: "r",
      recommendedAction: "a",
      toolPlan: [
        {
          stepId: "s1",
          toolId: "search.create",
          arguments: {
            createBody: { symbols: ["BTCUSDT"], timeframe: "15m" },
          },
          dependsOn: [],
          purpose: "create",
          expectedResult: "jobId",
          requiresApproval: true,
          executionOrder: 1,
          onFailure: "abort" as const,
          status: "pending" as const,
        },
      ],
      requiresApproval: true,
      riskLevel: "medium" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "local",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const issues = validateToolPlanArguments(artifact);
    expect(issues.filter((i) => i.startsWith("invalid_args"))).toHaveLength(0);
  });

  it("rejects unsupported arguments", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "search",
      userIntent: "search",
      confidence: 0.8,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "d",
      decisionReason: "r",
      recommendedAction: "a",
      toolPlan: [
        {
          stepId: "s1",
          toolId: "search.status",
          arguments: {},
          dependsOn: [],
          purpose: "status",
          expectedResult: "status",
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
      provider: "local",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const issues = validateToolPlanArguments(artifact);
    expect(issues.some((i) => i.startsWith("invalid_args"))).toBe(true);
  });
});
