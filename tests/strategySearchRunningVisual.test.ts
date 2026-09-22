import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIRECT_LAYER_IDS } from "../components/rextora/strategySearch/visual/searchVisualCopy";
import {
  CANCELLING_TITLE_KO,
  PAUSE_PREPARING_TITLE_KO,
  RUNNING_ENGINE_SUBCOPY_KO,
  RUNNING_ENGINE_TITLE_KO,
  RUNNING_WORKFLOW_STEPS,
  buildRunningConfigSummary,
  formatElapsedClock,
  resolveRunningVisualMode,
  runningFamilyNodeLabel,
  runningFamilyNodes,
  runningMetricValues,
  runningVisualCopy,
  shouldRenderRunningVisual,
} from "../components/rextora/strategySearch/visual/runningVisualModel";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search running visualization v2", () => {
  it("A: running page renders StrategySearchRunningVisual as primary activity panel", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(workbench).toContain("StrategySearchRunningVisual");
    expect(workbench.indexOf("<StrategySearchRunningVisual")).toBeLessThan(
      workbench.indexOf("ss-sticky-status-header"),
    );
    expect(visual).toContain('data-testid="ss-running-visual"');
    expect(visual).toContain('data-testid="ss-running-core"');
  });

  it("B: selected families render as visible customer-facing family nodes", () => {
    const nodes = runningFamilyNodes(
      ["ema_core", "fvg", "order_block"],
      { status: "running" },
    );
    expect(nodes.map((node) => node.labelKo)).toEqual([
      "EMA",
      "FVG",
      "오더블럭",
    ]);
    expect(runningFamilyNodeLabel("support_resistance")).toBe("지지·저항");
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("ss-run-node-card");
    expect(visual).toContain("ss-running-node-${node.id}");
    expect(nodes.every((node) => node.labelKo !== node.id)).toBe(true);
  });

  it("C/D: current family is active; unselected family is absent", () => {
    const selected = ["order_block", "fvg", "ema_core"];
    const nodes = runningFamilyNodes(selected, {
      status: "running",
      currentSearchFamily: "order_block",
    });
    expect(nodes.find((node) => node.id === "order_block")?.state).toBe(
      "active",
    );
    expect(nodes.find((node) => node.id === "fvg")?.state).not.toBe("active");
    expect(nodes.some((node) => node.id === "trendline")).toBe(false);
    expect(DIRECT_LAYER_IDS).toContain("trendline");
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("현재 분석");
  });

  it("E/F: SearchProgressRing and duplicate live metrics are suppressed while running", () => {
    const map = read(
      "components/rextora/strategySearch/visual/StrategySearchScopeMap.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(map).toContain("shouldRenderRunningVisual(progress?.status)");
    expect(map).toContain("<SearchProgressRing progress={progress} />");
    expect(css).toContain(
      ".ss-create-main--secondary [data-testid=\"ss-running-progress\"]",
    );
    expect(css).toContain(".ss-create-main--secondary .ss-launch-bar");
    expect(css).toContain("display: none");
  });

  it("G/H/I: running configuration is collapsed by default and summarizes the job", () => {
    const summary = buildRunningConfigSummary({
      symbol: "BTCUSDT",
      timeframe: "15m",
      periodPreset: "standard",
      automatic: false,
      familyCount: 1,
    });
    expect(summary.titleKo).toBe("탐색 설정");
    expect(summary.marketLine).toBe("BTCUSDT · 15분 · 최근 60일");
    expect(summary.scopeLine).toBe("직접 선택 · 전략군 1개");
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("RunningConfigSummary");
    expect(workbench).toContain("runningConfigOpen");
    expect(workbench).toContain("useState(false)");
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("설정 보기 ▾");
    expect(visual).toContain("aria-expanded={expanded}");
    expect(visual).toContain('data-testid="ss-running-config-details"');
  });

  it("J: running configuration is read-only", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("readOnly={showRunningVisual}");
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(form).toContain("props.readOnly === true");
  });

  it("K: idle/setup state keeps the normal configuration form", () => {
    expect(shouldRenderRunningVisual(null)).toBe(false);
    expect(shouldRenderRunningVisual("completed")).toBe(false);
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const createIdx = workbench.indexOf("{createForm}");
    const statusIdx = workbench.indexOf("ss-sticky-status-header");
    expect(createIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(createIdx);
  });

  it("L/M/N: no fake percentage, ETA, or market chart", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    const model = read(
      "components/rextora/strategySearch/visual/runningVisualModel.ts",
    );
    const joined = `${visual}\n${model}`;
    expect(joined).not.toMatch(/거의 완료/);
    expect(joined).not.toMatch(/남음/);
    expect(joined).not.toMatch(/%\s*완료/);
    expect(joined).not.toContain("runtimeUtilizationPct");
    expect(visual).not.toContain("ss-market-candle");
    expect(visual).not.toContain("candlestick");
  });

  it("O: paused/cancelling lifecycle visuals remain correct", () => {
    expect(runningVisualCopy("paused").titleKo).toBe("탐색 일시정지");
    expect(runningVisualCopy("paused").claimsActiveEngine).toBe(false);
    expect(runningVisualCopy("cancelling").titleKo).toBe(CANCELLING_TITLE_KO);
    expect(runningVisualCopy("pause_requested").titleKo).toBe(
      PAUSE_PREPARING_TITLE_KO,
    );
    expect(runningVisualCopy("running").subcopyKo).toBe(
      RUNNING_ENGINE_SUBCOPY_KO,
    );
    expect(RUNNING_ENGINE_TITLE_KO).toBe("전략 탐색 엔진 가동 중");
  });

  it("P: reduced-motion contract remains present", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    const reduced = css.slice(
      css.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain(".ss-run-particle");
    expect(reduced).toContain("animation: none !important");
    expect(reduced).toContain(".ss-run-sweep");
  });

  it("Q: mobile contract has no horizontal overflow", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-run-visual");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("transform: none !important");
  });

  it("R: polling unchanged", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("const DETAIL_POLL_MS = 2000");
    expect(workbench).toContain("const DETAIL_POLL_CANCEL_MS = 400");
  });

  it("S: workflow stays ambient and real metrics remain source-backed", () => {
    expect(RUNNING_WORKFLOW_STEPS).toEqual([
      "시장 조건 분석",
      "후보 전략 생성",
      "백테스트 평가",
      "적격 조건 검증",
      "후보 정리",
    ]);
    const metrics = runningMetricValues({
      status: "running",
      uniqueEvaluatedCount: 128,
      qualifiedCount: 3,
      elapsedMs: 84_000,
      currentSearchFamily: "order_block",
    });
    expect(metrics.evaluated).toBe("128");
    expect(metrics.qualified).toBe("3");
    expect(metrics.elapsed).toBe("01:24");
    expect(formatElapsedClock(84_000)).toBe("01:24");
    expect(metrics.family).toBe("오더블럭");
    expect(resolveRunningVisualMode("running")).toBe("running");
    const live = runningMetricValues({
      status: "running",
      evaluatedCount: 121,
      gatePassedCount: 4,
      rejectedCount: 117,
      qualifiedCount: 2,
      elapsedMs: 84_000,
    });
    expect(live.evaluated).toBe("121");
    expect(live.gatePassed).toBe("4");
    expect(live.rejected).toBe("117");
    expect(live.qualified).toBe("2");
  });

  it("T-Z: activity feed, compact visual, polling, motion", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(visual).toContain("실시간 탐색 활동");
    expect(visual).toContain('data-testid="ss-running-activity-feed"');
    expect(visual).toContain('data-feed-priority="secondary"');
    expect(visual).toContain("평가 통과");
    expect(visual).toContain("최종 적격");
    expect(visual).toContain("formatActivityEventLineKo");
    expect(visual).not.toMatch(/거의 완료/);
    expect(visual).not.toMatch(/남음/);
    expect(css).toContain("minmax(156px, 0.2fr) minmax(0, 1fr)");
    expect(css).toContain("max-width: 220px");
    expect(css).not.toContain("minmax(0, 0.34fr) minmax(0, 0.66fr)");
    expect(css).not.toContain("min-height: 420px");
    expect(css).toContain("grid-area: feed");
    expect(css).toContain("overflow-x: hidden");
    expect(workbench).toContain("const DETAIL_POLL_MS = 2000");
    expect(workbench).toContain("recentActivityEvents: detail.recentActivityEvents");
    expect(workbench).not.toContain("/raw-trials");
    const reduced = css.slice(
      css.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain("animation: none !important");
  });
});
