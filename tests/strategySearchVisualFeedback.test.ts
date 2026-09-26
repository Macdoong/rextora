import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  SEARCHABLE_SPACE_OPTIONS,
} from "../components/rextora/strategySearch/formDefaults";
import { autoPresetDepthOrdinal } from "../components/rextora/strategySearch/visual/autoPresetVisual";
import {
  mergeDirectVisualSpaceIds,
  DIRECT_SUPPLEMENTAL_SPACE_IDS,
} from "../components/rextora/strategySearch/visual/searchVisualCopy";
import {
  costStressChannelLines,
  familyProgressState,
  liveEvaluatedCount,
  liveTop10EmptyPresentation,
  presentSearchFamilyLabelKo,
  qualificationFillRatio,
  resolveLaunchPanelState,
  resolveRunningProgressVisual,
  runtimeUtilizationPct,
  topResultCopy,
} from "../components/rextora/strategySearch/visual/searchScopeVisual";

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "components", "rextora", "strategySearch");
const CSS = path.join(ROOT, "components", "rextora", "v3", "strategy-search.css");

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search visual feedback", () => {
  it("redesigns the launch panel for readable contrast and keeps the primary CTA", () => {
    const form = readUi("JobCreateForm.tsx");
    expect(form).toContain('data-testid="ss-launch-panel"');
    expect(form).toContain('data-contrast="readable"');
    expect(form).toContain("탐색 준비 완료");
    expect(form).toContain("예상 최대 시간");
    expect(form).toContain("formatRuntimeKo(");
    expect(form).toContain("form.maxRuntimeMinutesOverride");
    expect(form).toContain("추천 패턴을 자동으로 조합");
    expect(form).toContain('data-testid="ss-create-submit"');
    expect(form).toContain("className=\"ss-btn-primary\"");
    expect(form).toContain("탐색 시작");
    const launchSlice = form.slice(
      form.indexOf("ss-launch-panel"),
      form.indexOf("ss-create-submit") + 80,
    );
    expect(launchSlice).not.toContain("text-slate-100");
    expect(launchSlice).not.toContain("text-slate-200");
    expect(form).not.toContain("설정을 확인한 뒤 자동 탐색을 시작합니다.");
    const css = fs.readFileSync(CSS, "utf8");
    expect(css).toContain(".ss-launch-panel");
    expect(css).toContain("background: #fff !important");
    expect(css).toContain("color: var(--v3-text-primary)");
    expect(css).toContain(".ss-launch-ready");
    expect(css).toContain("color: var(--v3-success)");
  });

  it("exposes meaningful source-backed visuals on every scope card", () => {
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).toContain("MarketScopeVisual");
    expect(map).toContain("FamilyNetworkVisual");
    expect(map).toContain("CandidateBranchVisual");
    expect(map).toContain("HistoryScanVisual");
    expect(map).toContain("CostChannelVisual");
    expect(map).toContain("QualificationTargetVisual");
    expect(map).toContain("TopResultVisual");
    expect(map).toContain("SearchFamilyGlyph");
    expect(map).toContain("form.symbol");
    expect(map).toContain("form.timeframe");
    expect(map).toContain("periodScopeDays(form.periodPreset)");
    expect(map).toContain("familyIds.length");
    expect(map).toContain("costStressChannels(form)");
    expect(map).toContain("qualification.target");
    expect(map).toContain("progress?.qualifiedCount");
    expect(map).toContain("progress?.top10Count");
    expect(map).not.toMatch(/별점|위험 점수|기회 점수/);
    const visuals = readUi("visual/ScopeCardVisuals.tsx");
    expect(visuals).toContain('data-scope-visual="market"');
    expect(visuals).toContain('data-scope-visual="families"');
    expect(visuals).toContain('data-scope-visual="candidates"');
    expect(visuals).toContain('data-scope-visual="history"');
    expect(visuals).toContain('data-scope-visual="cost"');
    expect(visuals).toContain('data-scope-visual="qualification"');
    expect(visuals).toContain('data-scope-visual="top"');
  });

  it("does not present elapsed/maxRuntime as search completion percentage", () => {
    const threeHours = 3 * 60 * 60 * 1000;
    expect(
      resolveRunningProgressVisual({
        status: "running",
        progressRatio: 0.24,
        maxRuntimeMs: threeHours,
        overallProgressPct: 24,
      }),
    ).toEqual({
      running: true,
      mode: "indeterminate",
      percent: null,
      denominator: null,
    });
    expect(
      runtimeUtilizationPct({
        status: "running",
        progressRatio: 0.24,
        maxRuntimeMs: threeHours,
      }),
    ).toBe(24);
    expect(
      runtimeUtilizationPct({
        status: "running",
        uniqueEvaluatedCount: 1348,
      }),
    ).toBeNull();
    const ring = readUi("visual/ScopeCardVisuals.tsx");
    expect(ring).toContain('data-progress-mode="indeterminate"');
    expect(ring).toContain('aria-label="탐색 진행 중"');
    expect(ring).toContain('role="status"');
    expect(ring).not.toContain("aria-valuenow");
    expect(ring).not.toContain("탐색 진행률");
    expect(ring).not.toContain("완료율");
    expect(ring).not.toContain("후보 평가 진행률");
    expect(ring).toContain("최대 실행시간 사용률");
    expect(ring).toContain("liveEvaluatedCount(progress)");
    expect(ring).not.toContain("${visual.percent}%");
    const status = readUi("SearchStatusCard.tsx");
    expect(status).toContain("최대 실행시간 사용률");
    expect(status).not.toContain('label="탐색 진행"');
    expect(status).not.toContain('"탐색 진행 "');
  });

  it("hides the start CTA while a job is running and keeps it when idle", () => {
    expect(resolveLaunchPanelState({ status: "running" })).toBe("running");
    expect(resolveLaunchPanelState({ status: "paused" })).toBe("paused");
    expect(resolveLaunchPanelState({ status: "cancel_requested" })).toBe(
      "stopping",
    );
    expect(resolveLaunchPanelState({ status: "cancelling" })).toBe("stopping");
    expect(resolveLaunchPanelState({ status: "completed" })).toBe("ready");
    expect(resolveLaunchPanelState(null)).toBe("ready");
    const form = readUi("JobCreateForm.tsx");
    expect(form).toContain('data-launch-state={launchState}');
    expect(form).toContain("탐색 실행 중");
    expect(form).toContain("탐색 일시정지");
    expect(form).toContain("중지 요청 중");
    expect(readUi("formatters.ts")).toContain(
      "안전하게 탐색을 종료하고 있습니다.",
    );
    expect(form).toContain('{launchState === "ready" ? (');
    expect(form).toContain('data-testid="ss-create-submit"');
    expect(form).toContain("탐색 시작");
    const submitIdx = form.indexOf('data-testid="ss-create-submit"');
    const readyGuardIdx = form.lastIndexOf(
      '{launchState === "ready" ? (',
      submitIdx,
    );
    expect(readyGuardIdx).toBeGreaterThan(-1);
    expect(submitIdx).toBeGreaterThan(readyGuardIdx);
    expect(form).toContain("현재 탐색 전략군");
    expect(form).toContain("ss-launch-evaluated");
    const exec = readUi("ExecutionControls.tsx");
    expect(exec).toContain('actions.includes("pause")');
    expect(exec).toContain("일시정지");
    expect(exec).toContain("중지");
    expect(exec).toContain("재개");
    const visibility = readUi("jobActionVisibility.ts");
    expect(visibility).toContain('case "paused"');
    expect(visibility).toContain('return ["resume", "cancel"]');
    expect(visibility).toContain('case "running"');
    expect(visibility).toContain('return ["pause", "cancel"]');
  });

  it("highlights the actual active search family only", () => {
    expect(
      familyProgressState("ema_core", [
        { id: "ema_core", labelKo: "EMA / 추세 추종", status: "active" },
        { id: "rsi_pullback", labelKo: "RSI / 되돌림", status: "pending" },
      ]),
    ).toBe("active");
    expect(
      familyProgressState("rsi_pullback", null, "RSI / 되돌림"),
    ).toBe("active");
    expect(familyProgressState("ema_core", null, "RSI / 되돌림")).toBe("idle");
    const map = readUi("visual/StrategySearchScopeMap.tsx");
    expect(map).toContain("progress?.currentSearchFamily");
    expect(map).not.toContain("시장 준비");
    expect(map).not.toContain("후보 생성 완료");
  });

  it("formats live metrics from actual job fields only", () => {
    expect(
      liveEvaluatedCount({
        uniqueEvaluatedCount: 1348,
        candidateBudgetUsed: 10,
        completedIterations: 3,
      }),
    ).toBe(1348);
    expect(
      liveEvaluatedCount({
        candidateBudgetUsed: 22,
      }),
    ).toBe(22);
    expect(liveEvaluatedCount({})).toBeNull();
    expect(
      qualificationFillRatio({ target: 3, qualifiedCount: 9 }),
    ).toBe(1);
    expect(qualificationFillRatio({ target: 3, qualifiedCount: null })).toBeNull();
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("progressRatio: detail.progressRatio");
    expect(workbench).toContain("uniqueEvaluatedCount: detail.uniqueEvaluatedCount");
    expect(workbench).toContain("qualifiedCount:");
    expect(workbench).toContain("elapsedMs: detail.elapsedMs");
    expect(workbench).toContain("searchProgression: detail.searchProgression");
  });

  it("does not invent placeholder TOP candidates while a job is running", () => {
    expect(
      liveTop10EmptyPresentation({ running: true, candidateCount: 0 }),
    ).toEqual({
      evaluating: true,
      title: "후보를 평가하고 있습니다.",
      detail: "평가가 진행되면 상위 후보가 여기에 실시간으로 표시됩니다.",
    });
    expect(
      liveTop10EmptyPresentation({ running: true, candidateCount: 0 }).title,
    ).not.toBe("표시할 순위 데이터가 없습니다");
    expect(
      liveTop10EmptyPresentation({ running: false, candidateCount: 0 }),
    ).toMatchObject({
      evaluating: false,
      title: "표시할 순위 데이터가 없습니다",
    });
    expect(
      liveTop10EmptyPresentation({ running: true, candidateCount: 3 }).evaluating,
    ).toBe(false);
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("liveTop10EmptyPresentation");
    expect(workbench).toContain("liveTop10Empty.title");
    expect(workbench).toContain("liveTop10Empty.detail");
    expect(workbench).toContain('aria-label={top10Evaluating ? "후보 평가 중" : undefined}');
    expect(workbench).toContain("ss-top10-dots");
    expect(workbench).not.toContain("placeholder candidate");
    expect(workbench).not.toContain("fakeTop");
    expect(workbench).not.toContain("ss-live-top10-row-placeholder");
    expect(workbench).toContain("detail?.liveTop10?.entries");
    const status = readUi("SearchStatusCard.tsx");
    expect(status).toContain("liveTop10EmptyPresentation");
    expect(status).toContain("liveTop10Empty.title");
    expect(status).toContain("liveTop10Empty.detail");
    expect(status).toContain("job.liveTop10.entries");
    expect(status).toContain("ss-live-top10-row-${row.rank}");
    expect(status).not.toContain("가짜 후보");
  });

  it("does not present qualifiedCount as a fake TOP10 availability count", () => {
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
      topResultCopy({
        status: "running",
        qualifiedCount: 185,
        top10Count: 3,
      }).detail,
    ).toBe("통과 후보 185개 · TOP10 3개");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain(
      "top10Count: hasLiveTop10 ? liveTop10Entries.length : 0",
    );
    expect(workbench).not.toContain("Math.min(qualified");
    const status = readUi("SearchStatusCard.tsx");
    expect(status).toContain("ss-live-top10-row-${row.rank}");
  });

  it("maps engine full_safe / SAFE 종합 to the user-facing family label", () => {
    expect(presentSearchFamilyLabelKo("full_safe")).toBe("통합 기술 전략");
    expect(presentSearchFamilyLabelKo("SAFE 종합")).toBe("통합 기술 전략");
    expect(presentSearchFamilyLabelKo("통합 기술 전략")).toBe("통합 기술 전략");
    expect(familyProgressState("full_safe", null, "SAFE 종합")).toBe("active");
    const status = readUi("SearchStatusCard.tsx");
    expect(status).toContain("presentSearchFamilyLabelKo");
    expect(status).not.toContain("SAFE 종합");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("presentSearchFamilyLabelKo(detail.currentSearchFamily)");
  });

  it("adds ordinal depth and family glyphs from existing sources", () => {
    expect(autoPresetDepthOrdinal("scalping")).toEqual({
      id: "fast",
      rank: 1,
      total: 3,
    });
    expect(autoPresetDepthOrdinal("balanced").rank).toBe(2);
    expect(autoPresetDepthOrdinal("stable")).toEqual({
      id: "deep",
      rank: 3,
      total: 3,
    });
    const presets = readUi("visual/StrategyAutoPresetPanel.tsx");
    expect(presets).toContain("ss-preset-depth");
    expect(presets).toContain("autoPresetVisualDims");
    expect(presets).toContain("criteriaChips");
    const glyph = readUi("visual/SearchFamilyGlyph.tsx");
    expect(glyph).toContain('"ema_core"');
    expect(glyph).toContain('"rsi_pullback"');
    expect(glyph).toContain('"breakout"');
    expect(glyph).toContain('"risk_exits"');
    expect(glyph).toContain('"full_safe"');
    expect(SEARCHABLE_SPACE_OPTIONS.map((space) => space.id)).toEqual([
      "ema_core",
      "rsi_pullback",
      "breakout",
      "risk_exits",
      "full_safe",
    ]);
  });

  it("keeps reduced-motion fallbacks and does not clip essential copy", () => {
    const css = fs.readFileSync(CSS, "utf8");
    expect(css).toContain("--ss-motion-fast: 160ms");
    expect(css).toContain("--ss-motion-normal: 240ms");
    expect(css).toContain("--ss-motion-slow: 900ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".ss-progress-ring--indeterminate svg");
    expect(css).toContain("animation: none !important");
    expect(css).toContain(".ss-top10-dots i");
    expect(css).toContain("overflow-x: hidden");
  });

  it("does not change search engine, cost arithmetic, or Direct risk_exits merge", () => {
    const generator = read("src/lib/rextora/strategySearch/candidateGenerator.ts");
    const evaluator = read("src/lib/rextora/strategySearch/candidateEvaluator.ts");
    const orch = read("src/lib/rextora/strategySearch/searchOrchestrator.ts");
    expect(generator).toContain("export function");
    expect(evaluator).toContain("evaluateCompleteCandidate");
    expect(orch).toContain("runOrchestratedSearchJob");
    const form = createDefaultOperatorFormState();
    expect(costStressChannelLines(form).lines).toEqual([
      "수수료 1.5×",
      "슬리피지 1.5×",
      "스프레드 1.5×",
    ]);
    const body = operatorFormToCreateBody(form);
    expect(body.costStressScenarios?.[0]?.feeMultiplier).toBe(1.5);
    expect(body.costStressScenarios?.[0]?.slippageMultiplier).toBe(1.5);
    expect(body.costStressScenarios?.[0]?.spreadMultiplier).toBe(1.5);
    expect([...DIRECT_SUPPLEMENTAL_SPACE_IDS]).toEqual(["risk_exits"]);
    expect(
      mergeDirectVisualSpaceIds(
        ["order_block", "risk_exits"],
        ["order_block", "ema_core"],
      ),
    ).toEqual(["order_block", "ema_core", "risk_exits"]);
  });

  it("keeps new visual files free of user-facing SafeV44 copy", () => {
    const rendered = [
      "visual/ScopeCardVisuals.tsx",
      "visual/SearchFamilyGlyph.tsx",
      "visual/StrategySearchScopeMap.tsx",
      "JobCreateForm.tsx",
    ]
      .map((file) => readUi(file))
      .join("\n");
    expect(rendered).not.toMatch(/SafeV44/);
    expect(rendered).not.toMatch(/SAFE 종합/);
    const mapping = readUi("visual/searchScopeVisual.ts");
    expect(mapping).not.toMatch(/SafeV44/);
    expect(mapping).toContain('"SAFE 종합": "full_safe"');
    expect(presentSearchFamilyLabelKo("SAFE 종합")).toBe("통합 기술 전략");
  });

  it("A: parameter-combination visual is a self-contained SVG", () => {
    const visuals = readUi("visual/ScopeCardVisuals.tsx");
    const branch = visuals.slice(
      visuals.indexOf("export function CandidateBranchVisual"),
      visuals.indexOf("export function HistoryScanVisual"),
    );
    expect(branch).toContain("ScopeVisualSlot");
    expect(branch).toContain('viewBox="0 0 40 40"');
    expect(branch).toContain('width="40"');
    expect(branch).toContain('height="40"');
    expect(branch).toContain("ss-combo-source");
    expect(branch).toContain("ss-combo-node");
    expect(branch).not.toMatch(/-ml-|marginLeft|margin-left:\s*-/);
    expect(branch).not.toMatch(/translateX\(\s*-/);
    expect(branch).not.toMatch(/translate\(\s*-/);
    expect(branch).not.toMatch(/\s-[0-9]/);
    const css = fs.readFileSync(CSS, "utf8");
    const candidateRule = css.slice(
      css.indexOf(".v3-strategy-search .ss-scope-visual--candidates"),
      css.indexOf(".v3-strategy-search .ss-scope-visual--candidates") + 160,
    );
    expect(candidateRule).toContain("width: 40px");
    expect(candidateRule).toContain("height: 40px");
    expect(candidateRule).not.toMatch(/margin-left:\s*-/);
    expect(candidateRule).not.toMatch(/translateX\(\s*-/);
  });

  it("B: scope visual containers use contained alignment", () => {
    const visuals = readUi("visual/ScopeCardVisuals.tsx");
    expect(visuals.match(/<ScopeVisualSlot>/g)?.length).toBeGreaterThanOrEqual(7);
    expect(visuals).toContain('data-scope-visual="market"');
    expect(visuals).toContain('data-scope-visual="families"');
    expect(visuals).toContain('data-scope-visual="candidates"');
    expect(visuals).toContain('data-scope-visual="history"');
    expect(visuals).toContain('data-scope-visual="cost"');
    expect(visuals).toContain('data-scope-visual="qualification"');
    expect(visuals).toContain('data-scope-visual="top"');
    const css = fs.readFileSync(CSS, "utf8");
    expect(css).toContain(".ss-scope-visual-slot");
    expect(css).toContain("justify-self: start");
    const visualRule = css.slice(
      css.indexOf(".v3-strategy-search .ss-scope-visual {"),
      css.indexOf(".v3-strategy-search .ss-scope-visual {") + 220,
    );
    expect(visualRule).toContain("overflow: visible");
    const candidateRule = css.slice(
      css.indexOf(".v3-strategy-search .ss-scope-visual--candidates"),
      css.indexOf(".v3-strategy-search .ss-scope-visual--candidates") + 180,
    );
    expect(candidateRule).toContain("overflow: hidden");
  });

  it("C/D: ranking-group cards use the light Strategy Search surface", () => {
    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("ss-ranking-group-card");
    const css = fs.readFileSync(CSS, "utf8");
    const surface = css.slice(
      css.indexOf(".v3-strategy-search .ss-ranking-group-card {"),
      css.indexOf(".v3-strategy-search .ss-ranking-group-card {") + 280,
    );
    expect(surface).toContain("background: var(--v3-surface)");
    expect(surface).toContain("border: 1px solid var(--v3-border)");
    expect(surface).toContain("color: var(--v3-text-primary)");
    expect(surface).not.toMatch(/slate-950|#0f172a|#020617/);
    expect(css).toContain(".v3-strategy-search .bg-slate-950\\/40");
    expect(css).toContain(
      ".v3-strategy-search .ss-ranking-group-card[data-has-recommend=\"false\"]",
    );
  });

  it("G: scope containment is local and does not add page-level overflow clipping", () => {
    const css = fs.readFileSync(CSS, "utf8");
    const mapRule = css.slice(
      css.indexOf(".v3-strategy-search .ss-scope-map {"),
      css.indexOf(".v3-strategy-search .ss-scope-map {") + 220,
    );
    expect(mapRule).not.toContain("overflow: hidden");
    expect(mapRule).not.toContain("overflow-x: hidden");
    expect(css).not.toMatch(
      /\.v3-ss-s8\s*\{[^}]*overflow:\s*hidden/,
    );
    expect(css).not.toMatch(
      /\.v3-strategy-search\s+\.ss-scope-stack\s*\{[^}]*overflow:\s*hidden/,
    );
    const pageRule = css.slice(
      css.indexOf(".v3-strategy-search.rextora-page,"),
      css.indexOf(".v3-ss-pagehead"),
    );
    expect(pageRule).toContain("overflow-x: hidden");
    expect(pageRule).not.toMatch(/^\s*overflow:\s*hidden;/m);
  });

  it("A/B: mobile launch card is content-driven without a tall flex basis", () => {
    const css = fs.readFileSync(CSS, "utf8");
    const stackedStart = css.indexOf("@media (max-width: 900px)");
    const stacked = css.slice(
      stackedStart,
      css.indexOf("@media (max-width: 767px)", stackedStart),
    );
    expect(stacked).toContain("flex-direction: column");
    expect(stacked).toContain("height: auto");
    expect(stacked).toContain("min-height: 0");
    expect(stacked).toContain(".ss-launch-panel");
    expect(stacked).toContain("flex: 0 0 auto");
    expect(stacked).not.toMatch(/min-height:\s*(1[5-9]\d|[2-9]\d{2})px/);
    expect(stacked).not.toMatch(/flex:\s*1\s+1\s+240px/);
    expect(stacked).toContain("width: 100%");
    const desktopPanel = css.slice(
      css.indexOf(".v3-strategy-search .ss-launch-panel {"),
      css.indexOf(".v3-strategy-search .ss-launch-ready,"),
    );
    expect(desktopPanel).toContain("flex: 1 1 240px");
    expect(desktopPanel).not.toContain("min-height:");
  });

  it("E: mobile layout fixes do not add page-level overflow clipping", () => {
    const css = fs.readFileSync(CSS, "utf8");
    const pageRule = css.slice(
      css.indexOf(".v3-strategy-search.rextora-page,"),
      css.indexOf(".v3-ss-pagehead"),
    );
    expect(pageRule).not.toMatch(/^\s*overflow:\s*hidden;/m);
    expect(css).not.toMatch(
      /\.v3-strategy-search \.ss-ranking-group-grid\s*\{[^}]*overflow:\s*hidden/,
    );
  });

  it("J: ranking visual animations honor prefers-reduced-motion", () => {
    const css = fs.readFileSync(CSS, "utf8");
    expect(css).toContain("@keyframes ss-rank-card-in");
    expect(css).toContain("@keyframes ss-rank-flow-draw");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
      css.indexOf("@media (prefers-reduced-motion: reduce)") + 1400,
    );
    expect(reduced).toContain(".ss-ranking-group-card");
    expect(reduced).toContain(".ss-rank-flow__line");
    expect(reduced).toContain("animation: none !important");
    expect(reduced).toContain("transform: none !important");
  });
});
