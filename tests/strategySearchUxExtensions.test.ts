import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVALUATION_PIPELINE_STAGES,
  evaluationPipelineStageLabelKo,
  mapEngineStageToPipelineId,
} from "../components/rextora/strategySearch/formatters";
import {
  countLibraryCategories,
  filterLibraryStrategies,
  libraryCategoryOf,
  LIBRARY_CATEGORY_LABELS,
} from "../components/rextora/results/libraryFilterUtils";
import { validatePatternCombination } from "../components/rextora/strategySearch/formValidation";
import { SEARCHABLE_PATTERN_SPACE_OPTIONS } from "../components/rextora/strategySearch/formDefaults";

describe("12-stage evaluation pipeline", () => {
  it("defines exactly 12 operator-facing stages", () => {
    expect(EVALUATION_PIPELINE_STAGES).toHaveLength(12);
    expect(EVALUATION_PIPELINE_STAGES.map((s) => s.id)).toEqual([
      "market_data",
      "strategy_generation",
      "base_backtest",
      "qualification_gate",
      "cost_stress",
      "trade_stability",
      "overfitting",
      "weakness_analysis",
      "search_improvement",
      "clustering",
      "top10_selection",
      "persistence",
    ]);
  });

  it("uses updated Korean labels (not legacy 9-stage names)", () => {
    expect(evaluationPipelineStageLabelKo("strategy_generation")).toBe("전략 생성");
    expect(evaluationPipelineStageLabelKo("top10_selection")).toBe("TOP 10 선정");
    expect(evaluationPipelineStageLabelKo("qualification_gate")).toBe(
      "조건 탈락 판정",
    );
    expect(EVALUATION_PIPELINE_STAGES.map((s) => s.labelKo)).not.toContain(
      "전략 후보 생성",
    );
    expect(EVALUATION_PIPELINE_STAGES.map((s) => s.labelKo)).not.toContain(
      "추천 판정",
    );
  });

  it("maps legacy engine stage ids to new pipeline ids", () => {
    expect(mapEngineStageToPipelineId("candidate_generation")).toBe(
      "strategy_generation",
    );
    expect(mapEngineStageToPipelineId("recommendation")).toBe("top10_selection");
    expect(mapEngineStageToPipelineId("weakness_analysis")).toBe(
      "weakness_analysis",
    );
    expect(mapEngineStageToPipelineId("mutation")).toBe("search_improvement");
  });

  it("SearchStatusCard uses beginner narrative labels", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/SearchStatusCard.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("현재 AI 작업");
    expect(src).toContain("최근 발견한 약점");
    expect(src).toContain("적용한 개선");
    expect(src).toContain("다음 단계");
    expect(src).not.toContain("다음 예정 단계");
    expect(src).not.toContain("왜 다음 전략을 생성하는지");
  });
});

describe("library filter utils", () => {
  it("classifies review vs backtested vs lifecycle categories", () => {
    expect(
      libraryCategoryOf({
        id: "a",
        lastBacktest: null,
      }),
    ).toBe("review");
    expect(
      libraryCategoryOf({
        id: "b",
        lastBacktest: { totalReturn: 0.1 },
      }),
    ).toBe("backtested");
    expect(
      libraryCategoryOf({
        id: "c",
        paperActive: true,
        lastBacktest: { totalReturn: 0.1 },
      }),
    ).toBe("paper");
  });

  it("counts every filter bucket including current research", () => {
    const counts = countLibraryCategories(
      [
        { id: "s1", description: "sourceResearchJobId=job_a" },
        { id: "s2", lastBacktest: { totalReturn: 0.1 } },
        { id: "s3" },
        { id: "SAFE_v44_i4060" },
      ],
      {
        selectedJobId: "job_a",
        parseSourceResearchJobId: (d) =>
          d?.match(/sourceResearchJobId=([^\s·]+)/)?.[1] ?? null,
      },
    );
    expect(counts.all).toBe(3);
    expect(counts.newest).toBe(3);
    expect(counts.current).toBe(1);
    expect(counts.backtested).toBe(1);
    expect(counts.review).toBe(2);
    expect(counts.safe).toBe(1);
    expect(LIBRARY_CATEGORY_LABELS.all).toBe("전체");
    expect(LIBRARY_CATEGORY_LABELS.newest).toBe("최신");
    expect(LIBRARY_CATEGORY_LABELS.recommended).toBe("추천");
    expect(LIBRARY_CATEGORY_LABELS.backtested).toBe("백테스트 완료");
  });

  it("sorts newest by createdAt descending", () => {
    const rows = filterLibraryStrategies(
      [
        { id: "old", createdAt: "2024-01-01T00:00:00.000Z" },
        { id: "new", createdAt: "2025-06-01T00:00:00.000Z" },
        { id: "SAFE_v44_i4060" },
      ],
      "newest",
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("validatePatternCombination", () => {
  it("requires at least one space when manual selection", () => {
    const errors = validatePatternCombination([]);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(true);
  });

  it("allows SafeV44 mixed with pattern families", () => {
    const errors = validatePatternCombination(["full_safe", "order_block", "fvg"]);
    expect(errors).toHaveLength(0);
  });

  it("blocks unknown pattern ids", () => {
    const errors = validatePatternCombination(["full_safe", "unknown_pattern_x"]);
    expect(errors.some((e) => e.message.includes("unknown_pattern_x"))).toBe(
      true,
    );
  });

  it("skips validation when autoStrategyCombo is enabled", () => {
    expect(
      validatePatternCombination([], { autoStrategyCombo: true }),
    ).toHaveLength(0);
  });

  it("exposes all five pattern families in form defaults", () => {
    const ids = SEARCHABLE_PATTERN_SPACE_OPTIONS.map((p) => p.id);
    expect(ids).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
      "supply_demand",
    ]);
  });
});

describe("lifecycle next actions panel", () => {
  it("renders evidence-gated lifecycle strings", () => {
    const panel = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/LifecycleNextActionsPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("백테스트 실행");
    expect(panel).toContain("TOP 3 비교");
    expect(panel).toContain("모의매매");
    expect(panel).toContain("실전매매");
    expect(panel).toContain("모의매매 검증 전에는 실전매매");
    expect(panel).toContain("ss-lifecycle-next-actions");

    const completion = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
      ),
      "utf8",
    );
    expect(completion).toContain("LifecycleNextActionsPanel");
  });
});
