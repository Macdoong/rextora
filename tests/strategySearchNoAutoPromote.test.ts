import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptySearchPlan,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { retryFailedPromotions } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  createSearchJob,
  saveSearchTrial,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import {
  percentInputToRatio,
  maxDrawdownPercentToPolicy,
} from "../components/rextora/strategySearch/unitMapping";
import { operatorFormToCreateBody, createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

function tempStore(): StrategySearchStoreOptions & { root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-no-auto-"));
  return { rootDir: root, root };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategy search no auto-registration", () => {
  it("orchestrator retryFailedPromotions does not call createStrategy", () => {
    const store = tempStore();
    const createSpy = vi.spyOn(strategyStore, "createStrategy");
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
          { key: "ema_fast", min: 8, max: 40, step: 1, valueType: "integer" },
        ],
        evaluationWindows: [
          {
            id: "full",
            label: "full",
            fromOpenTime: 0,
            toOpenTime: 1,
            requiredForPass: true,
          },
        ],
        balance: 10000,
        baseCostConfig: {
          feeRate: 0.0004,
          slippageRate: 0.0002,
          fundingRate: 0,
          applyFunding: false,
          applySpread: false,
          spreadRate: 0,
        },
        passPolicy: { thresholds: {} },
        scoreWeights: {
          returnWeight: 1,
          mddWeight: 1,
          profitFactorWeight: 0.25,
          winRateWeight: 0.25,
          tradeAdequacyWeight: 0.25,
          negativeMonthWeight: 0.1,
          consistencyWeight: 0.1,
        },
        costStressScenarios: [],
        jitterConfig: {
          enabled: false,
          sampleCount: 0,
          mutationScale: 0.2,
          seed: 1,
          minimumPassRate: 0,
          maximumScoreDropRatio: 1,
          parameterRanges: [],
        },
        dataRef: {
          source: "binance_historical",
          availableFrom: 0,
          availableTo: 1,
        },
      },
      store,
    );
    const plan = createEmptySearchPlan({
      searchName: "t",
      depthProfile: "fast",
      qualificationProfile: "aggressive",
      qualifiedTarget: 1,
      candidateBudget: 50,
      stageBatchSize: 20,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_trend", labelKo: "EMA 추세" }],
      minScore: null,
    });
    saveSearchPlan(job.id, plan, store);
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: `${job.id}_c0`,
        params: { ema_fast: 20 },
        paramsHash: "abcdef123456",
        score: 1,
        passed: true,
        failureReasons: [],
        windowResults: [
          { totalReturn: -0.01, mdd: -0.02, trades: 10, winRate: 0.3 },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
        generatorType: "random",
        parentCandidateIds: [],
      },
      store,
    );

    const next = retryFailedPromotions(job.id, store);
    expect(next?.qualifiedHashes).toContain("abcdef123456");
    expect(createSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(SAFE_PATH)).toBeTruthy();
  });

  it("percent UI maps to backend ratio units", () => {
    expect(percentInputToRatio("10")).toBeCloseTo(0.1);
    expect(percentInputToRatio("0")).toBe(0);
    expect(percentInputToRatio("")).toBeNull();
    expect(maxDrawdownPercentToPolicy("25")).toBeCloseTo(-0.25);
    const body = operatorFormToCreateBody(createDefaultOperatorFormState());
    expect(body.passPolicy.thresholds.maxMdd).toBeLessThan(0);
    expect(body.passPolicy.thresholds.maxMdd).toBeCloseTo(-0.25);
    expect(body.passPolicy.thresholds.minTotalReturn).toBe(0);
  });

  it("workbench source has no auto promote hooks", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("allPassed");
    expect(src).not.toContain("promotePassed");
    expect(src).toContain("iterations");
    const orch = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    expect(orch).not.toContain("promoteSearchCandidateToStrategy");
    expect(orch).toContain("recordQualifiedPasses");
  });
});
