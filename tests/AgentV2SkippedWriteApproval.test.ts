import { describe, expect, it } from "vitest";
import { parseReasoningJson } from "../src/lib/rextora/agent/v2/reasoning/reasoningSchema";
import { executeApprovedToolPlan } from "../src/lib/rextora/agent/v2/reasoning/reasoningExecution";
import { validateToolPlanArguments } from "../src/lib/rextora/agent/v2/reasoning/reasoningValidator";
import type { ReasoningArtifact } from "../src/lib/rextora/agent/v2/reasoning/reasoningTypes";

describe("skipped write steps cannot fake approval success", () => {
  it("coerces provider-skipped approval write steps back to pending", () => {
    const parsed = parseReasoningJson(
      {
        goal: "prepare_paper",
        decision: "모의매매 준비",
        decisionReason: "승인 후 준비",
        recommendedAction: "승인",
        confidence: 0.9,
        riskLevel: "medium",
        requiresApproval: true,
        toolPlan: [
          {
            stepId: "1",
            toolId: "paper.prepare",
            arguments: { strategyId: "strat_1" },
            requiresApproval: true,
            status: "skipped",
          },
        ],
        verifiedFactRefs: [],
        assumptions: [],
        unknownGaps: [],
        conclusionKo: "준비 계획",
        explanationKo: "승인 필요",
      },
      { sessionId: "s1", userIntent: "모의매매 준비해" },
    );
    expect(parsed.artifact?.toolPlan[0]?.status).toBe("pending");
  });

  it("rejects write steps that remain pre-skipped", () => {
    const artifact = {
      toolPlan: [
        {
          stepId: "1",
          toolId: "paper.prepare",
          arguments: { strategyId: "strat_1" },
          dependsOn: [],
          purpose: "",
          expectedResult: "",
          requiresApproval: true,
          executionOrder: 1,
          onFailure: "abort" as const,
          status: "skipped" as const,
        },
      ],
    } as ReasoningArtifact;
    const issues = validateToolPlanArguments(artifact);
    expect(issues.some((issue) => issue.startsWith("write_step_pre_skipped"))).toBe(
      true,
    );
  });

  it("fails approved execution when write steps were all skipped", async () => {
    const result = await executeApprovedToolPlan({
      plan: [
        {
          stepId: "1",
          toolId: "paper.prepare",
          arguments: { strategyId: "strat_1" },
          dependsOn: [],
          purpose: "",
          expectedResult: "",
          requiresApproval: true,
          executionOrder: 1,
          onFailure: "abort",
          status: "skipped",
        },
      ],
      sessionId: "s1",
      approvalId: "pa_1",
    });
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.summaryKo).toMatch(/실행 단계가 비어|실행할 단계/);
  });
});
