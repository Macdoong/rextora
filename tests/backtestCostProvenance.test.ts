import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COST_ASSUMPTIONS_VERSION,
  COST_GUARD_SLIPPAGE_ESTIMATE_RATE_TIMES_TWO,
  DEFAULT_APPLY_FUNDING,
  DEFAULT_APPLY_SPREAD,
  DEFAULT_COST_GUARD_K,
  DEFAULT_FEE_RATE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_SPREAD_RATE,
  FEE_LEG_COUNT,
  FEE_MODEL_ROUND_TRIP_TAKER_2X,
  FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE,
  RATE_UNIT_DECIMAL_FRACTION,
  SLIPPAGE_LEG_COUNT,
  SPREAD_MODEL_FLAT_FRACTION_PER_TRADE,
  enrichCostStressRow,
  formatDecimalRateAsPercentLabel,
  formatCostAssumptionsDisclosure,
  normalizeCostAssumptions,
  reconstructAppliedCostAssumptions,
  resolveEffectiveRates,
  resolvePrimaryCostAssumptions,
  resolveScenarioCostAssumptions,
  stampReportCostProvenance,
  type CostAssumptionsV1,
} from "../src/lib/rextora/backtest/costAssumptions";
import {
  SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
  SLIPPAGE_MODEL_LEGACY_V0,
} from "../src/lib/rextora/backtest/executionSlippage";
import {
  IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1,
  IDENTITY_SCHEMA_LEGACY_ORIGINAL,
  IDENTITY_SCHEMA_P3A52,
  backtestResultHash,
  getSavedBacktest,
  resolveBacktestIdentitySchema,
} from "../src/lib/rextora/backtest/backtestStore";
import {
  ACTIVE_SESSION_POLICY,
  LEGACY_NEW_LIVE_ADVANCEMENT_ALLOWED,
  LEGACY_NEW_PAPER_ADVANCEMENT_ALLOWED,
  LEGACY_RESULT_COMPARE_ALLOWED,
  LEGACY_RESULT_DEEP_LINK_ALLOWED,
  LEGACY_RESULT_VIEW_ALLOWED,
  evaluateBacktestEligibility,
  eligibilityBlocksPaperLive,
  resolveEligibilityCostRatio,
} from "../src/lib/rextora/backtest/backtestEligibility";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { LEGACY_SAVED_IDS } from "../src/lib/rextora/backtest/backtestCostProvenanceContract";
import type {
  BacktestConfig,
  BacktestReport,
  SavedBacktestResult,
} from "../src/lib/rextora/backtest/backtestTypes";

import { productionBacktestsRoot } from "./helpers/productionResearchBaseline";
import { RETIRED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const PROD_BACKTESTS = productionBacktestsRoot();
const EXPECTED_SAFE_SHA256 =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const hashesBefore = productionReadonlyHashes(ROOT);
const legacyShasBefore = LEGACY_SAVED_IDS.map((id) => {
  const p = join(ROOT, "data/rextora/backtests", `${id}.json`);
  return {
    id,
    sha: existsSync(p)
      ? createHash("sha256").update(readFileSync(p)).digest("hex")
      : null,
  };
});
const LEGACY_RECORDS_PRESENT = legacyShasBefore.every((row) => row.sha != null);

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sha256File(p: string): string | null {
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function baseConfig(
  overrides: Partial<BacktestConfig> = {},
): BacktestConfig {
  const assumptions = normalizeCostAssumptions({
    feeRate: overrides.feeRate,
    slippageRate: overrides.slippageRate,
    fundingRate: overrides.fundingRate,
    applyFunding: overrides.applyFunding,
    spreadRate: overrides.spreadRate,
    applySpread: overrides.applySpread,
    costGuardK: overrides.costGuardK,
  });
  const rates = resolveEffectiveRates(assumptions);
  return {
    strategyId: "SAFE_v44_i4060",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromOpenTime: 1,
    toOpenTime: 2,
    balance: 10_000,
    feeRate: rates.feeRate,
    slippageRate: rates.slippageRate,
    fundingRate: rates.fundingRate,
    applyFunding: rates.applyFunding,
    applySpread: rates.applySpread,
    spreadRate: rates.spreadRate,
    costStressMultipliers: overrides.costStressMultipliers ?? [1, 1.5, 2],
    costGuardK: rates.costGuardK,
    costAssumptions: assumptions,
    ...overrides,
    costAssumptions: overrides.costAssumptions ?? assumptions,
  };
}

function emptyReport(
  assumptions: CostAssumptionsV1,
  extras: Partial<BacktestReport> = {},
): BacktestReport {
  return {
    strategyName: "SAFE",
    strategyHash: "abc",
    strategyId: "SAFE_v44_i4060",
    sourceStatus: "user_created",
    symbol: "BTCUSDT",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    requestedFrom: null,
    requestedTo: null,
    actualFirstCandleTime: null,
    actualLastCandleTime: null,
    candleCount: 10,
    processedCandleCount: 10,
    dataSource: "synthetic-test",
    totalReturn: 0.1,
    mdd: -0.05,
    tradeCount: 40,
    winRate: 0.6,
    averageTrade: 0.01,
    profitFactor: 1.5,
    maxConsecutiveLosses: 1,
    feeImpact: 0,
    feeTotal: 0,
    slippageTotal: 0,
    fundingTotal: 0,
    spreadTotal: 0,
    costs: {
      fees: 0,
      slippage: 0,
      funding: 0,
      spread: 0,
      totalTradingCost: 0,
      totalCostUsdt: 400,
      totalDeductedCostUsdt: 400,
      totalEconomicFrictionUsdt: 600,
      grossPnLBeforeCosts: 1000,
      netPnLAfterCosts: 600,
    },
    monthlyReturns: [],
    negativeMonths: 0,
    startingBalance: 10_000,
    endingBalance: 11_000,
    slippageModelVersion: SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
    costAssumptions: assumptions,
    validation: {
      paramsHashVerified: true,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: assumptions.funding.enabled,
      spreadApplied: assumptions.spread.enabled,
      noRealOrders: true,
    },
    ...extras,
  };
}

function v1Saved(
  overrides: {
    config?: Partial<BacktestConfig>;
    report?: Partial<BacktestReport>;
    assumptions?: CostAssumptionsV1;
    multipliers?: number[];
  } = {},
): Omit<SavedBacktestResult, "id" | "createdAt"> {
  const assumptions =
    overrides.assumptions ??
    normalizeCostAssumptions({
      feeRate: overrides.config?.feeRate,
      slippageRate: overrides.config?.slippageRate,
      fundingRate: overrides.config?.fundingRate,
      applyFunding: overrides.config?.applyFunding,
      spreadRate: overrides.config?.spreadRate,
      applySpread: overrides.config?.applySpread,
      costGuardK: overrides.config?.costGuardK,
    });
  const multipliers = overrides.multipliers ?? [1, 1.5, 2];
  const config = baseConfig({
    ...overrides.config,
    costAssumptions: assumptions,
    costStressMultipliers: multipliers,
  });
  const primary = resolvePrimaryCostAssumptions(assumptions, multipliers[0] ?? 1);
  let report = emptyReport(assumptions, {
    primaryCostAssumptions: primary,
    costStress: multipliers.map((multiplier) => ({
      multiplier,
      totalReturn: 0.01,
      mdd: -0.01,
      tradeCount: 1,
      negativeMonths: 0,
    })),
    ...overrides.report,
  });
  report = {
    ...report,
    costStress: (report.costStress ?? []).map((row) =>
      enrichCostStressRow(row, config, assumptions),
    ),
  };
  report = stampReportCostProvenance({
    report,
    config,
    isSafeEngine: true,
    multipliers,
  });
  return {
    config,
    report,
    trades: [],
    engineVersion: "rextora-backtest-1",
    dataVersion: "synthetic-test",
  };
}

function passingGate(input: Parameters<typeof evaluateBacktestEligibility>[0]) {
  const assumptions = input.costAssumptions ?? normalizeCostAssumptions({});
  return evaluateBacktestEligibility({
    status: "completed",
    totalReturn: 0.12,
    mdd: -0.05,
    tradeCount: 40,
    winRate: 0.6,
    profitFactor: 1.5,
    totalCostPctOfGrossProfit: 0.1,
    negativeMonths: 0,
    monthlyReturnCount: 4,
    hasCostStress: false,
    slippageModelVersion: SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
    costAssumptions: assumptions,
    primaryCostAssumptions:
      input.primaryCostAssumptions ??
      resolvePrimaryCostAssumptions(assumptions, 1),
    ...input,
  });
}

describe("P3-A6.2 cost provenance + versioned identity", () => {
  it("1. cost_assumptions_v1 constant", () => {
    expect(COST_ASSUMPTIONS_VERSION).toBe("cost_assumptions_v1");
  });

  it("2. canonical normalizer default values", () => {
    const a = normalizeCostAssumptions({});
    expect(a.fee.configuredRate).toBe(DEFAULT_FEE_RATE);
    expect(a.slippage.configuredRate).toBe(DEFAULT_SLIPPAGE_RATE);
    expect(a.funding.configuredRate).toBe(DEFAULT_FUNDING_RATE);
    expect(a.spread.configuredRate).toBe(DEFAULT_SPREAD_RATE);
    expect(a.funding.enabled).toBe(DEFAULT_APPLY_FUNDING);
    expect(a.spread.enabled).toBe(DEFAULT_APPLY_SPREAD);
    expect(a.costGuard.k).toBe(DEFAULT_COST_GUARD_K);
  });

  it("3. decimal units", () => {
    const a = normalizeCostAssumptions({});
    expect(a.fee.unit).toBe(RATE_UNIT_DECIMAL_FRACTION);
    expect(a.slippage.unit).toBe(RATE_UNIT_DECIMAL_FRACTION);
    expect(a.fee.configuredRate).toBe(0.0004);
    expect(a.fee.configuredRate).not.toBe(0.04);
  });

  it("4. funding disabled configured/effective values", () => {
    const a = normalizeCostAssumptions({
      applyFunding: false,
      fundingRate: 0.0001,
    });
    expect(a.funding.enabled).toBe(false);
    expect(a.funding.configuredRate).toBe(0.0001);
    expect(a.funding.effectiveRate).toBe(0);
  });

  it("5. funding enabled values", () => {
    const a = normalizeCostAssumptions({
      applyFunding: true,
      fundingRate: 0.0001,
    });
    expect(a.funding.enabled).toBe(true);
    expect(a.funding.configuredRate).toBe(0.0001);
    expect(a.funding.effectiveRate).toBe(0.0001);
  });

  it("6. spread disabled values", () => {
    const a = normalizeCostAssumptions({
      applySpread: false,
      spreadRate: 0.0001,
    });
    expect(a.spread.enabled).toBe(false);
    expect(a.spread.configuredRate).toBe(0.0001);
    expect(a.spread.effectiveRate).toBe(0);
  });

  it("7. spread enabled values", () => {
    const a = normalizeCostAssumptions({
      applySpread: true,
      spreadRate: 0.0001,
    });
    expect(a.spread.enabled).toBe(true);
    expect(a.spread.effectiveRate).toBe(0.0001);
  });

  it("8. fee model", () => {
    const a = normalizeCostAssumptions({});
    expect(a.fee.model).toBe(FEE_MODEL_ROUND_TRIP_TAKER_2X);
    expect(a.fee.legCount).toBe(FEE_LEG_COUNT);
  });

  it("9. slippage execution_price_v1", () => {
    const a = normalizeCostAssumptions({});
    expect(a.slippage.modelVersion).toBe(SLIPPAGE_MODEL_EXECUTION_PRICE_V1);
    expect(a.slippage.legCount).toBe(SLIPPAGE_LEG_COUNT);
  });

  it("10. funding model", () => {
    expect(normalizeCostAssumptions({}).funding.model).toBe(
      FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE,
    );
  });

  it("11. spread model", () => {
    expect(normalizeCostAssumptions({}).spread.model).toBe(
      SPREAD_MODEL_FLAT_FRACTION_PER_TRADE,
    );
  });

  it("12. cost guard provenance", () => {
    const a = normalizeCostAssumptions({});
    expect(a.costGuard.enabled).toBe(true);
    expect(a.costGuard.k).toBe(3);
    expect(a.costGuard.slippageEstimateModel).toBe(
      COST_GUARD_SLIPPAGE_ESTIMATE_RATE_TIMES_TWO,
    );
  });

  it("13. primary multiplier 1", () => {
    const a = normalizeCostAssumptions({ applySpread: true });
    const p = resolvePrimaryCostAssumptions(a, 1);
    expect(p.feeRate).toBeCloseTo(0.0004);
    expect(p.slippageRate).toBeCloseTo(0.0002);
    expect(p.spreadRate).toBeCloseTo(0.0001);
    expect(p.fundingEffectiveRate).toBe(0);
  });

  it("14. primary multiplier 1.5", () => {
    const a = normalizeCostAssumptions({ applySpread: true });
    const p = resolvePrimaryCostAssumptions(a, 1.5);
    expect(p.feeRate).toBeCloseTo(0.0006);
    expect(p.slippageRate).toBeCloseTo(0.0003);
    expect(p.spreadRate).toBeCloseTo(0.00015);
    expect(p.fundingConfiguredRate).toBe(0.0001);
    expect(p.fundingEffectiveRate).toBe(0);
  });

  it("15. stress multiplier 1", () => {
    const a = normalizeCostAssumptions({ applySpread: true });
    const s = resolveScenarioCostAssumptions(a, 1);
    expect(s.feeRate).toBeCloseTo(0.0004);
    expect(s.slippageRate).toBeCloseTo(0.0002);
    expect(s.spreadRate).toBeCloseTo(0.0001);
  });

  it("16. stress multiplier 1.5", () => {
    const s = resolveScenarioCostAssumptions(
      normalizeCostAssumptions({ applySpread: true }),
      1.5,
    );
    expect(s.feeRate).toBeCloseTo(0.0006);
    expect(s.slippageRate).toBeCloseTo(0.0003);
    expect(s.spreadRate).toBeCloseTo(0.00015);
  });

  it("17. stress multiplier 2", () => {
    const s = resolveScenarioCostAssumptions(
      normalizeCostAssumptions({ applySpread: true }),
      2,
    );
    expect(s.feeRate).toBeCloseTo(0.0008);
    expect(s.slippageRate).toBeCloseTo(0.0004);
    expect(s.spreadRate).toBeCloseTo(0.0002);
  });

  it("18. stress funding not multiplied", () => {
    const a = normalizeCostAssumptions({
      applyFunding: true,
      fundingRate: 0.0001,
    });
    const s = resolveScenarioCostAssumptions(a, 2);
    expect(s.fundingConfiguredRate).toBe(0.0001);
    expect(s.fundingEffectiveRate).toBe(0.0001);
    expect(s.feeRate).toBeCloseTo(0.0008);
  });

  it("19. report persists canonical assumptions", () => {
    const saved = v1Saved();
    expect(saved.report.costAssumptions?.version).toBe(COST_ASSUMPTIONS_VERSION);
    expect(saved.report.primaryCostAssumptions?.feeRate).toBeCloseTo(0.0004);
    expect(saved.report.costStress?.[0]?.feeRate).toBeCloseTo(0.0004);
  });

  it("20. report-only reconstruction succeeds", () => {
    const rec = reconstructAppliedCostAssumptions(v1Saved().report);
    expect(rec.REPORT_ONLY_COST_REPRODUCIBLE).toBe("YES");
    expect(rec.base?.fee.effectiveRate).toBe(0.0004);
    expect(rec.primary?.multiplier).toBe(1);
    expect(rec.stress).toHaveLength(3);
    expect(rec.missing).toEqual([]);
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("21. legacy record 1 stored hash reproduced", () => {
    const saved = getSavedBacktest(LEGACY_SAVED_IDS[0], { rootDir: PROD_BACKTESTS });
    expect(saved).toBeTruthy();
    const { id: _i, createdAt: _c, ...rest } = saved!;
    expect(backtestResultHash(rest)).toBe(saved!.resultHash);
    expect(resolveBacktestIdentitySchema(rest)).toBe(
      IDENTITY_SCHEMA_LEGACY_ORIGINAL,
    );
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("22. legacy record 2 stored hash reproduced", () => {
    const saved = getSavedBacktest(LEGACY_SAVED_IDS[1], { rootDir: PROD_BACKTESTS });
    expect(saved).toBeTruthy();
    const { id: _i, createdAt: _c, ...rest } = saved!;
    expect(backtestResultHash(rest)).toBe(saved!.resultHash);
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("23. legacy record 3 stored hash reproduced", () => {
    const saved = getSavedBacktest(LEGACY_SAVED_IDS[2], { rootDir: PROD_BACKTESTS });
    expect(saved).toBeTruthy();
    const { id: _i, createdAt: _c, ...rest } = saved!;
    expect(backtestResultHash(rest)).toBe(saved!.resultHash);
  });

  it("24. P3-A5.2 identity preserved", () => {
    const v1 = v1Saved();
    const p3 = {
      ...v1,
      report: {
        ...v1.report,
        costAssumptions: undefined,
        primaryCostAssumptions: undefined,
        slippageModelVersion: SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
      },
    };
    const other = {
      ...p3,
      report: {
        ...p3.report,
        slippageModelVersion: SLIPPAGE_MODEL_LEGACY_V0,
      },
    };
    expect(resolveBacktestIdentitySchema(p3)).toBe(IDENTITY_SCHEMA_P3A52);
    expect(backtestResultHash(p3)).not.toBe(backtestResultHash(other));
  });

  it("25. v1 deterministic hash stable", () => {
    expect(backtestResultHash(v1Saved())).toBe(backtestResultHash(v1Saved()));
    expect(resolveBacktestIdentitySchema(v1Saved())).toBe(
      IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1,
    );
  });

  it("26. fee changes v1 hash", () => {
    expect(
      backtestResultHash(v1Saved({ assumptions: normalizeCostAssumptions({ feeRate: 0.0008 }) })),
    ).not.toBe(backtestResultHash(v1Saved()));
  });

  it("27. slippage changes v1 hash", () => {
    expect(
      backtestResultHash(
        v1Saved({ assumptions: normalizeCostAssumptions({ slippageRate: 0.0004 }) }),
      ),
    ).not.toBe(backtestResultHash(v1Saved()));
  });

  it("28. slippage model changes v1 hash", () => {
    const a = normalizeCostAssumptions({
      slippageModelVersion: SLIPPAGE_MODEL_LEGACY_V0,
    });
    expect(backtestResultHash(v1Saved({ assumptions: a }))).not.toBe(
      backtestResultHash(v1Saved()),
    );
  });

  it("29. funding enabled changes hash", () => {
    const off = normalizeCostAssumptions({ applyFunding: false, fundingRate: 0.0001 });
    const on = normalizeCostAssumptions({ applyFunding: true, fundingRate: 0.0001 });
    expect(backtestResultHash(v1Saved({ assumptions: off }))).not.toBe(
      backtestResultHash(v1Saved({ assumptions: on })),
    );
  });

  it("30. dormant funding configured rate changes hash", () => {
    const a = normalizeCostAssumptions({ applyFunding: false, fundingRate: 0.0001 });
    const b = normalizeCostAssumptions({ applyFunding: false, fundingRate: 0.0005 });
    expect(a.funding.effectiveRate).toBe(0);
    expect(b.funding.effectiveRate).toBe(0);
    expect(backtestResultHash(v1Saved({ assumptions: a }))).not.toBe(
      backtestResultHash(v1Saved({ assumptions: b })),
    );
  });

  it("31. spread enabled changes hash", () => {
    const off = normalizeCostAssumptions({ applySpread: false, spreadRate: 0.0001 });
    const on = normalizeCostAssumptions({ applySpread: true, spreadRate: 0.0001 });
    expect(backtestResultHash(v1Saved({ assumptions: off }))).not.toBe(
      backtestResultHash(v1Saved({ assumptions: on })),
    );
  });

  it("32. dormant spread configured rate changes hash", () => {
    const a = normalizeCostAssumptions({ applySpread: false, spreadRate: 0.0001 });
    const b = normalizeCostAssumptions({ applySpread: false, spreadRate: 0.0005 });
    expect(a.spread.effectiveRate).toBe(0);
    expect(b.spread.effectiveRate).toBe(0);
    expect(backtestResultHash(v1Saved({ assumptions: a }))).not.toBe(
      backtestResultHash(v1Saved({ assumptions: b })),
    );
  });

  it("33. costGuardK changes hash", () => {
    expect(
      backtestResultHash(v1Saved({ assumptions: normalizeCostAssumptions({ costGuardK: 5 }) })),
    ).not.toBe(backtestResultHash(v1Saved()));
  });

  it("34. primary multiplier changes hash", () => {
    expect(backtestResultHash(v1Saved({ multipliers: [1.5, 2] }))).not.toBe(
      backtestResultHash(v1Saved({ multipliers: [1, 1.5, 2] })),
    );
  });

  it("35. stress multiplier changes hash", () => {
    expect(backtestResultHash(v1Saved({ multipliers: [1, 2] }))).not.toBe(
      backtestResultHash(v1Saved({ multipliers: [1, 1.5, 2] })),
    );
  });

  it("36. no legacy load-time hash rejection", () => {
    const store = source("src/lib/rextora/backtest/backtestStore.ts");
    expect(store).toMatch(/JSON\.parse\(fs\.readFileSync\(full/);
    expect(store).not.toMatch(/getSavedBacktest[\s\S]{0,200}backtestResultHash/);
  });

  it("37. economic-friction eligibility ratio", () => {
    const ratio = resolveEligibilityCostRatio({
      totalReturn: 0.1,
      mdd: -0.05,
      tradeCount: 40,
      totalCostPctOfGrossProfit: 0.4,
      grossPnLBeforeCosts: 1000,
      totalDeductedCostUsdt: 400,
      totalEconomicFrictionUsdt: 600,
      slippageModelVersion: SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
    });
    expect(ratio).toBeCloseTo(0.6);
  });

  it("38. 0.4 deducted / 0.6 friction threshold case fails", () => {
    const gate = passingGate({
      totalCostPctOfGrossProfit: 0.4,
      grossPnLBeforeCosts: 1000,
      totalDeductedCostUsdt: 400,
      totalEconomicFrictionUsdt: 600,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.reasons.some((r) => r.code === "excessive_cost_ratio")).toBe(true);
    expect(gate.reasons.find((r) => r.code === "excessive_cost_ratio")?.observedValue).toBeCloseTo(0.6);
  });

  it("39. missing assumptions blocker", () => {
    const gate = passingGate({
      costAssumptions: null,
      primaryCostAssumptions: null,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.reasons.some((r) => r.code === "missing_cost_assumptions")).toBe(
      true,
    );
  });

  it("40. unsupported version blocker", () => {
    const a = {
      ...normalizeCostAssumptions({}),
      version: "cost_assumptions_v9" as CostAssumptionsV1["version"],
    };
    const gate = passingGate({ costAssumptions: a });
    expect(gate.reasons.some((r) => r.code === "unsupported_cost_assumptions_version")).toBe(
      true,
    );
  });

  it("41. legacy slippage blocker", () => {
    const gate = passingGate({
      slippageModelVersion: SLIPPAGE_MODEL_LEGACY_V0,
    });
    expect(gate.reasons.some((r) => r.code === "legacy_slippage_model")).toBe(
      true,
    );
  });

  it("42. invalid rate blocker", () => {
    const a = normalizeCostAssumptions({});
    const bad = {
      ...a,
      fee: { ...a.fee, configuredRate: Number.NaN },
    };
    const gate = passingGate({ costAssumptions: bad });
    expect(gate.reasons.some((r) => r.code === "invalid_cost_rate")).toBe(true);
  });

  it("43. unknown fee model blocker", () => {
    const a = normalizeCostAssumptions({});
    const bad = {
      ...a,
      fee: { ...a.fee, model: "binance_live" as typeof a.fee.model },
    };
    const gate = passingGate({ costAssumptions: bad });
    expect(gate.reasons.some((r) => r.code === "unrecognized_fee_model")).toBe(
      true,
    );
  });

  it("44. unknown funding model blocker", () => {
    const a = normalizeCostAssumptions({});
    const bad = {
      ...a,
      funding: { ...a.funding, model: "binance_schedule" as typeof a.funding.model },
    };
    const gate = passingGate({ costAssumptions: bad });
    expect(gate.reasons.some((r) => r.code === "unrecognized_funding_model")).toBe(
      true,
    );
  });

  it("45. unknown spread model blocker", () => {
    const a = normalizeCostAssumptions({});
    const bad = {
      ...a,
      spread: { ...a.spread, model: "orderbook" as typeof a.spread.model },
    };
    const gate = passingGate({ costAssumptions: bad });
    expect(gate.reasons.some((r) => r.code === "unrecognized_spread_model")).toBe(
      true,
    );
  });

  it("46. missing stress assumptions blocker", () => {
    const gate = passingGate({
      costStress: [
        {
          multiplier: 1,
          totalReturn: 0.01,
          mdd: 0,
          tradeCount: 1,
          negativeMonths: 0,
        },
      ],
    });
    expect(
      gate.reasons.some((r) => r.code === "missing_stress_cost_assumptions"),
    ).toBe(true);
  });

  it("47. legacy view allowed", () => {
    expect(LEGACY_RESULT_VIEW_ALLOWED).toBe(true);
    expect(LEGACY_RESULT_DEEP_LINK_ALLOWED).toBe(true);
    expect(LEGACY_RESULT_COMPARE_ALLOWED).toBe(true);
  });

  it("48. legacy new Paper blocked", () => {
    expect(LEGACY_NEW_PAPER_ADVANCEMENT_ALLOWED).toBe(false);
    const gate = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.12,
      mdd: -0.04,
      tradeCount: 48,
    });
    expect(eligibilityBlocksPaperLive(gate)).toBe(true);
  });

  it("49. legacy new Live blocked", () => {
    expect(LEGACY_NEW_LIVE_ADVANCEMENT_ALLOWED).toBe(false);
  });

  it("50. active session untouched", () => {
    expect(ACTIVE_SESSION_POLICY).toBe("untouched");
    expect(source("src/lib/rextora/backtest/backtestEligibility.ts")).not.toMatch(
      /paper-sessions|placeOrder|terminate/i,
    );
  });

  it("51. Workbench percentage display conversion", () => {
    expect(formatDecimalRateAsPercentLabel(0.0004)).toBe("0.04%");
    expect(formatDecimalRateAsPercentLabel(0.0002)).toBe("0.02%");
    expect(source("components/rextora/backtest/BacktestReviewWorkbench.tsx")).toContain(
      "formatCostAssumptionsDisclosure",
    );
  });

  it("52. engine decimal rate unchanged", () => {
    const rates = resolveEffectiveRates(normalizeCostAssumptions({}));
    expect(rates.feeRate).toBe(0.0004);
    expect(rates.slippageRate).toBe(0.0002);
    expect(source("components/rextora/backtest/BacktestReviewWorkbench.tsx")).toMatch(
      /save:\s*true/,
    );
    expect(source("app/api/rextora/backtest/run/route.ts")).toContain(
      "feeRate: rates.feeRate",
    );
    expect(source("app/api/rextora/backtest/run/route.ts")).not.toContain(
      "feeRate: 0.04",
    );
  });

  it("53. fee arithmetic unchanged", () => {
    const engine = source("src/lib/rextora/backtest/backtestEngine.ts");
    expect(engine).toContain("const feePct = feeRate * 2");
    expect(engine).toContain("const feeCostUsdt = Number((margin * feePct * leverage).toFixed(6))");
  });

  it("54. slippage arithmetic unchanged", () => {
    const engine = source("src/lib/rextora/backtest/backtestEngine.ts");
    expect(engine).toContain("applyAdverseSlippage");
    expect(source("src/lib/rextora/backtest/executionSlippage.ts")).toContain(
      "side === \"long\"",
    );
  });

  it("55. funding arithmetic unchanged", () => {
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).toContain(
      "const fundingRate = input.applyFunding ? input.fundingRate ?? 0.0001 : 0",
    );
  });

  it("56. spread arithmetic unchanged", () => {
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).toContain(
      "const spreadRate = input.applySpread ? input.spreadRate ?? 0.0001 : 0",
    );
  });

  it("57. event-sequence ledger formula remains rate*2", () => {
    const src = source("src/lib/rextora/strategy/eventSequenceCostModel.ts");
    expect(src).toContain("input.slippageRate * 2");
    expect(source("src/lib/rextora/strategy/eventSequenceBacktest.ts")).toContain(
      "settleEventSequenceClose",
    );
  });

  it("58. condition arithmetic unchanged", () => {
    const src = source("src/lib/rextora/strategy/conditionBacktest.ts");
    expect(src).toContain("const slipPct = input.slippageRate * 2");
    expect(src).not.toContain("applyAdverseSlippage");
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("59. production records unchanged", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    for (const row of legacyShasBefore) {
      expect(sha256File(join(ROOT, "data/rextora/backtests", `${row.id}.json`))).toBe(
        row.sha,
      );
    }
  });

  it("60. Research executions 0", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      hashesBefore.researchIndexSha256,
    );
  });

  it("61. Paper/Live actions 0", () => {
    expect(hashesBefore.paperSessionsDirExists).toBe(
      productionReadonlyHashes(ROOT).paperSessionsDirExists,
    );
  });

  it("62. orders 0", () => {
    expect(source("src/lib/rextora/backtest/costAssumptions.ts")).not.toMatch(
      /placeOrder|createOrder/,
    );
  });

  it("63. SAFE unchanged", () => {
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(sha256File(SAFE_PATH)).toBeNull();
  });

  it("disclosure names the resolved model", () => {
    const text = formatCostAssumptionsDisclosure(v1Saved().report);
    expect(text).toContain("0.04%");
    expect(text).toContain("execution_price_v1");
    expect(text).toContain("cost_assumptions_v1");
  });
});

afterAll(() => {
  const after = productionReadonlyHashes(ROOT);
  expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
});
