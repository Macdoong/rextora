/**
 * P2-B: lifecycle-aware Dashboard Research selection and copy.
 * Isolated fixtures — no production strategy-search store.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDashboardAttentionItems,
  buildDashboardPrimaryAction,
  copyImpliesExecuting,
  dashboardResearchActivityTitle,
  dashboardResearchBadgeLabel,
  dashboardResearchBriefingSituation,
  dashboardResearchLifecycleLabel,
  researchJobHref,
  selectDashboardResearch,
  shouldFetchDashboardGenerationHint,
} from "../components/rextora/dashboard/dashboardResearchSelection";

type Job = {
  id: string;
  status: string;
  executionActive?: boolean;
  searchName?: string;
};

function job(
  id: string,
  status: string,
  extras?: Partial<Pick<Job, "executionActive" | "searchName">>,
): Job {
  return { id, status, ...extras };
}

function dashSrc(file: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components/rextora/dashboard", file),
    "utf8",
  );
}

describe("Dashboard lifecycle-aware Research selection (P2-B)", () => {
  it("1. newer queued + older running → running is executing", () => {
    const selected = selectDashboardResearch([
      job("queued-newer", "queued"),
      job("running-older", "running"),
    ]);
    expect(selected.executingResearch?.id).toBe("running-older");
    expect(selected.pendingResearch?.id).toBe("queued-newer");
    expect(selected.currentResearch?.id).toBe("running-older");
  });

  it("2. only queued → pending, not executing, copy is waiting", () => {
    const selected = selectDashboardResearch([job("only-queued", "queued")]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch?.id).toBe("only-queued");
    const action = buildDashboardPrimaryAction(selected);
    const briefing = dashboardResearchBriefingSituation(selected);
    const lifecycle = dashboardResearchLifecycleLabel(selected);
    expect(action.label).toBe("대기 중인 탐색 보기");
    expect(copyImpliesExecuting(action.label)).toBe(false);
    expect(copyImpliesExecuting(action.description)).toBe(false);
    expect(copyImpliesExecuting(briefing)).toBe(false);
    expect(lifecycle).toBe("대기");
    expect(copyImpliesExecuting(lifecycle)).toBe(false);
    expect(dashboardResearchActivityTitle(selected.currentResearch)).toBe(
      "대기 중인 연구",
    );
    expect(dashboardResearchBadgeLabel(selected.pendingResearch!)).toBe("준비");
  });

  it("3. running + queued + paused → running executing, queued pending, paused attention", () => {
    const selected = selectDashboardResearch([
      job("q", "queued"),
      job("r", "running"),
      job("p", "paused"),
    ]);
    expect(selected.executingResearch?.id).toBe("r");
    expect(selected.pendingResearch?.id).toBe("q");
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["p"]);
    expect(isDashboardExecutingCopy(selected)).toBe(true);
  });

  it("4. pause_requested + newer queued → pause_requested stays executing", () => {
    const selected = selectDashboardResearch([
      job("q-newer", "queued"),
      job("pr", "pause_requested"),
    ]);
    expect(selected.executingResearch?.id).toBe("pr");
    expect(selected.pendingResearch?.id).toBe("q-newer");
    expect(dashboardResearchLifecycleLabel(selected)).toBe("일시정지 요청");
    expect(buildDashboardPrimaryAction(selected).label).toBe(
      "일시정지 요청 중 탐색 보기",
    );
    expect(dashboardResearchBriefingSituation(selected)).toContain(
      "일시정지 요청",
    );
    expect(dashboardResearchBriefingSituation(selected)).not.toBe(
      "연구 진행 중 · 탐색",
    );
  });

  it("5. interrupted + queued → queued pending, interrupted attention", () => {
    const selected = selectDashboardResearch([
      job("i", "interrupted", { searchName: "interrupted-job" }),
      job("q", "queued"),
    ]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch?.id).toBe("q");
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["i"]);
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(selected))).toBe(
      false,
    );
    expect(
      buildDashboardAttentionItems(selected.attentionResearch).some((item) =>
        item.what.includes("중단된 탐색"),
      ),
    ).toBe(true);
  });

  it("6. paused + queued → queued pending, paused attention", () => {
    const selected = selectDashboardResearch([
      job("q", "queued"),
      job("p", "paused", { searchName: "paused-job" }),
    ]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch?.id).toBe("q");
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["p"]);
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(selected))).toBe(
      false,
    );
  });

  it("7. only paused → no executing, paused attention", () => {
    const selected = selectDashboardResearch([job("p", "paused")]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch).toBeUndefined();
    expect(selected.currentResearch).toBeUndefined();
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["p"]);
    expect(dashboardResearchLifecycleLabel(selected)).toBe("일시정지");
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(selected))).toBe(
      false,
    );
    expect(buildDashboardPrimaryAction(selected).label).toBe(
      "일시정지된 탐색 확인",
    );
  });

  it("8. only interrupted → no executing, interrupted attention", () => {
    const selected = selectDashboardResearch([job("i", "interrupted")]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch).toBeUndefined();
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["i"]);
    expect(dashboardResearchLifecycleLabel(selected)).toBe("실행 중단");
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(selected))).toBe(
      false,
    );
    expect(buildDashboardPrimaryAction(selected).label).toBe(
      "중단된 탐색 확인",
    );
  });

  it("9. terminal-only preserves completed primary action", () => {
    const jobs = [
      job("c", "completed"),
      job("f", "failed"),
      job("x", "cancelled"),
    ];
    const selected = selectDashboardResearch(jobs);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch).toBeUndefined();
    expect(selected.attentionResearch).toEqual([]);
    const action = buildDashboardPrimaryAction(selected, jobs[0]);
    expect(action.label).toBe("완료된 결과 검토");
    expect(action.href).toBe("/results?jobId=c");
  });

  it("10. queued CTA is Research detail only — no Start API", () => {
    const selected = selectDashboardResearch([job("only-queued", "queued")]);
    const action = buildDashboardPrimaryAction(selected);
    expect(action.href).toBe(researchJobHref("only-queued"));
    expect(action.href).toContain("/strategy-search?jobId=");
    expect(action.href).not.toContain("/start");
    const dashboardDir = path.join(
      process.cwd(),
      "components/rextora/dashboard",
    );
    for (const file of fs.readdirSync(dashboardDir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const src = fs.readFileSync(path.join(dashboardDir, file), "utf8");
      expect(src).not.toMatch(/\/start["'`]/);
      expect(src).not.toMatch(/startStrategySearchJob/);
    }
  });

  it("11. running CTA is 진행 중인 탐색 보기", () => {
    const selected = selectDashboardResearch([job("r", "running")]);
    const action = buildDashboardPrimaryAction(selected);
    expect(action.label).toBe("진행 중인 탐색 보기");
    expect(dashboardResearchBriefingSituation(selected)).toBe(
      "연구 진행 중 · 탐색",
    );
    expect(dashboardResearchLifecycleLabel(selected)).toBe("진행 중");
    expect(shouldFetchDashboardGenerationHint(selected)).toBe(true);
  });

  it("12. queued lifecycle copy is 대기, never 진행 중 / 현재 실행 중", () => {
    const selected = selectDashboardResearch([job("q", "queued")]);
    expect(dashboardResearchLifecycleLabel(selected)).toBe("대기");
    const texts = [
      dashboardResearchLifecycleLabel(selected),
      dashboardResearchBriefingSituation(selected),
      buildDashboardPrimaryAction(selected).label,
      buildDashboardPrimaryAction(selected).description,
      dashboardResearchActivityTitle(selected.currentResearch),
    ];
    for (const text of texts) {
      expect(text).not.toContain("진행 중");
      expect(text).not.toContain("현재 실행 중");
      expect(text).not.toContain("진행 중인 탐색");
    }
  });

  it("13. interrupted/paused must not produce executing copy", () => {
    for (const status of ["paused", "interrupted"] as const) {
      const selected = selectDashboardResearch([job(status, status)]);
      expect(selected.executingResearch).toBeUndefined();
      expect(
        copyImpliesExecuting(dashboardResearchBriefingSituation(selected)),
      ).toBe(false);
      expect(
        copyImpliesExecuting(buildDashboardPrimaryAction(selected).label),
      ).toBe(false);
      expect(shouldFetchDashboardGenerationHint(selected)).toBe(false);
    }
  });

  it("14. old duplicated predicate no longer controls generation-hint fetch", () => {
    const hook = dashSrc("dashboardData.ts");
    expect(hook).not.toMatch(
      /\["running", "queued", "pause_requested", "paused"\]/,
    );
    expect(hook).toContain("shouldFetchDashboardGenerationHint");
    expect(hook).toContain("selectDashboardResearch");
    const selectedQueued = selectDashboardResearch([job("q", "queued")]);
    const selectedRunning = selectDashboardResearch([job("r", "running")]);
    expect(shouldFetchDashboardGenerationHint(selectedQueued)).toBe(false);
    expect(shouldFetchDashboardGenerationHint(selectedRunning)).toBe(true);
  });

  it("15. production-like newest interrupted then queued, no running", () => {
    const selected = selectDashboardResearch([
      job("search_8212e555-bed8-4966-82ab-b92f4d5e5a4a", "interrupted", {
        searchName: "interrupted-visible",
      }),
      job("search_169c82b6-b973-4a72-8958-d1478789d4ba", "queued", {
        searchName: "agent_draft_BTCUSDT_15m",
      }),
    ]);
    expect(selected.executingResearch).toBeUndefined();
    expect(selected.pendingResearch?.id).toBe(
      "search_169c82b6-b973-4a72-8958-d1478789d4ba",
    );
    expect(selected.attentionResearch.map((j) => j.id)).toEqual([
      "search_8212e555-bed8-4966-82ab-b92f4d5e5a4a",
    ]);
    expect(dashboardResearchLifecycleLabel(selected)).toBe("대기");
    expect(buildDashboardPrimaryAction(selected).label).toBe(
      "대기 중인 탐색 보기",
    );
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(selected))).toBe(
      false,
    );
    const attention = buildDashboardAttentionItems(selected.attentionResearch);
    expect(attention).toHaveLength(1);
    expect(attention[0]?.href).toBe(
      researchJobHref("search_8212e555-bed8-4966-82ab-b92f4d5e5a4a"),
    );
  });

  it("executionActive queued lag is executing; cancel_* is attention/stopping", () => {
    const lag = selectDashboardResearch([
      job("q-lag", "queued", { executionActive: true }),
    ]);
    expect(lag.executingResearch?.id).toBe("q-lag");
    expect(lag.pendingResearch).toBeUndefined();

    const stopping = selectDashboardResearch([
      job("cr", "cancel_requested", { executionActive: true }),
      job("cg", "cancelling"),
    ]);
    expect(stopping.executingResearch).toBeUndefined();
    expect(stopping.attentionResearch.map((j) => j.id)).toEqual(["cr", "cg"]);
    expect(copyImpliesExecuting(dashboardResearchBriefingSituation(stopping))).toBe(
      false,
    );
    expect(dashboardResearchLifecycleLabel(stopping)).toBe("중지 요청 중");
  });

  it("failed-only still falls through to new-search CTA", () => {
    const selected = selectDashboardResearch([job("f", "failed")]);
    expect(buildDashboardPrimaryAction(selected).href).toBe("/strategy-search");
    expect(buildDashboardPrimaryAction(selected).label).toBe("새 탐색 시작");
  });
});

function isDashboardExecutingCopy(
  selected: ReturnType<typeof selectDashboardResearch>,
): boolean {
  return copyImpliesExecuting(dashboardResearchBriefingSituation(selected));
}
