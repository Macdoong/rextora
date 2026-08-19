import { describe, expect, it } from "vitest";
import { buildExecutionSummaryFromPlan } from "../src/lib/rextora/agent/v2/reasoning/conversationalProse";
import type { ToolPlanItem } from "../src/lib/rextora/agent/v2/reasoning/reasoningTypes";

describe("Agent V2 conversational execution prose", () => {
  it("describes a result promotion as promotion even when the handler returns jobId", () => {
    const plan: ToolPlanItem[] = [{
      stepId: "promote_top_result",
      toolId: "results.promote",
      arguments: { jobId: "search_demo", mode: "top", limit: 1, idempotencyKey: "once" },
      dependsOn: [],
      purpose: "결과 승격",
      expectedResult: "전략 등록",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    }];

    const summary = buildExecutionSummaryFromPlan(plan, {
      ok: true,
      steps: [],
      summaryKo: "",
      jobId: "search_demo",
      runId: null,
      sessionId: null,
    });

    expect(summary).toContain("전략으로 승격");
    expect(summary).not.toContain("탐색 작업을 시작");
  });
});
