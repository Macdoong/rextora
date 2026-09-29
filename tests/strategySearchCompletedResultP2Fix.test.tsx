/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompletedFilterDonutFlow } from "../components/rextora/strategySearch/completed/CompletedFilterDonutFlow";
import { buildCompletedDashboardViewModel } from "../components/rextora/strategySearch/completed/completedViewModel";
import type { StrategySearchJobDetail } from "../components/rextora/strategySearch/types";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function jobWithRejected(rejected: number): StrategySearchJobDetail {
  return {
    id: "search_completed_p2",
    status: "completed",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    completionReason: "QUALIFIED_TARGET_REACHED",
    qualifiedCount: 2,
    evaluatedCount: 30,
    gatePassedCount: 5,
    rejectedCount: rejected,
    statistics: {
      generated: 40,
      evaluated: 30,
      passed: 5,
      failed: rejected,
    },
  } as StrategySearchJobDetail;
}

describe("completed result P2 fixes", () => {
  afterEach(() => cleanup());

  it("shows rejected count without a leading minus", () => {
    const model = buildCompletedDashboardViewModel({
      job: jobWithRejected(25),
      payloadReady: true,
      trials: { jobId: "x", total: 0, limit: 200, offset: 0, trials: [] },
    });
    render(<CompletedFilterDonutFlow model={model} />);
    const failed = screen.getByTestId("ss-waterfall-value-failed");
    expect(failed.textContent).toBe("25");
    expect(failed.textContent).not.toMatch(/^[−-]/);
    expect(screen.getByTestId("ss-waterfall-failed-count").textContent).toBe(
      "25개 탈락",
    );
  });

  it("reserves mobile inline-end clearance for the final qualification row", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(
      /max-width: 767px[\s\S]*ss-completed-waterfall__row--qualified[\s\S]*padding-inline-end: calc\(52px \+ env\(safe-area-inset-right/,
    );
    expect(css).not.toMatch(/\.rextora-agent-fab/);
  });

  it("keeps completed dashboard layout overflow guard", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain(".ss-completed-dashboard-layout");
    expect(css).toContain("overflow-x: hidden");
  });
});
