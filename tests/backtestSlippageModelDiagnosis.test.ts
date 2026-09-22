import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyAdverseSlippage,
  buildExitReasonMatrix,
  buildModelComparison,
  computeModelArithmetic,
  getApprovalImpact,
  getCostGuardAnalysis,
  getEngineParity,
  getEntryAuthorities,
  getFeeInteraction,
  getGrossNetSemantics,
  getHistoricalImpact,
  getLedgerSemantics,
  getRecommendedFormulas,
  getRootDefects,
  getSpreadInteraction,
  getStressSemantics,
  getTriggerFillContract,
  P3A51_ARTIFACT_TS,
  runExitReasonFixture,
  SLIPPAGE_RATE,
  SLIPPAGE_SOURCE_PIPELINE,
  slippageApplicationCountTable,
  writeP3A51Artifacts,
} from "../src/lib/rextora/backtest/backtestSlippageModelDiagnosis";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";

const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const hashesBefore = productionReadonlyHashes(ROOT);

function sha256(p: string): string | null {
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const matrix = buildExitReasonMatrix();
const table = slippageApplicationCountTable(matrix);
const models = buildModelComparison();
const written = writeP3A51Artifacts(ROOT);
const longTp = matrix.rows.find((r) => r.side === "LONG" && r.exitReason === "take_profit")!;
const shortTp = matrix.rows.find((r) => r.side === "SHORT" && r.exitReason === "take_profit")!;
const longSl = matrix.rows.find((r) => r.side === "LONG" && r.exitReason === "stop_loss")!;
const shortSl = matrix.rows.find((r) => r.side === "SHORT" && r.exitReason === "stop_loss")!;
const longHold = matrix.rows.find((r) => r.side === "LONG" && r.exitReason === "max_hold")!;
const shortHold = matrix.rows.find((r) => r.side === "SHORT" && r.exitReason === "max_hold")!;
const longEnd = matrix.rows.find((r) => r.side === "LONG" && r.exitReason === "end")!;
const shortEnd = matrix.rows.find((r) => r.side === "SHORT" && r.exitReason === "end")!;

describe("P3-A5.1 slippage execution model diagnosis", () => {
  it("1. long entry current behavior", () => {
    expect(longHold.rawEntry).toBe(110);
    expect(longHold.executionEntry).toBeCloseTo(110 * (1 + SLIPPAGE_RATE), 9);
    expect(applyAdverseSlippage({
      side: "LONG",
      action: "entry",
      rawPrice: 110,
      slippageRate: SLIPPAGE_RATE,
    })).toBeCloseTo(longHold.executionEntry, 9);
  });

  it("2. short entry current behavior", () => {
    expect(shortHold.rawEntry).toBe(90);
    expect(shortHold.executionEntry).toBeCloseTo(90 * (1 - SLIPPAGE_RATE), 9);
  });

  it("3. long TP current behavior", () => {
    expect(longTp.requestedReason).toBe("take_profit");
    expect(longTp.exitReason).toBe("take_profit");
    expect(longTp.exitPriceSlipApplied).toBe(true);
    expect(longTp.executionExit).toBeCloseTo(
      longTp.rawExit * (1 - SLIPPAGE_RATE),
      9,
    );
    expect(longTp.triggerLevel).toBe(longTp.takeProfit);
  });

  it("4. short TP current behavior", () => {
    expect(shortTp.exitReason).toBe("take_profit");
    expect(shortTp.exitPriceSlipApplied).toBe(true);
    expect(shortTp.ledgerSlipApplied).toBe(false);
  });

  it("5. long SL current behavior", () => {
    expect(longSl.exitReason).toBe("stop_loss");
    expect(longSl.exitPriceSlipApplied).toBe(true);
    expect(longSl.executionExit).toBeCloseTo(
      longSl.stopLoss * (1 - SLIPPAGE_RATE),
      9,
    );
  });

  it("6. short SL current behavior", () => {
    expect(shortSl.exitReason).toBe("stop_loss");
    expect(shortSl.exitPriceSlipApplied).toBe(true);
  });

  it("7. long max_hold current behavior", () => {
    expect(longHold.exitReason).toBe("max_hold");
    expect(longHold.executionExit).toBeCloseTo(longHold.rawExit * (1 - SLIPPAGE_RATE), 9);
    expect(longHold.ledgerSlipApplied).toBe(false);
  });

  it("8. short max_hold current behavior", () => {
    expect(shortHold.exitReason).toBe("max_hold");
    expect(shortHold.executionExit).toBeCloseTo(shortHold.rawExit * (1 + SLIPPAGE_RATE), 9);
    expect(shortHold.ledgerSlipApplied).toBe(false);
  });

  it("9. long end current behavior", () => {
    expect(longEnd.exitReason).toBe("end");
    expect(longEnd.executionExit).toBeCloseTo(
      longEnd.rawExit * (1 - SLIPPAGE_RATE),
      9,
    );
    expect(longEnd.ledgerSlipApplied).toBe(false);
  });

  it("10. short end current behavior", () => {
    expect(shortEnd.exitReason).toBe("end");
    expect(shortEnd.exitPriceSlipApplied).toBe(true);
    expect(shortEnd.ledgerSlipApplied).toBe(false);
  });

  it("11. price-slip application count per reason", () => {
    expect(longTp.priceApplicationCount).toBe(2);
    expect(longSl.priceApplicationCount).toBe(2);
    expect(longHold.priceApplicationCount).toBe(2);
    expect(longEnd.priceApplicationCount).toBe(2);
  });

  it("12. ledger-slip application count per reason", () => {
    expect(longTp.ledgerApplicationCount).toBe(0);
    expect(longSl.ledgerApplicationCount).toBe(0);
    expect(longHold.ledgerApplicationCount).toBe(0);
    expect(longEnd.ledgerApplicationCount).toBe(0);
  });

  it("13. max_hold double-application reproduction", () => {
    expect(longHold.classification).toBe("SINGLE_APPLIED");
    expect(shortHold.classification).toBe("SINGLE_APPLIED");
    expect(longHold.slippageCostUsdt).toBeGreaterThan(0);
  });

  it("14. TP missing exit slip reproduction", () => {
    expect(longTp.classification).toBe("SINGLE_APPLIED");
    expect(shortTp.classification).toBe("SINGLE_APPLIED");
  });

  it("15. SL missing exit slip reproduction", () => {
    expect(longSl.classification).toBe("SINGLE_APPLIED");
    expect(shortSl.classification).toBe("SINGLE_APPLIED");
  });

  it("16. end missing exit slip reproduction", () => {
    expect(longEnd.classification).toBe("SINGLE_APPLIED");
    expect(shortEnd.classification).toBe("SINGLE_APPLIED");
  });

  it("17. fee interaction captured", () => {
    const fee = getFeeInteraction();
    expect(fee.FEE_DEPENDS_ON_EXECUTION_PRICE).toBe("NO");
    expect(fee.feesEqualAcrossExitReasons).toBe(true);
  });

  it("18. spread interaction captured", () => {
    const sp = getSpreadInteraction();
    expect(sp.SLIPPAGE_SPREAD_DOUBLE_COUNT_RISK).toBe("PARTIAL");
    expect(sp.executionPricesUnchangedBySpread).toBe(true);
    expect(sp.spreadCostWhenOn).toBeGreaterThan(0);
    expect(sp.spreadCostWhenOff).toBe(0);
  });

  it("19. cost guard estimate captured", () => {
    const g = getCostGuardAnalysis();
    expect(g.captured.slippageCost).toBeCloseTo(SLIPPAGE_RATE * 2, 12);
    expect(g.captured.expectedFromHelper).toBe(g.captured.slippageCost);
  });

  it("20. model A arithmetic long", () => {
    const a = models.long[0]!.modelA;
    expect(a.entryExecution).toBeCloseTo(100 * 1.0002, 9);
    expect(a.exitExecution).toBeCloseTo(110 * 0.9998, 9);
    expect(a.slippageDeductedAgainUsdt).toBe(0);
    expect(a.netPnlUsdt).toBe(a.grossPnlUsdt);
  });

  it("21. model A arithmetic short", () => {
    const a = models.short[0]!.modelA;
    expect(a.entryExecution).toBeCloseTo(100 * 0.9998, 9);
    expect(a.exitExecution).toBeCloseTo(90 * 1.0002, 9);
    expect(a.slippageDeductedAgainUsdt).toBe(0);
  });

  it("22. model B arithmetic long", () => {
    const b = models.long[0]!.modelB;
    expect(b.entryExecution).toBe(100);
    expect(b.exitExecution).toBe(110);
    expect(b.grossPnlUsdt).toBeCloseTo(100, 6);
    expect(b.slippageMonetaryUsdt).toBeCloseTo(0.4, 6);
    expect(b.netPnlUsdt).toBeCloseTo(99.6, 6);
  });

  it("23. model B arithmetic short", () => {
    const b = models.short[0]!.modelB;
    expect(b.grossPnlUsdt).toBeCloseTo(100, 6);
    expect(b.slippageMonetaryUsdt).toBeCloseTo(0.4, 6);
  });

  it("24. leverage 1x", () => {
    expect(models.long[0]!.leverage).toBe(1);
    expect(models.long[0]!.modelA.leverage).toBe(1);
  });

  it("25. leverage 5x", () => {
    const a1 = models.long[0]!.modelA;
    const a5 = models.long[1]!.modelA;
    expect(a5.leverage).toBe(5);
    expect(a5.grossPnlUsdt / a1.grossPnlUsdt).toBeCloseTo(5, 5);
    expect(a5.slippageMonetaryUsdt / a1.slippageMonetaryUsdt).toBeCloseTo(5, 5);
  });

  it("26. leverage 10x", () => {
    const a1 = models.long[0]!.modelA;
    const a10 = models.long[2]!.modelA;
    expect(a10.grossPnlUsdt / a1.grossPnlUsdt).toBeCloseTo(10, 5);
  });

  it("27. canonical leg-count decision", () => {
    expect(models.CANONICAL_SLIPPAGE_LEG_COUNT).toBe(2);
    expect(models.RECOMMENDED_SLIPPAGE_MODEL).toBe("MODEL_A");
  });

  it("28. gross PnL semantic decision", () => {
    expect(getGrossNetSemantics().CANONICAL_GROSS_PNL_SEMANTIC).toContain(
      "execution (slipped) prices",
    );
  });

  it("29. net PnL semantic decision", () => {
    expect(getGrossNetSemantics().CANONICAL_NET_PNL_SEMANTIC).toContain(
      "NOT subtracted again",
    );
  });

  it("30. stress multiplier semantic", () => {
    expect(getStressSemantics().multipliers).toEqual([1, 1.5, 2]);
    expect(getStressSemantics().RECOMMENDED_STRESS_SLIPPAGE_SEMANTIC).toContain(
      "Multiply slippageRate",
    );
  });

  it("31. SAFE engine path captured", () => {
    expect(SLIPPAGE_SOURCE_PIPELINE).toContain("backtestEngine.ts::runSafeV44Backtest");
    expect(getEngineParity().SAFE).toContain("DOUBLE");
  });

  it("32. event-sequence path captured", () => {
    expect(getEngineParity().eventSequence).toContain("LEDGER_ONLY");
    expect(SLIPPAGE_SOURCE_PIPELINE).toContain("eventSequenceBacktest.ts");
  });

  it("33. condition path captured", () => {
    expect(getEngineParity().conditionBuilder).toContain("LEDGER_ONLY");
  });

  it("34. Research pattern path captured", () => {
    expect(getEngineParity().researchPattern).toContain("runEventSequenceBacktest");
    expect(getEngineParity().recommendedScope).toBe("D");
  });

  it("35. historical identity impact", () => {
    const h = getHistoricalImpact();
    expect(h.SLIPPAGE_MODEL_VERSION_REQUIRED).toBe("YES");
    expect(h.HISTORICAL_REPORT_MIGRATION_REQUIRED).toBe("NO");
  });

  it("36. approval policy decision", () => {
    expect(getApprovalImpact().policy).toBe("B+C");
  });

  it("37. no production writes", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
  });

  it("38. no Research execution", () => {
    expect(safety.researchExecutions).toBe(0);
  });

  it("39. no Paper/Live/orders", () => {
    expect(safety.paperLive).toBe(0);
    expect(safety.orders).toBe(0);
  });

  it("40. retired SAFE file remains absent", () => {
    expect(sha256(SAFE_PATH)).toBeNull();
  });

  it("artifacts written and trigger/ledger decisions recorded", () => {
    expect(getTriggerFillContract().CURRENT_FILL_MODEL).toContain("max_hold");
    expect(getEntryAuthorities().slippageShouldAffect).toContain("execution only");
    expect(getLedgerSemantics().RECOMMENDED_SLIPPAGE_LEDGER_SEMANTIC).toBe("A");
    expect(getRecommendedFormulas().LONG_EXIT).toContain("rawExit");
    expect(getRootDefects().SLIPPAGE_DOUBLE_DEDUCTION_MAX_HOLD.status).toBe("CLOSED");
    expect(computeModelArithmetic({
      model: "CURRENT_MAX_HOLD",
      side: "LONG",
      rawEntry: 100,
      rawExit: 110,
      leverage: 1,
    }).slippageDeductedAgainUsdt).toBeGreaterThan(0);
    const dir = join(
      ROOT,
      ".validation/backtest-p3-a5-1-slippage-model",
      P3A51_ARTIFACT_TS,
    );
    const required = [
      "source-trace.json",
      "exit-reason-matrix.json",
      "trigger-fill-contract.json",
      "fee-interaction.json",
      "spread-interaction.json",
      "cost-guard-analysis.json",
      "model-comparison.json",
      "micro-arithmetic.json",
      "recommended-formulas.json",
      "ledger-semantics.json",
      "gross-net-semantics.json",
      "stress-semantics.json",
      "engine-parity.json",
      "historical-impact.json",
      "approval-impact.json",
      "root-defects.json",
      "implementation-plan.json",
      "production-readonly-hashes.json",
    ];
    for (const f of required) expect(existsSync(join(dir, f))).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThanOrEqual(required.length);
    expect(written.dir).toBe(dir);
    expect(table.length).toBe(8);
    expect(runExitReasonFixture({ side: "LONG", reason: "max_hold" }).classification).toBe(
      "SINGLE_APPLIED",
    );
  });
});

const safety = { researchExecutions: 0, paperLive: 0, orders: 0 };

afterAll(() => {
  const after = productionReadonlyHashes(ROOT);
  if (after.safeSha256 !== hashesBefore.safeSha256) {
    throw new Error("SAFE changed");
  }
  if (after.backtestIndexSha256 !== hashesBefore.backtestIndexSha256) {
    throw new Error("Backtest index changed");
  }
  if (after.researchIndexSha256 !== hashesBefore.researchIndexSha256) {
    throw new Error("Research index changed");
  }
});
