import { describe, expect, it } from "vitest";
import {
  extractJsonFromText,
  newReasoningId,
  parseReasoningJson,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningSchema";

describe("AgentV2ReasoningSchema", () => {
  it("parses valid reasoning JSON", () => {
    const raw = {
      goal: "new_search",
      userIntent: "새 탐색",
      confidence: 0.8,
      currentStateSummary: "대기 중",
      verifiedFactRefs: ["심볼::BTCUSDT"],
      assumptions: [],
      missingInformation: [],
      decision: "새 탐색을 제안합니다",
      decisionReason: "이전 결과 부족",
      recommendedAction: "탐색 계획 승인",
      toolPlan: [
        {
          stepId: "s1",
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
      ],
      requiresApproval: true,
      riskLevel: "medium",
      blockedReason: null,
      conclusionKo: "새 탐색이 적절합니다.",
      explanationKo: "근거 기반 제안입니다.",
    };
    const { artifact, issues } = parseReasoningJson(raw, {
      sessionId: "sess_1",
      userIntent: "새 탐색",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(issues).toHaveLength(0);
    expect(artifact?.goal).toBe("new_search");
    expect(artifact?.toolPlan).toHaveLength(1);
    expect(artifact?.reasoningId).toBeTruthy();
  });

  it("rejects missing required fields", () => {
    const { artifact, issues } = parseReasoningJson({}, {
      sessionId: null,
      userIntent: "test",
      provider: "local",
      model: "fallback",
    });
    expect(artifact).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
  });

  it("extracts JSON from fenced text", () => {
    const text = '```json\n{"goal":"x","decision":"y","decisionReason":"z","recommendedAction":"a","confidence":0.5}\n```';
    const parsed = extractJsonFromText(text);
    expect(parsed).toMatchObject({ goal: "x" });
  });

  it("generates unique reasoning ids", () => {
    expect(newReasoningId()).not.toBe(newReasoningId());
  });
});
