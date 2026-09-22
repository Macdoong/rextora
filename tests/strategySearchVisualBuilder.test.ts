import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  HISTORICAL_PERIOD_PRESETS,
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  QUALIFICATION_PROFILES,
  SEARCH_DEPTH_PROFILES,
  SEARCHABLE_SPACE_OPTIONS,
  TRADING_STYLE_MAP,
  datesForPeriodPreset,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  autoPresetEngineValues,
  autoPresetVisualDims,
} from "../components/rextora/strategySearch/visual/autoPresetVisual";
import {
  COST_STRESS_SUMMARY,
  DIRECT_LAYER_IDS,
  PREVIEW_ENTRY_RULE,
  PREVIEW_STOP_ATR,
  PREVIEW_STOP_RULE,
  PREVIEW_TP_ATR,
  PREVIEW_TP_RULE,
  periodPresetHint,
  timeframeCandleHint,
  visibleDirectLayerIds,
  visualSpaceIdsForDirectMode,
} from "../components/rextora/strategySearch/visual/searchVisualCopy";
import { catalogDefaultsForPatternFamily } from "../src/lib/rextora/patternParameterCatalog";
import {
  resolvePatternSelectionMode,
  selectedSpaceIdsForSelectionMode,
} from "../src/lib/rextora/patternSelectionMode";

const UI_DIR = path.join(
  process.cwd(),
  "components",
  "rextora",
  "strategySearch",
);

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

function redesignedUiSources(): string {
  return [
    "JobCreateForm.tsx",
    "visual/StrategySearchVisualBuilder.tsx",
    "visual/StrategySearchModeSelector.tsx",
    "visual/StrategyAutoPresetPanel.tsx",
    "visual/StrategyPatternLayerPanel.tsx",
    "visual/StrategyTradeRulePanel.tsx",
    "visual/StrategySearchScopeMap.tsx",
    "visual/searchScopeVisual.ts",
    "visual/ScopeCardVisuals.tsx",
    "visual/SearchFamilyGlyph.tsx",
    "visual/StrategyVisualPreview.tsx",
    "visual/searchVisualCopy.ts",
    "visual/autoPresetVisual.ts",
  ]
    .map((file) => readUi(file))
    .join("\n");
}

describe("Strategy Search visual builder", () => {
  it("uses the canonical supported symbol source for the dropdown", () => {
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).toContain("OPERATOR_SUPPORTED_SYMBOLS");
    expect(builder).toContain('data-testid="ss-symbols"');
    expect(OPERATOR_SUPPORTED_SYMBOLS).toContain("BTCUSDT");
    expect(OPERATOR_SUPPORTED_SYMBOLS).not.toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    const form = createDefaultOperatorFormState();
    expect(form.symbol).toBe("BTCUSDT");
    form.symbol = "ETHUSDT";
    expect(operatorFormToCreateBody(form).symbols).toEqual(["ETHUSDT"]);
  });

  it("timeframe selection updates form serialization and uses real values only", () => {
    expect([...OPERATOR_SUPPORTED_TIMEFRAMES]).toEqual([
      "1m",
      "3m",
      "5m",
      "15m",
      "1h",
    ]);
    expect(timeframeCandleHint("15m")).toBe("캔들 1개 = 15분");
    expect(timeframeCandleHint("1h")).toBe("캔들 1개 = 1시간");
    expect(timeframeCandleHint("4h")).toBe("");
    const form = createDefaultOperatorFormState();
    expect(form.timeframe).toBe("15m");
    form.timeframe = "1h";
    expect(operatorFormToCreateBody(form).timeframe).toBe("1h");
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).toContain("OPERATOR_SUPPORTED_TIMEFRAMES");
    expect(builder).toContain('data-testid="ss-timeframe"');
    expect(builder).toContain("ss-timeframe-hint");
  });

  it("analysis-period selection updates form dates from canonical presets", () => {
    expect(HISTORICAL_PERIOD_PRESETS.standard).toEqual({
      labelKo: "표준 (60일)",
      days: 60,
    });
    expect(periodPresetHint("standard")).toBe("최근 60일 데이터로 검증");
    expect(periodPresetHint("short")).toBe("최근 30일 데이터로 검증");
    const form = createDefaultOperatorFormState();
    expect(form.periodPreset).toBe("standard");
    const longDates = datesForPeriodPreset("long");
    form.periodPreset = "long";
    form.availableFromDate = longDates.from;
    form.availableToDate = longDates.to;
    const body = operatorFormToCreateBody(form);
    expect(body.dataRef.availableFrom).toBeDefined();
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).toContain("HISTORICAL_PERIOD_PRESETS");
    expect(builder).toContain('data-testid="ss-period"');
  });

  it("automatic/manual resolved mode matches family-control lock source", () => {
    const formSrc = readUi("JobCreateForm.tsx");
    expect(formSrc).toContain("resolvePatternSelectionMode");
    expect(formSrc).toContain("selectionLocked");
    expect(formSrc).toContain("disabled={selectionLocked}");
    expect(formSrc).toContain('data-selection-mode={resolvedSelectionMode}');
    expect(formSrc).toContain("applySearchMode");

    const mismatched = createDefaultOperatorFormState();
    mismatched.autoStrategyCombo = false;
    mismatched.patternConfigLevel = "automatic";
    mismatched.selectedSpaceIds = ["order_block", "fvg"];
    expect(resolvePatternSelectionMode(mismatched)).toBe("automatic");
    const leaked = operatorFormToCreateBody(mismatched);
    expect(leaked.operatorPlan?.patternSelectionMode).toBe("automatic");
    expect(leaked.operatorPlan?.selectedSpaceIds).toBeNull();
  });

  it("manual selected spaces still serialize and automatic does not leak them", () => {
    const automatic = createDefaultOperatorFormState();
    automatic.selectedSpaceIds = ["order_block", "ema_core"];
    expect(resolvePatternSelectionMode(automatic)).toBe("automatic");
    expect(
      selectedSpaceIdsForSelectionMode(
        "automatic",
        automatic.selectedSpaceIds,
      ),
    ).toBeNull();
    expect(operatorFormToCreateBody(automatic).operatorPlan?.selectedSpaceIds).toBeNull();

    const manual = createDefaultOperatorFormState();
    manual.autoStrategyCombo = false;
    manual.patternConfigLevel = "basic";
    manual.selectedSpaceIds = ["order_block", "fvg"];
    expect(resolvePatternSelectionMode(manual)).toBe("manual");
    const body = operatorFormToCreateBody(manual);
    expect(body.operatorPlan?.patternSelectionMode).toBe("manual");
    expect(body.operatorPlan?.selectedSpaceIds).toEqual([
      "order_block",
      "fvg",
    ]);
  });

  it("redesigned Strategy Search surface has no user-facing SafeV44 labels", () => {
    const ui = redesignedUiSources();
    expect(ui).not.toMatch(/SafeV44/);
    expect(SEARCHABLE_SPACE_OPTIONS.find((s) => s.id === "full_safe")?.labelKo).toBe(
      "통합 기술 전략",
    );
    const rendered = [
      "JobCreateForm.tsx",
      "visual/StrategySearchVisualBuilder.tsx",
      "visual/StrategySearchModeSelector.tsx",
      "visual/StrategyAutoPresetPanel.tsx",
      "visual/StrategyPatternLayerPanel.tsx",
      "visual/StrategyTradeRulePanel.tsx",
      "visual/StrategySearchScopeMap.tsx",
      "visual/ScopeCardVisuals.tsx",
      "visual/SearchFamilyGlyph.tsx",
      "visual/StrategyVisualPreview.tsx",
      "visual/searchVisualCopy.ts",
      "visual/autoPresetVisual.ts",
    ]
      .map((file) => readUi(file))
      .join("\n");
    expect(rendered).not.toMatch(/SAFE 종합/);
    const mapping = readUi("visual/searchScopeVisual.ts");
    expect(mapping).toContain('"SAFE 종합": "full_safe"');
  });

  it("keeps proven cost-stress arithmetic and copy", () => {
    const form = createDefaultOperatorFormState();
    expect(Number(form.stressFeeMultiplier)).toBe(1.5);
    expect(Number(form.stressSlippageMultiplier)).toBe(1.5);
    const scenario = operatorFormToCreateBody(form).costStressScenarios?.[0];
    expect(scenario?.feeMultiplier).toBe(1.5);
    expect(scenario?.slippageMultiplier).toBe(1.5);
    expect(scenario?.spreadMultiplier).toBe(1.5);
    expect(scenario?.fundingMultiplier).toBe(1);
    expect(COST_STRESS_SUMMARY).toBe(
      "수수료 1.5× · 슬리피지 1.5× · 스프레드 1.5×",
    );
    const formSrc = readUi("JobCreateForm.tsx");
    expect(formSrc).toContain("COST_STRESS_LABEL");
    expect(formSrc).not.toContain("ss-spread-stress");
  });

  it("keeps existing pattern-family internal ids in the visual layer cards", () => {
    const copy = readUi("visual/searchVisualCopy.ts");
    expect(copy).toContain('id: "order_block"');
    expect(copy).toContain('id: "fvg"');
    expect(copy).toContain('id: "ema_core"');
    expect(copy).toContain('id: "support_resistance"');
    expect(copy).toContain('id: "trendline"');
    expect(copy).toContain('id: "supply_demand"');
    const layers = readUi("visual/StrategyPatternLayerPanel.tsx");
    expect(layers).toContain("DIRECT_LAYER_OPTIONS");
    expect(layers).toContain("ss-layer-${layer.id}");
    const preview = readUi("visual/StrategyVisualPreview.tsx");
    expect(preview).toContain("전략 구조 미리보기");
    expect(preview).toContain("현재 시세가 아닙니다");
  });

  it("renders the visual builder on the main workbench, not inside a drawer", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    const page = fs.readFileSync(
      path.join(process.cwd(), "app", "strategy-search", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("StrategySearchWorkbench");
    expect(workbench).toContain("ss-visual-builder-host");
    expect(workbench).toContain("<JobCreateForm");
    expect(workbench).not.toContain("V3Drawer");
    expect(workbench).not.toContain("activeJobSummary");
    expect(workbench).not.toContain("탐색 구성");
    const createIdx = workbench.indexOf("{createForm}");
    const statusIdx = workbench.indexOf("ss-sticky-status-header");
    expect(createIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(createIdx);
    const form = readUi("JobCreateForm.tsx");
    expect(form).toContain("StrategySearchVisualBuilder");
    expect(form).toContain("ss-legacy-details");
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).not.toContain("StrategyHelpTooltip");
    expect(builder).toContain("StrategySearchScopeMap");
    expect(builder).not.toContain("StrategyVisualPreview");
    expect(builder).not.toContain("ss-strategy-preview");
    const layers = readUi("visual/StrategyPatternLayerPanel.tsx");
    expect(layers).toContain("StrategyHelpTooltip");
  });

  it("derives automatic profile visuals from source-proven depth and qualification fields", () => {
    expect(TRADING_STYLE_MAP.stable).toEqual({
      qualification: "conservative",
      depth: "deep",
    });
    expect(TRADING_STYLE_MAP.balanced).toEqual({
      qualification: "balanced",
      depth: "standard",
    });
    expect(TRADING_STYLE_MAP.scalping).toEqual({
      qualification: "aggressive",
      depth: "fast",
    });
    const stable = autoPresetEngineValues("stable");
    expect(stable.candidateBudget).toBe(
      SEARCH_DEPTH_PROFILES.deep.candidateBudget,
    );
    expect(stable.stageBatchSize).toBe(
      SEARCH_DEPTH_PROFILES.deep.stageBatchSize,
    );
    expect(stable.maxMddAbs).toBe(QUALIFICATION_PROFILES.conservative.maxMddAbs);
    expect(stable.minTradeCount).toBe(
      QUALIFICATION_PROFILES.conservative.minTradeCount,
    );
    const dims = autoPresetVisualDims("scalping");
    expect(dims.map((item) => item.key)).toEqual([
      "candidateBudget",
      "stageBatchSize",
      "maxMddAbs",
    ]);
    expect(dims[0]?.valueLabel).toBe(
      `${SEARCH_DEPTH_PROFILES.fast.candidateBudget}개`,
    );
    const visual = readUi("visual/autoPresetVisual.ts");
    expect(visual).toContain("SEARCH_DEPTH_PROFILES");
    expect(visual).toContain("QUALIFICATION_PROFILES");
    expect(visual).toContain("TRADING_STYLE_MAP");
    expect(visual).not.toMatch(/위험 1\/3|빠른 단타/);
    const css = fs.readFileSync(
      path.join(process.cwd(), "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain("ss-visual-workspace");
    expect(css).toContain("minmax(280px, 32%)");
    expect(css).toContain("ss-scope-map");
  });

  it("scopes Direct Strategy selected spaces to the six visible chart layers", () => {
    const defaults = createDefaultOperatorFormState();
    expect(visualSpaceIdsForDirectMode(defaults.selectedSpaceIds)).toEqual(
      DIRECT_LAYER_IDS,
    );
    expect(
      visualSpaceIdsForDirectMode(["order_block", "fvg"]),
    ).toEqual(["order_block", "fvg"]);
    expect(visibleDirectLayerIds(defaults.selectedSpaceIds)).toEqual([
      "ema_core",
    ]);
    const formSrc = readUi("JobCreateForm.tsx");
    expect(formSrc).toContain("visualSpaceIdsForDirectMode");
    expect(formSrc).toContain("visibleDirectLayerIds");
    expect(formSrc).toContain("mergeDirectVisualSpaceIds");
  });

  it("keeps isolated preview relative and does not render it on Strategy Search", () => {
    const catalog = catalogDefaultsForPatternFamily("order_block");
    expect(PREVIEW_STOP_ATR).toBe(Number(catalog.stopAtrMult));
    expect(PREVIEW_TP_ATR).toBe(Number(catalog.tpAtrMult));
    expect(PREVIEW_ENTRY_RULE).toBe("패턴 구간");
    expect(PREVIEW_STOP_RULE).toBe(`진입 기준 − ${PREVIEW_STOP_ATR} ATR`);
    expect(PREVIEW_TP_RULE).toBe(`${PREVIEW_TP_ATR.toFixed(1)} ATR`);
    const preview = readUi("visual/StrategyVisualPreview.tsx");
    expect(preview).toContain("ss-strategy-preview");
    expect(preview).not.toContain("100.8");
    expect(preview).not.toContain("99.2");
    expect(preview).not.toContain("103.4");
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).not.toContain("StrategyVisualPreview");
    expect(builder).not.toMatch(/entryPrice|stopPrice|takeProfitPrice/);
    const formSrc = readUi("JobCreateForm.tsx");
    expect(formSrc).not.toContain("StrategyVisualPreview");
    const rules = readUi("visual/StrategyTradeRulePanel.tsx");
    expect(rules).not.toContain("PREVIEW_ENTRY_RULE");
    expect(rules).not.toContain("손절");
    expect(rules).not.toContain("익절");
    const form = createDefaultOperatorFormState();
    const body = operatorFormToCreateBody(form);
    expect(JSON.stringify(body)).not.toMatch(/100\.8|99\.2|103\.4/);
    expect(form.patternDirection).toBe("both");
  });
});
