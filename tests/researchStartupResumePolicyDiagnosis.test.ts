/**
 * P2-G2 startup auto-resume policy diagnosis.
 * Temp stores for algorithm proofs. Production is raw-read only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  resolveOrphanAutoResumeLimit,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  capConsumptionTruthTable,
  collectProductionReadonlyHashes,
  countInterruptedInHistoryWindow,
  EXPLICIT_RESUME_PATH,
  planOrphanStartupSelection,
  productionStartupRoot,
  sortStartupScan,
  STARTUP_CANDIDATE_ORDER,
} from "../src/lib/rextora/strategySearch/startupResumePolicyDiagnosis";
import {
  createSearchJob,
  markSearchJobInterrupted,
  markSearchJobRunning,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchConfig, StrategySearchJob } from "../src/lib/rextora/strategySearch/types";
import { resumeStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import { readRunnerPayloadFromCheckpoint } from "../src/lib/rextora/strategySearch/jobCheckpoint";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g2-startup-resume-policy/2026-09-03T04-40-00-000Z",
);

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 40, step: 1 }],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g2-"));
  tempRoots.push(root);
  return root;
}

function touchProfile(root: string, jobId: string): void {
  fs.writeFileSync(
    path.join(root, "jobs", `${jobId}.execution.json`),
    JSON.stringify({ version: 1 }),
  );
}

function writeDeadlinePlan(jobId: string, root: string): void {
  saveSearchPlan(
    jobId,
    {
      ...createEmptySearchPlan({
        searchName: "g2",
        depthProfile: "standard",
        qualificationProfile: "balanced",
        qualifiedTarget: 3,
        candidateBudget: 10,
        stageBatchSize: 1,
        maxRuntimeMs: 60_000,
        spaces: [{ id: "s1", labelKo: "s1" }],
      }),
      completionReason: "DEADLINE_REACHED",
    },
    { rootDir: root },
  );
}

describe("P2-G2 startup auto-resume policy diagnosis", () => {
  it("1. effective dev default", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("2. effective production default", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT);
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
  });

  it("3. explicit limit=0", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "production",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("4. effective limit=1", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "development",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(1);
  });

  it("5. effective limit=2", () => {
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "test",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "2",
      } as NodeJS.ProcessEnv),
    ).toBe(2);
  });

  it("6. exact candidate ordering", () => {
    expect(STARTUP_CANDIDATE_ORDER).toContain("updatedAt");
    const older = { id: "a", updatedAt: "2026-08-01T00:00:00.000Z" } as StrategySearchJob;
    const newer = { id: "b", updatedAt: "2026-08-11T00:00:00.000Z" } as StrategySearchJob;
    expect(sortStartupScan([older, newer]).map((j) => j.id)).toEqual(["b", "a"]);
  });

  it("7. exact cap consumption", () => {
    const table = capConsumptionTruthTable();
    expect(table.find((r) => r.className === "queued_successful_start")?.consumesCap).toBe(
      true,
    );
    expect(
      table.find((r) => r.className === "interrupted_successful_start")?.consumesCap,
    ).toBe(true);
    expect(table.find((r) => r.className === "terminal_stale_skip")?.consumesCap).toBe(
      false,
    );
    expect(table.find((r) => r.className === "ineligible_interrupted")?.consumesCap).toBe(
      false,
    );
    expect(
      table.find((r) => r.className === "interrupted_deadline_complete")?.consumesCap,
    ).toBe(false);
  });

  it("8. queued selection classification", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    touchProfile(root, job.id);
    const plan = planOrphanStartupSelection({ rootDir: root, resumeLimit: 2 });
    expect(plan.queuedCandidates).toContain(job.id);
    expect(plan.selected.map((s) => s.jobId)).toEqual([job.id]);
    expect(plan.selected[0]?.reason).toBe("queued_startup_resume");
  });

  it("9. interrupted selection classification", () => {
    const root = productionStartupRoot();
    const plan = planOrphanStartupSelection({ rootDir: root, resumeLimit: 2 });
    expect(plan.interruptedCandidates).toHaveLength(37);
    expect(plan.selected.every((s) => s.status === "interrupted")).toBe(true);
    expect(plan.selected.every((s) => s.reason === "process_loss_interrupted_resume")).toBe(
      true,
    );
  });

  it("10. terminal-stale skip does not consume cap", () => {
    const root = makeTempRoot();
    const queued = createSearchJob(sampleConfig(), { rootDir: root });
    touchProfile(root, queued.id);
    const stale = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(stale.id, { rootDir: root });
    writeDeadlinePlan(stale.id, root);
    const plan = planOrphanStartupSelection({ rootDir: root, resumeLimit: 1 });
    expect(plan.skipped.some((s) => s.jobId === stale.id && s.reason === "terminal_stale_running")).toBe(
      true,
    );
    expect(plan.selected.map((s) => s.jobId)).toEqual([queued.id]);
  });

  it("11. ineligible candidate does not consume cap", () => {
    const root = makeTempRoot();
    const queued = createSearchJob(sampleConfig(), { rootDir: root });
    touchProfile(root, queued.id);
    const interrupted = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(interrupted.id, { rootDir: root });
    markSearchJobInterrupted(interrupted.id, { rootDir: root });
    const plan = planOrphanStartupSelection({ rootDir: root, resumeLimit: 1 });
    expect(
      plan.skipped.some(
        (s) => s.jobId === interrupted.id && s.reason === "interrupted_ineligible",
      ),
    ).toBe(true);
    expect(plan.selected.map((s) => s.jobId)).toEqual([queued.id]);
  });

  it("12. current production read-only selection matches planner", () => {
    const root = productionStartupRoot();
    const at2 = planOrphanStartupSelection({ rootDir: root, resumeLimit: 2 });
    expect(at2.selected.map((s) => s.jobId)).toEqual([
      "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6",
      "search_fed7a3c6-1ec1-4392-a9fa-7de59712783b",
    ]);
    expect(
      planOrphanStartupSelection({ rootDir: root, resumeLimit: 0 }).selected,
    ).toEqual([]);
    expect(
      planOrphanStartupSelection({ rootDir: root, resumeLimit: 1 }).selected.map(
        (s) => s.jobId,
      ),
    ).toEqual(["search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6"]);
    const at4 = planOrphanStartupSelection({ rootDir: root, resumeLimit: 4 });
    expect(at4.selected.map((s) => s.jobId)).toEqual([
      "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6",
      "search_fed7a3c6-1ec1-4392-a9fa-7de59712783b",
      "search_f9dd7458-299b-427d-aaa4-f285bdb5bb4a",
      "search_f239f36b-987c-445d-b279-f0be4dea797c",
    ]);
    const at100 = planOrphanStartupSelection({
      rootDir: root,
      resumeLimit: 100,
    });
    expect(at100.selected).toHaveLength(41);
    expect(at100.selected[40]?.jobId).toBe(
      "search_abf10625-74ff-458f-8759-d9dddfb04944",
    );
    expect(at2.queuedCandidates).toHaveLength(4);
    expect(at2.queuedCandidates).toContain(
      "search_abf10625-74ff-458f-8759-d9dddfb04944",
    );
  });

  it("13. explicit Resume path classification", () => {
    expect(EXPLICIT_RESUME_PATH).toBe("PARTIAL");
    expect(typeof resumeStrategySearchJobApi).toBe("function");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(src).toContain('job.status !== "interrupted"');
    const ui = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/strategySearch/ExecutionControls.tsx"),
      "utf8",
    );
    expect(ui).toContain('status === "interrupted"');
    expect(ui).toContain("ss-action-resume");
  });

  it("14. checkpoint remains resumable with auto-resume disabled", () => {
    const root = productionStartupRoot();
    const none = planOrphanStartupSelection({ rootDir: root, resumeLimit: 0 });
    expect(none.selected).toEqual([]);
    const job = JSON.parse(
      fs.readFileSync(
        path.join(root, "jobs", "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6.json"),
        "utf8",
      ),
    ) as StrategySearchJob;
    expect(job.status).toBe("interrupted");
    expect(readRunnerPayloadFromCheckpoint(job.checkpoint)).toBeTruthy();
  });

  it("15. diagnosis causes no production writes", () => {
    const root = productionStartupRoot();
    const before = collectProductionReadonlyHashes(root);
    const limits = [0, 1, 2, 4, 100];
    const selections = Object.fromEntries(
      limits.map((limit) => [
        `limit_${limit}`,
        planOrphanStartupSelection({ rootDir: root, resumeLimit: limit }),
      ]),
    );
    const history = countInterruptedInHistoryWindow(root, 20);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const write = (name: string, value: unknown) => {
      fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
    };
    write("startup-selection-current.json", {
      order: STARTUP_CANDIDATE_ORDER,
      capTable: capConsumptionTruthTable(),
      queuedCandidates: (selections.limit_2 as { queuedCandidates: string[] })
        .queuedCandidates,
      interruptedCandidates: (
        selections.limit_2 as { interruptedCandidates: string[] }
      ).interruptedCandidates,
      ineligibleInterrupted: 0,
      statusSkips: 33,
      p2g1Limit2Confirmed: [
        "search_cefbe580-8cd5-4ea6-b29b-974f1dd978e6",
        "search_fed7a3c6-1ec1-4392-a9fa-7de59712783b",
      ],
      selections,
      historyWindow20: history,
    });
    write("configuration-resolution.json", {
      envName: "REXTORA_ORPHAN_AUTO_RESUME_LIMIT",
      parser:
        "trim → Number; unset/blank/invalid/negative → 0; finite n>=0 → Math.floor; no maximum",
      developmentUnset: 0,
      productionUnset: 0,
      testUnset: 0,
      explicitZero: 0,
      invalidFallsBackToNodeEnvDefault: true,
      repoDotenvConfigured: false,
      effectiveConfiguredNumeric: null,
      secondGate:
        "instrumentation.ts skips recovery in development unless REXTORA_ORPHAN_RECOVERY=1",
      entryPoints: [
        "instrumentation.register → recoverOrphanSearchJobs() in-process",
        "POST/GET /api/rextora/strategy-search/recover",
        "startBotRuntime (Paper start) before Paper session check",
      ],
    });
    write("policy-comparison.json", {
      decisionPriority: [
        "no unexpected Research execution",
        "preserve recoverability/checkpoints",
        "explicit operator understanding",
        "minimal architecture change",
        "no production-data migration unless necessary",
      ],
      models: {
        MODEL_A: {
          name: "KEEP_CURRENT",
          safety: "LOW — production/test default 2 plus Paper start and GET recover auto-start Research",
          crashContinuity: "HIGH — newest 2 eligible start on boot",
          operatorPredictability: "LOW — hidden history jobs can start",
          implementationScope: "NONE",
          backwardCompatibility: "current behavior",
          unexpectedExecutionRisk: "HIGH",
          paperLiveEffect: "NONE on orders; Paper start can start Research",
          testImpact: "NONE",
          migrationNeed: "NONE",
        },
        MODEL_B: {
          name: "DEFAULT_ZERO_OPERATOR_ONLY",
          safety: "HIGH — no boot start unless explicit env override",
          crashContinuity: "PRESERVED via checkpoints + explicit Resume API/UI",
          operatorPredictability: "HIGH",
          implementationScope: "SMALL — resolveOrphanAutoResumeLimit default 0; tests that assume unset=2",
          backwardCompatibility: "dev already 0; production behavior change",
          unexpectedExecutionRisk: "LOW (override remains)",
          paperLiveEffect: "NONE",
          testImpact: "orphan/process-interruption tests that assume production unset=2",
          migrationNeed: "NONE",
        },
        MODEL_C: {
          name: "INTERRUPTED_ONLY_AUTO_RESUME",
          safety: "LOW on current inventory — 37 interrupted are the real stampede",
          crashContinuity: "HIGH for interrupted",
          operatorPredictability: "MEDIUM — queued never start; interrupted still surprise",
          implementationScope: "MEDIUM — eligibility filter",
          backwardCompatibility: "queued_startup_resume removed",
          unexpectedExecutionRisk: "HIGH on this inventory",
          paperLiveEffect: "NONE",
          testImpact: "MEDIUM",
          migrationNeed: "NONE",
        },
        MODEL_D: {
          name: "RECENT_PROCESS_LOSS_ONLY",
          safety: "HIGH if lease identity is proven",
          crashContinuity: "HIGH for true crash",
          operatorPredictability: "MEDIUM — needs process/lease identity",
          implementationScope: "LARGE — current owners=0 so all 37 would be excluded unless new identity is stored",
          backwardCompatibility: "requires new evidence fields",
          unexpectedExecutionRisk: "LOW if proven recent only",
          paperLiveEffect: "NONE",
          testImpact: "HIGH",
          migrationNeed: "LIKELY",
        },
        MODEL_E: {
          name: "EXPLICIT_PERSISTED_OPT_IN",
          safety: "HIGH",
          crashContinuity: "only opted-in jobs",
          operatorPredictability: "HIGH",
          implementationScope: "LARGE — job schema + UI",
          backwardCompatibility: "existing 37 have no flag",
          unexpectedExecutionRisk: "LOW",
          paperLiveEffect: "NONE",
          testImpact: "HIGH",
          migrationNeed: "YES",
        },
      },
    });
    write("recommended-policy.json", {
      recommended: "MODEL_B",
      AUTO_RESUME_ORIGINAL_INTENT:
        "process-crash / disk-orphan continuity with a boot stampede cap; not autonomous unattended Research product policy",
      envOverride: true,
      envOverrideRule:
        "default 0 in every NODE_ENV; explicit REXTORA_ORPHAN_AUTO_RESUME_LIMIT>0 required; log selected count",
      explicitResumePath: EXPLICIT_RESUME_PATH,
      all37Discoverable: false,
      historyVisibleInterrupted: history.visible.length,
      historyHiddenInterrupted: history.hidden.length,
      operatorExperience: "SAFE_TO_DISABLE_NOW",
      operatorCompleteness: "SAFE_ONLY_WITH_RECOVERY_UI_FIX",
      canChangePolicyNow: true,
      requiredUiDependency:
        "Research history/attention must list all interrupted jobs so the operator can resume each deliberately",
      productionDataMigrationRequired: false,
      implementationFiles: [
        "src/lib/rextora/strategySearch/orphanJobRecovery.ts#resolveOrphanAutoResumeLimit",
        "instrumentation.ts (optional log)",
        "src/lib/rextora/botRuntime.ts#startBotRuntime (becomes no-op at 0)",
        "tests/orphanJobRecovery.test.ts",
        "tests/processInterruptionRecovery.test.ts",
        "tests/queuedDeadlineReachedPrevention.test.ts",
      ],
    });
    write("production-readonly-hashes.json", before);
    const after = collectProductionReadonlyHashes(root);
    expect(after).toEqual(before);
  });
});
