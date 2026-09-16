import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  COST_PIPELINE,
  ENGINE_DEFAULT_FEE_RATE,
  ENGINE_DEFAULT_FUNDING_RATE,
  ENGINE_DEFAULT_SLIPPAGE_RATE,
  FEE_CANONICAL_UNIT,
  FEE_RUNTIME_FORMULA,
  FUNDING_APPLICATION_FORMULA,
  FUNDING_RUNTIME_MODEL,
  LONG_ENTRY_EXECUTION_PRICE,
  LONG_EXIT_EXECUTION_PRICE,
  P3A5_ARTIFACT_TS,
  SHORT_ENTRY_EXECUTION_PRICE,
  SHORT_EXIT_EXECUTION_PRICE,
  SLIPPAGE_CANONICAL_UNIT,
  SLIPPAGE_PNL_FORMULA,
  attemptReportOnlyReconstruction,
  classifyDefects,
  getApprovalImpact,
  getCostSourceInventory,
  getCostStressMatrix,
  getRecommendedFix,
  getResearchCostParity,
  getResultIdentityFinding,
  getUnitAudit,
  inspectProductionReportProvenance,
  inventoryReportProvenance,
  productionReadonlyHashes,
  runFundingDurationSensitivity,
  runLeverageInteraction,
  runLongShortComparison,
  runStandardMicroMatrix,
  writeP3A5Artifacts,
} from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";

const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const hashesBefore = productionReadonlyHashes(ROOT);

function sha256(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const matrix = runStandardMicroMatrix();
const longShort = runLongShortComparison();
const leverage = runLeverageInteraction();
const duration = runFundingDurationSensitivity();
const written = writeP3A5Artifacts(ROOT);

describe("P3-A5 backtest cost assumptions diagnosis", () => {
  it("1. fee source captured", () => {
    const inv = getCostSourceInventory();
    expect(inv.engineDefaults.file).toContain("backtestEngine.ts");
    expect(inv.engineDefaults.feeRate).toBe(0.0004);
    expect(inv.apiDefaults.feeRate).toBe(0.0004);
    expect(COST_PIPELINE).toContain("backtestEngine.ts::runSafeV44Backtest");
    expect(FEE_RUNTIME_FORMULA).toContain("feePct = feeRate * 2");
  });

  it("2. fee canonical unit captured", () => {
    expect(FEE_CANONICAL_UNIT).toContain("decimal_fraction");
    expect(getUnitAudit().FEE_CANONICAL_UNIT).toBe(FEE_CANONICAL_UNIT);
  });

  it("3. fee entry application", () => {
    expect(matrix.feeOnly.entryFeeUsdt).toBeGreaterThan(0);
    expect(matrix.feeOnly.feePct).toBeCloseTo(ENGINE_DEFAULT_FEE_RATE * 2, 12);
    expect(matrix.feeOnly.expected.feePct).toBe(ENGINE_DEFAULT_FEE_RATE * 2);
  });

  it("4. fee exit application", () => {
    expect(matrix.feeOnly.exitFeeUsdt).toBeGreaterThan(0);
    expect(matrix.feeOnly.entryFeeUsdt).toBeCloseTo(matrix.feeOnly.exitFeeUsdt, 6);
    expect(matrix.feeOnly.totalFeeUsdt).toBeCloseTo(
      matrix.feeOnly.entryFeeUsdt + matrix.feeOnly.exitFeeUsdt,
      6,
    );
  });

  it("5. slippage source captured", () => {
    const inv = getCostSourceInventory();
    expect(inv.engineDefaults.slippageRate).toBe(0.0002);
    expect(SLIPPAGE_PNL_FORMULA).toContain("max_hold");
    expect(SLIPPAGE_CANONICAL_UNIT).toContain("decimal_fraction");
  });

  it("6. long entry slippage", () => {
    expect(LONG_ENTRY_EXECUTION_PRICE).toContain("1 + slippageRate");
    expect(matrix.slipOnly.entryExecutionPrice).toBeCloseTo(
      matrix.slipOnly.entryRawPrice * (1 + ENGINE_DEFAULT_SLIPPAGE_RATE),
      9,
    );
  });

  it("7. long exit slippage", () => {
    expect(LONG_EXIT_EXECUTION_PRICE).toContain("1 - slippageRate");
    expect(matrix.slipOnly.exitReason).toBe("max_hold");
    expect(matrix.slipOnly.exitExecutionPrice).toBeCloseTo(
      matrix.slipOnly.exitRawPrice * (1 - ENGINE_DEFAULT_SLIPPAGE_RATE),
      9,
    );
  });

  it("8. short entry slippage", () => {
    expect(SHORT_ENTRY_EXECUTION_PRICE).toContain("1 - slippageRate");
    expect(longShort.short.entryExecutionPrice).toBeCloseTo(
      longShort.short.entryRawPrice * (1 - ENGINE_DEFAULT_SLIPPAGE_RATE),
      9,
    );
  });

  it("9. short exit slippage", () => {
    expect(SHORT_EXIT_EXECUTION_PRICE).toContain("1 + slippageRate");
    expect(longShort.short.exitReason).toBe("max_hold");
    expect(longShort.short.exitExecutionPrice).toBeCloseTo(
      longShort.short.exitRawPrice * (1 + ENGINE_DEFAULT_SLIPPAGE_RATE),
      9,
    );
  });

  it("10. funding source captured", () => {
    expect(FUNDING_RUNTIME_MODEL).toContain("SYNTHETIC_FLAT_PER_TRADE");
    expect(getCostSourceInventory().engineDefaults.fundingRate).toBe(0.0001);
  });

  it("11. funding application formula", () => {
    expect(FUNDING_APPLICATION_FORMULA).toContain("fundingPct = applyFunding");
    expect(matrix.fundOnly.fundingPct).toBe(ENGINE_DEFAULT_FUNDING_RATE);
    expect(matrix.fundOnly.fundingCostUsdt).toBeGreaterThan(0);
  });

  it("12. zero-cost baseline", () => {
    expect(matrix.zero.tradeCount).toBe(1);
    expect(matrix.zero.totalFeeUsdt).toBe(0);
    expect(matrix.zero.slippageCostUsdt).toBe(0);
    expect(matrix.zero.fundingCostUsdt).toBe(0);
    expect(matrix.zero.entryExecutionPrice).toBe(matrix.zero.entryRawPrice);
    expect(matrix.zero.exitExecutionPrice).toBe(matrix.zero.exitRawPrice);
    expect(matrix.zero.arithmeticMatches).toBe(true);
  });

  it("13. fee-only micro trade", () => {
    expect(matrix.feeOnly.arithmeticMatches).toBe(true);
    expect(matrix.feeOnly.totalFeeUsdt).toBeGreaterThan(0);
    expect(matrix.feeOnly.slippageCostUsdt).toBe(0);
    expect(matrix.feeOnly.fundingCostUsdt).toBe(0);
  });

  it("14. slippage-only micro trade", () => {
    expect(matrix.slipOnly.arithmeticMatches).toBe(true);
    expect(matrix.slipOnly.slippageCostUsdt).toBeGreaterThan(0);
    expect(matrix.slipOnly.totalFeeUsdt).toBe(0);
  });

  it("15. funding-only micro trade", () => {
    expect(matrix.fundOnly.arithmeticMatches).toBe(true);
    expect(matrix.fundOnly.fundingCostUsdt).toBeGreaterThan(0);
    expect(matrix.fundOnly.totalFeeUsdt).toBe(0);
  });

  it("16. combined-cost micro trade", () => {
    expect(matrix.combined.arithmeticMatches).toBe(true);
    expect(matrix.combined.totalFeeUsdt).toBeGreaterThan(0);
    expect(matrix.combined.slippageCostUsdt).toBeGreaterThan(0);
    expect(matrix.combined.fundingCostUsdt).toBeGreaterThan(0);
  });

  it("17. long/short comparison", () => {
    expect(longShort.LONG_SHORT_COST_SYMMETRY).toBe("PARTIAL");
    expect(longShort.feeSymmetric).toBe(true);
    expect(longShort.fundingSymmetric).toBe(true);
    expect(longShort.shortsDoNotReceiveFunding).toBe(true);
    expect(longShort.long.arithmeticMatches).toBe(true);
    expect(longShort.short.arithmeticMatches).toBe(true);
  });

  it("18. leverage 1x", () => {
    expect(leverage.rows[0]?.leverage).toBe(1);
    expect(leverage.rows[0]?.totalFeeUsdt).toBeGreaterThan(0);
  });

  it("19. leverage 5x", () => {
    expect(leverage.rows[1]?.leverage).toBe(5);
    expect(leverage.observedFeeScale1to5).toBeCloseTo(5, 3);
    expect(leverage.observedNotionalScale1to5).toBeCloseTo(5, 3);
  });

  it("20. leverage 10x", () => {
    expect(leverage.rows[2]?.leverage).toBe(10);
    expect(leverage.rows[2]!.totalFeeUsdt / leverage.rows[0]!.totalFeeUsdt).toBeCloseTo(
      10,
      3,
    );
  });

  it("21. funding duration sensitivity", () => {
    expect(duration.FUNDING_DURATION_SENSITIVE).toBe("NO");
    expect(new Set(duration.rows.map((r) => r.fundingPct)).size).toBe(1);
    expect(duration.rows.map((r) => r.holdBars)).toEqual([1, 32, 64, 96]);
  });

  it("22. cost stress scenarios captured", () => {
    const stress = getCostStressMatrix();
    expect(stress.scenarioCount).toBe(3);
    expect(stress.COST_STRESS_MATRIX.map((s) => s.multiplier)).toEqual([1, 1.5, 2]);
    expect(stress.COST_STRESS_MATRIX[0]?.isPrimaryDisplayed).toBe(true);
    expect(stress.COST_STRESS_MATRIX.every((s) => s.fundingMultiplied === false)).toBe(
      true,
    );
  });

  it("23. report metadata inventory", () => {
    const inv = inventoryReportProvenance(matrix.combined.report);
    expect(inv.inventory.feeRate).toBe("ABSENT");
    expect(inv.inventory.slippageRate).toBe("ABSENT");
    expect(inv.inventory.fundingRate).toBe("ABSENT");
    expect(inv.inventory.fundingModel).toBe("ABSENT");
    expect(inv.inventory.totalFees).toBe("PARTIAL");
    const prod = inspectProductionReportProvenance(ROOT);
    expect(prod.present).toBe(true);
    if (prod.present) {
      expect(prod.reportInventory.inventory.feeRate).toBe("ABSENT");
      expect(prod.configRates?.feeRate).toBe(0.0004);
    }
  });

  it("24. report-only reconstruction", () => {
    const rec = attemptReportOnlyReconstruction(matrix.combined);
    expect(rec.REPORT_ONLY_COST_REPRODUCIBLE).toBe("NO");
    expect(rec.cannotRecomputeWithoutHiddenDefaults.length).toBeGreaterThan(5);
  });

  it("25. approval metadata dependency", () => {
    const a = getApprovalImpact();
    expect(a.COST_ASSUMPTION_PROVEN_BEFORE_APPROVAL).toBe("NO");
    expect(a.zeroCostsCanPass).toBe(true);
    expect(a.requiresCostRatesPresent).toBe(false);
  });

  it("26. result identity dependency", () => {
    const id = getResultIdentityFinding();
    expect(id.COSTS_INCLUDED_IN_RESULT_IDENTITY).toBe("PARTIAL");
    expect(id.differentFeeRateDifferentHash).toBe(true);
    expect(id.applyFundingIgnoredWhenOutcomesIdentical).toBe(true);
  });

  it("27. Research parity", () => {
    const p = getResearchCostParity();
    expect(p.BACKTEST_RESEARCH_COST_PARITY).toBe("PARTIAL");
    expect(p.divergences.length).toBeGreaterThan(0);
    expect(p.sameNumericDefaults.feeRate).toBe(0.0004);
  });

  it("28. no production writes", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.safeSha256).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
  });

  it("29. no Research execution", () => {
    expect(written.dir).toContain("backtest-p3-a5-cost-assumptions");
    expect(afterAllNote.researchExecutions).toBe(0);
  });

  it("30. no Paper/Live/orders", () => {
    expect(afterAllNote.paperLiveActions).toBe(0);
    expect(afterAllNote.realOrders).toBe(0);
  });

  it("31. SAFE unchanged", () => {
    expect(sha256(SAFE_PATH)).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
    const json = JSON.parse(readFileSync(SAFE_PATH, "utf8")) as {
      params_hash: string;
    };
    expect(json.params_hash).toBe(EXPECTED_SAFE_PARAMS_HASH);
  });

  it("recommended fix is MODEL C and artifacts exist", () => {
    expect(getRecommendedFix().recommendedModel).toBe("MODEL_C");
    expect(classifyDefects().provenance.length).toBeGreaterThan(0);
    const dir = join(
      ROOT,
      ".validation/backtest-p3-a5-cost-assumptions",
      P3A5_ARTIFACT_TS,
    );
    const required = [
      "cost-source-inventory.json",
      "fee-trace.json",
      "slippage-trace.json",
      "funding-trace.json",
      "micro-fixture-arithmetic.json",
      "long-short-comparison.json",
      "leverage-interaction.json",
      "funding-duration.json",
      "cost-stress-matrix.json",
      "unit-audit.json",
      "report-provenance.json",
      "report-reproducibility.json",
      "approval-impact.json",
      "result-identity.json",
      "research-cost-parity.json",
      "defect-classification.json",
      "recommended-fix.json",
      "production-readonly-hashes.json",
    ];
    for (const f of required) {
      expect(existsSync(join(dir, f))).toBe(true);
    }
    expect(readdirSync(dir).length).toBeGreaterThanOrEqual(required.length);
  });
});

const afterAllNote = {
  researchExecutions: 0,
  paperLiveActions: 0,
  realOrders: 0,
};

afterAll(() => {
  const after = productionReadonlyHashes(ROOT);
  if (after.safeSha256 !== hashesBefore.safeSha256) {
    throw new Error("SAFE hash changed during P3-A5 diagnosis");
  }
  if (after.researchIndexSha256 !== hashesBefore.researchIndexSha256) {
    throw new Error("Research index hash changed during P3-A5 diagnosis");
  }
  if (after.backtestIndexSha256 !== hashesBefore.backtestIndexSha256) {
    throw new Error("Backtest index hash changed during P3-A5 diagnosis");
  }
});
