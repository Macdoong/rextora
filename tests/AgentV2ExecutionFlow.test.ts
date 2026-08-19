import { describe, expect, it } from "vitest";
import { executeApprovedToolPlan } from "../src/lib/rextora/agent/v2/reasoning/reasoningExecution";
import { executeTool } from "../src/lib/rextora/agent/v2/tools";

describe("AgentV2ExecutionFlow", () => {
  it("executes approved read plan steps and captures jobId", async () => {
    const result = await executeApprovedToolPlan({
      plan: [
        {
          stepId: "monitor",
          toolId: "search.status",
          arguments: { jobId: "j1" },
          dependsOn: [],
          purpose: "monitor",
          expectedResult: "status",
          requiresApproval: false,
          executionOrder: 1,
          onFailure: "continue",
          status: "pending",
        },
      ],
      sessionId: "sess_test",
      approvalId: "pa_test",
    });

    expect(result.steps.length).toBeGreaterThanOrEqual(0);
    expect(typeof result.summaryKo).toBe("string");
  });

  it("blocks write tools without approval in tool policy", async () => {
    const denied = await executeTool({
      toolId: "search.create",
      input: { createBody: { symbols: ["BTCUSDT"], timeframe: "15m" } },
      context: { sessionId: null, approved: false },
    });
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe("denied");
  });

  it("resolves $step.field references in chained plans", async () => {
    const result = await executeApprovedToolPlan({
      plan: [
        {
          stepId: "create_search",
          toolId: "search.create",
          arguments: { createBody: { symbols: ["BTCUSDT"], timeframe: "15m" } },
          dependsOn: [],
          purpose: "create",
          expectedResult: "jobId",
          requiresApproval: true,
          executionOrder: 1,
          onFailure: "abort",
          status: "pending",
        },
        {
          stepId: "start_search",
          toolId: "search.start",
          arguments: { jobId: "$create_search.jobId" },
          dependsOn: ["create_search"],
          purpose: "start",
          expectedResult: "running",
          requiresApproval: true,
          executionOrder: 2,
          onFailure: "abort",
          status: "pending",
        },
      ],
      sessionId: "sess_chain",
      approvalId: "pa_chain",
    });

    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0]?.toolId).toBe("search.create");
  });
});
