/**
 * Pattern combo validation, allowed spaces, evidence-derived Top-10 reasons.
 */
import { describe, expect, it } from "vitest";
import { validatePatternCombination } from "../components/rextora/strategySearch/formValidation";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { validateStrategySearchForm } from "../components/rextora/strategySearch/formValidation";
import { ALL_SEARCH_SPACES } from "../src/lib/rextora/strategySearch/searchSpaces";
import {
  movementReasonForChange,
  rankChangeLabelShort,
  type ResearchTop10Entry,
} from "../src/lib/rextora/strategySearch/researchTop10";

function stubEntry(
  partial: Partial<ResearchTop10Entry> & { strategyHash: string; rank: number },
): ResearchTop10Entry {
  return {
    roleBadges: [],
    sourceResearchJobId: "job_x",
    sourceTrialIteration: 1,
    sourceClusterId: "c1",
    symbol: "BTCUSDT",
    timeframe: "15m",
    candidateId: "cand",
    readableName: "t",
    displayAlias: "alias",
    netReturn: 0.1,
    maxDrawdown: -0.05,
    tradeCount: 20,
    profitFactor: 1.5,
    score: 1,
    costStatus: "비용 통과",
    sampleConfidence: "충분",
    sampleConfidenceDetail: "",
    robustnessStatus: "안정 통과",
    overfittingRisk: "낮음",
    eligibilityStatus: "추천 가능",
    recommendable: true,
    finalRecommendable: true,
    registrationState: "not_registered",
    registeredStrategyId: null,
    rankReason: "score",
    leverageLabel: "1x",
    movementReasonKo: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("pattern combination validation", () => {
  it("allows auto combo with empty selection", () => {
    expect(
      validatePatternCombination([], { autoStrategyCombo: true }),
    ).toEqual([]);
  });

  it("blocks empty manual selection", () => {
    const errors = validatePatternCombination([], {
      autoStrategyCombo: false,
    });
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(true);
  });

  it("blocks unknown space ids", () => {
    const errors = validatePatternCombination(["not_a_space"], {
      autoStrategyCombo: false,
    });
    expect(errors[0]?.message).toContain("지원하지 않는");
  });

  it("allows multi-pattern + SafeV44", () => {
    expect(
      validatePatternCombination(
        ["ema_core", "order_block", "fvg", "trendline", "support_resistance"],
        { autoStrategyCombo: false },
      ),
    ).toEqual([]);
  });

  it("form validation includes pattern selection when manual", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = false;
    form.selectedSpaceIds = [];
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(true);
  });
});

describe("search space catalog includes patterns", () => {
  it("ALL_SEARCH_SPACES includes four pattern families", () => {
    const ids = new Set(ALL_SEARCH_SPACES.map((s) => s.id));
    for (const id of [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe("Top-10 movement evidence reasons", () => {
  it("uses Phase 10 Korean movement shorts", () => {
    expect(rankChangeLabelShort("신규 진입")).toBe("신규");
    expect(rankChangeLabelShort("순위 상승")).toBe("상승");
    expect(rankChangeLabelShort("순위 하락")).toBe("하락");
    expect(rankChangeLabelShort("순위 유지")).toBe("유지");
  });

  it("derives 수익 개선 from return evidence", () => {
    const reason = movementReasonForChange({
      change: "순위 상승",
      previousRank: 5,
      currentRank: 2,
      previousEntry: stubEntry({
        strategyHash: "h1",
        rank: 5,
        netReturn: 0.05,
      }),
      currentEntry: stubEntry({
        strategyHash: "h1",
        rank: 2,
        netReturn: 0.12,
      }),
    });
    expect(reason).toBe("수익 개선");
  });

  it("marks new entries as 더 강한 후보 진입", () => {
    expect(
      movementReasonForChange({
        change: "신규 진입",
        previousRank: null,
        currentRank: 1,
      }),
    ).toBe("더 강한 후보 진입");
  });

  it("marks non-recommendable exit as 적격성 상실", () => {
    expect(
      movementReasonForChange({
        change: "TOP 10 제외",
        previousRank: 3,
        currentRank: null,
        previousEntry: stubEntry({
          strategyHash: "h2",
          rank: 3,
          recommendable: false,
        }),
      }),
    ).toBe("적격성 상실");
  });
});
