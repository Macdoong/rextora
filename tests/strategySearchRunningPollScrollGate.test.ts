import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  shouldHideLegacyWorkbenchForCompleted,
  shouldShowCompletedResultLoading,
} from "@/components/rextora/strategySearch/completed/completedLoadingGate";
import type { StrategySearchJobDetail } from "@/components/rextora/strategySearch/types";

function detail(status: StrategySearchJobDetail["status"]): StrategySearchJobDetail {
  return { id: "search_run", status } as StrategySearchJobDetail;
}

const base = {
  clientReady: true,
  selectedId: "search_run",
  jobMissing: false,
  trials: { jobId: "search_run", total: 0, limit: 200, offset: 0, trials: [] },
};

describe("running poll must not hide the workbench", () => {
  it("running + background detail loading does not show the completed shell", () => {
    const show = shouldShowCompletedResultLoading({
      ...base,
      detail: detail("running"),
      detailFetchState: "loading",
    });
    expect(show).toBe(false);
    expect(
      shouldHideLegacyWorkbenchForCompleted({
        showCompletedDashboardPrimary: false,
        showCompletedResultLoading: show,
      }),
    ).toBe(false);
  });

  it("queued and paused refreshes also keep the workbench", () => {
    for (const status of ["queued", "paused", "failed"] as const) {
      expect(
        shouldShowCompletedResultLoading({
          ...base,
          detail: detail(status),
          detailFetchState: "loading",
        }),
      ).toBe(false);
    }
  });

  it("initial loading with no detail still shows the completed-result shell", () => {
    expect(
      shouldShowCompletedResultLoading({
        ...base,
        detail: null,
        trials: null,
        detailFetchState: "loading",
      }),
    ).toBe(true);
  });

  it("completed loading and missing trials still show the shell", () => {
    expect(
      shouldShowCompletedResultLoading({
        ...base,
        detail: detail("completed"),
        detailFetchState: "loading",
        trials: null,
      }),
    ).toBe(true);
    expect(
      shouldShowCompletedResultLoading({
        ...base,
        detail: detail("completed"),
        detailFetchState: "ready",
        trials: null,
      }),
    ).toBe(true);
    expect(
      shouldShowCompletedResultLoading({
        ...base,
        detail: detail("completed"),
        detailFetchState: "ready",
      }),
    ).toBe(false);
  });

  it("one-shot running scroll stays in place and no scroll compensation was added", () => {
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    const gate = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/completed/completedLoadingGate.ts",
      ),
      "utf8",
    );
    expect(workbench).toContain("pendingScrollToRunningRef");
    expect(workbench).toContain('getElementById("ss-running-view-anchor")');
    expect(workbench).not.toMatch(/scrollY|window\.scrollTo/);
    expect(gate).not.toMatch(/scrollIntoView|window\.scrollTo/);
    expect(gate).toContain('input.detail.status !== "completed"');
  });
});
