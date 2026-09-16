import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  applyAdverseSlippage,
  resolveSlippageModelVersion,
  SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
  SLIPPAGE_MODEL_LEGACY_V0,
} from "../src/lib/rextora/backtest/executionSlippage";
import { backtestResultHash } from "../src/lib/rextora/backtest/backtestStore";
import {
  normalizeCostAssumptions,
  resolvePrimaryCostAssumptions,
} from "../src/lib/rextora/backtest/costAssumptions";
import {
  evaluateBacktestEligibility,
  eligibilityBlocksPaperLive,
} from "../src/lib/rextora/backtest/backtestEligibility";
import { evaluateCostGuard } from "../src/lib/rextora/cost/costGuard";
import { computeSlippageCost } from "../src/lib/rextora/metrics/unifiedCost";
import {
  productionReadonlyHashes,
  runMicroCostFixture,
} from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  runExitReasonFixture,
  SLIPPAGE_RATE,
} from "../src/lib/rextora/backtest/backtestSlippageModelDiagnosis";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import type {
  BacktestConfig,
  BacktestReport,
  SavedBacktestResult,
} from "../src/lib/rextora/backtest/backtestTypes";

const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const hashesBefore = productionReadonlyHashes(ROOT);
const RATE = 0.0002;

function sha256(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function source(pathFromRoot: string): string {
  return readFileSync(join(ROOT, pathFromRoot), "utf8");
}

function signedReturn(
  side: "LONG" | "SHORT",
  entry: number,
  exit: number,
): number {
  return side === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
}

function modelALedger(input: {
  side: "LONG" | "SHORT";
  rawEntry: number;
  rawExit: number;
  rate: number;
  margin: number;
  leverage: number;
  feeRate?: number;
  fundingRate?: number;
  spreadRate?: number;
}) {
  const feeRate = input.feeRate ?? 0;
  const fundingRate = input.fundingRate ?? 0;
  const spreadRate = input.spreadRate ?? 0;
  const side = input.side === "LONG" ? "long" : "short";
  const entryExecution = applyAdverseSlippage({
    side,
    action: "entry",
    rawPrice: input.rawEntry,
    slippageRate: input.rate,
  });
  const exitExecution = applyAdverseSlippage({
    side,
    action: "exit",
    rawPrice: input.rawExit,
    slippageRate: input.rate,
  });
  const executionReturn = signedReturn(
    input.side,
    entryExecution,
    exitExecution,
  );
  const unslippedReturn = signedReturn(
    input.side,
    input.rawEntry,
    input.rawExit,
  );
  const feePct = feeRate * 2;
  const gross = input.margin * executionReturn * input.leverage;
  const unslippedGross = input.margin * unslippedReturn * input.leverage;
  const attribution = unslippedGross - gross;
  const fee = input.margin * feePct * input.leverage;
  const funding = input.margin * fundingRate * input.leverage;
  const spread = input.margin * spreadRate * input.leverage;
  const net = gross - fee - funding - spread;
  return {
    entryExecution,
    exitExecution,
    gross,
    attribution,
    fee,
    funding,
    spread,
    net,
  };
}

function hashPayload(
  version: string | undefined,
): Omit<SavedBacktestResult, "id" | "createdAt"> {
  const config: BacktestConfig = {
    strategyId: "P3A52",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromOpenTime: 1,
    toOpenTime: 2,
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0.0001,
    costStressMultipliers: [1],
    costGuardK: 3,
  };
  const report = {
    strategyId: "P3A52",
    strategyHash: "abc",
    strategyName: "x",
    symbol: "BTCUSDT",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    candleCount: 10,
    processedCandleCount: 10,
    dataSource: "synthetic-test" as const,
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
      totalCostUsdt: 1,
      grossPnLBeforeCosts: 100,
      netPnLAfterCosts: 99,
    },
    monthlyReturns: [],
    negativeMonths: 0,
    startingBalance: 10_000,
    endingBalance: 11_000,
    slippageModelVersion: version,
    validation: {
      paramsHashVerified: true,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: false,
      spreadApplied: false,
      noRealOrders: true as const,
    },
  } as BacktestReport;
  return {
    config,
    report,
    trades: [],
    engineVersion: "rextora-backtest-1",
  };
}

function passingEligibility(
  version: string | undefined,
) {
  const assumptions = normalizeCostAssumptions({});
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
    hasCostStress: true,
    slippageModelVersion: version,
    costAssumptions: assumptions,
    primaryCostAssumptions: resolvePrimaryCostAssumptions(assumptions, 1),
  });
}

const longTp = runExitReasonFixture({
  side: "LONG",
  reason: "take_profit",
  slippageRate: RATE,
});
const shortTp = runExitReasonFixture({
  side: "SHORT",
  reason: "take_profit",
  slippageRate: RATE,
});
const longSl = runExitReasonFixture({
  side: "LONG",
  reason: "stop_loss",
  slippageRate: RATE,
});
const shortSl = runExitReasonFixture({
  side: "SHORT",
  reason: "stop_loss",
  slippageRate: RATE,
});
const longHold = runExitReasonFixture({
  side: "LONG",
  reason: "max_hold",
  slippageRate: RATE,
});
const shortHold = runExitReasonFixture({
  side: "SHORT",
  reason: "max_hold",
  slippageRate: RATE,
});
const longEnd = runExitReasonFixture({
  side: "LONG",
  reason: "end",
  slippageRate: RATE,
});
const shortEnd = runExitReasonFixture({
  side: "SHORT",
  reason: "end",
  slippageRate: RATE,
});

const feeHold = runMicroCostFixture("p3a52-fee-hold", {
  feeRate: 0.0004,
  slippageRate: RATE,
  fundingRate: 0,
  applyFunding: false,
  side: "LONG",
  leverage: 1,
  maxHoldBars: 1,
});
const longMicro = modelALedger({
  side: "LONG",
  rawEntry: 100,
  rawExit: 110,
  rate: RATE,
  margin: 1000,
  leverage: 1,
});
const shortMicro = modelALedger({
  side: "SHORT",
  rawEntry: 100,
  rawExit: 90,
  rate: RATE,
  margin: 1000,
  leverage: 1,
});

describe("P3-A5.2 SAFE execution-price slippage", () => {
  it("1. helper long entry", () => {
    expect(
      applyAdverseSlippage({
        side: "long",
        action: "entry",
        rawPrice: 100,
        slippageRate: RATE,
      }),
    ).toBeCloseTo(100.02, 9);
  });

  it("2. helper long exit", () => {
    expect(
      applyAdverseSlippage({
        side: "long",
        action: "exit",
        rawPrice: 110,
        slippageRate: RATE,
      }),
    ).toBeCloseTo(109.978, 9);
  });

  it("3. helper short entry", () => {
    expect(
      applyAdverseSlippage({
        side: "short",
        action: "entry",
        rawPrice: 100,
        slippageRate: RATE,
      }),
    ).toBeCloseTo(99.98, 9);
  });

  it("4. helper short exit", () => {
    expect(
      applyAdverseSlippage({
        side: "short",
        action: "exit",
        rawPrice: 90,
        slippageRate: RATE,
      }),
    ).toBeCloseTo(90.018, 9);
  });

  it("5. invalid raw price", () => {
    expect(() =>
      applyAdverseSlippage({
        side: "long",
        action: "entry",
        rawPrice: 0,
        slippageRate: RATE,
      }),
    ).toThrow(/rawPrice/);
  });

  it("6. invalid slippage rate", () => {
    expect(() =>
      applyAdverseSlippage({
        side: "long",
        action: "entry",
        rawPrice: 100,
        slippageRate: -0.1,
      }),
    ).toThrow(/slippageRate/);
  });

  it("7. TP long trigger unchanged", () => {
    expect(longTp.exitReason).toBe("take_profit");
    expect(longTp.triggerLevel).toBe(longTp.takeProfit);
    expect(longTp.rawExit).toBe(longTp.takeProfit);
  });

  it("8. TP long exit slipped", () => {
    expect(longTp.executionExit).toBeCloseTo(
      longTp.rawExit * (1 - RATE),
      9,
    );
  });

  it("9. TP short exit slipped", () => {
    expect(shortTp.executionExit).toBeCloseTo(
      shortTp.rawExit * (1 + RATE),
      9,
    );
  });

  it("10. SL long exit slipped", () => {
    expect(longSl.exitReason).toBe("stop_loss");
    expect(longSl.executionExit).toBeCloseTo(longSl.rawExit * (1 - RATE), 9);
  });

  it("11. SL short exit slipped", () => {
    expect(shortSl.exitReason).toBe("stop_loss");
    expect(shortSl.executionExit).toBeCloseTo(shortSl.rawExit * (1 + RATE), 9);
  });

  it("12. max_hold long no double deduction", () => {
    expect(longHold.exitReason).toBe("max_hold");
    expect(longHold.executionExit).toBeCloseTo(
      longHold.rawExit * (1 - RATE),
      9,
    );
    expect(longHold.ledgerSlipApplied).toBe(false);
    expect(longHold.netPnlUsdt).toBeCloseTo(
      longHold.grossPnlUsdt -
        longHold.feeCostUsdt -
        longHold.spreadCostUsdt,
      5,
    );
  });

  it("13. max_hold short no double deduction", () => {
    expect(shortHold.exitReason).toBe("max_hold");
    expect(shortHold.executionExit).toBeCloseTo(
      shortHold.rawExit * (1 + RATE),
      9,
    );
    expect(shortHold.ledgerSlipApplied).toBe(false);
  });

  it("14. end long exit slipped", () => {
    expect(longEnd.exitReason).toBe("end");
    expect(longEnd.executionExit).toBeCloseTo(longEnd.rawExit * (1 - RATE), 9);
  });

  it("15. end short exit slipped", () => {
    expect(shortEnd.exitReason).toBe("end");
    expect(shortEnd.executionExit).toBeCloseTo(
      shortEnd.rawExit * (1 + RATE),
      9,
    );
  });

  it("16. slippage attribution derived", () => {
    expect(longMicro.attribution).toBeGreaterThan(0);
    expect(longHold.slippageCostUsdt).toBeGreaterThan(0);
    const unslipped =
      longHold.marginUsdt *
      signedReturn("LONG", longHold.rawEntry, longHold.rawExit) *
      longHold.leverage;
    expect(longHold.slippageCostUsdt).toBeCloseTo(
      unslipped - longHold.grossPnlUsdt,
      4,
    );
  });

  it("17. attribution not deducted from net", () => {
    const withAttr =
      longMicro.gross - longMicro.fee - longMicro.attribution;
    expect(longMicro.net).not.toBeCloseTo(withAttr, 6);
    expect(longHold.netPnlUsdt).toBeCloseTo(
      longHold.grossPnlUsdt - longHold.feeCostUsdt - longHold.spreadCostUsdt,
      5,
    );
  });

  it("18. gross semantic", () => {
    expect(longMicro.gross).toBeCloseTo(
      1000 * signedReturn("LONG", 100.02, 109.978),
      6,
    );
  });

  it("19. net semantic", () => {
    expect(longMicro.net).toBeCloseTo(longMicro.gross, 9);
  });

  it("20. total deducted-cost semantic", () => {
    expect(feeHold.report.costs.totalCostUsdt).toBeCloseTo(
      feeHold.totalFeeUsdt + 0,
      4,
    );
    expect(feeHold.report.costs.totalDeductedCostUsdt).toBeCloseTo(
      feeHold.report.costs.totalCostUsdt ?? 0,
      4,
    );
    expect(feeHold.report.costs.totalCostUsdt).not.toBeCloseTo(
      feeHold.totalFeeUsdt + feeHold.slippageCostUsdt,
      4,
    );
  });

  it("21. total economic-friction semantic", () => {
    expect(feeHold.report.costs.totalEconomicFrictionUsdt).toBeCloseTo(
      (feeHold.report.costs.totalDeductedCostUsdt ?? 0) +
        (feeHold.report.costs.slippageCostUsdt ?? 0),
      4,
    );
  });

  it("22. fee unchanged", () => {
    const feeOn = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      feeRate: 0.0004,
    });
    const feeOff = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      feeRate: 0,
    });
    expect(feeOn.feeCostUsdt).toBeCloseTo(
      feeOn.marginUsdt * 0.0008 * feeOn.leverage,
      5,
    );
    expect(feeOff.feeCostUsdt).toBe(0);
  });

  it("23. funding unchanged", () => {
    expect(feeHold.report.validation.fundingApplied).toBe(false);
    expect(feeHold.fundingCostUsdt).toBe(0);
    expect(longHold.netPnlUsdt).toBeCloseTo(
      longHold.grossPnlUsdt - longHold.feeCostUsdt - longHold.spreadCostUsdt,
      5,
    );
  });

  it("24. spread unchanged", () => {
    const withSpread = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      applySpread: true,
      spreadRate: 0.0001,
    });
    expect(withSpread.spreadCostUsdt).toBeGreaterThan(0);
    expect(longHold.spreadCostUsdt).toBe(0);
  });

  it("25. cost guard unchanged", () => {
    const slippageRate = 0.0002;
    const guard = evaluateCostGuard({
      entryPrice: 100,
      takeProfitPrice: 110,
      side: "LONG",
      atr: 1,
      params: { cost_guard: true, cost_guard_k: 3 },
      feeRate: 0.0004,
      slippageRate,
      spreadRate: 0,
      fundingRate: 0,
    });
    expect(guard.slippageCost).toBeCloseTo(computeSlippageCost(slippageRate), 12);
    expect(guard.slippageCost).toBeCloseTo(slippageRate * 2, 12);
    expect(guard.passed).toBe(true);
  });

  it("26. leverage 1x", () => {
    const row = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      leverage: 1,
    });
    expect(row.leverage).toBe(1);
    expect(row.executionEntry).toBeCloseTo(row.rawEntry * (1 + RATE), 9);
  });

  it("27. leverage 5x", () => {
    const x1 = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      leverage: 1,
    });
    const x5 = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      leverage: 5,
    });
    expect(x5.leverage).toBe(5);
    expect(x5.slippageCostUsdt / x1.slippageCostUsdt).toBeCloseTo(5, 3);
    expect(x5.feeCostUsdt).toBe(0);
  });

  it("28. leverage 10x", () => {
    const x1 = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      leverage: 1,
    });
    const x10 = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE,
      leverage: 10,
    });
    expect(x10.leverage).toBe(10);
    expect(x10.slippageCostUsdt / x1.slippageCostUsdt).toBeCloseTo(10, 3);
  });

  it("29. stress 1x rate", () => {
    expect(longHold.executionEntry).toBeCloseTo(
      longHold.rawEntry * (1 + RATE),
      9,
    );
    expect(feeHold.report.slippageModelVersion).toBe(
      SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
    );
  });

  it("30. stress 1.5x rate", () => {
    const row = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE * 1.5,
    });
    expect(row.executionEntry).toBeCloseTo(row.rawEntry * (1 + RATE * 1.5), 9);
    expect(row.executionExit).toBeCloseTo(row.rawExit * (1 - RATE * 1.5), 9);
    expect(row.ledgerSlipApplied).toBe(false);
    expect(
      runMicroCostFixture("stress-1.5", {
        feeRate: 0,
        slippageRate: RATE * 1.5,
        fundingRate: 0,
        applyFunding: false,
        side: "LONG",
        leverage: 1,
        maxHoldBars: 1,
      }).report.slippageModelVersion,
    ).toBe(SLIPPAGE_MODEL_EXECUTION_PRICE_V1);
  });

  it("31. stress 2x rate", () => {
    const row = runExitReasonFixture({
      side: "LONG",
      reason: "max_hold",
      slippageRate: RATE * 2,
    });
    expect(row.executionEntry).toBeCloseTo(row.rawEntry * (1 + RATE * 2), 9);
    expect(row.executionExit).toBeCloseTo(row.rawExit * (1 - RATE * 2), 9);
    expect(row.ledgerSlipApplied).toBe(false);
    expect(
      runMicroCostFixture("stress-2", {
        feeRate: 0,
        slippageRate: RATE * 2,
        fundingRate: 0,
        applyFunding: false,
        side: "LONG",
        leverage: 1,
        maxHoldBars: 1,
      }).report.slippageModelVersion,
    ).toBe(SLIPPAGE_MODEL_EXECUTION_PRICE_V1);
  });

  it("32. execution_price_v1 stamped", () => {
    expect(feeHold.report.slippageModelVersion).toBe(
      SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
    );
  });

  it("33. legacy_v0 read fallback", () => {
    expect(resolveSlippageModelVersion(undefined)).toBe(SLIPPAGE_MODEL_LEGACY_V0);
    expect(resolveSlippageModelVersion(null)).toBe(SLIPPAGE_MODEL_LEGACY_V0);
    const p = join(ROOT, "data/rextora/backtests/bt_mryf1ecb_446095.json");
    if (!existsSync(p)) {
      expect(resolveSlippageModelVersion(undefined)).toBe(
        SLIPPAGE_MODEL_LEGACY_V0,
      );
      return;
    }
    const before = sha256(p);
    const mtime = statSync(p).mtimeMs;
    const saved = JSON.parse(readFileSync(p, "utf8")) as {
      report: { slippageModelVersion?: string };
    };
    expect(saved.report.slippageModelVersion).toBeUndefined();
    expect(resolveSlippageModelVersion(saved.report.slippageModelVersion)).toBe(
      SLIPPAGE_MODEL_LEGACY_V0,
    );
    expect(sha256(p)).toBe(before);
    expect(statSync(p).mtimeMs).toBe(mtime);
  });

  it("34. version affects result hash", () => {
    const v1 = backtestResultHash(hashPayload(SLIPPAGE_MODEL_EXECUTION_PRICE_V1));
    const legacy = backtestResultHash(hashPayload(SLIPPAGE_MODEL_LEGACY_V0));
    const omitted = backtestResultHash(hashPayload(undefined));
    expect(v1).not.toBe(legacy);
    expect(legacy).not.toBe(omitted);
  });

  it("35. legacy result new eligibility blocked", () => {
    const gate = passingEligibility(undefined);
    expect(gate.eligible).toBe(false);
    expect(gate.reasons.some((r) => r.code === "legacy_slippage_model")).toBe(
      true,
    );
    expect(gate.verdictLabel).toBe(
      "부적격 - 레거시 슬리피지 모델 (재백테스트 필요)",
    );
    expect(eligibilityBlocksPaperLive(gate)).toBe(true);
  });

  it("36. v1 result eligibility allowed if other gates pass", () => {
    const gate = passingEligibility(SLIPPAGE_MODEL_EXECUTION_PRICE_V1);
    expect(gate.eligible).toBe(true);
    expect(gate.verdictCode).toBe("eligible");
  });

  it("37. existing active Paper/Live not touched", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.paperSessionsDirExists).toBe(hashesBefore.paperSessionsDirExists);
    expect(source("src/lib/rextora/backtest/backtestEligibility.ts")).not.toMatch(
      /paper-sessions|placeOrder|live session/i,
    );
  });

  it("38. event-sequence ledger arithmetic still uses slipPct=rate*2", () => {
    const src = source("src/lib/rextora/strategy/eventSequenceCostModel.ts");
    expect(src).toContain("input.slippageRate * 2");
    expect(source("src/lib/rextora/strategy/eventSequenceBacktest.ts")).toContain(
      "settleEventSequenceClose",
    );
  });

  it("39. condition-builder arithmetic unchanged", () => {
    const src = source("src/lib/rextora/strategy/conditionBacktest.ts");
    expect(src).not.toContain("applyAdverseSlippage");
    expect(src).not.toContain("executionSlippage");
    expect(src).toContain("const slipPct = input.slippageRate * 2");
  });

  it("40. production records unchanged", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  });

  it("41. no Research execution", () => {
    expect(hashesBefore.researchIndexSha256).toBe(
      productionReadonlyHashes(ROOT).researchIndexSha256,
    );
  });

  it("42. no Paper/Live action", () => {
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).not.toContain(
      "apply_paper",
    );
  });

  it("43. no orders", () => {
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).not.toMatch(
      /createOrder|placeOrder/,
    );
  });

  it("44. SAFE unchanged", () => {
    expect(sha256(SAFE_PATH)).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    expect(
      (JSON.parse(readFileSync(SAFE_PATH, "utf8")) as { params_hash: string })
        .params_hash,
    ).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });
});

afterAll(() => {
  const after = productionReadonlyHashes(ROOT);
  expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
  expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
});
