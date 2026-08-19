import { describe, expect, it } from "vitest";
import {
  buildFactRefIndex,
  validateFactRefs,
  validateReasoningArtifact,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningValidator";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { newReasoningId } from "../src/lib/rextora/agent/v2/reasoning/reasoningSchema";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";

describe("AgentV2NoFabrication", () => {
  const facts = [
    {
      labelKo: "심볼",
      value: "BTCUSDT",
      source: "system_status" as const,
      fetchedAt: new Date().toISOString(),
    },
  ];

  it("rejects fabricated fact references", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "search",
      userIntent: "search",
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: ["수익률::999%"],
      assumptions: [],
      missingInformation: [],
      decision: "d",
      decisionReason: "r",
      recommendedAction: "a",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "openai",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const index = buildFactRefIndex(facts);
    const issues = validateFactRefs(artifact, index);
    expect(issues.some((i) => i.startsWith("fabricated_fact_ref"))).toBe(true);
  });

  it("accepts verified fact references", () => {
    const artifact = {
      reasoningId: newReasoningId(),
      sessionId: null,
      goal: "search",
      userIntent: "search",
      confidence: 0.9,
      currentStateSummary: "",
      verifiedFactRefs: ["심볼::BTCUSDT"],
      assumptions: [],
      missingInformation: [],
      decision: "d",
      decisionReason: "r",
      recommendedAction: "a",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low" as const,
      blockedReason: null,
      fallbackUsed: false,
      provider: "openai",
      model: "test",
      createdAt: new Date().toISOString(),
    };
    const input = buildReasoningInput({
      query: "test",
      sessionId: null,
      intentType: "market_status",
      goal: null,
      facts,
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const result = validateReasoningArtifact(artifact, input);
    expect(result.issues.some((i) => i.startsWith("fabricated_fact_ref"))).toBe(
      false,
    );
  });
});
