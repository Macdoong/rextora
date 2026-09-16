/**
 * P2-D2: Dashboard list window is 100; Attention presentation stays bounded.
 * Isolated fixtures — no production strategy-search store.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ATTENTION_VISIBLE_CAP,
  DASHBOARD_RESEARCH_LIST_LIMIT,
  buildDashboardAttentionItems,
  buildDashboardPrimaryAction,
  dashboardAttentionHiddenCopy,
  dashboardAttentionTitle,
  prioritizeDashboardAttention,
  researchJobHref,
  selectDashboardResearch,
  shouldFetchDashboardGenerationHint,
} from "../components/rextora/dashboard/dashboardResearchSelection";
import { STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT } from "../src/lib/rextora/strategySearch/historyRetention";

type Job = { id: string; status: string };

function job(id: string, status: string): Job {
  return { id, status };
}

function dashSrc(file: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components/rextora/dashboard", file),
    "utf8",
  );
}

describe("Dashboard attention visibility (P2-D2)", () => {
  it("1. Dashboard URL requests limit=100", () => {
    expect(DASHBOARD_RESEARCH_LIST_LIMIT).toBe(100);
    expect(dashSrc("dashboardData.ts")).toContain(
      "`/api/rextora/strategy-search?limit=${DASHBOARD_RESEARCH_LIST_LIMIT}`",
    );
  });

  it("2. API default elsewhere remains unchanged", () => {
    expect(STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT).toBe(20);
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/strategy-search/route.ts"),
      "utf8",
    );
    expect(route).toContain("default limit 20");
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/JobList.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain(
      "export const STRATEGY_SEARCH_HISTORY_RETENTION_NOTE = 20",
    );
    const results = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/results/ResultsWorkbench.tsx",
      ),
      "utf8",
    );
    expect(results).toContain("?limit=40");
    const searchWorkbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(searchWorkbench).toContain("limit: HISTORY_PAGE");
  });

  it("3. attention model receives >20 old interrupted jobs", () => {
    const jobs = Array.from({ length: 25 }, (_, i) =>
      job(`interrupted-${i}`, "interrupted"),
    );
    const selected = selectDashboardResearch(jobs);
    expect(selected.allAttentionResearch.length).toBe(25);
    expect(selected.attentionResearch.length).toBe(25);
  });

  it("4. total attention count includes all supplied jobs", () => {
    const jobs = [
      ...Array.from({ length: 10 }, (_, i) => job(`i-${i}`, "interrupted")),
      ...Array.from({ length: 4 }, (_, i) => job(`p-${i}`, "paused")),
      job("q", "queued"),
    ];
    const selected = selectDashboardResearch(jobs);
    expect(selected.attentionTotal).toBe(14);
    expect(selected.allAttentionResearch).toHaveLength(14);
  });

  it("5. rendered attention count is capped", () => {
    const jobs = Array.from({ length: 12 }, (_, i) =>
      job(`interrupted-${i}`, "interrupted"),
    );
    const selected = selectDashboardResearch(jobs);
    expect(DASHBOARD_ATTENTION_VISIBLE_CAP).toBe(3);
    expect(selected.visibleAttentionResearch).toHaveLength(3);
    expect(
      buildDashboardAttentionItems(selected.visibleAttentionResearch),
    ).toHaveLength(3);
  });

  it("6. stopping state outranks interrupted", () => {
    const jobs = [
      job("i-new", "interrupted"),
      job("cr", "cancel_requested"),
      job("i-old", "interrupted"),
    ];
    const selected = selectDashboardResearch(jobs);
    expect(selected.visibleAttentionResearch[0]?.id).toBe("cr");
    expect(prioritizeDashboardAttention(selected.attentionResearch)[0]?.id).toBe(
      "cr",
    );
  });

  it("7. interrupted outranks paused", () => {
    const jobs = [job("p", "paused"), job("i", "interrupted")];
    const selected = selectDashboardResearch(jobs);
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["p", "i"]);
    expect(selected.visibleAttentionResearch[0]?.id).toBe("i");
  });

  it("8. same-status order preserves API order", () => {
    const jobs = [
      job("i-first", "interrupted"),
      job("i-second", "interrupted"),
      job("i-third", "interrupted"),
    ];
    const selected = selectDashboardResearch(jobs);
    expect(selected.visibleAttentionResearch.map((j) => j.id)).toEqual([
      "i-first",
      "i-second",
      "i-third",
    ]);
  });

  it("9. hidden-count presentation is correct", () => {
    const selected = selectDashboardResearch(
      Array.from({ length: 37 }, (_, i) => job(`i-${i}`, "interrupted")),
    );
    expect(selected.attentionTotal).toBe(37);
    expect(selected.attentionHiddenCount).toBe(34);
    expect(dashboardAttentionTitle(37)).toBe("확인이 필요한 항목 37건");
    expect(dashboardAttentionHiddenCopy(34)).toBe("외 34건");
    expect(dashSrc("DashboardAttentionQueue.tsx")).toContain(
      "dash-attention-view-all",
    );
    expect(dashSrc("DashboardAttentionQueue.tsx")).toContain(
      "RESEARCH_RECOVERY_HREF",
    );
    expect(dashSrc("dashboardResearchSelection.ts")).toContain(
      'export const RESEARCH_RECOVERY_HREF = "/strategy-search#ss-recovery"',
    );
  });

  it("10. no hidden-count message when total <= cap", () => {
    const selected = selectDashboardResearch([
      job("i1", "interrupted"),
      job("i2", "interrupted"),
    ]);
    expect(selected.attentionHiddenCount).toBe(0);
    expect(dashboardAttentionHiddenCopy(0)).toBeNull();
    expect(dashboardAttentionTitle(0)).toBe("확인이 필요한 항목");
  });

  it("11. queued remains pending, not attention", () => {
    const selected = selectDashboardResearch([
      job("q", "queued"),
      job("i", "interrupted"),
    ]);
    expect(selected.pendingResearch?.id).toBe("q");
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["i"]);
  });

  it("12. running remains executing", () => {
    const selected = selectDashboardResearch([
      job("q-newer", "queued"),
      job("r", "running"),
      job("i", "interrupted"),
    ]);
    expect(selected.executingResearch?.id).toBe("r");
    expect(selected.pendingResearch?.id).toBe("q-newer");
    expect(buildDashboardPrimaryAction(selected).label).toBe(
      "진행 중인 탐색 보기",
    );
  });

  it("13. generation hint remains executing-only", () => {
    expect(
      shouldFetchDashboardGenerationHint(
        selectDashboardResearch([job("q", "queued")]),
      ),
    ).toBe(false);
    expect(
      shouldFetchDashboardGenerationHint(
        selectDashboardResearch([job("i", "interrupted")]),
      ),
    ).toBe(false);
    expect(
      shouldFetchDashboardGenerationHint(
        selectDashboardResearch([job("p", "paused")]),
      ),
    ).toBe(false);
    expect(
      shouldFetchDashboardGenerationHint(
        selectDashboardResearch([job("r", "running")]),
      ),
    ).toBe(true);
  });

  it("14. item CTAs remain job-detail links", () => {
    const items = buildDashboardAttentionItems([
      job("search_8212e555-bed8-4966-82ab-b92f4d5e5a4a", "interrupted"),
    ]);
    expect(items[0]?.href).toBe(
      researchJobHref("search_8212e555-bed8-4966-82ab-b92f4d5e5a4a"),
    );
    expect(items[0]?.href).toContain("/strategy-search?jobId=");
    expect(items[0]?.href).not.toContain("/start");
  });

  it("15. no Dashboard Start API exists", () => {
    const dir = path.join(process.cwd(), "components/rextora/dashboard");
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\/start["'`]/);
      expect(src).not.toMatch(/startStrategySearchJob/);
    }
  });
});
