import { describe, expect, it } from "vitest";
import {
  analyzeResearchFailure,
  analyzeResearchGaps,
  compareResearchEvidence,
  generateResearchPlan,
  recommendNextResearch,
  validateResearchRecommendation,
  type ResearchEvidence,
} from "../src/lib/rextora/agent/v2/research";

function evidence(input: Partial<ResearchEvidence> = {}): ResearchEvidence {
  return {
    evidenceId: "ev_1",
    kind: "top_result",
    sourceId: "search_real#1",
    verified: true,
    configuration: {
      symbol: "BTCUSDT",
      timeframe: "15m",
      patternIds: ["order_block", "fvg"],
      parametersHash: null,
    },
    metrics: {
      totalReturn: 0.12,
      mdd: -0.08,
      tradeCount: 42,
      profitFactor: 1.4,
      totalCost: 0.02,
    },
    status: "recommendable",
    rejectionReasons: [],
    recordedAt: "2026-08-03T00:00:00.000Z",
    ...input,
  };
}

describe("Agent V2 Research Brain", () => {
  it("selects an untested supported combination and never starts it", () => {
    const plan = generateResearchPlan({
      symbol: "BTCUSDT",
      timeframe: "15m",
      supportedPatternCombinations: [
        ["order_block", "fvg"],
        ["trendline", "support_resistance"],
      ],
      evidence: [evidence()],
    });
    expect(plan.patternIds).toEqual(["trendline", "support_resistance"]);
    expect(plan.duplicateOf).toBeNull();
    expect(plan.executionStarted).toBe(false);
    expect(plan.reasonKo).not.toMatch(/수익.*예상|개선.*확정/);
  });

  it("rejects duplicate research unless a retest is justified", () => {
    expect(() => generateResearchPlan({
      symbol: "BTCUSDT",
      timeframe: "15m",
      supportedPatternCombinations: [["order_block", "fvg"]],
      evidence: [evidence()],
    })).toThrow("DUPLICATE_RESEARCH_REQUIRES_JUSTIFICATION");
    expect(generateResearchPlan({
      symbol: "BTCUSDT",
      timeframe: "15m",
      supportedPatternCombinations: [["order_block", "fvg"]],
      evidence: [evidence()],
      retestJustification: "수수료 조건을 바꿔 실제 비용 민감도를 재검증",
    }).duplicateOf).toBe("ev_1");
  });

  it("identifies missing cost and backtest evidence", () => {
    const gaps = analyzeResearchGaps([
      evidence({ metrics: { totalReturn: 0.1, mdd: -0.1, tradeCount: 20, profitFactor: 1.2, totalCost: null } }),
    ]);
    expect(gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining(["missing_cost", "missing_backtest"]));
  });

  it("analyzes only persisted failure metrics and reasons", () => {
    const result = analyzeResearchFailure(evidence({
      metrics: { totalReturn: -0.03, mdd: -0.31, tradeCount: 6, profitFactor: 0.7, totalCost: 0.05 },
      rejectionReasons: ["비용 스트레스 검증 실패"],
      status: "rejected",
    }));
    expect(result.causes).toEqual(expect.arrayContaining([
      "비용 스트레스 검증 실패",
      "저장된 비용이 순성과의 절대값보다 큽니다.",
      "저장된 최대 낙폭이 25%를 초과했습니다.",
      "거래 표본이 10회 미만입니다.",
    ]));
    expect(result.evidenceRefs).toEqual(["ev_1"]);
  });

  it("does not rank two strategies without complete verified metrics", () => {
    const incomplete = evidence({ evidenceId: "ev_2", metrics: null });
    expect(compareResearchEvidence(evidence(), incomplete).preferredEvidenceId).toBeNull();
  });

  it("recommends backtest only for a verified recommendable result", () => {
    const items = [evidence()];
    const recommendation = recommendNextResearch(items);
    expect(recommendation).toMatchObject({
      kind: "backtest",
      targetEvidenceId: "ev_1",
      expectedReturn: null,
    });
    expect(validateResearchRecommendation(recommendation, items)).toEqual({ ok: true, issues: [] });
  });

  it("rejects fabricated evidence references", () => {
    const result = validateResearchRecommendation({
      kind: "backtest",
      summaryKo: "검증",
      evidenceRefs: ["not_real"],
      targetEvidenceId: "not_real",
      expectedReturn: null,
    }, [evidence()]);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(["UNKNOWN_EVIDENCE_REFERENCE", "UNKNOWN_TARGET_EVIDENCE"]));
  });
});

