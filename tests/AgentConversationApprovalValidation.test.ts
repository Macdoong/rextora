import { describe, expect, it } from "vitest";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import type { ReasoningArtifact } from "../src/lib/rextora/agent/v2/reasoning/reasoningTypes";
import { validateReasoningArtifact } from "../src/lib/rextora/agent/v2/reasoning/reasoningValidator";

describe("provider write plans require executable approval metadata", () => {
  const input = buildReasoningInput({
    query: "이 전략 모의매매까지 준비해.",
    sessionId: "agent_validation",
    intentType: "prepare_paper_plan",
    goal: "prepare_paper",
    facts: [],
    history: [],
    context: null,
    entities: {
      ...emptyEntityMemory(),
      strategyId: "strategy_valid",
      runId: "run_valid",
    },
  });

  function artifact(
    artifactApproval: boolean,
    stepApproval: boolean,
  ): ReasoningArtifact {
    return {
      reasoningId: "reason_approval_validation",
      sessionId: "agent_validation",
      goal: "prepare_paper",
      userIntent: "이 전략 모의매매까지 준비해.",
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: "모의매매 계획 준비",
      decisionReason: "검증 계획",
      recommendedAction: "모의매매 계획 검토",
      toolPlan: [
        {
          stepId: "paper_prepare",
          toolId: "paper.prepare",
          arguments: { strategyId: "strategy_valid" },
          dependsOn: [],
          purpose: "모의매매 준비",
          expectedResult: "승인 대기 세션",
          requiresApproval: stepApproval,
          executionOrder: 1,
          onFailure: "abort",
          status: "pending",
        },
      ],
      requiresApproval: artifactApproval,
      riskLevel: "medium",
      blockedReason: null,
      fallbackUsed: false,
      provider: "gemini",
      model: "gemini-2.5-flash",
      createdAt: new Date().toISOString(),
    };
  }

  it("rejects a provider write artifact with no artifact approval", () => {
    const result = validateReasoningArtifact(artifact(false, true), input);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("write_without_approval:paper.prepare");
  });

  it("rejects a provider write step that omits approval", () => {
    const result = validateReasoningArtifact(artifact(true, false), input);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("approval_mismatch:paper.prepare");
  });

  it("accepts the same valid plan only when both approval flags are set", () => {
    const result = validateReasoningArtifact(artifact(true, true), input);
    expect(result.ok).toBe(true);
  });
});

