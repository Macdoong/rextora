/**
 * P2-G1 residual lifecycle inventory.
 * Temp stores for synthetic cases. Production is raw-read only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSeededRandom } from "../src/lib/rextora/strategySearch/random";
import {
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
} from "../src/lib/rextora/strategySearch/jobCheckpoint";
import {
  classifyCheckpoint,
  classifyInterruptedJob,
  detectDashboardContradiction,
  loadResidualLifecycleInventory,
  productionResidualInventoryRoot,
  sha256Path,
  writeResidualLifecycleInventoryArtifacts,
} from "../src/lib/rextora/strategySearch/residualLifecycleInventory";
import {
  createSearchJob,
  markSearchJobCompleted,
  markSearchJobRunning,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  markPlanInterrupted,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import type {
  StrategySearchConfig,
  StrategySearchJob,
  StrategySearchJobIndex,
} from "../src/lib/rextora/strategySearch/types";
import type { StrategySearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g1-residual-lifecycle-inventory/2026-09-03T04-25-00-000Z",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p2g1-"));
  tempRoots.push(root);
  return root;
}

function rawIndex(root: string): StrategySearchJobIndex {
  return JSON.parse(
    fs.readFileSync(path.join(root, "index.json"), "utf8"),
  ) as StrategySearchJobIndex;
}

function writePlan(
  jobId: string,
  root: string,
  reason: StrategySearchPlan["completionReason"],
): void {
  const plan = {
    ...createEmptySearchPlan({
      searchName: "g1",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      candidateBudget: 10,
      stageBatchSize: 1,
      maxRuntimeMs: 3_600_000,
      spaces: [{ id: "s1", labelKo: "s1" }],
    }),
    completionReason: reason,
  };
  saveSearchPlan(jobId, plan, { rootDir: root });
}

describe("P2-G1 residual Research lifecycle inventory", () => {
  it("1. all indexed jobs are enumerated", () => {
    const root = productionResidualInventoryRoot();
    const inventory = loadResidualLifecycleInventory(root);
    const index = rawIndex(root);
    expect(inventory.indexedJobCount).toBe(index.jobs.length);
    expect(inventory.jobs).toHaveLength(index.jobs.length);
    expect(new Set(inventory.jobs.map((j) => j.jobId))).toEqual(
      new Set(index.jobs.map((j) => j.id)),
    );
  });

  it("2. index/job status mismatch detection", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const index = rawIndex(root);
    index.jobs[0]!.status = "paused";
    fs.writeFileSync(
      path.join(root, "index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.indexJobStatusMismatchTotal).toBe(1);
    expect(inventory.invalidIds).toContain(job.id);
  });

  it("3. queued + normal terminal reason violation detection", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writePlan(job.id, root, "DEADLINE_REACHED");
    const inventory = loadResidualLifecycleInventory(root);
    const rec = inventory.jobs.find((j) => j.jobId === job.id);
    expect(rec?.findings).toContain("queued_plus_normal_terminal_reason");
    expect(inventory.invalidIds).toContain(job.id);
  });

  it("4. completed without finishedAt detection", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    const completed = markSearchJobCompleted(job.id, { rootDir: root });
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, "jobs", `${completed.id}.json`), "utf8"),
    );
    raw.finishedAt = null;
    fs.writeFileSync(
      path.join(root, "jobs", `${completed.id}.json`),
      JSON.stringify(raw, null, 2),
    );
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.terminalWithoutFinishedAt).toContain(completed.id);
    expect(inventory.invalidIds).toContain(completed.id);
  });

  it("5. terminal with owner detection", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    markSearchJobCompleted(job.id, { rootDir: root });
    fs.mkdirSync(path.join(root, "owners"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "owners", `${job.id}.owner.json`),
      JSON.stringify({
        jobId: job.id,
        ownerId: "owner_test",
        pid: 1,
        hostname: "test",
        acquiredAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        releasedAt: null,
        releaseReason: null,
      }),
    );
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.terminalWithActiveExecution).toContain(job.id);
    expect(inventory.invalidIds).toContain(job.id);
  });

  it("6. interrupted compatibility classification", () => {
    const now = Date.now();
    const job = {
      id: "search_11111111-1111-4111-8111-111111111111",
      status: "interrupted",
      finishedAt: null,
      checkpoint: {
        completedIterations: 1,
        nextIteration: 1,
        randomState: null,
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date(now).toISOString(),
      },
    } as StrategySearchJob;
    const plan = {
      campaignStartedAtMs: now - 1_000,
      interruptedAtMs: now,
      maxRuntimeMs: 3_600_000,
      completionReason: null,
    } as StrategySearchPlan;
    expect(
      classifyInterruptedJob({
        job,
        plan,
        inspection: {
          eligible: false,
          blocker: "MISSING_CHECKPOINT",
          activeElapsedMs: null,
          remainingMs: null,
        },
      }),
    ).toBe("HISTORICAL_ATTENTION_ONLY");
    expect(
      classifyInterruptedJob({
        job: { ...job, finishedAt: new Date(now).toISOString() },
        plan,
        inspection: {
          eligible: true,
          blocker: null,
          activeElapsedMs: 10,
          remainingMs: 100,
        },
      }),
    ).toBe("INVALID_INTERRUPTED");
    expect(
      classifyInterruptedJob({
        job,
        plan,
        inspection: {
          eligible: true,
          blocker: null,
          activeElapsedMs: 3_600_000,
          remainingMs: 0,
        },
      }),
    ).toBe("VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE");
    expect(
      classifyInterruptedJob({
        job,
        plan,
        inspection: {
          eligible: true,
          blocker: null,
          activeElapsedMs: 10,
          remainingMs: 100,
        },
      }),
    ).toBe("VALID_INTERRUPTED_RESUMABLE");
  });

  it("7. valid checkpoint lag is not falsely flagged", () => {
    const payload = createInitialRunnerPayload({
      prng: createSeededRandom(1).getState(),
      jobStatus: "queued",
    });
    const job = {
      id: "search_22222222-2222-4222-8222-222222222222",
      status: "completed",
      finishedAt: "2026-08-11T00:41:52.554Z",
      checkpoint: buildPersistedCheckpoint({
        completedIterations: 1,
        nextIteration: 1,
        payload,
        bestCandidate: null,
        bestPassedCandidate: null,
      }),
    } as StrategySearchJob;
    const result = classifyCheckpoint({ job, startEligible: false });
    expect(result.benignLag).toBe(true);
    expect(result.riskMismatch).toBe(false);
  });

  it("8. dangerous checkpoint mismatch is flagged", () => {
    const job = {
      id: "search_33333333-3333-4333-8333-333333333333",
      status: "queued",
      finishedAt: null,
      checkpoint: {
        completedIterations: 0,
        nextIteration: 0,
        randomState: "{not-json",
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    } as StrategySearchJob;
    const result = classifyCheckpoint({ job, startEligible: true });
    expect(result.riskMismatch).toBe(true);
    expect(result.benignLag).toBe(false);
  });

  it("9. startup recovery candidate classification", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.startup.autoStartCandidates).toContain(job.id);
    expect(inventory.startup.terminalStaleSkips).not.toContain(job.id);
  });

  it("10. terminal-stale startup skip classification", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    writePlan(job.id, root, "DEADLINE_REACHED");
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.startup.terminalStaleSkips).toContain(job.id);
    expect(inventory.startup.autoStartCandidates).not.toContain(job.id);
  });

  it("11. Dashboard lifecycle contradiction detection", () => {
    const result = detectDashboardContradiction({
      job: {
        id: "search_44444444-4444-4444-8444-444444444444",
        status: "interrupted",
        finishedAt: null,
      } as StrategySearchJob,
      plan: { completionReason: "DEADLINE_REACHED", qualifiedHashes: ["a"] } as StrategySearchPlan,
      executionActive: false,
    });
    expect(result.contradiction).toBe(true);
    expect(result.reason).toBe("outcome_presents_completed_but_job_not_completed");
  });

  it("12. exact disk-only separation", () => {
    const root = makeTempRoot();
    const indexed = createSearchJob(sampleConfig(), { rootDir: root });
    const fossilId = "search_55555555-5555-4555-8555-555555555555";
    fs.writeFileSync(
      path.join(root, "jobs", `${fossilId}.json`),
      JSON.stringify({
        id: fossilId,
        status: "completed",
        finishedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        startedAt: null,
        failureMessage: null,
        config: sampleConfig(),
        checkpoint: {
          completedIterations: 0,
          nextIteration: 0,
          randomState: null,
          bestCandidate: null,
          bestPassedCandidate: null,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      }),
    );
    const inventory = loadResidualLifecycleInventory(root);
    expect(inventory.indexedJobCount).toBe(1);
    expect(inventory.diskJobCount).toBe(2);
    expect(inventory.diskOnlyCount).toBe(1);
    expect(inventory.diskOnly.map((d) => d.jobId)).toEqual([fossilId]);
    expect(inventory.jobs.map((j) => j.jobId)).toEqual([indexed.id]);
  });

  it("13. disk-only jobs are not inserted into index", () => {
    const root = makeTempRoot();
    createSearchJob(sampleConfig(), { rootDir: root });
    const before = fs.readFileSync(path.join(root, "index.json"), "utf8");
    const fossilId = "search_66666666-6666-4666-8666-666666666666";
    fs.writeFileSync(
      path.join(root, "jobs", `${fossilId}.json`),
      JSON.stringify({
        id: fossilId,
        status: "queued",
        finishedAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        startedAt: null,
        failureMessage: null,
        config: sampleConfig(),
        checkpoint: {
          completedIterations: 0,
          nextIteration: 0,
          randomState: null,
          bestCandidate: null,
          bestPassedCandidate: null,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      }),
    );
    loadResidualLifecycleInventory(root);
    expect(fs.readFileSync(path.join(root, "index.json"), "utf8")).toBe(before);
    expect(rawIndex(root).jobs.some((row) => row.id === fossilId)).toBe(false);
  });

  it("14. inventory performs no production writes", () => {
    const root = productionResidualInventoryRoot();
    const beforeIndex = sha256Path(path.join(root, "index.json"));
    const index = rawIndex(root);
    const beforeJobs = index.jobs.map((row) =>
      sha256Path(path.join(root, "jobs", `${row.id}.json`)),
    );
    const beforePlans = index.jobs.map((row) =>
      sha256Path(path.join(root, "jobs", `${row.id}.plan.json`)),
    );
    const beforeOwn = sha256Path(path.join(root, "execution-ownership-audit.jsonl"));
    const beforeRec = sha256Path(path.join(root, "recovery-audit.jsonl"));
    const inventory = loadResidualLifecycleInventory(root);
    writeResidualLifecycleInventoryArtifacts(inventory, ARTIFACT_DIR);
    expect(sha256Path(path.join(root, "index.json"))).toBe(beforeIndex);
    expect(
      index.jobs.map((row) => sha256Path(path.join(root, "jobs", `${row.id}.json`))),
    ).toEqual(beforeJobs);
    expect(
      index.jobs.map((row) =>
        sha256Path(path.join(root, "jobs", `${row.id}.plan.json`)),
      ),
    ).toEqual(beforePlans);
    expect(sha256Path(path.join(root, "execution-ownership-audit.jsonl"))).toBe(
      beforeOwn,
    );
    expect(sha256Path(path.join(root, "recovery-audit.jsonl"))).toBe(beforeRec);
    expect(fs.existsSync(path.join(ARTIFACT_DIR, "inventory.json"))).toBe(true);
  });

  it("15. SAFE untouched", () => {
    expect(
      sha256Path(
        path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json"),
      ),
    ).toBe("fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0");
  });
});
