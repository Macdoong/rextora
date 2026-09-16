/**
 * P2-G4 interrupted operator-recovery UI diagnosis.
 * Production is raw-read only. No recoverOrphanSearchJobs. No resume/start.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  API_LIST_MAX_LIMIT,
  DASHBOARD_ATTENTION_VISIBLE_CAP,
  DASHBOARD_FULL_LIST_DESTINATION,
  RESEARCH_HISTORY_FETCH_LIMIT,
  RESEARCH_HISTORY_SELECT_VISIBLE,
  collectProductionReadonlyHashes,
  loadInterruptedRecoveryUiDiagnosis,
  productionRecoveryUiRoot,
} from "../src/lib/rextora/strategySearch/interruptedRecoveryUiDiagnosis";
import { STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT } from "../src/lib/rextora/strategySearch/historyRetention";
import { resumeStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import { DASHBOARD_RESEARCH_LIST_LIMIT } from "../components/rextora/dashboard/dashboardResearchSelection";
import { ownerFilesExcludingKnownFossil } from "./helpers/productionResearchBaseline";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g4-operator-recovery-ui-design/2026-09-03T05-10-00-000Z",
);

describe("P2-G4 interrupted operator recovery UI diagnosis", () => {
  it("1. all current interrupted jobs detectable", () => {
    const d = loadInterruptedRecoveryUiDiagnosis();
    expect(d.interruptedTotal).toBe(37);
    expect(d.rows).toHaveLength(37);
    expect(d.runningTotal).toBe(0);
    expect(d.queuedTotal).toBe(4);
  });

  it("2. current Research history truncation reproduced", () => {
    expect(RESEARCH_HISTORY_FETCH_LIMIT).toBe(20);
    expect(STRATEGY_SEARCH_HISTORY_VISIBLE_DEFAULT).toBe(20);
    expect(RESEARCH_HISTORY_SELECT_VISIBLE).toBe(12);
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("limit: HISTORY_PAGE");
    expect(workbench).toContain("jobs.slice(0, 12)");
    expect(workbench).not.toContain("<JobList");
  });

  it("3. current hidden interrupted count proven", () => {
    const d = loadInterruptedRecoveryUiDiagnosis();
    expect(
      d.interruptedInHistoryFetch.length +
        d.interruptedHiddenFromHistoryFetch.length,
    ).toBe(d.interruptedTotal);
    expect(d.interruptedInHistoryFetch.length).toBeLessThanOrEqual(
      RESEARCH_HISTORY_FETCH_LIMIT,
    );
    expect(d.interruptedHiddenFromHistoryFetch.length).toBeGreaterThan(0);
    expect(d.interruptedInHistorySelect.length).toBeLessThanOrEqual(
      RESEARCH_HISTORY_SELECT_VISIBLE,
    );
    expect(
      d.interruptedInHistorySelect.length +
        d.interruptedHiddenFromHistorySelect.length,
    ).toBe(37);
  });

  it("4. current Resume route supports interrupted", () => {
    expect(typeof resumeStrategySearchJobApi).toBe("function");
    const route = fs.readFileSync(
      path.join(
        process.cwd(),
        "app/api/rextora/strategy-search/[jobId]/resume/route.ts",
      ),
      "utf8",
    );
    expect(route).toContain("resumeStrategySearchJobApi");
    const api = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(api).toContain('job.status !== "interrupted"');
    const ui = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/ExecutionControls.tsx",
      ),
      "utf8",
    );
    expect(ui).toContain('status === "interrupted"');
    expect(ui).toContain("ss-action-resume");
  });

  it("5. resumability classification available", () => {
    const d = loadInterruptedRecoveryUiDiagnosis();
    expect(d.resumableIds.length).toBe(37);
    expect(d.deadlineIds).toEqual([]);
    expect(d.notResumableIds).toEqual([]);
    expect(d.reviewIds).toEqual([]);
    expect(d.rows.every((r) => r.eligible)).toBe(true);
    expect(d.rows.every((r) => r.checkpointPresent)).toBe(true);
  });

  it("6. Dashboard view-all now targets recovery section", () => {
    expect(DASHBOARD_ATTENTION_VISIBLE_CAP).toBe(3);
    const queue = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/dashboard/DashboardAttentionQueue.tsx",
      ),
      "utf8",
    );
    expect(queue).toContain("dash-attention-hidden-count");
    expect(queue).toContain("dashboardRecoveryViewAllLabel");
    expect(queue).toContain("RESEARCH_RECOVERY_HREF");
    const copy = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/dashboard/dashboardResearchSelection.ts",
      ),
      "utf8",
    );
    expect(copy).toContain('export const RESEARCH_RECOVERY_HREF = "/strategy-search#ss-recovery"');
    expect(copy).toContain("return `외 ${hiddenCount}건`");
    expect(copy).toContain('return "전체 복구 항목 보기"');
  });

  it("7. API max/limit contract captured", () => {
    expect(API_LIST_MAX_LIMIT).toBe(100);
    expect(DASHBOARD_RESEARCH_LIST_LIMIT).toBe(100);
    const listApi = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(listApi).toContain("Math.min(\n      100,");
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/strategy-search/route.ts"),
      "utf8",
    );
    expect(route).toContain("searchParams.get(\"limit\")");
    expect(route).toContain("searchParams.get(\"offset\")");
    expect(route).not.toContain("searchParams.get(\"status\")");
    expect(route).not.toContain("searchParams.get(\"statuses\")");
  });

  it("8. MODEL A completeness today", () => {
    const d = loadInterruptedRecoveryUiDiagnosis();
    const index = JSON.parse(
      fs.readFileSync(path.join(productionRecoveryUiRoot(), "index.json"), "utf8"),
    ) as { jobs: unknown[] };
    expect(index.jobs.length).toBeGreaterThan(0);
    expect(d.indexed).toBeLessThanOrEqual(index.jobs.length);
    expect(d.indexed).toBeLessThanOrEqual(API_LIST_MAX_LIMIT);
    expect(d.modelATodayComplete).toBe(true);
  });

  it("9. MODEL B completeness/scalability", () => {
    const listApi = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(listApi).not.toContain("options?.status");
    expect(listApi).not.toContain("options?.statuses");
    const d = loadInterruptedRecoveryUiDiagnosis();
    expect(d.interruptedTotal).toBeGreaterThan(RESEARCH_HISTORY_FETCH_LIMIT);
  });

  it("10. stale queued not classified as interrupted recovery", () => {
    const d = loadInterruptedRecoveryUiDiagnosis();
    expect(d.staleQueuedIds).toEqual([
      "search_abf10625-74ff-458f-8759-d9dddfb04944",
    ]);
    expect(d.rows.some((r) => r.jobId === d.staleQueuedIds[0])).toBe(false);
    expect(d.queuedNotInterrupted).toBe(true);
  });

  it("11. no production write", () => {
    const root = productionRecoveryUiRoot();
    const before = collectProductionReadonlyHashes(root);
    const d = loadInterruptedRecoveryUiDiagnosis(root);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const write = (name: string, value: unknown) => {
      fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
    };
    write("current-ui-trace.json", {
      researchPage: "app/strategy-search/page.tsx → StrategySearchWorkbench",
      historyFetch: {
        client: "listStrategySearchJobs({ limit: 20, offset: 0 })",
        api: "GET /api/rextora/strategy-search limit/offset",
        sort: "compareJobsNewestFirst (createdAt desc)",
        statusFilter: false,
        paginationInApi: true,
        paginationInWorkbench: false,
        jobListMounted: false,
        selectVisible: 12,
      },
      resume: {
        ui: "ExecutionControls ss-action-resume",
        handler: "StrategySearchWorkbench.runAction('resume')",
        client: "resumeStrategySearchJob",
        route: "POST /api/rextora/strategy-search/[jobId]/resume",
        api: "resumeStrategySearchJobApi",
        ux: "RESUME_UX_PARTIAL",
      },
      dashboard: {
        fetchLimit: 100,
        visibleCap: 3,
        cardHref: "/strategy-search?jobId=",
        fullListDestination: DASHBOARD_FULL_LIST_DESTINATION,
      },
    });
    write("interrupted-inventory.json", {
      indexed: d.indexed,
      interruptedTotal: d.interruptedTotal,
      queuedTotal: d.queuedTotal,
      runningTotal: d.runningTotal,
      resumable: d.resumableIds.length,
      deadlineTerminalizable: d.deadlineIds.length,
      notResumable: d.notResumableIds.length,
      reviewRequired: d.reviewIds.length,
      historyFetchVisible: d.interruptedInHistoryFetch,
      historyFetchHidden: d.interruptedHiddenFromHistoryFetch,
      historySelectVisible: d.interruptedInHistorySelect,
      historySelectHiddenCount: d.interruptedHiddenFromHistorySelect.length,
      rows: d.rows,
      staleQueuedIds: d.staleQueuedIds,
    });
    write("api-model-comparison.json", {
      MODEL_A: {
        correctness: "Complete for current 74. Latent miss when newer jobs push interrupted past createdAt top 100.",
        architectureImpact: "UI-only",
        ioCost: "1 list request",
        scalability: "Breaks after 100 newer non-interrupted rows",
        apiSemanticImpact: "none",
        uiComplexity: "low",
        exposesAll37Today: true,
        futureBeyond100: false,
      },
      MODEL_B: {
        correctness: "Complete if filter is exact status=interrupted",
        architectureImpact: "small list API + route query",
        ioCost: "1 filtered request",
        scalability: "high",
        apiSemanticImpact: "new optional query; default history unchanged",
        uiComplexity: "low",
        exposesAll37Today: true,
        futureBeyond100: true,
      },
      MODEL_C: {
        correctness: "Complete but duplicates summarizeJob/list",
        architectureImpact: "new endpoint",
        ioCost: "1 dedicated request",
        scalability: "high",
        apiSemanticImpact: "new surface",
        uiComplexity: "low",
        exposesAll37Today: true,
        futureBeyond100: true,
      },
      MODEL_D: {
        correctness: "Complete by walking existing offset/limit until short page, client-filter interrupted",
        architectureImpact: "UI only; JobList already has onLoadMore",
        ioCost: "1 request today (74); ceil(n/100) later",
        scalability: "high without API change",
        apiSemanticImpact: "none",
        uiComplexity: "medium",
        exposesAll37Today: true,
        futureBeyond100: true,
      },
      recommended: "MODEL_D",
    });
    write("recommended-ui-design.json", {
      informationArchitecture: "RESEARCH_RECOVERY_SECTION_ABOVE_HISTORY",
      scope: "INTERRUPTED_ONLY",
      confirmation: "EXISTING_SUFFICIENT",
      dataModel: "MODEL_D",
      resumeUx: "RESUME_UX_PARTIAL",
      dashboardFollowUp: "/strategy-search#ss-recovery",
      agentDependency: false,
      rowFields: [
        "searchName/symbols/timeframe",
        "status interrupted",
        "createdAt/startedAt/interruptedAtMs",
        "completedIterations",
        "remainingMs",
        "qualifiedCount",
        "recoveryBlocker/resumability",
        "primary Open detail",
        "Resume only when recoveryBlocker is null",
      ],
      g5Files: [
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
        "components/rextora/strategySearch/JobList.tsx (card primitive / load-more)",
        "components/rextora/strategySearch/ExecutionControls.tsx",
        "components/rextora/strategySearch/SearchStatusCard.tsx",
        "components/rextora/strategySearch/apiClient.ts",
        "components/rextora/dashboard/DashboardAttentionQueue.tsx",
        "components/rextora/dashboard/dashboardResearchSelection.ts",
      ],
    });
    write("acceptance-criteria.json", {
      allInterruptedDiscoverable: true,
      noRecentHistoryTruncation: true,
      openSelectedJob: true,
      resumabilityVisibleBeforeResume: true,
      ineligibleNoActiveResume: true,
      useExistingResumeApi: true,
      noAutomaticResume: true,
      dashboardNavigatesToFullList: true,
      historyIntact: true,
      mobile390: true,
    });
    write("production-readonly-hashes.json", before);
    const after = collectProductionReadonlyHashes(root);
    expect(after).toEqual(before);
  });

  it("12. no Research execution", () => {
    expect(
      ownerFilesExcludingKnownFossil(
        path.join(productionRecoveryUiRoot(), "owners"),
      ),
    ).toEqual([]);
  });
});
