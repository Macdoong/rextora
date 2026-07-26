import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAndPersistResearchTop10,
  finalizeResearchTop10,
  getResearchTop10,
  rankChangeLabelShort,
  refreshLiveResearchTop10,
  selectResearchTop10,
} from "../src/lib/rextora/strategySearch";
import {
  PATTERN_SEARCH_SUPPORT,
  SEARCHABLE_STRATEGY_FAMILIES,
  isSearchableSpaceId,
} from "../src/lib/rextora/strategySearch/patternSupportMatrix";
import { buildPersistedSearchSummary } from "../src/lib/rextora/strategySearch/persistedSearchSummary";
import {
  detachResearchProvenance,
  previewStrategyDeletion,
} from "../src/lib/rextora/strategySearch/strategyDeletionSafety";
import {
  createSearchJob,
  markSearchJobCancelled,
  markSearchJobRunning,
  requestCancelSearchJob,
  saveSearchTrial,
  type StrategySearchConfig,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { createStrategy, listStrategies } from "../src/lib/rextora/strategy/strategyStore";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { previewResearchJobDeletion } from "../src/lib/rextora/strategySearch/deletionSafety";
import type { ResearchResultCard } from "../src/lib/rextora/strategySearch/researchResultsSummary";
import type { StrategySearchTrial } from "../src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];
const cleanups: Array<() => void> = [];
const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-live-top10-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "t",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 20, step: 1 }],
    evaluationWindows: [
      {
        id: "w",
        label: "w",
        fromOpenTime: Date.UTC(2024, 0, 1),
        toOpenTime: Date.UTC(2024, 0, 10),
      },
    ],
    passCriteria: {},
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function card(
  overrides: Partial<ResearchResultCard> & { paramsHash: string; iteration: number },
): ResearchResultCard {
  return {
    candidateId: `c_${overrides.iteration}`,
    readableName: "테스트",
    displayAlias: `테스트 · ${overrides.iteration}`,
    strategyFamily: "ema_trend",
    symbol: "BTCUSDT",
    timeframe: "15m",
    sourceResearchJobId: "search_x",
    netReturn: 0.1,
    maxDrawdown: -0.05,
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
    recommendationReason: "t",
    leverageLabel: "자동 1.0–3.0x",
    whyNotRank1: "",
    vsPreviousRankNote: "",
    ...overrides,
  };
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("live Top-10", () => {
  it("caps at 10 and dedupes by paramsHash", () => {
    const reps = Array.from({ length: 20 }, (_, i) =>
      card({
        paramsHash: i < 12 ? `h${i}` : "h0",
        iteration: i,
        netReturn: 0.5 - i * 0.01,
      }),
    );
    const top = selectResearchTop10(reps);
    expect(top.length).toBeLessThanOrEqual(10);
    expect(new Set(top.map((t) => t.paramsHash)).size).toBe(top.length);
  });

  it("persists live Top-10 and survives reload; finalize marks phase", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    const snap = buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: [
        card({ paramsHash: "a", iteration: 1, netReturn: 0.2 }),
        card({ paramsHash: "b", iteration: 2, netReturn: 0.1 }),
      ],
      options: store,
    });
    expect(snap.entries.length).toBe(2);
    expect(getResearchTop10(job.id, store)?.entries.length).toBe(2);
    const fin = finalizeResearchTop10(job.id, store);
    expect(fin?.phase).toBe("final");
    expect(fin?.finalEntries?.length).toBe(2);
    expect(rankChangeLabelShort("신규 진입")).toBe("신규");
    expect(rankChangeLabelShort("순위 상승")).toBe("상승");
    expect(rankChangeLabelShort("순위 유지")).toBe("유지");
  });

  it("cancel finalization freezes existing live Top-10 as final", async () => {
    const { finalizeCancellation } = await import(
      "../src/lib/rextora/strategySearch/cancellationLifecycle"
    );
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    buildAndPersistResearchTop10({
      jobId: job.id,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter",
      representatives: [
        card({ paramsHash: "a", iteration: 1, netReturn: 0.2 }),
        card({ paramsHash: "b", iteration: 2, netReturn: 0.1 }),
      ],
      options: store,
    });
    expect(getResearchTop10(job.id, store)?.entries.length).toBe(2);
    // Force cancel path as if cancel was requested while running.
    const { markSearchJobRunning, requestCancelSearchJob } = await import(
      "../src/lib/rextora/strategySearch/jobStore"
    );
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    const result = finalizeCancellation(job.id, store);
    expect(result.finalized).toBe(true);
    const snap = getResearchTop10(job.id, store);
    expect(snap?.phase).toBe("final");
    expect(snap?.finalEntries?.length).toBe(2);
    expect(snap?.finalizedAt).toBeTruthy();
  });

  it("refreshLiveResearchTop10 no-ops without qualified trials", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    expect(refreshLiveResearchTop10(job.id, store)).toBeNull();
  });
});

describe("pattern support matrix", () => {
  it("enables OB/FVG/TL/SR Search; Paper/Live stay partial", () => {
    for (const id of [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]) {
      const p = PATTERN_SEARCH_SUPPORT.find((row) => row.id === id);
      expect(p?.searchable).toBe(true);
      expect(p?.search).toBe("verification_required");
      expect(p?.backtest).toBe("verification_required");
      expect(p?.paper).toBe("partial");
      expect(p?.live).toBe("partial");
      expect(isSearchableSpaceId(id)).toBe(true);
    }
    expect(SEARCHABLE_STRATEGY_FAMILIES.every((f) => f.searchable)).toBe(true);
  });
});

describe("readable search summary", () => {
  it("builds human sections without requiring form JSON", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    saveSearchPlan(
      job.id,
      createEmptySearchPlan({
        searchName: "요약 테스트",
        depthProfile: "standard",
        qualificationProfile: "balanced",
        qualifiedTarget: 3,
        candidateBudget: 50,
        stageBatchSize: 10,
        maxRuntimeMs: 60_000,
        spaces: [
          { id: "ema_core", labelKo: "EMA" },
          { id: "rsi_pullback", labelKo: "RSI" },
        ],
        leverageMode: "automatic",
        leverageMin: 1,
        leverageMax: 5,
        adaptiveLeverageEnabled: true,
      }),
      store,
    );
    const summary = buildPersistedSearchSummary(job.id, store);
    expect(summary).not.toBeNull();
    expect(summary!.titleKo).toBe("설정 당시 적용값");
    expect(summary!.sections.some((s) => s.id === "strategy_scope")).toBe(true);
    expect(summary!.sections.some((s) => s.id === "risk")).toBe(true);
    expect(JSON.stringify(summary!.sections)).not.toMatch(/durationPreset/);
  });
});

describe("strategy detach unlocks research job deletion", () => {
  it("detaches provenance and classifies job deletable", () => {
    const store = tempStore();
    const iso = installIsolatedStrategyStore();
    cleanups.push(iso.cleanup);
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobRunning(job.id, store);
    requestCancelSearchJob(job.id, store);
    markSearchJobCancelled(job.id, store);
    const strategy = createStrategy({
      name: "linked",
      description: `promoted · sourceResearchJobId=${job.id} · sourceTrialIteration=1`,
    });
    expect(previewResearchJobDeletion(job.id, store).classification).toBe(
      "archive_only",
    );
    detachResearchProvenance(strategy.id);
    const after = listStrategies().find((s) => s.id === strategy.id)!;
    expect(after.description).toMatch(/researchProvenanceDetached=true/);
    expect(previewResearchJobDeletion(job.id, store).classification).toBe(
      "deletable",
    );
    expect(previewStrategyDeletion(strategy.id).classification).not.toBe(
      "absolute_protect",
    );
  });

  it("SAFE remains absolute_protect", () => {
    const before = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(previewStrategyDeletion("SAFE_v44_i4060").classification).toBe(
      "absolute_protect",
    );
    const after = crypto
      .createHash("sha256")
      .update(fs.readFileSync(SAFE_PATH))
      .digest("hex");
    expect(after).toBe(before);
  });
});

describe("library default expansion signal", () => {
  it("ResultsWorkbench defaults libraryOpen to true in source", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/results/ResultsWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/useState\(true\)/);
    expect(src).toMatch(/libraryOpen/);
  });
});
