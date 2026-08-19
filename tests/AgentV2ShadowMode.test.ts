import { describe, expect, it } from "vitest";
import {
  compareShadowReasoning,
  summarizeShadowAudit,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningAudit";
import { buildFallbackReasoning } from "../src/lib/rextora/agent/v2/reasoning/reasoningFallback";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";

describe("AgentV2ShadowMode", () => {
  it("records v1 vs v2 comparison", () => {
    const input = buildReasoningInput({
      query: "이전과 다른 패턴으로 탐색",
      sessionId: null,
      intentType: "prepare_search_plan",
      goal: "plan_search",
      facts: [],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const v2 = buildFallbackReasoning(input);
    const record = compareShadowReasoning({
      query: input.query,
      v1Intent: "prepare_search_plan",
      v1Goal: "plan_search",
      v1RequiresApproval: true,
      v1Tools: ["search.create", "search.start"],
      v2,
    });
    expect(record.v1Intent).toBe("prepare_search_plan");
    expect(record.v2Tools.length).toBeGreaterThan(0);
    expect(typeof record.safetyAgreement).toBe("boolean");
  });

  it("summarizes shadow audit matrix", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      compareShadowReasoning({
        query: `prompt ${i}`,
        v1Intent: "prepare_search_plan",
        v1Goal: "plan_search",
        v1RequiresApproval: true,
        v1Tools: ["search.create"],
        v2: buildFallbackReasoning(
          buildReasoningInput({
            query: `prompt ${i}`,
            sessionId: null,
            intentType: "prepare_search_plan",
            goal: "plan_search",
            facts: [],
            history: [],
            context: null,
            entities: emptyEntityMemory(),
          }),
        ),
      }),
    );
    const summary = summarizeShadowAudit(records);
    expect(summary.total).toBe(5);
    expect(summary.safetyAgreementRate).toBeGreaterThanOrEqual(0);
  });
});
