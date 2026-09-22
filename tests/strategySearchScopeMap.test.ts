import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  SEARCHABLE_SPACE_OPTIONS,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  AUTOMATIC_SEARCH_SPACE_IDS,
  costStressChannelLines,
  periodScopeLabel,
  qualificationTargetCopy,
  searchFamilyLabelKo,
  timeframeBarLabel,
  topResultCopy,
  visualizedAutomaticSpaceIds,
  visualizedManualSpaceIds,
  visualizedSearchSpaceIds,
} from "../components/rextora/strategySearch/visual/searchScopeVisual";
import {
  DIRECT_AUTOMATIC_ONLY_SPACE_IDS,
  DIRECT_LAYER_IDS,
  mergeDirectVisualSpaceIds,
} from "../components/rextora/strategySearch/visual/searchVisualCopy";
import { SEARCH_DEPTH_PROFILES } from "../src/lib/rextora/strategySearch/operatorProfiles";

const UI_DIR = path.join(
  process.cwd(),
  "components",
  "rextora",
  "strategySearch",
);

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

describe("Strategy Search scope visualizer", () => {
  it("does not render the illustrative candlestick chart on the Search page", () => {
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    const form = readUi("JobCreateForm.tsx");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(builder).toContain("StrategySearchScopeMap");
    expect(builder).not.toContain("StrategyVisualPreview");
    expect(form).not.toContain("StrategyVisualPreview");
    expect(workbench).not.toContain("StrategyVisualPreview");
    expect(builder).not.toContain("ss-strategy-preview");
  });

  it("derives market scope from canonical symbol, timeframe, and period", () => {
    expect(timeframeBarLabel("15m")).toBe("15분봉");
    expect(periodScopeLabel("standard")).toBe("60일 검증");
    const form = createDefaultOperatorFormState();
    expect(form.symbol).toBe("BTCUSDT");
    expect(form.timeframe).toBe("15m");
    expect(form.periodPreset).toBe("standard");
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).toContain("ss-scope-symbol");
    expect(map).toContain("ss-scope-timeframe");
    expect(map).toContain("ss-scope-period");
    expect(map).toContain("form.symbol");
    expect(map).toContain("form.timeframe");
    expect(map).toContain("periodScopeLabel(form.periodPreset)");
  });

  it("visualizes actual automatic search spaces from the depth profile source", () => {
    expect(visualizedAutomaticSpaceIds()).toEqual([
      "ema_core",
      "rsi_pullback",
      "breakout",
      "risk_exits",
      "full_safe",
    ]);
    expect([...AUTOMATIC_SEARCH_SPACE_IDS]).toEqual(
      SEARCH_DEPTH_PROFILES.standard.spaceIds,
    );
    expect([...AUTOMATIC_SEARCH_SPACE_IDS]).toEqual(
      SEARCH_DEPTH_PROFILES.fast.spaceIds,
    );
    expect([...AUTOMATIC_SEARCH_SPACE_IDS]).toEqual(
      SEARCH_DEPTH_PROFILES.deep.spaceIds,
    );
    expect(searchFamilyLabelKo("ema_core")).toBe("EMA / 추세 추종");
    expect(searchFamilyLabelKo("rsi_pullback")).toBe("RSI / 되돌림");
    expect(searchFamilyLabelKo("breakout")).toBe("변동성 돌파");
    expect(searchFamilyLabelKo("risk_exits")).toBe("ATR 위험 관리");
    expect(searchFamilyLabelKo("full_safe")).toBe("통합 기술 전략");
    expect(SEARCHABLE_SPACE_OPTIONS.map((space) => space.id)).toEqual(
      visualizedAutomaticSpaceIds(),
    );
  });

  it("visualizes manual selectedSpaceIds without leaking automatic-only ids", () => {
    const selected = ["order_block", "fvg", "risk_exits", "rsi_pullback"];
    expect(visualizedManualSpaceIds(selected)).toEqual([
      "order_block",
      "fvg",
      "risk_exits",
    ]);
    expect(visualizedSearchSpaceIds({ automatic: false, selectedSpaceIds: selected })).not.toContain(
      "rsi_pullback",
    );
    expect(visualizedSearchSpaceIds({ automatic: false, selectedSpaceIds: selected })).not.toContain(
      "breakout",
    );
    expect(visualizedSearchSpaceIds({ automatic: false, selectedSpaceIds: selected })).not.toContain(
      "full_safe",
    );
    const merged = mergeDirectVisualSpaceIds(selected, ["order_block", "ema_core"]);
    expect(merged).toContain("risk_exits");
    expect(merged).not.toContain("rsi_pullback");
    expect([...DIRECT_LAYER_IDS]).toEqual([
      "order_block",
      "fvg",
      "ema_core",
      "support_resistance",
      "trendline",
      "supply_demand",
    ]);
    expect([...DIRECT_AUTOMATIC_ONLY_SPACE_IDS]).toEqual([
      "rsi_pullback",
      "breakout",
      "full_safe",
    ]);
  });

  it("keeps qualification as a progress target and does not auto-stop", () => {
    const form = createDefaultOperatorFormState();
    expect(form.stopWhenQualifiedTarget).toBe(false);
    expect(operatorFormToCreateBody(form).operatorPlan?.stopWhenQualifiedTarget).toBe(
      false,
    );
    const copy = qualificationTargetCopy(form);
    expect(copy.target).toBe(3);
    expect(copy.title).toBe("목표 합격 후보 3개");
    expect(copy.hint).toContain("자동 종료 조건이 아닙니다");
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).toContain("qualification.title");
    expect(map).toContain("qualification.hint");
    const formSrc = readUi("JobCreateForm.tsx");
    expect(formSrc).not.toContain("ss-stop-when-qualified");
    expect(formSrc).toContain("진행 상황을 확인하기 위한 목표이며 자동 종료 조건이 아닙니다.");
  });

  it("exposes currently applied cost channels without changing arithmetic", () => {
    const form = createDefaultOperatorFormState();
    expect(form.applySpread).toBe(true);
    expect(form.applyFunding).toBe(false);
    expect(costStressChannelLines(form).lines).toEqual([
      "수수료 1.5×",
      "슬리피지 1.5×",
      "스프레드 1.5×",
    ]);
    const body = operatorFormToCreateBody(form);
    expect(body.costStressScenarios?.[0]?.feeMultiplier).toBe(1.5);
    expect(body.costStressScenarios?.[0]?.slippageMultiplier).toBe(1.5);
    expect(body.costStressScenarios?.[0]?.spreadMultiplier).toBe(1.5);
    expect(body.costStressScenarios?.[0]?.fundingMultiplier).toBe(1);
    expect(body.baseCostConfig?.applySpread).toBe(true);
    expect(body.baseCostConfig?.applyFunding).toBe(false);
  });

  it("does not invent TOP candidate scores and keeps idle copy", () => {
    expect(topResultCopy(null).detail).toBe(
      "탐색 후 통과한 후보가 여기에 연결됩니다.",
    );
    expect(topResultCopy({ status: "running", qualifiedCount: 2, top10Count: 2 }).detail).toBe(
      "통과 후보 2개 · TOP10 2개",
    );
    expect(
      topResultCopy({
        status: "running",
        qualifiedCount: 185,
        top10Count: 0,
      }).detail,
    ).toBe("통과 후보 185개 · 상위 후보 준비 중");
    expect(
      topResultCopy({
        status: "running",
        qualifiedCount: 185,
        top10Count: 0,
      }).detail,
    ).not.toContain("TOP10 10개");
    expect(
      topResultCopy({ status: "running", qualifiedCount: 185, top10Count: 3 })
        .detail,
    ).toBe("통과 후보 185개 · TOP10 3개");
    expect(topResultCopy({ status: "completed", qualifiedCount: 3, top10Count: 10 }).detail).toBe(
      "통과 후보 3개 · 결과 10개",
    );
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).not.toMatch(/별점|위험 점수|기회 점수/);
    expect(map).toContain("파라미터 조합 생성");
    expect(map).toContain("MarketScopeVisual");
    expect(map).toContain("CandidateBranchVisual");
  });

  it("does not claim Strategy Search is a strategy authoring tool", () => {
    const mode = readUi("visual/StrategySearchModeSelector.tsx");
    const form = readUi("JobCreateForm.tsx");
    expect(mode).toContain("탐색 범위 직접 선택");
    expect(mode).toContain("후보 생성과 검증은 Rextora가");
    expect(form).toContain("선택 범위로 탐색 시작");
    expect(form).not.toContain("직접 전략 탐색 시작");
    expect(form).toContain("고급 탐색 조건");
    expect(form).not.toContain("전략 작성");
    expect(searchFamilyLabelKo("full_safe")).not.toMatch(/SAFE|SafeV44/);
  });

  it("keeps every scope-stage visual inside a contained alignment slot", () => {
    const visuals = readUi("visual/ScopeCardVisuals.tsx");
    expect(visuals).toContain('className="ss-scope-visual-slot"');
    expect(visuals).toContain("export function CandidateBranchVisual");
    expect(visuals).toContain('viewBox="0 0 40 40"');
    expect(visuals).not.toMatch(/-ml-\[/);
    expect(visuals).not.toMatch(/translateX\(\s*-/);
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).toContain("ss-scope-card--visual");
    expect(map).toContain("파라미터 조합 생성");
    expect(map.match(/ss-scope-card--visual/g)?.length).toBe(7);
  });
});
