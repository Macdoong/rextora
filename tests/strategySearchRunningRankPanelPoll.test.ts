import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isOperationallyActiveStatus } from "@/components/rextora/strategySearch/apiClient";
import {
  normalizeResultRankPanel,
  resolveDefaultResultRankPanel,
} from "@/components/rextora/strategySearch/resultRankPanel";

const WORKBENCH = path.join(
  process.cwd(),
  "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
);

function readWorkbench(): string {
  return fs.readFileSync(WORKBENCH, "utf8");
}

describe("running detail poll must not auto-replace rank panel", () => {
  it("skips rank-panel normalization while the job is operationally active", () => {
    const workbench = readWorkbench();
    const effectStart = workbench.indexOf(
      "const groupAwareNow = hasAuthoritativeRankingGroups(detail);",
    );
    expect(effectStart).toBeGreaterThan(-1);
    const effectBlock = workbench.slice(
      effectStart - 280,
      effectStart + 520,
    );
    expect(effectBlock).toContain("isOperationallyActiveStatus(detail.status");
    expect(effectBlock).toContain("detail.executionActive");
    expect(effectBlock).toContain("return;");
    expect(effectBlock).toContain("normalizeResultRankPanel");
  });

  it("keeps Live TOP10 surface mounted when group-aware data arrives on a running job", () => {
    const workbench = readWorkbench();
    expect(workbench).toContain("showLiveTop10RankChrome");
    expect(workbench).toContain("liveTop10RankSurfaceActive");
    expect(workbench).toContain('data-testid="ss-job-detail"');
    expect(workbench).toMatch(
      /liveTop10RankSurfaceActive[\s\S]*data-testid="ss-job-detail"/,
    );
    expect(workbench).toContain('data-testid="ss-result-tab-groups"');
    expect(workbench).toContain("ResearchRankingGroups");
  });

  it("still normalizes top10 to groups for completed group-aware results", () => {
    expect(
      normalizeResultRankPanel({ current: "top10", groupAware: true }),
    ).toBe("groups");
    expect(
      resolveDefaultResultRankPanel({
        status: "completed",
        groupAware: true,
        hasVisibleLiveTop10: false,
      }),
    ).toBe("groups");
    expect(isOperationallyActiveStatus("completed")).toBe(false);
  });

  it("handleSelect still applies group-aware defaults on explicit job selection", () => {
    const workbench = readWorkbench();
    const handleSelect = workbench.slice(
      workbench.indexOf("function handleSelect"),
      workbench.indexOf("function handleSelect") + 700,
    );
    expect(handleSelect).toContain("normalizeResultRankPanel");
    expect(handleSelect).toContain("hasAuthoritativeRankingGroups(listed)");
  });
});
