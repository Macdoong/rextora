import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandlestickChart } from "../components/rextora/charts/CandlestickChart";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import type { PatternBlockEvidence } from "../src/lib/rextora/strategy/eventSequenceBacktest";

const T0 = Date.UTC(2024, 0, 1);
const T1 = T0 + 60_000;

function block(
  family: PatternBlockEvidence["family"],
  overrides: Partial<PatternBlockEvidence> = {},
): PatternBlockEvidence {
  return {
    blockId: `block-${family}`,
    family,
    role: "entry_zone",
    order: 0,
    status: "detected",
    patternType: family,
    zoneHigh: 102,
    zoneLow: 98,
    creationBar: 1,
    creationTime: new Date(T0).toISOString(),
    revisitBar: 2,
    revisitTime: new Date(T1).toISOString(),
    confirmationBar: 2,
    confirmationTime: new Date(T1).toISOString(),
    entryBar: 2,
    entryTime: new Date(T1).toISOString(),
    measured: 0.7,
    threshold: 0.5,
    detectorParams: { lookback: 40, bodyOnly: true },
    measuredValues: { penetrationPct: 0.7 },
    thresholds: { penetrationPct: 0.5 },
    required: true,
    weight: 2,
    priority: 1,
    operatorPassed: true,
    scoreContribution: 2,
    scoreTotal: 3,
    scoreThreshold: 2.5,
    selectedPriority: 1,
    operator: "weighted_score",
    stage: "confirmation",
    reasonCode: null,
    touchCount: family === "support_resistance" ? 3 : null,
    lineAnchors: null,
    stopPrice: 97,
    targetPrice: 108,
    exitPrice: 106,
    exitBar: 3,
    exitTime: new Date(T1 + 60_000).toISOString(),
    exitReason: "take_profit",
    ...overrides,
  };
}

function tradeWith(blocks: PatternBlockEvidence[]) {
  return {
    id: "T0001",
    symbol: "BTCUSDT",
    side: "LONG",
    entryTime: new Date(T1).toISOString(),
    exitTime: new Date(T1 + 60_000).toISOString(),
    entryPrice: 100,
    exitPrice: 106,
    stopPrice: 97,
    takeProfitPrice: 108,
    exitReason: "take_profit",
    patternBlocks: blocks,
    combinationOperator: "weighted_score",
    combinationResult: true,
    combinationScore: 3,
    combinationPriority: 1,
  };
}

describe("persisted pattern explainability evidence", () => {
  it("round-trips every block evidence field, including normal exit risk", () => {
    const original = block("order_block", {
      breakBar: 3,
      breakTime: new Date(T1 + 60_000).toISOString(),
      invalidationBar: 3,
      invalidationTime: new Date(T1 + 60_000).toISOString(),
    });
    const trace = buildTradeEventTrace(tradeWith([original]) as never);
    expect(trace.patternBlocks?.[0]).toEqual(original);
    expect(trace.combinationScore).toBe(3);
    expect(trace.combinationPriority).toBe(1);
  });

  it("preserves all five real geometry families and true trendline endpoints", () => {
    const anchors = [
      { bar: 4, price: 99, time: new Date(T0).toISOString() },
      { bar: 9, price: 104, time: new Date(T1).toISOString() },
    ];
    const blocks = [
      block("order_block"),
      block("fvg"),
      block("supply_demand"),
      block("support_resistance", { touchCount: 4 }),
      block("trendline", {
        zoneHigh: null,
        zoneLow: null,
        lineAnchors: anchors,
      }),
    ];
    const trace = buildTradeEventTrace(tradeWith(blocks) as never);
    expect(trace.patternBlocks?.map((b) => b.family)).toEqual([
      "order_block",
      "fvg",
      "supply_demand",
      "support_resistance",
      "trendline",
    ]);
    expect(trace.patternBlocks?.[3]?.touchCount).toBe(4);
    expect(trace.patternBlocks?.[4]?.lineAnchors).toEqual(anchors);
  });

  it("does not fabricate geometry and hydrates legacy blocks safely", () => {
    const trace = buildTradeEventTrace(
      tradeWith([
        {
          blockId: "legacy",
          family: "fvg",
          role: "entry_zone",
          order: 0,
          status: "missing",
          patternType: "fvg",
          zoneHigh: null,
          zoneLow: null,
          creationBar: null,
          measured: 0,
          required: 1,
        } as never,
      ]) as never,
    );
    const legacy = trace.patternBlocks?.[0];
    expect(legacy?.zoneHigh).toBeNull();
    expect(legacy?.zoneLow).toBeNull();
    expect(legacy?.lineAnchors).toBeNull();
    expect(legacy?.detectorParams).toEqual({});
    expect(legacy?.required).toBe(true);
  });

  it("renders persisted endpoint segments and rejection lifecycle markers", () => {
    const html = renderToStaticMarkup(
      <CandlestickChart
        candles={[
          { time: T0, open: 100, high: 102, low: 98, close: 101 },
          { time: T1, open: 101, high: 105, low: 100, close: 104 },
        ]}
        segments={[
          {
            fromTime: T0,
            fromPrice: 99,
            toTime: T1,
            toPrice: 104,
            color: "#fbbf24",
            label: "true endpoints",
          },
        ]}
        lifecycleMarkers={[
          {
            time: T1,
            price: 103,
            kind: "rejected",
            label: "거부",
            tooltipLines: ["reason confirmation_timeout", "stage confirmation"],
          },
        ]}
      />,
    );
    expect(html).toContain('data-testid="chart-line-segment"');
    expect(html).toContain(`data-from-time="${T0}"`);
    expect(html).toContain(`data-to-time="${T1}"`);
    expect(html).toContain('data-lifecycle-kind="rejected"');
  });

  it("wires every overlay toggle to rendered evidence", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("for (const block of blocks)");
    expect(src).toContain("patternToggleOn(kind)");
    expect(src).toContain("overlayOpts.sequence");
    expect(src).toContain("overlayOpts.revisit");
    expect(src).toContain("overlayOpts.confirmation");
    expect(src).toContain("overlayOpts.invalidation");
    expect(src).toContain("overlayOpts.rejected");
    expect(src).toContain('data-testid="pattern-summary"');
  });
});
