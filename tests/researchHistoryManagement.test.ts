import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classificationLabelKo,
  filterBulkArchiveCandidates,
  filterBulkDeleteCandidates,
  selectFailedJobIds,
  selectUserStoppedJobIds,
} from "@/components/rextora/results/researchHistoryBulk";
import {
  archiveResearchJob,
  isJobArchived,
  listVisibleResearchJobs,
  restoreArchivedResearchJob,
} from "@/src/lib/rextora/strategySearch/jobArchive";
import {
  executeResearchJobDeletion,
  previewResearchJobDeletion,
  ResearchJobDeletionError,
  writeDeletionAudit,
} from "@/src/lib/rextora/strategySearch/deletionSafety";
import {
  createSearchJob,
  getSearchJob,
  listSearchJobs,
  markSearchJobCancelled,
  markSearchJobCompleted,
  markSearchJobFailed,
  markSearchJobRunning,
  requestCancelSearchJob,
  type StrategySearchConfig,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  deleteStrategySearchJobApi,
  listStrategySearchJobsApi,
  restoreStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { buildAndPersistResearchTop10 } from "@/src/lib/rextora/strategySearch/researchTop10";
import { createStrategy, listStrategies } from "@/src/lib/rextora/strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
} from "@/src/lib/rextora/strategy/strategyTypes";
import {
  installIsolatedStrategyStore,
} from "./helpers/isolatedStrategyStore";
import crypto from "node:crypto";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

const tempRoots: string[] = [];
const strategyCleanups: Array<() => void> = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-hist-mgmt-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 5,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 20, step: 1 }],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: Date.UTC(2024, 0, 1),
        toOpenTime: Date.UTC(2024, 0, 10),
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function seedTerminalJob(
  store: StrategySearchStoreOptions,
  status: "completed" | "cancelled" | "failed" = "cancelled",
) {
  const job = createSearchJob(sampleConfig(), store);
  markSearchJobRunning(job.id, store);
  if (status === "completed") markSearchJobCompleted(job.id, store);
  else if (status === "failed") markSearchJobFailed(job.id, "test failure", store);
  else {
    requestCancelSearchJob(job.id, store);
    markSearchJobCancelled(job.id, store);
  }
  return job.id;
}

afterEach(() => {
  while (strategyCleanups.length) strategyCleanups.pop()?.();
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("research history archive/delete management", () => {
  it("classifies archive_only when registered strategy references job", () => {
    const store = tempStore();
    const iso = installIsolatedStrategyStore();
    strategyCleanups.push(iso.cleanup);
    const jobId = seedTerminalJob(store);
    const strategy = createStrategy({
      name: "linked",
      description: `promoted · sourceResearchJobId=${jobId}`,
    });
    const preview = previewResearchJobDeletion(jobId, store);
    expect(preview.classification).toBe("archive_only");
    expect(preview.registeredStrategyRefs).toContain(strategy.id);
    expect(preview.protectedItems).toContain(`strategy:${strategy.id}`);
    expect(preview.reasonsKo[0]).toMatch(/보관만/);
  });

  it("archives and restores; archived jobs hidden from default list API", () => {
    const store = tempStore();
    const jobId = seedTerminalJob(store);
    archiveResearchJob(jobId, "test", store);
    expect(isJobArchived(jobId, store)).toBe(true);
    expect(listVisibleResearchJobs(store).some((j) => j.id === jobId)).toBe(
      false,
    );
    const visible = listStrategySearchJobsApi({ ...store, limit: 50 });
    expect(visible.some((j) => j.id === jobId)).toBe(false);
    const archived = listStrategySearchJobsApi({
      ...store,
      limit: 50,
      archivedOnly: true,
    });
    expect(archived.some((j) => j.id === jobId)).toBe(true);
    expect(archived.find((j) => j.id === jobId)?.isArchived).toBe(true);
    restoreStrategySearchJobApi(jobId, store);
    expect(isJobArchived(jobId, store)).toBe(false);
    expect(
      listStrategySearchJobsApi({ ...store, limit: 50 }).some(
        (j) => j.id === jobId,
      ),
    ).toBe(true);
  });

  it("deletes deletable job atomically with audit; preserves registered strategy", () => {
    const store = tempStore();
    const iso = installIsolatedStrategyStore();
    strategyCleanups.push(iso.cleanup);
    const deletableId = seedTerminalJob(store);
    const protectedId = seedTerminalJob(store);
    const strategy = createStrategy({
      name: "keep",
      description: `promoted · sourceResearchJobId=${protectedId}`,
    });
    const preview = previewResearchJobDeletion(deletableId, store);
    expect(preview.classification).toBe("deletable");
    expect(preview.trialCount).toBeGreaterThanOrEqual(0);
    const result = executeResearchJobDeletion(deletableId, store);
    expect(result).toEqual({ deleted: true, jobId: deletableId });
    expect(getSearchJob(deletableId, store)).toBeNull();
    expect(getSearchJob(protectedId, store)).not.toBeNull();
    const strategiesAfter = listStrategies();
    expect(strategiesAfter.some((s) => s.id === strategy.id)).toBe(true);
    const auditPath = path.join(store.rootDir!, "deletion-audit.jsonl");
    expect(fs.existsSync(auditPath)).toBe(true);
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]!) as { action: string; jobId: string };
    expect(last.action).toBe("delete");
    expect(last.jobId).toBe(deletableId);
  });

  it("blocks delete for archive_only and protected classifications", () => {
    const store = tempStore();
    const iso = installIsolatedStrategyStore();
    strategyCleanups.push(iso.cleanup);
    const jobId = seedTerminalJob(store);
    createStrategy({
      name: "block",
      description: `sourceResearchJobId=${jobId}`,
    });
    expect(() => executeResearchJobDeletion(jobId, store)).toThrow(
      ResearchJobDeletionError,
    );
    expect(() => deleteStrategySearchJobApi(jobId, store)).toThrow(/참조|출처/);
    expect(getSearchJob(jobId, store)).not.toBeNull();
  });

  it("impact preview reports trials, top10, refs, and bytes", () => {
    const store = tempStore();
    const jobId = seedTerminalJob(store, "completed");
    buildAndPersistResearchTop10({
      jobId,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: [
        {
          iteration: 1,
          candidateId: "c1",
          paramsHash: "abc",
          readableName: "t",
          displayAlias: "t",
          strategyFamily: "ema_trend",
          symbol: "BTCUSDT",
          timeframe: "15m",
          sourceResearchJobId: jobId,
          netReturn: 0.1,
          maxDrawdown: -0.05,
          tradeCount: 20,
          profitFactor: 1.2,
          totalCost: 1,
          costStatus: "ok",
          sampleConfidence: "ok",
          sampleConfidenceDetail: "ok",
          score: 1,
          stressPassed: true,
          jitterPassed: true,
          robustnessStatus: "ok",
          overfittingRisk: "low",
          eligibilityStatus: "ok",
          recommendable: true,
          finalRecommendable: true,
          roles: [],
          registrationState: "미등록",
          registeredStrategyId: null,
          clusterId: "cl1",
          isRepresentative: true,
          memberCount: 1,
          strongestPoint: "",
          primaryWeakness: "",
          recommendationReason: "t",
          leverageLabel: "—",
          whyNotRank1: "",
          vsPreviousRankNote: "",
        },
      ],
      options: store,
    });
    const preview = previewResearchJobDeletion(jobId, store);
    expect(preview.researchJobCount).toBe(1);
    expect(preview.top10Count).toBe(1);
    expect(preview.bytesToRemove).toBeGreaterThan(0);
    expect(preview.backtestRefs).toEqual([]);
    expect(preview.paperRefs).toEqual([]);
    expect(preview.liveRefs).toEqual([]);
  });

  it("bulk delete filters out active and protected jobs", () => {
    const store = tempStore();
    const iso = installIsolatedStrategyStore();
    strategyCleanups.push(iso.cleanup);
    const deletable = seedTerminalJob(store);
    const referenced = seedTerminalJob(store);
    createStrategy({
      name: "ref",
      description: `sourceResearchJobId=${referenced}`,
    });
    const active = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(active.id, store);
    const jobs = listSearchJobs(store).map((j) => ({
      id: j.id,
      status: j.status,
      completionReason: j.completionReason ?? null,
    }));
    const impacts = Object.fromEntries(
      jobs.map((j) => [
        j.id,
        previewResearchJobDeletion(j.id, store),
      ]),
    );
    const selected = jobs.map((j) => j.id);
    const deletableOnly = filterBulkDeleteCandidates(
      selected,
      new Map(jobs.map((j) => [j.id, j])),
      impacts,
    );
    expect(deletableOnly).toContain(deletable);
    expect(deletableOnly).not.toContain(referenced);
    expect(deletableOnly).not.toContain(active.id);
    const archivable = filterBulkArchiveCandidates(
      selected,
      new Map(jobs.map((j) => [j.id, j])),
      impacts,
    );
    expect(archivable).toContain(referenced);
    expect(archivable).not.toContain(active.id);
  });

  it("preset selectors pick failed and user-stopped jobs only", () => {
    const jobs = [
      { id: "a", status: "failed", completionReason: null },
      { id: "b", status: "cancelled", completionReason: "USER_CANCELLED" },
      { id: "c", status: "completed", completionReason: "DEADLINE_REACHED" },
    ];
    expect(selectFailedJobIds(jobs)).toEqual(["a"]);
    expect(selectUserStoppedJobIds(jobs)).toEqual(["b"]);
  });

  it("does not touch SAFE during deletion operations", () => {
    const store = tempStore();
    const beforeHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    const jobId = seedTerminalJob(store);
    executeResearchJobDeletion(jobId, store);
    const afterHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    expect(afterHash).toBe(beforeHash);
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    writeDeletionAudit({ action: "test_safe_check", jobId }, store);
    const afterAuditHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    expect(afterAuditHash).toBe(beforeHash);
  });

  it("restore archive writes audit event", () => {
    const store = tempStore();
    const jobId = seedTerminalJob(store);
    archiveResearchJob(jobId, "test", store);
    restoreArchivedResearchJob(jobId, store);
    const auditPath = path.join(store.rootDir!, "deletion-audit.jsonl");
    const events = fs
      .readFileSync(auditPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { action: string; jobId: string });
    expect(events.some((e) => e.action === "archive" && e.jobId === jobId)).toBe(
      true,
    );
    expect(
      events.some((e) => e.action === "restore_archive" && e.jobId === jobId),
    ).toBe(true);
  });

  it("exports required Korean classification labels", () => {
    expect(classificationLabelKo("deletable")).toBe("삭제 가능");
    expect(classificationLabelKo("archive_only")).toBe("보관만 가능");
    expect(classificationLabelKo("protected")).toBe("보호됨");
  });
});
