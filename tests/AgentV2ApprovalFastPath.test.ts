import { describe, expect, it, vi, beforeEach } from "vitest";
import { runReasoningEngine } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import { clearReasoningRequestCache } from "../src/lib/rextora/agent/v2/reasoning/reasoningRequestRegistry";

vi.mock("../src/lib/rextora/agent/v2/reasoning/reasoningProvider", () => ({
  callReasoningProvider: vi.fn(async () => ({
    ok: true,
    raw: {},
    provider: "gemini",
    model: "gemini-2.5-flash",
    errorKo: null,
    latencyMs: 5,
    parsed: { artifact: null, issues: ["mock"] },
  })),
}));

describe("approval fast path", () => {
  beforeEach(() => {
    clearReasoningRequestCache();
  });

  it("skips provider on approve_pending when pending tool plan exists", async () => {
    const { callReasoningProvider } = await import(
      "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
    );
    const input = buildReasoningInput({
      query: "진행해",
      sessionId: "s1",
      intentType: "approve_pending",
      goal: "approve",
      facts: [],
      history: [],
      context: null,
      entities: {
        ...emptyEntityMemory(),
        pendingProposedAction: {
          actionId: "pa_test",
          actionType: "prepare_search_plan",
          summary: "탐색 시작",
          reason: "test",
          targetRoute: "/strategy-search",
          strategyId: null,
          jobId: null,
          runId: null,
          symbol: "BTCUSDT",
          timeframe: "1h",
          parameters: {
            toolPlan: [
              {
                stepId: "create_search",
                toolId: "search.create",
                arguments: {
                  createBody: {
                    symbols: ["BTCUSDT"],
                    timeframe: "1h",
                    operatorPlan: { selectedSpaceIds: ["trendline", "support_resistance"] },
                  },
                },
                dependsOn: [],
                purpose: "create",
                expectedResult: "job",
                requiresApproval: true,
                executionOrder: 1,
                onFailure: "abort",
                status: "pending",
              },
            ],
          },
          requiresApproval: true,
          riskLevel: "medium",
          blockedReason: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
        },
      },
    });

    const result = await runReasoningEngine(input);
    expect(callReasoningProvider).not.toHaveBeenCalled();
    expect(result.artifact.provider).toBe("local");
    expect(result.artifact.conclusionKo).toMatch(/탐색/);
    expect(result.artifact.conclusionKo).not.toMatch(/patternConfigLevel/i);
  });
});
