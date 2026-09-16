/**
 * P2-A diagnosis kept as history-only.
 * Obsolete first-match behavioral assertions were replaced by
 * tests/dashboardActiveResearch.test.ts (P2-B corrected selector).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readDashboard(file: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components/rextora/dashboard", file),
    "utf8",
  );
}

describe("Dashboard activeResearch P2-A diagnosis (history)", () => {
  it("old first-match predicate is gone from Dashboard model and presentation", () => {
    const files = [
      "dashboardData.ts",
      "dashboardResearchSelection.ts",
      "DashboardLifecycleOverview.tsx",
      "DashboardExecutiveBriefing.tsx",
      "DashboardActivitySummary.tsx",
      "LifecycleDashboard.tsx",
    ];
    for (const file of files) {
      expect(readDashboard(file)).not.toMatch(
        /\["running", "queued", "pause_requested", "paused"\]/,
      );
    }
  });

  it("P2-B selector is the single Dashboard Research selection entry", () => {
    const model = readDashboard("dashboardData.ts");
    expect(model).toContain("selectDashboardResearch");
    expect(model).toContain("shouldFetchDashboardGenerationHint");
    expect(model).not.toContain("jobs.find((j) =>");
  });
});
