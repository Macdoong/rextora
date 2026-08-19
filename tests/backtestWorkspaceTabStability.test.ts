/**
 * Regression: workspace tab selection is click-owned; scroll never swaps tabs.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  highlightFromScroll,
  initialWorkspaceTabState,
  isWorkspaceTabVisible,
  selectWorkspaceTab,
} from "../src/lib/rextora/backtest/workspaceTabState";

describe("backtest workspace tab ownership", () => {
  it("keeps selected tab when scroll highlight changes", () => {
    let state = initialWorkspaceTabState("advanced");
    state = highlightFromScroll(state, "validation");
    expect(state.selectedTab).toBe("advanced");
    expect(state.scrollHighlight).toBe("validation");
    expect(isWorkspaceTabVisible(state, "advanced")).toBe(true);
    expect(isWorkspaceTabVisible(state, "validation")).toBe(false);

    // Oscillation sequence from operator repro near page bottom
    for (const candidate of [
      "validation",
      "advanced",
      "validation",
      "advanced",
      "validation",
    ]) {
      state = highlightFromScroll(state, candidate);
    }
    expect(state.selectedTab).toBe("advanced");
  });

  it("only click/select mutates the authoritative tab", () => {
    let state = initialWorkspaceTabState("price");
    state = highlightFromScroll(state, "trades");
    expect(state.selectedTab).toBe("price");
    state = selectWorkspaceTab(state, "trades");
    expect(state.selectedTab).toBe("trades");
    state = highlightFromScroll(state, "monthly");
    expect(state.selectedTab).toBe("trades");
  });

  it("workbench no longer installs scroll-spy setActiveNavSection", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("IntersectionObserver");
    expect(src).not.toContain("scrollBottomGap");
    expect(src).toContain("selectWorkbenchSection");
    expect(src).not.toContain("backtest-nav-scroll-spacer");
  });

  it("analysis view uses exclusive workspace tab anchors", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("data-workspace-tab");
    expect(src).toContain("activeSection={activeSection}");
    expect(src).toContain('hidden = exclusive && activeSection != null');
  });
});
