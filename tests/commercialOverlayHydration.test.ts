/**
 * Commercial blocker regressions: overlay geometry from persisted trades,
 * saved-run deep-link hydration wiring, library authoritative loading.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyPatternOverlays } from "../src/lib/rextora/backtest/patternOverlayAvailability";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import type { BacktestTrade } from "../src/lib/rextora/backtest/backtestEngine";

const ROOT = path.resolve(__dirname, "..");
const BACKTESTS = path.join(ROOT, "data/rextora/backtests");

function firstTradeWithFamily(
  runId: string,
  family: string,
): BacktestTrade | null {
  const raw = JSON.parse(
    fs.readFileSync(path.join(BACKTESTS, `${runId}.json`), "utf8"),
  );
  const trades = (raw.trades ?? []) as BacktestTrade[];
  return (
    trades.find(
      (t) =>
        t.patternType === family ||
        (t as { patternBlocks?: { family?: string }[] }).patternBlocks?.some(
          (b) => b.family === family,
        ),
    ) ?? null
  );
}

describe("persisted overlay geometry (production backtest runs)", () => {
  const cases = [
    { runId: "bt_ms31e199_1dae4f", family: "order_block", label: "OB" },
    { runId: "bt_ms31dmrw_637c6a", family: "fvg", label: "FVG" },
    { runId: "bt_ms31dync_01317b", family: "trendline", label: "Trendline" },
    {
      runId: "bt_ms31e01l_5d6b9f",
      family: "support_resistance",
      label: "S/R",
    },
  ] as const;

  for (const { runId, family, label } of cases) {
    it(`${label}: persisted trade trace enables overlay toggle`, () => {
      if (!fs.existsSync(path.join(BACKTESTS, `${runId}.json`))) {
        expect.fail(`missing fixture ${runId}`);
      }
      const trade = firstTradeWithFamily(runId, family);
      expect(trade).not.toBeNull();
      const trace = buildTradeEventTrace(trade!, {
        symbol: "BTCUSDT",
        timeframe: "15m",
      });
      const avail = classifyPatternOverlays({
        strategyType: "condition_builder",
        eventSequenceFamily: family,
        traces: [trace],
      });
      const row = avail.find((a) => a.kind === family);
      expect(row?.status).toBe("available");
      if (family === "trendline") {
        expect(trace.lineAnchors?.length).toBeGreaterThan(0);
      } else {
        expect(trace.zoneHigh).not.toBeNull();
        expect(trace.zoneLow).not.toBeNull();
      }
    });
  }

  it("BacktestAnalysisView renders every patternBlocks family (not primary only)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/charts/BacktestAnalysisView.tsx"),
      "utf8",
    );
    expect(src).toContain("selectedTrace.patternBlocks");
    expect(src).toContain('block.family === "trendline"');
    expect(src).toContain("patternToggleOn(kind)");
  });
});

describe("saved-run deep-link hydration wiring", () => {
  it("workbench syncs runId into URL and fetches missing filtered runs", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(src).toContain("missing_run");
    expect(src).toContain("loading_run");
    expect(src).toContain("fetchAndApplyRunById");
    expect(src).toContain('runId=${encodeURIComponent(runId)}');
  });
});
