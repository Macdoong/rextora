import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search running P2 polish", () => {
  it("places running lifecycle controls in the visual header and omits duplicates below", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain('data-testid="ss-running-header-controls"');
    expect(workbench).toContain("headerActions={");
    expect(workbench).toContain("omitLifecycleActions=");
    expect(workbench).toContain("showRunningVisual ? runningVisualLifecycleActions");
    const exec = read("components/rextora/strategySearch/ExecutionControls.tsx");
    expect(exec).toContain("omitLifecycleActions");
  });

  it("removes the ambient workflow sweep without adding phase state", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain('data-workflow="static"');
    expect(visual).not.toContain('data-workflow="ambient"');
    expect(visual).not.toContain('data-testid="ss-running-visual-activity"');
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).not.toContain("ss-run-flow-light");
    expect(css).not.toContain(".ss-run-flow__list::after");
  });

  it("clears recent-candidate strip for the mobile assistant FAB", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toMatch(
      /max-width: 767px[\s\S]*\.ss-cand-strip__list[\s\S]*padding-inline-end/,
    );
  });

  it("keeps a single current-analysis statement on the active family chip", () => {
    const visual = read(
      "components/rextora/strategySearch/visual/StrategySearchRunningVisual.tsx",
    );
    expect(visual).toContain("현재 분석");
    expect(visual).not.toContain("ss-run-visual__activity");
  });
});
