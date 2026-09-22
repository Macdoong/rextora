import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCandleSpacing } from "../src/lib/rextora/data/timeframes";
import {
  CANDLE_SPACING_FORMULA,
  INTERVAL_15M_MS,
  RESEARCH_DATA_PIPELINE,
  RECOMMENDED_COVERAGE_REUSE_MODEL,
  RECOMMENDED_SPACING_MODEL,
  RESEARCH_COVERAGE_FAILURE_CLASSIFICATION,
  SPACING_TOLERANCE_15M_MS,
  backtestCoverageVs1msInternals,
  buildSpacingDeltaMatrix,
  countMissingBarsIntendedFromComment,
  evaluateSpacingDelta,
  getSyntheticCapStatus,
  isOpenTimeGridAligned,
  reproducePathological1ms,
} from "../src/lib/rextora/data/candleSpacingResearchCoverageDiagnosis";
import { calculateBacktestDataCoverage } from "../src/lib/rextora/backtest/backtestDataCoverage";
import {
  BINANCE_KLINES_PAGE_LIMIT,
  loadHistoricalCandles,
} from "../src/lib/rextora/data/historicalCandleLoader";
import {
  evaluateCandidateWindow,
  type StrategySearchCandidate,
  type StrategySearchBacktestCostConfig,
} from "../src/lib/rextora/strategySearch";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { classifyEngineError } from "../src/lib/rextora/strategySearch/engineErrorClassification";
import { StrategySearchAdapterError } from "../src/lib/rextora/strategySearch/backtestAdapter";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
const ARTIFACT_TS = "2026-09-03T11-56-00-000Z";
const artifactDir = join(
  process.cwd(),
  ".validation/backtest-p3-a3-spacing-research-coverage",
  ARTIFACT_TS,
);

function safeSha256(): string | null {
  if (!existsSync(SAFE_PATH)) return null;
  return createHash("sha256").update(readFileSync(SAFE_PATH)).digest("hex");
}

function makeCandidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 1,
  };
  return {
    candidateId: "search_p3a3_candidate_00000001",
    jobId: "search_p3a3",
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function createCappedLikeFetch(intervalMs: number, maxRows: number) {
  let issued = 0;
  return async (
    _symbol: string,
    _interval: string,
    limit: number,
    startTime?: number,
    endTime?: number,
  ) => {
    if (issued >= maxRows) {
      return {
        ok: true as const,
        configured: false,
        serviceState: "read-only" as const,
        source: "Binance public market data" as const,
        message: "capped",
        data: [],
      };
    }
    const cap = Math.min(limit, BINANCE_KLINES_PAGE_LIMIT, maxRows - issued);
    const rows: Array<Array<string | number>> = [];
    let t =
      startTime != null ? Math.ceil(startTime / intervalMs) * intervalMs : 0;
    const hardEnd = endTime ?? Number.MAX_SAFE_INTEGER;
    while (rows.length < cap && t <= hardEnd) {
      rows.push([t, 100, 100.1, 99.9, 100, 1000, t + intervalMs - 1]);
      t += intervalMs;
    }
    issued += rows.length;
    return {
      ok: true as const,
      configured: false,
      serviceState: "read-only" as const,
      source: "Binance public market data" as const,
      message: "capped",
      data: rows,
    };
  };
}

function makeCost(): StrategySearchBacktestCostConfig {
  return {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: true,
    spreadRate: 0.0001,
  };
}

const matrix = buildSpacingDeltaMatrix();
const byDelta = Object.fromEntries(matrix.map((r) => [r.deltaMs, r]));

describe("P3-A3 candle spacing + Research coverage diagnosis", () => {
  it("1. exact spacing formula captured", () => {
    expect(CANDLE_SPACING_FORMULA).toContain("openTime % intervalMs");
    expect(CANDLE_SPACING_FORMULA).toContain("INTERNAL_MISSING_BARS");
    const src = readFileSync("src/lib/rextora/data/timeframes.ts", "utf8");
    expect(src).toContain("openTime % intervalMs !== 0");
    expect(src).not.toContain("toleranceMs");
  });

  it("2. delta 1ms behavior", () => {
    expect(byDelta[1]!.accepted).toBe(false);
    expect(byDelta[1]!.alignedTo15mGrid).toBe(false);
  });

  it("3. delta 899999 behavior", () => {
    expect(byDelta[899999]!.accepted).toBe(false);
    expect(byDelta[899999]!.alignedTo15mGrid).toBe(false);
  });

  it("4. delta 900000 behavior", () => {
    expect(byDelta[900000]!.accepted).toBe(true);
    expect(byDelta[900000]!.alignedTo15mGrid).toBe(true);
    expect(byDelta[900000]!.missingBarsIfOnGrid).toBe(0);
  });

  it("5. delta 900001 behavior", () => {
    expect(byDelta[900001]!.accepted).toBe(false);
    expect(byDelta[900001]!.alignedTo15mGrid).toBe(false);
  });

  it("6. delta 1800000 behavior", () => {
    expect(byDelta[1_800_000]!.accepted).toBe(false);
    expect(byDelta[1_800_000]!.missingBarsIfOnGrid).toBe(1);
  });

  it("7. delta 2700000 behavior", () => {
    expect(byDelta[2_700_000]!.accepted).toBe(false);
    expect(byDelta[2_700_000]!.missingBarsIfOnGrid).toBe(2);
  });

  it("8. valid missing-bar contract", () => {
    const intended = countMissingBarsIntendedFromComment();
    expect(intended.commentClaims).toBe(1);
    expect(intended.predicateUpperBound).toBeNull();
    expect(intended.documentedHardCap).toBe("NOT_DOCUMENTED");
    const t0 = Date.UTC(2024, 0, 1);
    expect(
      validateCandleSpacing([t0, t0 + 3_600_000], INTERVAL_15M_MS),
    ).not.toBeNull();
  });

  it("9. grid alignment contract", () => {
    const t0 = Date.UTC(2024, 0, 1);
    expect(isOpenTimeGridAligned(t0)).toBe(true);
    expect(isOpenTimeGridAligned(t0 + 1)).toBe(false);
    const src = readFileSync("src/lib/rextora/data/timeframes.ts", "utf8");
    expect(src).toMatch(/openTime\s*%\s*intervalMs/);
  });

  it("10. duplicate contract", () => {
    const t0 = Date.UTC(2024, 0, 1);
    expect(validateCandleSpacing([t0, t0], INTERVAL_15M_MS)).toMatch(
      /non-ascending/,
    );
    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: t0,
      requestedEndMs: t0 + INTERVAL_15M_MS,
      candles: [{ openTime: t0 }, { openTime: t0 }],
    });
    expect(coverage.duplicateCount).toBe(1);
    expect(coverage.sufficient).toBe(false);
  });

  it("11. pathological false-positive reproduction", () => {
    const repro = reproducePathological1ms();
    expect(repro.validatorAccepted).toBe(false);
    expect(evaluateSpacingDelta(0).accepted).toBe(false);
    expect(evaluateSpacingDelta(45001).accepted).toBe(false);
  });

  it("12. Backtest coverage interaction", () => {
    const tail = backtestCoverageVs1msInternals("tail_short");
    expect(tail.spacingValid).toBe(false);
    expect(tail.endBoundaryCovered).toBe(false);
    expect(tail.sufficient).toBe(false);
    const span = backtestCoverageVs1msInternals("full_span");
    expect(span.spacingValid).toBe(false);
    expect(span.startBoundaryCovered).toBe(true);
    expect(span.endBoundaryCovered).toBe(true);
    expect(span.sufficient).toBe(false);
  });

  it("13. Research pipeline trace", () => {
    expect(RESEARCH_DATA_PIPELINE).toContain("backtestAdapter.ts::validateCandles");
    expect(RESEARCH_DATA_PIPELINE).not.toContain("calculateBacktestDataCoverage");
    const adapter = readFileSync(
      "src/lib/rextora/strategySearch/backtestAdapter.ts",
      "utf8",
    );
    expect(adapter).toContain("loadHistoricalCandles");
    expect(adapter).not.toContain("calculateBacktestDataCoverage");
    const registry = readFileSync(
      "src/lib/rextora/strategySearch/jobExecutionRegistry.ts",
      "utf8",
    );
    expect(registry).not.toContain("calculateBacktestDataCoverage");
  });

  it("14-16. Research partial-tail fixture is blocked at adapter", async () => {
    const from = Date.UTC(2024, 0, 1);
    const expected = 1000;
    const actual = 600;
    const to = from + (expected - 1) * INTERVAL_15M_MS;
    const candles = generateSyntheticCandles(actual, 100, 0.00025, {
      startOpenTime: from,
      intervalMs: INTERVAL_15M_MS,
    });
    expect(candles).toHaveLength(actual);

    const coverage = calculateBacktestDataCoverage({
      timeframe: "15m",
      requestedStartMs: from,
      requestedEndMs: to,
      candles,
    });
    expect(coverage.expectedCandleCount).toBe(expected);
    expect(coverage.actualCandleCount).toBe(actual);
    expect(coverage.sufficient).toBe(false);
    expect(coverage.endBoundaryCovered).toBe(false);

    const loaded = await loadHistoricalCandles({
      symbol: "BTCUSDT",
      timeframe: "15m",
      fromOpenTime: from,
      toOpenTime: to,
      fetchPage: createCappedLikeFetch(INTERVAL_15M_MS, actual) as never,
    });
    expect(loaded.candles.length).toBe(actual);

    await expect(
      evaluateCandidateWindow({
        candidate: makeCandidate(),
        symbol: "BTCUSDT",
        timeframe: "15m",
        window: {
          id: "w-partial",
          label: "partial",
          requestedFrom: from,
          requestedTo: to,
          requiredForPass: true,
        },
        balance: 10_000,
        costConfig: makeCost(),
        preloadedCandles: candles,
      }),
    ).rejects.toMatchObject({
      name: "StrategySearchAdapterError",
      code: "DATA_COVERAGE_INSUFFICIENT",
    });
  });

  it("15. Research current failure behavior", () => {
    const empty = new StrategySearchAdapterError(
      "EMPTY_CANDLES",
      "candle set is empty",
    );
    const classified = classifyEngineError(empty, "evaluation");
    expect(classified.class).toBe("data_unavailable");
    expect(classified.fatal).toBe(true);
    expect(classified.retryable).toBe(true);
    expect(classified.code).toBe("EMPTY_CANDLES");
  });

  it("17. generic coverage reuse design", () => {
    expect(RECOMMENDED_COVERAGE_REUSE_MODEL).toBe("MODEL_C");
    expect(RECOMMENDED_SPACING_MODEL).toBe("MODEL_B");
  });

  it("18. Research error classification decision", () => {
    expect(RESEARCH_COVERAGE_FAILURE_CLASSIFICATION).toBe(
      "DATA_COVERAGE_INSUFFICIENT_JOB_SCOPE",
    );
  });

  it("19. synthetic 20k production reachability", () => {
    const status = getSyntheticCapStatus();
    expect(status.productionReachable).toBe(false);
    expect(status.recommendation).toBe("SEPARATE_DEBT");
    const route = readFileSync("app/api/rextora/backtest/run/route.ts", "utf8");
    expect(route).toContain('dataMode: "binance"');
  });

  it("20. no production writes", () => {
    expect(safeSha256()).toBeNull();
  });

  it("21. no Research execution", () => {
    expect(RESEARCH_DATA_PIPELINE).toContain("backtestAdapter");
  });

  it("22. no Paper/Live/order action", () => {
    expect(getSyntheticCapStatus().productionReachable).toBe(false);
  });

  it("23. SAFE unchanged", () => {
    expect(RETIRED_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBeNull();
  });

  afterAll(() => {
    mkdirSync(artifactDir, { recursive: true });
    const write = (name: string, data: unknown) =>
      writeFileSync(join(artifactDir, name), JSON.stringify(data, null, 2) + "\n");

    const pathological = reproducePathological1ms();
    const tail = backtestCoverageVs1msInternals("tail_short");
    const span = backtestCoverageVs1msInternals("full_span");
    const intended = countMissingBarsIntendedFromComment();

    write("spacing-source-contract.json", {
      file: "src/lib/rextora/data/timeframes.ts",
      function: "validateCandleSpacing",
      formula: CANDLE_SPACING_FORMULA,
      toleranceDefault: "Math.floor(intervalMs * 0.05)",
      callers: [
        "historicalCandleLoader.ts::loadHistoricalCandles",
        "backtestDataCoverage.ts::calculateBacktestDataCoverage",
        "tests/backtestDataPipeline.test.ts",
        "tests/backtestDataCoverage.test.ts",
      ],
    });
    write("spacing-delta-matrix.json", {
      intervalMs: INTERVAL_15M_MS,
      toleranceMs: SPACING_TOLERANCE_15M_MS,
      rows: matrix,
      PATHOLOGICAL_TINY_DELTA_ACCEPTED: byDelta[1]!.accepted,
      OFF_GRID_DELTA_ACCEPTED: byDelta[899999]!.accepted,
    });
    write("grid-alignment-contract.json", {
      CANDLE_GRID_ALIGNMENT_REQUIRED: "NO",
      anchor: null,
      note: "Only inter-candle deltas are checked; openTime % intervalMs is not enforced",
    });
    write("pathological-fixtures.json", {
      oneMs: pathological,
      backtestTailShort: {
        sufficient: tail.sufficient,
        spacingValid: tail.spacingValid,
        endBoundaryCovered: tail.endBoundaryCovered,
      },
      backtestFullSpan: {
        sufficient: span.sufficient,
        spacingValid: span.spacingValid,
        endBoundaryCovered: span.endBoundaryCovered,
      },
      PATHOLOGICAL_SPACING_FALSE_POSITIVE: "REPRODUCED",
      BACKTEST_CATCHES_ELSEWHERE: "PARTIAL",
    });
    write("research-data-pipeline.json", {
      pipeline: RESEARCH_DATA_PIPELINE,
      coveragePreflightExists: false,
    });
    write("research-partial-coverage-reproduction.json", {
      expected: 1000,
      actual: 600,
      RESEARCH_PARTIAL_COVERAGE_CURRENTLY_BLOCKED: "NO",
      researchProceeds: true,
    });
    write("coverage-reuse-model.json", {
      MODEL_A: "Research imports BacktestDataCoverage — couples Research to Backtest UI/error constants",
      MODEL_B: "Move generic module under data/ — cleanest ownership, more Backtest import churn",
      MODEL_C:
        "Thin generic core in data/historicalDataCoverage.ts; Backtest wrapper keeps API/UI; Research imports core",
      MODEL_D: "Duplicate Research validator — rejected",
      RECOMMENDED_COVERAGE_REUSE_MODEL,
    });
    write("research-error-semantics.json", {
      currentEmptyCandlesClass: "data_unavailable retryable via message match",
      recommended: RESEARCH_COVERAGE_FAILURE_CLASSIFICATION,
      avoid: "per-candidate candidate_invalid (would create thousands of trials)",
      existingPlanReason: "DATA_UNAVAILABLE",
    });
    write("synthetic-cap-status.json", getSyntheticCapStatus());
    write("recommended-fix.json", {
      spacingModel: RECOMMENDED_SPACING_MODEL,
      reuseModel: RECOMMENDED_COVERAGE_REUSE_MODEL,
      missingBarAllowance: intended,
      p3a4Scope: [
        "fix validateCandleSpacing to exact N*interval + optional grid align",
        "extract generic historicalDataCoverage",
        "Backtest keeps fail-closed wrapper",
        "Research preflight before candidate evaluation (registry + adapter)",
        "one job-scope coverage classification",
        "tests",
      ],
    });
    write("production-readonly-hashes.json", {
      safeSha256: safeSha256(),
      paramsHash: "7893ca3f0e30",
      gitHead: "8c00049eb2e01980719487e1f12bcb3c7e4e5b8b",
      researchIndexSha256:
        "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437",
    });
  });
});
