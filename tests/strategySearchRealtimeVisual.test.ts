import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StrategySearchActivityEvent } from "../src/lib/rextora/strategySearch/activityTelemetry";
import { SEARCH_ACTIVITY_BUFFER_SIZE } from "../src/lib/rextora/strategySearch/activityTelemetry";
import {
  RECENT_CANDIDATE_STRIP_LIMIT,
  METRIC_CHART_FULL_LINE_MIN,
  buildCandidateMetricChart,
  SPARKLINE_MIN_POINTS,
  activityEventKey,
  activityEventKeys,
  candidateItemIsEntering,
  candidateMetricSparklinePoints,
  candidateVisualItems,
  establishActivityBaseline,
  familyNodeMatchesLabel,
  familyTransitionLabels,
  incomingActivityKeys,
  latestCampaignQualifiedEvent,
  recentCandidateStripItems,
  runningFamilyNodes,
  sparklinePolyline,
} from "../components/rextora/strategySearch/visual/runningVisualModel";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function candidateEvent(
  type: "candidate_evaluated" | "candidate_rejected" | "candidate_gate_passed",
  evaluatedCount: number,
  at: string,
  metrics?: StrategySearchActivityEvent extends { metrics?: infer M }
    ? M
    : never,
): StrategySearchActivityEvent {
  if (type === "candidate_rejected") {
    return {
      type,
      at,
      evaluatedCount,
      familyLabel: "오더블럭",
      ...(metrics ? { metrics } : {}),
    };
  }
  return {
    type,
    at,
    evaluatedCount,
    familyLabel: "오더블럭",
    ...(metrics ? { metrics } : {}),
  };
}

describe("Strategy Search realtime visual telemetry", () => {
  it("A: central AI visual is compact and secondary", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    const model = read(
      "components/rextora/strategySearch/visual/runningVisualModel.ts",
    );
    expect(visual).toContain('data-engine-size="compact"');
    expect(visual).toContain("ss-run-network--compact");
    expect(css).toContain("minmax(156px, 0.2fr) minmax(0, 1fr)");
    expect(css).toContain("max-width: 220px");
    expect(model).toContain("export const RUNNING_NETWORK_WIDTH = 160");
    expect(css).not.toContain("minmax(0, 0.34fr) minmax(0, 0.66fr)");
    expect(css).not.toContain("aspect-ratio: 560 / 400");
  });

  it("B/C: rejected and gate-passed candidates render distinct outcomes", () => {
    const items = candidateVisualItems([
      candidateEvent("candidate_evaluated", 831, "2026-09-21T00:00:01.000Z"),
      candidateEvent("candidate_rejected", 831, "2026-09-21T00:00:01.000Z", {
        netReturn: -0.0126,
        mdd: -0.015,
        tradeCount: 39,
        winRate: 0.5128,
      }),
      candidateEvent("candidate_evaluated", 832, "2026-09-21T00:00:02.000Z"),
      candidateEvent("candidate_gate_passed", 832, "2026-09-21T00:00:02.000Z", {
        netReturn: 0.04,
        mdd: -0.01,
        tradeCount: 20,
        winRate: 0.55,
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.outcome).toBe("rejected");
    expect(items[0]?.sequenceLabel).toBe("#831");
    expect(items[1]?.outcome).toBe("gate_passed");
    const flow = read(
      "components/rextora/strategySearch/visual/CandidateFlowVisual.tsx",
    );
    expect(flow).toContain('data-outcome={item.outcome}');
    expect(flow).toContain("탈락");
    expect(flow).toContain("평가 통과");
    expect(flow).not.toContain("candidateId");
  });

  it("D: candidate sequence uses evaluatedCount, not candidateId", () => {
    const items = candidateVisualItems([
      candidateEvent("candidate_evaluated", 833, "2026-09-21T00:00:03.000Z"),
    ]);
    expect(items[0]?.evaluatedCount).toBe(833);
    expect(items[0]?.sequenceLabel).toBe("#833");
    expect(items[0]?.key).toBe("cand-833");
    const joined = [
      read("components/rextora/strategySearch/visual/CandidateFlowVisual.tsx"),
      read("components/rextora/strategySearch/visual/RecentCandidateStrip.tsx"),
      read("components/rextora/strategySearch/visual/CandidateMetricSparkline.tsx"),
      read("components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx"),
      read("components/rextora/strategySearch/visual/runningVisualModel.ts"),
    ].join("\n");
    expect(joined).not.toContain("candidateId");
  });

  it("E: campaign qualified is not an ordinary gate-pass candidate cell", () => {
    const events: StrategySearchActivityEvent[] = [
      candidateEvent("candidate_gate_passed", 10, "2026-09-21T00:00:10.000Z"),
      { type: "campaign_qualified", at: "2026-09-21T00:00:11.000Z", qualifiedCount: 2 },
    ];
    const items = candidateVisualItems(events);
    expect(items.every((item) => item.outcome !== "evaluated" || item.evaluatedCount !== 2)).toBe(
      true,
    );
    expect(items.some((item) => item.evaluatedCount === 10)).toBe(true);
    expect(items.some((item) => String(item.evaluatedCount) === "2" && item.outcome === "gate_passed")).toBe(
      false,
    );
    expect(latestCampaignQualifiedEvent(events)?.qualifiedCount).toBe(2);
    expect(recentCandidateStripItems(items).every((item) => item.outcome !== undefined)).toBe(
      true,
    );
    const strip = read(
      "components/rextora/strategySearch/visual/RecentCandidateStrip.tsx",
    );
    const flow = read(
      "components/rextora/strategySearch/visual/CandidateFlowVisual.tsx",
    );
    expect(strip).not.toContain("campaign_qualified");
    expect(flow).toContain("최종 적격");
    expect(flow).toContain('data-campaign-qualified="true"');
  });

  it("F/G: recent strip uses real events only and respects bounded telemetry", () => {
    const events: StrategySearchActivityEvent[] = [];
    for (let i = 1; i <= 20; i += 1) {
      events.push(
        candidateEvent(
          i % 4 === 0 ? "candidate_gate_passed" : "candidate_rejected",
          i,
          `2026-09-21T00:00:${String(i).padStart(2, "0")}.000Z`,
        ),
      );
    }
    const items = recentCandidateStripItems(candidateVisualItems(events));
    expect(RECENT_CANDIDATE_STRIP_LIMIT).toBe(SEARCH_ACTIVITY_BUFFER_SIZE);
    expect(items).toHaveLength(SEARCH_ACTIVITY_BUFFER_SIZE);
    expect(items[0]?.evaluatedCount).toBe(9);
    expect(items[items.length - 1]?.evaluatedCount).toBe(20);
    expect(items.every((item) => item.sequenceLabel.startsWith("#"))).toBe(true);
  });

  it("H: real candidate metrics render on outcome item", () => {
    const items = candidateVisualItems([
      candidateEvent("candidate_rejected", 833, "2026-09-21T00:01:00.000Z", {
        netReturn: -0.0126,
        mdd: -0.015,
        tradeCount: 39,
        winRate: 0.5128,
      }),
    ]);
    expect(items[0]?.metrics?.netReturn).toBe(-0.0126);
    expect(items[0]?.metrics?.tradeCount).toBe(39);
    const strip = read(
      "components/rextora/strategySearch/visual/RecentCandidateStrip.tsx",
    );
    expect(strip).toContain("formatPct(metrics.netReturn)");
    expect(strip).toContain("후보 {item.evaluatedCount}");
    expect(strip).toContain("ss-strip-metrics-${item.evaluatedCount}");
  });

  it("I/J/K: sparklines use actual telemetry and skip missing metrics", () => {
    const items = candidateVisualItems([
      candidateEvent("candidate_rejected", 1, "2026-09-21T00:00:01.000Z", {
        netReturn: 0.01,
        mdd: -0.02,
      }),
      candidateEvent("candidate_rejected", 2, "2026-09-21T00:00:02.000Z"),
      candidateEvent("candidate_gate_passed", 3, "2026-09-21T00:00:03.000Z", {
        netReturn: 0.03,
        mdd: -0.01,
      }),
      candidateEvent("candidate_rejected", 4, "2026-09-21T00:00:04.000Z", {
        score: 1.2,
      }),
    ]);
    const returns = candidateMetricSparklinePoints(items, "netReturn");
    const mdds = candidateMetricSparklinePoints(items, "mdd");
    expect(returns.map((point) => point.value)).toEqual([0.01, 0.03]);
    expect(mdds.map((point) => point.value)).toEqual([-0.02, -0.01]);
    expect(returns).toHaveLength(2);
    expect(sparklinePolyline([0.01], 168, 52)).toBeNull();
    expect(METRIC_CHART_FULL_LINE_MIN).toBe(4);
    expect(SPARKLINE_MIN_POINTS).toBe(4);
    const compact = buildCandidateMetricChart([0.01, 0.03], "return");
    expect(compact?.mode).toBe("compact");
    const line = sparklinePolyline([0.01, 0.02, 0.03, 0.04], 168, 52);
    expect(line?.min).toBe(0.01);
    expect(line?.max).toBe(0.04);
    expect(line?.last).toBe(0.04);
    const spark = read(
      "components/rextora/strategySearch/visual/CandidateMetricSparkline.tsx",
    );
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("최근 후보 수익률");
    expect(visual).toContain("최근 후보 최대낙폭");
    expect(spark).toContain("data-sparkline={chart?.mode ?? \"empty\"}");
    expect(spark).not.toContain("candlestick");
    expect(spark).not.toContain("candle");
  });

  it("L/M/N: old events are not replayed; only post-baseline keys are new", () => {
    const historical: StrategySearchActivityEvent[] = [
      candidateEvent("candidate_rejected", 1, "2026-09-21T00:00:01.000Z"),
      candidateEvent("candidate_gate_passed", 2, "2026-09-21T00:00:02.000Z"),
    ];
    const baseline = establishActivityBaseline(activityEventKeys(historical));
    expect(incomingActivityKeys(activityEventKeys(historical), baseline)).toEqual(
      [],
    );
    const incomingEvent = candidateEvent(
      "candidate_rejected",
      3,
      "2026-09-21T00:00:03.000Z",
    );
    const afterPoll = [...historical, incomingEvent];
    const incoming = incomingActivityKeys(activityEventKeys(afterPoll), baseline);
    expect(incoming).toEqual([activityEventKey(incomingEvent)]);
    const items = candidateVisualItems(afterPoll);
    const fresh = new Set(incoming);
    expect(candidateItemIsEntering(items[0]!, fresh)).toBe(false);
    expect(candidateItemIsEntering(items[1]!, fresh)).toBe(false);
    expect(candidateItemIsEntering(items[2]!, fresh)).toBe(true);
    const hook = read(
      "components/rextora/strategySearch/visual/useFreshActivityKeys.ts",
    );
    expect(hook).toContain("establishActivityBaseline");
    expect(hook).toContain("incomingActivityKeys");
    expect(hook).not.toContain("requestAnimationFrame");
    expect(hook).not.toContain("setInterval");
  });

  it("O: family_started changes active family state", () => {
    const nodes = runningFamilyNodes(["order_block", "fvg"], {
      status: "running",
      currentSearchFamily: "fvg",
    });
    expect(nodes.find((node) => node.id === "fvg")?.state).toBe("active");
    expect(nodes.find((node) => node.id === "order_block")?.state).not.toBe(
      "active",
    );
    const started: StrategySearchActivityEvent = {
      type: "family_started",
      at: "2026-09-21T00:00:04.000Z",
      familyLabel: "FVG",
    };
    const fresh = new Set([activityEventKey(started)]);
    const labels = familyTransitionLabels([started], fresh);
    expect(labels.started.has("FVG")).toBe(true);
    expect(familyNodeMatchesLabel(nodes.find((node) => node.id === "fvg")!, "FVG")).toBe(
      true,
    );
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("data-family-just-started");
    expect(visual).toContain("is-just-started");
  });

  it("P: text activity feed still exists but is secondary", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("실시간 탐색 활동");
    expect(visual).toContain('data-feed-priority="secondary"');
    expect(visual).toContain("ss-run-feed--secondary");
    expect(visual.indexOf("CandidateFlowVisual")).toBeLessThan(
      visual.indexOf("ss-running-activity-feed"),
    );
    expect(visual.indexOf("RecentCandidateStrip")).toBeLessThan(
      visual.indexOf("ss-running-activity-feed"),
    );
  });

  it("Q/R/S/T: no fake candidates, candles, progress, or ETA", () => {
    const joined = [
      read("components/rextora/strategySearch/visual/CandidateFlowVisual.tsx"),
      read("components/rextora/strategySearch/visual/RecentCandidateStrip.tsx"),
      read("components/rextora/strategySearch/visual/CandidateMetricSparkline.tsx"),
      read("components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx"),
      read("components/rextora/strategySearch/visual/runningVisualModel.ts"),
    ].join("\n");
    expect(joined).not.toMatch(/가짜/);
    expect(joined).not.toContain("Math.random");
    expect(joined).not.toContain("ss-market-candle");
    expect(joined).not.toContain("candlestick");
    expect(joined).not.toMatch(/거의 완료/);
    expect(joined).not.toMatch(/남음/);
    expect(joined).not.toContain("runtimeUtilizationPct");
    expect(joined).not.toContain("/trials");
    expect(joined).not.toContain("/generations");
  });

  it("U/V: polling unchanged and no /trials request added", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("const DETAIL_POLL_MS = 2000");
    expect(workbench).toContain("const DETAIL_POLL_CANCEL_MS = 400");
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).not.toContain("fetch(");
    expect(visual).not.toContain("/trials");
    expect(visual).not.toContain("/generations");
  });

  it("W: mobile has no horizontal overflow", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain('"strip"');
    expect(css).toContain("grid-area: flow");
    expect(css).toContain("grid-area: sparks");
  });

  it("X: reduced-motion preserves state without motion", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    const reduced = css.slice(
      css.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain(".ss-cand-token.is-entering");
    expect(reduced).toContain(".ss-strip-cell.is-entering");
    expect(reduced).toContain("animation: none !important");
    expect(reduced).toContain(".ss-run-particle");
  });

  it("Y: engine/scoring/qualification/ranking files are not part of this visual change", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("recentActivityEvents");
    expect(visual).not.toContain("qualifyCandidate");
    expect(visual).not.toContain("rankTrials");
  });
});
