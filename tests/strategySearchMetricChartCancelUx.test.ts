import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSearchCancellationPending,
  researchStatusLabelKo,
  searchCancellationPendingCopy,
  searchCancellationPhaseCopy,
} from "../components/rextora/strategySearch/formatters";
import {
  METRIC_CHART_FULL_LINE_MIN,
  buildCandidateMetricChart,
  candidateMetricSparklinePoints,
  candidateVisualItems,
  resolveMetricChartMode,
} from "../components/rextora/strategySearch/visual/runningVisualModel";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function candidateEvent(
  type: "candidate_evaluated" | "candidate_rejected" | "candidate_gate_passed",
  evaluatedCount: number,
  at: string,
  metrics?: {
    netReturn?: number;
    mdd?: number;
    score?: number;
  },
) {
  return {
    type,
    at,
    evaluatedCount,
    metrics: metrics
      ? {
          netReturn: metrics.netReturn,
          mdd: metrics.mdd,
          score: metrics.score,
          trades: 10,
          winRate: 0.5,
          profitFactor: 1.1,
        }
      : undefined,
  };
}

describe("Strategy Search metric chart + cancel copy UX", () => {
  it("A–F: cancellation pending copy follows authoritative status only", () => {
    expect(searchCancellationPendingCopy("cancel_requested")).toBe("중지 요청 중");
    expect(searchCancellationPendingCopy("cancelling")).toBe(
      "안전하게 탐색을 종료하고 있습니다.",
    );
    expect(searchCancellationPendingCopy("cancelled")).toBeNull();
    expect(searchCancellationPendingCopy("completed")).toBeNull();
    expect(searchCancellationPendingCopy("failed")).toBeNull();
    expect(searchCancellationPendingCopy("paused")).toBeNull();
    expect(searchCancellationPendingCopy("running")).toBeNull();
    expect(isSearchCancellationPending("cancel_requested")).toBe(true);
    expect(isSearchCancellationPending("cancelling")).toBe(true);
    expect(isSearchCancellationPending("cancelled")).toBe(false);
    expect(researchStatusLabelKo("cancelled")).toBe("탐색이 중지되었습니다.");
  });

  it("G: ExecutionControls does not show pending copy after cancelled", () => {
    const controls = read(
      "components/rextora/strategySearch/ExecutionControls.tsx",
    );
    expect(controls).toContain("isSearchCancellationPending(status)");
    expect(controls).not.toContain('status === "cancelled" ? "ss-cancelled"');
    expect(controls).not.toContain("searchCancellationPhaseCopy(status)");
  });

  it("H: workbench clears stale pending feedback on terminal cancelled", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("isSearchCancellationPending(detail.status)");
    expect(workbench).toContain('data.status === "cancelled"');
    expect(workbench).toContain('prev.message === "중지 요청 중"');
  });

  it("I–L: metric chart modes follow real observation counts", () => {
    expect(resolveMetricChartMode(0)).toBe("empty");
    expect(resolveMetricChartMode(1)).toBe("single");
    expect(resolveMetricChartMode(2)).toBe("compact");
    expect(resolveMetricChartMode(3)).toBe("compact");
    expect(resolveMetricChartMode(4)).toBe("line");
    expect(METRIC_CHART_FULL_LINE_MIN).toBe(4);
    expect(buildCandidateMetricChart([], "return")).toBeNull();
    const one = buildCandidateMetricChart([0.0482], "return");
    expect(one?.mode).toBe("single");
    expect(one?.linePoints).toBeNull();
    const compact = buildCandidateMetricChart([0.01, 0.02, 0.03], "return");
    expect(compact?.mode).toBe("compact");
    expect(compact?.linePoints).toBeTruthy();
    const line = buildCandidateMetricChart([0.01, 0.02, 0.03, 0.04], "return");
    expect(line?.mode).toBe("line");
  });

  it("M–O: net return zero reference and min/max from real telemetry", () => {
    const chart = buildCandidateMetricChart(
      [-0.012, 0.0482, 0.021],
      "return",
    );
    expect(chart?.zeroY).not.toBeNull();
    const items = candidateVisualItems([
      candidateEvent("candidate_gate_passed", 478, "2026-09-21T00:00:00.000Z", {
        netReturn: 0.0482,
        mdd: -0.0324,
      }),
    ]);
    const returns = candidateMetricSparklinePoints(items, "netReturn");
    expect(returns[0]?.sequenceLabel).toBe("#478");
    expect(returns[0]?.value).toBe(0.0482);
  });

  it("P–R: missing metrics are skipped without zero fill", () => {
    const items = candidateVisualItems([
      candidateEvent("candidate_rejected", 1, "2026-09-21T00:00:01.000Z"),
      candidateEvent("candidate_gate_passed", 2, "2026-09-21T00:00:02.000Z", {
        netReturn: 0.03,
      }),
    ]);
    expect(candidateMetricSparklinePoints(items, "netReturn")).toHaveLength(1);
  });

  it("S–U: spark component structure and mobile overflow guard", () => {
    const spark = read(
      "components/rextora/strategySearch/visual/CandidateMetricSparkline.tsx",
    );
    const css = read("components/rextora/v3/strategy-search.css");
    expect(spark).toContain("표시할 최근 후보 데이터가 없습니다.");
    expect(spark).toContain("ss-spark__zero");
    expect(spark).toContain("ss-spark__foot");
    expect(spark).not.toContain("candlestick");
    expect(css).toContain(".ss-spark__plot");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("overflow-x: hidden");
    expect(searchCancellationPhaseCopy("cancelled")).toBe(
      "탐색이 중지되었습니다.",
    );
  });
});
