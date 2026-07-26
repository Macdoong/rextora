import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultOperatorFormState } from "@/components/rextora/strategySearch/formDefaults";
import { buildAppliedSettingsPreview } from "@/components/rextora/strategySearch/formValidation";
import {
  duplicateStrategySearchConfig,
  listStrategySearchConfigs,
  renameStrategySearchConfig,
  saveStrategySearchConfig,
  setDefaultStrategySearchConfig,
  deleteStrategySearchConfig,
} from "@/src/lib/rextora/strategySearch/searchConfigStore";
import {
  RESEARCH_TOP10_LIMIT,
  selectResearchTop10,
  buildAndPersistResearchTop10,
  getResearchTop10,
} from "@/src/lib/rextora/strategySearch/researchTop10";
import type { ResearchResultCard } from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import { previewResearchJobDeletion } from "@/src/lib/rextora/strategySearch/deletionSafety";
import {
  archiveResearchJob,
  isJobArchived,
  restoreArchivedResearchJob,
} from "@/src/lib/rextora/strategySearch/jobArchive";
import {
  createSearchJob,
  saveSearchTrial,
  type StrategySearchStoreOptions,
} from "@/src/lib/rextora/strategySearch/jobStore";
import {
  DEFAULT_RAW_TRIAL_RETENTION,
  executeRawTrialCleanup,
  previewRawTrialCleanup,
  setRawTrialRetentionPolicy,
} from "@/src/lib/rextora/strategySearch/rawTrialRetention";
import type { StrategySearchTrial } from "@/src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-top10-"));
  tempRoots.push(root);
  return { rootDir: root };
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function card(
  overrides: Partial<ResearchResultCard> & { paramsHash: string; iteration: number },
): ResearchResultCard {
  return {
    candidateId: `c_${overrides.iteration}`,
    readableName: "테스트 전략",
    displayAlias: `테스트 · ${overrides.iteration}`,
    strategyFamily: "ema_trend",
    symbol: "BTCUSDT",
    timeframe: "15m",
    sourceResearchJobId: "search_test",
    netReturn: 0.1,
    maxDrawdown: -0.1,
    tradeCount: 40,
    profitFactor: 1.5,
    totalCost: 1,
    costStatus: "비용 스트레스 통과",
    sampleConfidence: "표본 충분",
    sampleConfidenceDetail: "ok",
    score: 1,
    stressPassed: true,
    jitterPassed: true,
    robustnessStatus: "거래 안정성 통과",
    overfittingRisk: "low",
    eligibilityStatus: "최종 추천 가능",
    recommendable: true,
    finalRecommendable: true,
    roles: [],
    registrationState: "미등록",
    registeredStrategyId: null,
    clusterId: `cl_${overrides.iteration}`,
    isRepresentative: true,
    memberCount: 1,
    strongestPoint: "",
    primaryWeakness: "",
    recommendationReason: "테스트",
    leverageLabel: "고정 2.0x",
    whyNotRank1: "",
    vsPreviousRankNote: "",
    ...overrides,
  };
}

describe("applied settings terminology", () => {
  it("uses initial batch label instead of total evaluation count", () => {
    const { rows } = buildAppliedSettingsPreview(createDefaultOperatorFormState());
    expect(rows.some((r) => r.labelKo === "초기 평가 묶음")).toBe(true);
    expect(rows.some((r) => r.labelKo === "전체 평가 수")).toBe(false);
    expect(rows.some((r) => r.labelKo === "장기 저장 결과")).toBe(true);
  });
});

describe("selectResearchTop10", () => {
  it("caps at 10 unique identities and includes role strategies without duplication", () => {
    const reps = Array.from({ length: 20 }, (_, i) =>
      card({
        paramsHash: `h${i}`,
        iteration: i,
        netReturn: 0.5 - i * 0.01,
        maxDrawdown: -0.05 - i * 0.001,
        recommendable: i < 15,
        finalRecommendable: i < 10,
      }),
    );
    const top = selectResearchTop10(reps);
    expect(top.length).toBeLessThanOrEqual(RESEARCH_TOP10_LIMIT);
    const hashes = top.map((t) => t.paramsHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(top.some((t) => t.roles.includes("TOP 수익"))).toBe(true);
  });

  it("persists top10 and records rank changes on refresh", () => {
    const store = tempStore();
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "t",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 10,
        parameterRanges: [
          { key: "ema_fast", min: 10, max: 20, step: 1, valueType: "integer" },
        ],
        evaluationWindows: [
          {
            id: "w",
            label: "w",
            fromOpenTime: 0,
            toOpenTime: 1,
            requiredForPass: true,
          },
        ],
        passCriteria: {},
        costStress: { enabled: true, multipliers: [1.5] },
        jitter: { enabled: true, samples: 1, relativeAmplitude: 0.1 },
      },
      store,
    );
    const reps1 = [
      card({ paramsHash: "a", iteration: 1, netReturn: 0.2 }),
      card({ paramsHash: "b", iteration: 2, netReturn: 0.1 }),
    ];
    const snap1 = buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: reps1,
      options: store,
    });
    expect(snap1.entries.length).toBe(2);
    expect(getResearchTop10(job.id, store)?.entries[0]?.strategyHash).toBe("a");

    const reps2 = [
      card({ paramsHash: "b", iteration: 2, netReturn: 0.3 }),
      card({ paramsHash: "c", iteration: 3, netReturn: 0.25 }),
    ];
    const snap2 = buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: reps2,
      previousSameScope: snap1,
      options: store,
    });
    expect(snap2.entries.length).toBeLessThanOrEqual(10);
    expect(snap2.rankChanges.some((c) => c.change === "신규 진입")).toBe(true);
  });

  it("merges same-scope Top-10 across different jobs and ignores unrelated scopes", () => {
    const store = tempStore();
    const mkJob = () =>
      createSearchJob(
        {
          searchVersion: "1",
          strategyTemplateId: "t",
          symbols: ["BTCUSDT"],
          timeframe: "15m",
          dataVersion: "v1",
          seed: 1,
          generatorType: "random",
          maxIterations: 10,
          parameterRanges: [
            { key: "ema_fast", min: 10, max: 20, step: 1, valueType: "integer" },
          ],
          evaluationWindows: [
            {
              id: "w",
              label: "w",
              fromOpenTime: 0,
              toOpenTime: 1,
              requiredForPass: true,
            },
          ],
          passCriteria: {},
          costStress: { enabled: true, multipliers: [1.5] },
          jitter: { enabled: true, samples: 1, relativeAmplitude: 0.1 },
        },
        store,
      );
    const jobA = mkJob();
    const jobB = mkJob();
    const jobC = mkJob();
    const scope = "BTCUSDT|15m|balanced|standard|fresh|stress|jitter";
    const otherScope = "ETHUSDT|15m|balanced|standard|fresh|stress|jitter";

    buildAndPersistResearchTop10({
      jobId: jobA.id,
      scopeKey: scope,
      representatives: [
        card({ paramsHash: "keep-a", iteration: 1, netReturn: 0.4 }),
        card({ paramsHash: "old-b", iteration: 2, netReturn: 0.1 }),
      ],
      options: store,
    });
    buildAndPersistResearchTop10({
      jobId: jobC.id,
      scopeKey: otherScope,
      representatives: [
        card({
          paramsHash: "eth-only",
          iteration: 1,
          netReturn: 0.99,
          symbol: "ETHUSDT",
        }),
      ],
      options: store,
    });

    const snapB = buildAndPersistResearchTop10({
      jobId: jobB.id,
      scopeKey: scope,
      representatives: [
        card({ paramsHash: "new-c", iteration: 3, netReturn: 0.35 }),
      ],
      options: store,
    });
    const hashes = snapB.entries.map((e) => e.strategyHash);
    expect(hashes).toContain("keep-a");
    expect(hashes).toContain("new-c");
    expect(hashes).not.toContain("eth-only");
    expect(snapB.entries.length).toBeLessThanOrEqual(RESEARCH_TOP10_LIMIT);
    expect(snapB.rankChanges.some((c) => c.change === "신규 진입")).toBe(true);
  });
});

describe("search config management", () => {
  it("renames, duplicates, sets default, deletes without affecting jobs", () => {
    const store = tempStore();
    const form = createDefaultOperatorFormState();
    saveStrategySearchConfig("cfg_a", form, { rootDir: store.rootDir });
    renameStrategySearchConfig("cfg_a", "cfg_b", { rootDir: store.rootDir });
    expect(listStrategySearchConfigs({ rootDir: store.rootDir }).map((c) => c.name)).toEqual([
      "cfg_b",
    ]);
    duplicateStrategySearchConfig("cfg_b", "cfg_c", { rootDir: store.rootDir });
    setDefaultStrategySearchConfig("cfg_c", { rootDir: store.rootDir });
    const list = listStrategySearchConfigs({ rootDir: store.rootDir });
    expect(list.find((c) => c.name === "cfg_c")?.isDefault).toBe(true);
    expect(deleteStrategySearchConfig("cfg_b", { rootDir: store.rootDir })).toBe(true);
    // Job store untouched
    expect(fs.existsSync(path.join(store.rootDir!, "jobs"))).toBe(false);
  });
});

describe("raw trial retention", () => {
  it("defaults to keep_30_days and never cleans Top-10 source trials", () => {
    expect(DEFAULT_RAW_TRIAL_RETENTION).toBe("keep_30_days");
    const store = tempStore();
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "t",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 10,
        parameterRanges: [
          { key: "ema_fast", min: 10, max: 20, step: 1, valueType: "integer" },
        ],
        evaluationWindows: [
          {
            id: "w",
            label: "w",
            fromOpenTime: 0,
            toOpenTime: 1,
            requiredForPass: true,
          },
        ],
        passCriteria: {},
        costStress: { enabled: true, multipliers: [1.5] },
        jitter: { enabled: true, samples: 1, relativeAmplitude: 0.1 },
      },
      store,
    );
    const mkTrial = (iteration: number): StrategySearchTrial =>
      ({
        jobId: job.id,
        iteration,
        candidateId: `c_${iteration}`,
        paramsHash: `hash_${iteration}`,
        params: { ema_fast: 10 + iteration },
        metrics: {
          totalReturn: 0.1,
          maxDrawdown: -0.05,
          tradeCount: 20,
          profitFactor: 1.2,
        },
        passed: true,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      }) as StrategySearchTrial;
    saveSearchTrial(mkTrial(1), store);
    saveSearchTrial(mkTrial(2), store);
    buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: [
        card({
          paramsHash: "hash_1",
          iteration: 1,
          sourceResearchJobId: job.id,
        }),
      ],
      options: store,
    });
    setRawTrialRetentionPolicy("cleanup_after_top10", store);
    const preview = previewRawTrialCleanup(job.id, {
      ...store,
      policy: "cleanup_after_top10",
    });
    expect(preview.protectedTrialCount).toBeGreaterThanOrEqual(1);
    expect(preview.protectedIterations).toContain(1);
    expect(preview.deletableIterations).toContain(2);
    const dry = executeRawTrialCleanup(job.id, {
      ...store,
      policy: "cleanup_after_top10",
      dryRun: true,
    });
    expect(dry.deleted).toBe(0);
    expect(dry.deletableTrialCount).toBe(preview.deletableTrialCount);
    const done = executeRawTrialCleanup(job.id, {
      ...store,
      policy: "cleanup_after_top10",
      dryRun: false,
    });
    expect(done.deleted).toBe(preview.deletableTrialCount);
    const after = previewRawTrialCleanup(job.id, {
      ...store,
      policy: "cleanup_after_top10",
    });
    expect(after.protectedIterations).toContain(1);
    expect(after.deletableIterations).not.toContain(1);
  });
});

describe("deletion safety and archive", () => {
  it("archives paused job and restores; preview classifies missing refs", () => {
    const store = tempStore();
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "t",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 5,
        parameterRanges: [
          { key: "ema_fast", min: 10, max: 20, step: 1, valueType: "integer" },
        ],
        evaluationWindows: [
          {
            id: "w",
            label: "w",
            fromOpenTime: 0,
            toOpenTime: 1,
            requiredForPass: true,
          },
        ],
        passCriteria: {},
        costStress: { enabled: false, multipliers: [] },
        jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
      },
      store,
    );
    // queued is active — archive should fail; transition not needed for preview
    const preview = previewResearchJobDeletion(job.id, store);
    expect(preview.researchJobCount).toBe(1);
    expect(["deletable", "archive_only", "protected"]).toContain(
      preview.classification,
    );

    // Force paused via rewrite for archive test
    const jobPath = path.join(store.rootDir!, "jobs", `${job.id}.json`);
    const raw = JSON.parse(fs.readFileSync(jobPath, "utf8"));
    raw.status = "paused";
    fs.writeFileSync(jobPath, JSON.stringify(raw, null, 2));

    const archived = archiveResearchJob(job.id, "test", store);
    expect(archived.jobId).toBe(job.id);
    expect(isJobArchived(job.id, store)).toBe(true);
    restoreArchivedResearchJob(job.id, store);
    expect(isJobArchived(job.id, store)).toBe(false);
  });
});
