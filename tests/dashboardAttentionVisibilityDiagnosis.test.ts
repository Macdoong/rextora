/**
 * P2-D1 diagnosis only. Documents that Dashboard attention visibility is
 * bounded by the default newest-20 list window, not by P2-B classification.
 * Isolated fixtures — no production strategy-search store.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isDashboardAttentionResearch,
  selectDashboardResearch,
} from "../components/rextora/dashboard/dashboardResearchSelection";

type Job = { id: string; status: string; createdAt: string };

function compareNewestFirst(a: Job, b: Job): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function newestWindow(jobs: Job[], limit: number): Job[] {
  return jobs.slice().sort(compareNewestFirst).slice(0, limit);
}

describe("Dashboard attention visibility window (P2-D1 diagnosis)", () => {
  const pausedOld: Job = {
    id: "paused-old",
    status: "paused",
    createdAt: "2026-08-10T18:32:37.957Z",
  };
  const interruptedNew: Job = {
    id: "interrupted-new",
    status: "interrupted",
    createdAt: "2026-08-13T12:37:27.798Z",
  };
  const queued: Job = {
    id: "queued-mid",
    status: "queued",
    createdAt: "2026-08-13T00:34:58.411Z",
  };
  const completed: Job = {
    id: "completed-newest",
    status: "completed",
    createdAt: "2026-08-14T05:20:59.992Z",
  };
  const failed: Job = {
    id: "failed-mid",
    status: "failed",
    createdAt: "2026-08-11T20:51:19.466Z",
  };

  const fillers: Job[] = Array.from({ length: 18 }, (_, i) => ({
    id: `completed-filler-${String(i).padStart(2, "0")}`,
    status: "completed",
    createdAt: `2026-08-12T00:${String(i).padStart(2, "0")}:00.000Z`,
  }));

  const all = [
    completed,
    interruptedNew,
    queued,
    failed,
    pausedOld,
    ...fillers,
  ];

  it("1. paused item outside newest-20 is invisible today", () => {
    const window = newestWindow(all, 20);
    expect(window).toHaveLength(20);
    expect(window.some((j) => j.id === "paused-old")).toBe(false);
    const selected = selectDashboardResearch(window);
    expect(selected.attentionResearch.some((j) => j.status === "paused")).toBe(
      false,
    );
  });

  it("2. interrupted item inside newest-20 is visible", () => {
    const window = newestWindow(all, 20);
    expect(window.some((j) => j.id === "interrupted-new")).toBe(true);
    const selected = selectDashboardResearch(window);
    expect(selected.attentionResearch.map((j) => j.id)).toContain(
      "interrupted-new",
    );
  });

  it("3. selector itself correctly accepts paused once supplied", () => {
    const selected = selectDashboardResearch([pausedOld, interruptedNew]);
    expect(selected.attentionResearch.map((j) => j.id)).toEqual([
      "paused-old",
      "interrupted-new",
    ]);
    expect(isDashboardAttentionResearch(pausedOld)).toBe(true);
  });

  it("4. issue is upstream data-window visibility, not selector classification", () => {
    const window = newestWindow(all, 20);
    expect(isDashboardAttentionResearch(pausedOld)).toBe(true);
    expect(window.some((j) => j.id === pausedOld.id)).toBe(false);
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/dashboard/dashboardData.ts"),
      "utf8",
    );
    expect(src).toContain(
      "`/api/rextora/strategy-search?limit=${DASHBOARD_RESEARCH_LIST_LIMIT}`",
    );
  });

  it("5. terminal jobs do not become attention accidentally", () => {
    const selected = selectDashboardResearch([completed, failed, queued]);
    expect(selected.attentionResearch).toEqual([]);
    expect(isDashboardAttentionResearch(completed)).toBe(false);
    expect(isDashboardAttentionResearch(failed)).toBe(false);
    expect(isDashboardAttentionResearch(queued)).toBe(false);
  });
});
