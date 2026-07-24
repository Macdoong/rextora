import { describe, expect, it } from "vitest";
import {
  buildFollowUpResearch,
  FollowUpResearchError,
} from "../src/lib/rextora/strategySearch/followUpResearch";

describe("follow-up research API helper", () => {
  it("fail-closes SAFE mutation intents", () => {
    expect(() =>
      buildFollowUpResearch({ source: "paper", strategyId: "SAFE_v44_i4060" }),
    ).toThrow(FollowUpResearchError);
    try {
      buildFollowUpResearch({ source: "strategy", strategyId: "SAFE_v44_i4060" });
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: "SAFE_MUTATION_BLOCKED", httpStatus: 403 });
    }
  });

  it("returns paper feedback and suggested body without auto-start", () => {
    const result = buildFollowUpResearch({
      source: "paper",
      strategyId: "custom_x",
      strategyName: "테스트",
      paperRealizedPnl: -5,
      paperTradeCount: 4,
      notes: "모의 재탐색",
    });
    expect(result.ok).toBe(true);
    expect(result.paperFeedback?.paperMetrics.available).toBe(true);
    expect(result.researchBasis.suggestedResearchBasisId).toBe("paper_supplement");
    expect(result.suggestedCreateJobBody.autoStart).toBe(false);
    expect(result.suggestedCreateJobBody.operatorPlan).toBeTruthy();
    expect(result.searchSpaceMutation).toBeTruthy();
    expect(result.searchSpaceMutation!.mutations.length).toBeGreaterThan(0);
    const plan = result.suggestedCreateJobBody.operatorPlan as {
      mutatedParameterRanges?: unknown[];
    };
    expect(Array.isArray(plan.mutatedParameterRanges)).toBe(true);
    expect(
      (plan.mutatedParameterRanges?.length ?? 0) > 0 ||
        Array.isArray(result.suggestedCreateJobBody.parameterRanges),
    ).toBe(true);
  });

  it("rejects invalid source", () => {
    expect(() =>
      buildFollowUpResearch({ source: "unknown" as "paper" }),
    ).toThrow(/source must be/);
  });
});
