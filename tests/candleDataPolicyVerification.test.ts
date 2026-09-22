/**
 * P3-A3.1 forensic policy verification.
 * Isolated classification/fixtures only — no production Research/Paper/Live/orders.
 */

import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCandleSpacing } from "../src/lib/rextora/data/timeframes";
import {
  CANONICAL_GRID_POLICY,
  CODE_BASED_CLASSIFICATION_INTEGRATION,
  CODE_BASED_CLASSIFICATION_SUPPORTED,
  DEFENSIVE_SECONDARY_VALIDATION_LOCATION,
  EXPECTED_GIT_HEAD,
  EXPECTED_SAFE_SHA256,
  EXPLICIT_PRODUCT_GAP_POLICY_FOUND,
  OPEN_TIME_TRANSFORM,
  P3_A4_POLICY_READY,
  RECOMMENDED_INTERNAL_GAP_POLICY,
  RECOMMENDED_RESEARCH_ERROR_MODEL,
  RECOMMENDED_RESEARCH_PREFLIGHT_LOCATION,
  SAFE_PATH,
  SUPPORTED_MARKET_DATA_TIMEFRAMES,
  analyzeFixtureGridAgreement,
  analyzeOpenTimeSeries,
  captureProductionReadonlyHashes,
  classifyAdjacentDelta,
  frozenP3A4Contract,
  gapModelComparison,
  inventoryResearchErrors,
  measureMissingBarStrategySensitivity,
  probeLiveProviderGrid,
  proveResearchErrorPropagation,
  researchErrorModelComparison,
  sha256File,
} from "../src/lib/rextora/data/candleDataPolicyVerification";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { classifyEngineError } from "../src/lib/rextora/strategySearch/engineErrorClassification";
import { StrategySearchAdapterError } from "../src/lib/rextora/strategySearch/backtestAdapter";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const INTERVAL_15M = 900_000;
const researchIndexBefore = sha256("data/rextora/strategy-search/index.json");
const ARTIFACT_TS = "2026-09-03T12-20-00-000Z";
const artifactDir = join(
  process.cwd(),
  ".validation/backtest-p3-a3-1-data-policy",
  ARTIFACT_TS,
);

let liveProbe: Awaited<ReturnType<typeof probeLiveProviderGrid>> | null = null;

function sha256(rel: string): string {
  return createHash("sha256").update(readFileSync(rel)).digest("hex");
}

describe("P3-A3.1 candle data policy verification", () => {
  it("1. supported timeframe list captured", () => {
    expect(SUPPORTED_MARKET_DATA_TIMEFRAMES.map((r) => r.timeframe)).toEqual([
      "1m",
      "3m",
      "5m",
      "15m",
      "1h",
    ]);
  });

  it("2. interval mapping captured", () => {
    const byId = Object.fromEntries(
      SUPPORTED_MARKET_DATA_TIMEFRAMES.map((r) => [r.timeframe, r]),
    );
    expect(byId["1m"]).toMatchObject({
      intervalMs: 60_000,
      providerInterval: "1m",
    });
    expect(byId["3m"]).toMatchObject({
      intervalMs: 180_000,
      providerInterval: "3m",
    });
    expect(byId["5m"]).toMatchObject({
      intervalMs: 300_000,
      providerInterval: "5m",
    });
    expect(byId["15m"]).toMatchObject({
      intervalMs: 900_000,
      providerInterval: "15m",
    });
    expect(byId["1h"]).toMatchObject({
      intervalMs: 3_600_000,
      providerInterval: "1h",
    });
  });

  it("3. raw provider openTime contract", () => {
    expect(OPEN_TIME_TRANSFORM).toBe("RAW");
  });

  it("4. exact-grid fixture validation", () => {
    const fixture = analyzeFixtureGridAgreement();
    expect(fixture.FIXTURE_GRID_MATCHES_PROVIDER_CONTRACT).toBe("YES");
    for (const row of fixture.syntheticByTf) {
      expect(row.uniqueRemainders).toEqual([0]);
      expect(row.offGridCount).toBe(0);
      expect(row.nonExactDeltaCount).toBe(0);
    }
    const candles = generateSyntheticCandles(12, 100, 0, {
      startOpenTime: Date.UTC(2024, 0, 1),
      intervalMs: INTERVAL_15M,
    });
    expect(
      validateCandleSpacing(
        candles.map((c) => c.openTime),
        INTERVAL_15M,
      ),
    ).toBeNull();
    expect(
      analyzeOpenTimeSeries(
        candles.map((c) => c.openTime),
        INTERVAL_15M,
      ).uniqueRemainders,
    ).toEqual([0]);
  });

  it("5. 1ms classified off-grid", () => {
    expect(classifyAdjacentDelta(1, INTERVAL_15M)).toBe("OFF_GRID");
  });

  it("6. 899999ms classified off-grid", () => {
    expect(classifyAdjacentDelta(899_999, INTERVAL_15M)).toBe("OFF_GRID");
  });

  it("7. 900000ms classified valid adjacency", () => {
    expect(classifyAdjacentDelta(900_000, INTERVAL_15M)).toBe("VALID");
  });

  it("8. 900001ms classified off-grid", () => {
    expect(classifyAdjacentDelta(900_001, INTERVAL_15M)).toBe("OFF_GRID");
  });

  it("9. 1800000ms classified per gap policy candidate", () => {
    expect(classifyAdjacentDelta(1_800_000, INTERVAL_15M)).toBe("MISSING_BAR");
    expect(RECOMMENDED_INTERNAL_GAP_POLICY).toBe("MODEL_GAP_A");
  });

  it("10. missing-bar strategy sensitivity captured", () => {
    const sensitivity = measureMissingBarStrategySensitivity();
    expect(
      sensitivity.MISSING_BAR_CAN_MATERIALLY_CHANGE_STRATEGY_RESULT,
    ).toBe("YES");
    expect(sensitivity.mechanisms[0]?.emaTailChanged).toBe(true);
    expect(sensitivity.mechanisms[3]?.missingMiddleCanCreateGap).toBe(true);
  });

  it("11. gap policy evidence captured", () => {
    expect(EXPLICIT_PRODUCT_GAP_POLICY_FOUND).toBe("NO");
    expect(gapModelComparison().RECOMMENDED_INTERNAL_GAP_POLICY).toBe(
      "MODEL_GAP_A",
    );
  });

  it("12. provider-error propagation", () => {
    const rows = proveResearchErrorPropagation();
    expect(rows.provider_network.thrownCode).toBe("BINANCE_FETCH_FAILED");
    expect(rows.provider_network.classified.code).toBe("BINANCE_FETCH_FAILED");
    expect(rows.provider_network.classified.class).toBe("data_unavailable");
    expect(rows.provider_network.classified.fatal).toBe(true);
  });

  it("13. empty-candle propagation", () => {
    const rows = proveResearchErrorPropagation();
    expect(rows.empty_candles_adapter.classified.class).toBe("data_unavailable");
    expect(rows.empty_candles_adapter.classified.code).toBe("EMPTY_CANDLES");
    expect(rows.empty_candles_adapter.classified.retryable).toBe(true);
    expect(rows.empty_candles_loader.classified.code).toBe("EMPTY_CANDLES");
    expect(rows.empty_candles_loader.classified.class).toBe("data_unavailable");
  });

  it("14. partial-coverage propagation", () => {
    const rows = proveResearchErrorPropagation();
    expect(rows.partial_coverage.proceedsToEvaluation).toBe(false);
  });

  it("15. off-grid propagation", () => {
    const rows = proveResearchErrorPropagation();
    expect(validateCandleSpacing([Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 1) + 1], INTERVAL_15M)).not.toBeNull();
    expect(rows.off_grid_spacing_reject.thrownCode).toBe("SPACING_INCONSISTENT");
    expect(rows.off_grid_spacing_reject.classified.code).toBe("SPACING_INCONSISTENT");
    expect(rows.off_grid_spacing_reject.classified.class).toBe("data_unavailable");
  });

  it("16. config-error control case", () => {
    const rows = proveResearchErrorPropagation();
    expect(rows.config_invalid.thrownCode).toBe("CONFIGURATION_INVALID");
    expect(rows.config_invalid.classified.code).toBe("CONFIGURATION_INVALID");
    expect(rows.config_invalid.classified.fatal).toBe(true);
    expect(rows.config_invalid.classified.class).toBe("fatal_engine_error");
  });

  it("17. typed classification capability", () => {
    expect(CODE_BASED_CLASSIFICATION_SUPPORTED).toBe("YES");
    expect(CODE_BASED_CLASSIFICATION_INTEGRATION).toContain(
      "classifyEngineError",
    );
    const adapter = new StrategySearchAdapterError(
      "EMPTY_CANDLES",
      "candle set is empty",
    );
    expect(adapter.code).toBe("EMPTY_CANDLES");
    const classified = classifyEngineError(adapter, "evaluation");
    expect(classified.class).toBe("data_unavailable");
    expect(classified.code).toBe("EMPTY_CANDLES");
    expect(classified.code).toBe(adapter.code);
  });

  it("18. no per-candidate invalid loop design", () => {
    const model = researchErrorModelComparison();
    expect(model.RECOMMENDED_RESEARCH_ERROR_MODEL).toBe("MODEL_ERR_C");
    expect(model.AUTO_RETRY_BEHAVIOR).toContain("no per-candidate");
    expect(model.COVERAGE_FAILURE_JOB_STATUS).toBe("failed");
  });

  it("19. preflight location decision", () => {
    expect(RECOMMENDED_RESEARCH_PREFLIGHT_LOCATION).toContain(
      "jobExecutionRegistry.ts::resolveCandles",
    );
    expect(DEFENSIVE_SECONDARY_VALIDATION_LOCATION).toContain(
      "backtestAdapter.ts::validateCandles",
    );
  });

  it("20. frozen P3-A4 contract", () => {
    const contract = frozenP3A4Contract();
    expect(contract.P3_A4_POLICY_READY).toBe("YES");
    expect(contract.CANONICAL_CANDLE_GRID_RULE.policy).toBe(CANONICAL_GRID_POLICY);
    expect(contract.INTERNAL_MISSING_BAR_RULE.policy).toContain("MODEL_GAP_A");
    expect(contract.RESEARCH_COVERAGE_FAILURE_RULE.policy).toBe("MODEL_ERR_C");
    expect(contract.productionDataMigrationRequired).toBe(false);
  });

  it("21. no production write", () => {
    expect(existsSync(SAFE_PATH)).toBe(false);
    expect(sha256File(SAFE_PATH)).toBeNull();
    expect(sha256File("data/rextora/strategy-search/index.json")).toBe(
      researchIndexBefore,
    );
    expect(P3_A4_POLICY_READY).toBe("YES");
  });

  it("22. no Research execution", () => {
    expect(captureProductionReadonlyHashes().researchExecutions).toBe(0);
    expect(RECOMMENDED_RESEARCH_PREFLIGHT_LOCATION).not.toContain("runSearchJob");
  });

  it("23. no Paper/Live/order action", () => {
    const hashes = captureProductionReadonlyHashes();
    expect(hashes.paperLiveActions).toBe(0);
    expect(hashes.orders).toBe(0);
  });

  it("24. retired SAFE file is not present", () => {
    expect(RETIRED_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(existsSync(SAFE_PATH)).toBe(false);
    expect(sha256File(SAFE_PATH)).toBeNull();
  });

  it("live provider grid probe (read-only public klines)", async () => {
    liveProbe = await probeLiveProviderGrid({ limit: 40, timeoutMs: 12_000 });
    if (liveProbe.LIVE_PROVIDER_PROBE === "UNAVAILABLE") {
      expect(liveProbe.authenticated).toBe(false);
      return;
    }
    expect(liveProbe.authenticated).toBe(false);
    expect(liveProbe.cacheModified).toBe(false);
    for (const row of liveProbe.rows) {
      expect(row.available).toBe(true);
      expect(row.sampleCount).toBeGreaterThanOrEqual(20);
      expect(row.uniqueRemainders).toEqual([0]);
      expect(row.offGridCount).toBe(0);
      expect(row.nonExactDeltaCount).toBe(0);
      expect(row.exactGrid).toBe("YES");
      expect(row.observedRemainder).toBe(0);
    }
  });

  afterAll(() => {
    mkdirSync(artifactDir, { recursive: true });
    const write = (name: string, data: unknown) =>
      writeFileSync(join(artifactDir, name), `${JSON.stringify(data, null, 2)}\n`);

    const fixture = analyzeFixtureGridAgreement();
    const sensitivity = measureMissingBarStrategySensitivity();
    const propagation = proveResearchErrorPropagation();
    const hashes = captureProductionReadonlyHashes();
    const backtestDir = join(process.cwd(), "data/rextora/backtests");
    const backtestRecordHashes: Record<string, string> = {};
    try {
      for (const name of readdirSync(backtestDir)) {
        if (!name.endsWith(".json") || name.endsWith(".chart.json")) continue;
        backtestRecordHashes[name] = sha256(join(backtestDir, name));
      }
    } catch {
      /* directory optional */
    }

    write("supported-timeframes.json", {
      SUPPORTED_MARKET_DATA_TIMEFRAMES,
      sources: [
        "src/lib/rextora/data/timeframes.ts::SUPPORTED_TIMEFRAMES",
        "src/lib/rextora/strategySearch/operatorProfiles.ts::OPERATOR_SUPPORTED_TIMEFRAMES",
        "components/rextora/backtest/SafeBacktestPanel.tsx",
        "components/rextora/strategySearch/formDefaults.ts",
      ],
      calendarIntervalsInSet: false,
    });
    write("provider-grid-source.json", {
      OPEN_TIME_TRANSFORM,
      CANONICAL_GRID_POLICY,
      mapping: "candlesFromBinanceKlines openTime: Number(row[0])",
      cursor: "lastOpen + 1",
      timezoneOffsetApplied: false,
      snap: false,
    });
    write(
      "provider-grid-live-probe.json",
      liveProbe ?? {
        LIVE_PROVIDER_PROBE: "UNAVAILABLE",
        note: "probe test did not populate liveProbe",
      },
    );
    write("fixture-grid-crosscheck.json", fixture);
    write("gap-policy-evidence.json", {
      EXPLICIT_PRODUCT_GAP_POLICY_FOUND,
      comment: "validateCandleSpacing JSDoc claims one missing bar",
      predicate: "unbounded N * interval with ±5% remainder tolerance",
      testsProveAtLeastOneHole: true,
      documentedHardCap: null,
    });
    write("strategy-gap-sensitivity.json", sensitivity);
    write("gap-model-comparison.json", gapModelComparison());
    write("research-error-inventory.json", inventoryResearchErrors());
    write("research-error-propagation.json", propagation);
    write("research-error-model.json", researchErrorModelComparison());
    write("p3-a4-frozen-contract.json", frozenP3A4Contract());
    write("production-readonly-hashes.json", {
      ...hashes,
      gitHead: EXPECTED_GIT_HEAD,
      expectedSafeSha256: EXPECTED_SAFE_SHA256,
      backtestRecordHashes,
    });
  });
});
