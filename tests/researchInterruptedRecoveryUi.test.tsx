/**
 * P2-G5 interrupted operator recovery UI.
 * Fixtures only. Never calls production Research APIs or resume.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_API_PAGE_SIZE,
  RECOVERY_VISIBLE_PAGE_SIZE,
  RESEARCH_RECOVERY_HREF,
  discoverInterruptedRecoveryJobs,
  recoveryResumeEnabled,
  sliceRecoveryVisible,
} from "../components/rextora/strategySearch/interruptedRecoveryDiscovery";
import { InterruptedRecoverySection } from "../components/rextora/strategySearch/InterruptedRecoverySection";
import {
  DASHBOARD_ATTENTION_VISIBLE_CAP,
  RESEARCH_RECOVERY_HREF as DASH_RECOVERY_HREF,
} from "../components/rextora/dashboard/dashboardResearchSelection";
import {
  collectProductionReadonlyHashes,
  loadInterruptedRecoveryUiDiagnosis,
} from "../src/lib/rextora/strategySearch/interruptedRecoveryUiDiagnosis";
import type { StrategySearchJobSummary } from "../components/rextora/strategySearch/types";

const STALE_QUEUED = "search_abf10625-74ff-458f-8759-d9dddfb04944";

function summary(
  id: string,
  status: StrategySearchJobSummary["status"],
  extra: Partial<StrategySearchJobSummary> = {},
): StrategySearchJobSummary {
  return {
    id,
    status,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    startedAt: status === "queued" ? null : "2026-08-11T00:00:01.000Z",
    finishedAt: null,
    recoveryBlocker: extra.recoveryBlocker ?? null,
    maxIterations: 10,
    completedIterations: extra.completedIterations ?? 3,
    nextIteration: extra.completedIterations ?? 3,
    progressRatio: null,
    statistics: null,
    bestScore: null,
    bestCandidateHash: null,
    bestPassedCandidateHash: null,
    failureMessage: null,
    executionActive: false,
    searchVersion: "1",
    symbols: extra.symbols ?? ["BTCUSDT"],
    timeframe: extra.timeframe ?? "15m",
    seed: 1,
    searchName: extra.searchName ?? `탐색 ${id.slice(-4)}`,
    qualifiedCount: extra.qualifiedCount ?? 0,
    remainingMs: extra.remainingMs ?? 60_000,
    interruptedAtMs: extra.interruptedAtMs ?? Date.UTC(2026, 7, 27),
    ...extra,
  };
}

function pagesFrom(jobs: StrategySearchJobSummary[], pageSize = RECOVERY_API_PAGE_SIZE) {
  const calls: Array<{ limit: number; offset: number }> = [];
  return {
    calls,
    listFn: async (opts: { limit: number; offset: number }) => {
      calls.push({ limit: opts.limit, offset: opts.offset });
      return jobs.slice(opts.offset, opts.offset + opts.limit);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P2-G5 interrupted operator recovery UI", () => {
  it("1. 37 interrupted summaries all discovered", async () => {
    const interrupted = Array.from({ length: 37 }, (_, i) =>
      summary(`search_int_${String(i).padStart(2, "0")}`, "interrupted"),
    );
    const extras = [
      summary("q1", "queued"),
      summary("c1", "completed"),
      summary(STALE_QUEUED, "queued", { startedAt: "2026-08-11T16:20:43.076Z" }),
    ];
    const { listFn } = pagesFrom([...interrupted, ...extras]);
    const found = await discoverInterruptedRecoveryJobs(listFn);
    expect(found).toHaveLength(37);
    expect(found.every((j) => j.status === "interrupted")).toBe(true);
  });

  it("2. >100 pagination scans next API page", async () => {
    const jobs = Array.from({ length: 130 }, (_, i) =>
      summary(`job_${i}`, i < 5 || i >= 100 ? "interrupted" : "completed"),
    );
    const { listFn, calls } = pagesFrom(jobs);
    const found = await discoverInterruptedRecoveryJobs(listFn);
    expect(calls).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
    ]);
    expect(found.map((j) => j.id)).toEqual([
      "job_0",
      "job_1",
      "job_2",
      "job_3",
      "job_4",
      ...Array.from({ length: 30 }, (_, i) => `job_${100 + i}`),
    ]);
  });

  it("3. scan stops on short page", async () => {
    const jobs = Array.from({ length: 40 }, (_, i) =>
      summary(`job_${i}`, "interrupted"),
    );
    const { listFn, calls } = pagesFrom(jobs);
    await discoverInterruptedRecoveryJobs(listFn);
    expect(calls).toEqual([{ limit: 100, offset: 0 }]);
  });

  it("4. queued jobs excluded", async () => {
    const { listFn } = pagesFrom([
      summary("i1", "interrupted"),
      summary("q1", "queued"),
      summary("q2", "queued"),
    ]);
    const found = await discoverInterruptedRecoveryJobs(listFn);
    expect(found.map((j) => j.id)).toEqual(["i1"]);
  });

  it("5. stale queued excluded", async () => {
    const { listFn } = pagesFrom([
      summary("i1", "interrupted"),
      summary(STALE_QUEUED, "queued", {
        startedAt: "2026-08-11T16:20:43.076Z",
        completedIterations: 4560,
      }),
    ]);
    const found = await discoverInterruptedRecoveryJobs(listFn);
    expect(found.map((j) => j.id)).not.toContain(STALE_QUEUED);
  });

  it("6. recoveryBlocker null enables Resume", () => {
    const job = summary("i1", "interrupted", { recoveryBlocker: null });
    expect(recoveryResumeEnabled(job)).toBe(true);
    const html = renderToStaticMarkup(
      <InterruptedRecoverySection
        jobs={[job]}
        visibleCount={10}
        onOpen={() => undefined}
        onResume={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(html).toContain("ss-recovery-resume-i1");
    expect(html).toContain("복구 가능");
  });

  it("7. recoveryBlocker non-null disables/hides Resume", () => {
    const job = summary("i2", "interrupted", {
      recoveryBlocker: "MISSING_CHECKPOINT",
    });
    expect(recoveryResumeEnabled(job)).toBe(false);
    const html = renderToStaticMarkup(
      <InterruptedRecoverySection
        jobs={[job]}
        visibleCount={10}
        onOpen={() => undefined}
        onResume={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(html).not.toContain("ss-recovery-resume-i2");
    expect(html).toContain("MISSING_CHECKPOINT");
    expect(html).toContain("ss-recovery-open-i2");
  });

  it("8. Open detail targets exact jobId", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/InterruptedRecoverySection.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("props.onOpen(job.id)");
    expect(src).toContain("ss-recovery-open-");
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("onOpen={(jobId) => void handleSelect(jobId)}");
  });

  it("9. Resume passes exact jobId to existing action path", () => {
    const section = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/InterruptedRecoverySection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("props.onResume(job.id)");
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain('onResume={(jobId) => void runAction("resume", jobId)}');
    expect(workbench).toContain("explicitJobId");
    expect(workbench).toContain("const jobId = explicitJobId ?? selectedId");
    expect(workbench).toContain("resumeStrategySearchJob");
  });

  it("10. no selected-state race", () => {
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).not.toMatch(
      /setSelectedId\([^)]+\);\s*void runAction\("resume"\)/,
    );
    expect(workbench).toContain("await fn(jobId)");
    expect(workbench).toContain("selectedIdRef.current === jobId");
  });

  it("11. successful mocked Resume refreshes recovery list", async () => {
    const first = [
      summary("keep", "interrupted"),
      summary("leave", "interrupted"),
    ];
    const second = [summary("keep", "interrupted")];
    let pass = 0;
    const listFn = async () => {
      pass += 1;
      return pass === 1 ? first : second;
    };
    const before = await discoverInterruptedRecoveryJobs(listFn);
    const after = await discoverInterruptedRecoveryJobs(listFn);
    expect(before.map((j) => j.id)).toEqual(["keep", "leave"]);
    expect(after.map((j) => j.id)).toEqual(["keep"]);
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("await refreshRecovery()");
  });

  it("12. resumed job disappears after status changes", async () => {
    const afterResume = [
      summary("keep", "interrupted"),
      summary("leave", "running"),
    ];
    const { listFn } = pagesFrom(afterResume);
    const found = await discoverInterruptedRecoveryJobs(listFn);
    expect(found.map((j) => j.id)).toEqual(["keep"]);
  });

  it("13. initial visible list is bounded", () => {
    expect(RECOVERY_VISIBLE_PAGE_SIZE).toBe(10);
    const jobs = Array.from({ length: 37 }, (_, i) =>
      summary(`i${i}`, "interrupted"),
    );
    expect(sliceRecoveryVisible(jobs, RECOVERY_VISIBLE_PAGE_SIZE)).toHaveLength(
      10,
    );
    const html = renderToStaticMarkup(
      <InterruptedRecoverySection
        jobs={jobs}
        visibleCount={RECOVERY_VISIBLE_PAGE_SIZE}
        onOpen={() => undefined}
        onResume={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(html).toContain("ss-recovery-item-i0");
    expect(html).not.toContain("ss-recovery-item-i10");
    expect(html).toContain("ss-recovery-load-more");
  });

  it("14. load-more exposes all 37", () => {
    const jobs = Array.from({ length: 37 }, (_, i) =>
      summary(`i${i}`, "interrupted"),
    );
    const html = renderToStaticMarkup(
      <InterruptedRecoverySection
        jobs={jobs}
        visibleCount={40}
        onOpen={() => undefined}
        onResume={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(html).toContain("복구 필요 37건");
    expect(html).toContain("ss-recovery-item-i36");
    expect(html).not.toContain("ss-recovery-load-more");
  });

  it("15. zero interrupted empty state", () => {
    const html = renderToStaticMarkup(
      <InterruptedRecoverySection
        jobs={[]}
        visibleCount={10}
        onOpen={() => undefined}
        onResume={() => undefined}
        onLoadMore={() => undefined}
      />,
    );
    expect(html).toContain("현재 복구가 필요한 연구가 없습니다.");
    expect(html).not.toContain("ss-recovery-load-more");
  });

  it("16. Dashboard cap remains 3", () => {
    expect(DASHBOARD_ATTENTION_VISIBLE_CAP).toBe(3);
  });

  it("17. Dashboard view-all target is /strategy-search#ss-recovery", () => {
    expect(RESEARCH_RECOVERY_HREF).toBe("/strategy-search#ss-recovery");
    expect(DASH_RECOVERY_HREF).toBe("/strategy-search#ss-recovery");
    const queue = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/dashboard/DashboardAttentionQueue.tsx",
      ),
      "utf8",
    );
    expect(queue).toContain("RESEARCH_RECOVERY_HREF");
    expect(queue).toContain("dash-attention-view-all");
    expect(queue).toContain("dashboardRecoveryViewAllLabel");
    expect(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "components/rextora/dashboard/dashboardResearchSelection.ts",
        ),
        "utf8",
      ),
    ).toContain('return "전체 복구 항목 보기"');
  });

  it("18. normal recent picker remains intact", () => {
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("limit: HISTORY_PAGE");
    expect(workbench).toContain("jobs.slice(0, 12)");
    expect(workbench).toContain("ss-recent-job-select");
    expect(workbench).not.toContain("<JobList");
    expect(workbench).toContain("<InterruptedRecoverySection");
  });

  it("19. no production Research write", async () => {
    const before = collectProductionReadonlyHashes();
    expect(Object.keys(before.nonTerminalJobs)).toHaveLength(41);
    const d = loadInterruptedRecoveryUiDiagnosis();
    const found = await discoverInterruptedRecoveryJobs(
      pagesFrom([
        ...d.rows.map((row) => summary(row.jobId, "interrupted")),
        ...d.staleQueuedIds.map((id) => summary(id, "queued")),
      ]).listFn,
    );
    expect(found).toHaveLength(d.interruptedTotal);
    expect(found.map((j) => j.id)).toEqual(d.rows.map((row) => row.jobId));
    const after = collectProductionReadonlyHashes();
    expect(after).toEqual(before);
  });

  it("20. no automatic Resume", () => {
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).not.toMatch(/runAction\("resume"\)\s*;/);
    expect(workbench).toContain('onResume={(jobId) => void runAction("resume", jobId)}');
    const discovery = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/interruptedRecoveryDiscovery.ts",
      ),
      "utf8",
    );
    expect(discovery).not.toContain("resumeStrategySearchJob");
  });

  it("responsive CSS contracts for 390/1024/1440", () => {
    const section = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/InterruptedRecoverySection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("flex-wrap");
    expect(section).toContain("min-w-0");
    expect(section).toContain("break-words");
    expect(section).toContain("overflow-hidden");
    expect(section).toContain("min-h-11");
    const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain("#ss-recovery");
    expect(css).toContain("scroll-margin-top");
  });
});
