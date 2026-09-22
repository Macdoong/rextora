import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BACKTEST_COST_OF_GROSS_CRITICAL,
  evaluateBacktestEligibility,
} from "../src/lib/rextora/backtest/backtestEligibility";
import {
  normalizeCostAssumptions,
  resolvePrimaryCostAssumptions,
} from "../src/lib/rextora/backtest/costAssumptions";
import { computeCostRatios } from "../src/lib/rextora/backtest/costRatios";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  COST_ASSUMPTIONS_VERSION_V1,
  LEGACY_SAVED_IDS,
  P3A61_ARTIFACT_TS,
  buildP3A61Contract,
  getApprovalProvenanceGate,
  getCostAssumptionsTypeDesign,
  getCostInputAuthorities,
  getCurrentIdentityBehavior,
  getDefectClassification,
  getEligibilityMicroComparison,
  getEligibilitySourceTrace,
  getFrozenP3A62Contract,
  getHashModelComparison,
  getInactiveFieldIdentity,
  getLegacyResultPolicy,
  getNormalizationContract,
  getP3A62FilePlan,
  getPrimaryCostAssumptions,
  getRecommendedEligibilityCostModel,
  getReportOnlyReproducibilityTarget,
  getResearchProvenanceBoundary,
  getSettingsUnitMismatch,
  getStressCostAssumptions,
  inspectLegacySavedRecord,
  writeP3A61Artifacts,
  classifyResultDeterminingFields,
} from "../src/lib/rextora/backtest/backtestCostProvenanceContract";

const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
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
const contract = buildP3A61Contract(ROOT);
const written = writeP3A61Artifacts(ROOT);
const identity = getCurrentIdentityBehavior();

function sha256(p: string): string | null {
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

describe("P3-A6.1 cost provenance + identity contract", () => {
  it("1. fee authority captured", () => {
    const fee = getCostInputAuthorities().feeRate;
    expect(fee.currentDefault).toBe(0.0004);
    expect(fee.workbenchSends).toBe(false);
    expect(fee.apiResolves).toBe(true);
    expect(fee.hashIncludes).toBe(true);
  });

  it("2. slippage authority captured", () => {
    const s = getCostInputAuthorities().slippageRate;
    expect(s.currentDefault).toBe(0.0002);
    expect(s.workbenchSends).toBe(false);
    expect(s.engineConsumes).toBe(true);
  });

  it("3. funding authority captured", () => {
    const f = getCostInputAuthorities().fundingRate;
    expect(f.currentDefault).toBe(0.0001);
    expect(f.runnerOverridesOrScales).toMatch(/NOT multiplied/);
    expect(getCostInputAuthorities().applyFunding.currentDefault).toBe(false);
  });

  it("4. spread authority captured", () => {
    const s = getCostInputAuthorities().spreadRate;
    expect(s.currentDefault).toBe(0.0001);
    expect(getCostInputAuthorities().applySpread.hashIncludes).toBe(false);
  });

  it("5. cost guard authority captured", () => {
    expect(getCostInputAuthorities().costGuardK.currentDefault).toContain("3");
    expect(getCostInputAuthorities().cost_guard.engineConsumes).toBe(true);
  });

  it("6. primary cost assumptions captured", () => {
    const p = getPrimaryCostAssumptions().PRIMARY_COST_ASSUMPTIONS;
    expect(p.fundingMultiplied).toBe(false);
    expect(p.applyFunding).toContain("false");
  });

  it("7. stress assumptions captured", () => {
    const s = getStressCostAssumptions();
    expect(s.recommendedRepresentation).toBe("B");
    expect(s.STRESS_COST_ASSUMPTIONS.fundingRate).toMatch(/NOT multiplied/);
    expect(s.STRESS_COST_ASSUMPTIONS.researchDivergence).toContain(
      "fundingRate",
    );
  });

  it("8. result-determining fields classified", () => {
    const c = classifyResultDeterminingFields();
    expect(c.feeRate).toBe("RESULT_DETERMINING");
    expect(c.slippageRate).toBe("RESULT_DETERMINING");
    expect(c.slippageModelVersion).toBe("RESULT_DETERMINING");
    expect(c.engineVersion).toBe("PROVENANCE_ONLY (hashed, does not switch math)");
  });

  it("9. costAssumptions version decision", () => {
    const d = getCostAssumptionsTypeDesign();
    expect(d.COST_ASSUMPTIONS_VERSION_REQUIRED).toBe("YES");
    expect(d.recommendedVersion).toBe(COST_ASSUMPTIONS_VERSION_V1);
    expect(d.recommendedType.fee.model).toBe("round_trip_taker_2x");
    expect(d.recommendedType.funding.model).toBe("synthetic_flat_per_trade");
  });

  it("10. normalization point decision", () => {
    expect(
      getNormalizationContract().RECOMMENDED_COST_ASSUMPTION_NORMALIZATION_POINT,
    ).toContain("dedicated normalizer");
    expect(
      getNormalizationContract().hiddenDownstreamDefaultsP3A62MustBypass.length,
    ).toBeGreaterThan(2);
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("11. legacy saved result 1 hash behavior", () => {
    const row = inspectLegacySavedRecord(LEGACY_SAVED_IDS[0]);
    expect(row.present).toBe(true);
    expect(row.slippageModelVersionPresent).toBe(false);
    expect(row.matchesCurrent).toBe(true);
    expect(row.matchesPreA52).toBe(true);
    expect(row.readResult).toContain("readable");
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("12. legacy saved result 2 hash behavior", () => {
    const row = inspectLegacySavedRecord(LEGACY_SAVED_IDS[1]);
    expect(row.present).toBe(true);
    expect(row.storedHash).toBeTruthy();
    expect(row.matchesCurrent).toBe(true);
    expect(row.matchesPreA52).toBe(true);
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("13. legacy saved result 3 hash behavior", () => {
    const row = inspectLegacySavedRecord(LEGACY_SAVED_IDS[2]);
    expect(row.present).toBe(true);
    expect(row.matchesCurrent).toBe(true);
    expect(row.matchesPreA52).toBe(true);
  });

  it.skipIf(!LEGACY_RECORDS_PRESENT)("14. no historical rewrite", () => {
    for (const row of legacyShasBefore) {
      const p = join(ROOT, "data/rextora/backtests", `${row.id}.json`);
      expect(existsSync(p)).toBe(true);
      expect(sha256(p)).toBe(row.sha);
    }
    expect(contract.legacy.LEGACY_HASH_RECOMPUTATION_MISMATCH_COUNT).toBe(0);
  });

  it("15. new model version changes hash", () => {
    expect(identity.modelVersionChangesHash).toBe(true);
  });

  it("16. fee change changes hash", () => {
    expect(identity.feeChangeChangesHash).toBe(true);
  });

  it("17. slippage change changes hash", () => {
    expect(identity.slippageChangeChangesHash).toBe(true);
  });

  it("18. applyFunding change identity behavior", () => {
    expect(identity.applyFundingSameOutcomesSameHash).toBe(true);
    expect(getHashModelComparison().RECOMMENDED_HASH_MODEL).toBe("HASH-B");
  });

  it("19. dormant funding-rate identity behavior", () => {
    expect(identity.dormantFundingRateChangesHash).toBe(true);
    expect(getInactiveFieldIdentity().fundingRule).toBe("C");
  });

  it("20. applySpread change identity behavior", () => {
    expect(identity.applySpreadSameOutcomesSameHash).toBe(true);
  });

  it("21. dormant spread-rate identity behavior", () => {
    expect(identity.dormantSpreadRateSameHash).toBe(true);
    expect(getInactiveFieldIdentity().spreadRule).toBe("C");
  });

  it("22. report-only reproducibility target", () => {
    const t = getReportOnlyReproducibilityTarget()
      .REPORT_ONLY_COST_REPRODUCIBILITY_TARGET;
    expect(t.feeRate).toBe("required");
    expect(t.slippageModelVersion).toBe("required");
    expect(t.fundingEffectiveRate).toBe("required");
  });

  it("23. eligibility current deducted ratio", () => {
    const micro = getEligibilityMicroComparison();
    const deducted = computeCostRatios({
      grossPnLBeforeCosts: micro.grossProfit,
      netPnLAfterCosts: micro.grossProfit - (micro.fee + micro.funding + micro.spread),
      totalCostUsdt: micro.fee + micro.funding + micro.spread,
      feeCostUsdt: micro.fee,
      slippageCostUsdt: micro.slippageAttribution,
    });
    expect(deducted.totalCostPctOfGrossProfit).toBeCloseTo(0.4, 6);
    expect(deducted.criticalCostOfGross).toBe(false);
    expect(micro.deductedPasses).toBe(true);
  });

  it("24. eligibility economic-friction ratio", () => {
    const micro = getEligibilityMicroComparison();
    const econ = computeCostRatios({
      grossPnLBeforeCosts: micro.grossProfit,
      netPnLAfterCosts: micro.grossProfit - (micro.fee + micro.funding + micro.spread),
      totalCostUsdt:
        micro.fee +
        micro.funding +
        micro.spread +
        micro.slippageAttribution,
      feeCostUsdt: micro.fee,
      slippageCostUsdt: micro.slippageAttribution,
    });
    expect(econ.totalCostPctOfGrossProfit).toBeCloseTo(0.6, 6);
    expect(econ.criticalCostOfGross).toBe(true);
  });

  it("25. threshold crossing comparison", () => {
    const micro = getEligibilityMicroComparison();
    expect(micro.threshold).toBe(BACKTEST_COST_OF_GROSS_CRITICAL);
    expect(micro.deductedPasses).toBe(true);
    expect(micro.economicFails).toBe(true);
    const assumptions = normalizeCostAssumptions({});
    const primary = resolvePrimaryCostAssumptions(assumptions, 1);
    const deductedGate = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.1,
      mdd: -0.05,
      tradeCount: 40,
      totalCostPctOfGrossProfit: micro.deductedRatio,
      slippageModelVersion: "execution_price_v1",
      hasCostStress: true,
      costAssumptions: assumptions,
      primaryCostAssumptions: primary,
    });
    const economicGate = evaluateBacktestEligibility({
      status: "completed",
      totalReturn: 0.1,
      mdd: -0.05,
      tradeCount: 40,
      totalCostPctOfGrossProfit: micro.economicFrictionRatio,
      slippageModelVersion: "execution_price_v1",
      hasCostStress: true,
      costAssumptions: assumptions,
      primaryCostAssumptions: primary,
    });
    expect(deductedGate.eligible).toBe(true);
    expect(economicGate.eligible).toBe(false);
    expect(economicGate.reasons.some((r) => r.code === "excessive_cost_ratio")).toBe(
      true,
    );
  });

  it("26. eligibility semantic decision", () => {
    expect(
      getEligibilitySourceTrace().ELIGIBILITY_COST_RATIO_SEMANTIC_CHANGED_BY_P3_A5_2,
    ).toBe("YES");
    expect(getRecommendedEligibilityCostModel().RECOMMENDED_ELIGIBILITY_COST_MODEL).toBe(
      "ELIG-B",
    );
    expect(getEligibilitySourceTrace().uiCopy).toContain("슬리피지");
  });

  it("27. approval provenance gate", () => {
    const g = getApprovalProvenanceGate();
    expect(g.blockerCodes).toContain("missing_cost_assumptions");
    expect(g.blockerCodes).toContain("legacy_slippage_model");
    expect(g.requiredBeforeNewAdvancement[0]).toContain("costAssumptions");
  });

  it("28. legacy view allowed", () => {
    expect(getLegacyResultPolicy().view).toMatch(/allowed/);
  });

  it("29. legacy new Paper advancement policy", () => {
    expect(getLegacyResultPolicy().newPaper).toMatch(/blocked/);
  });

  it("30. legacy new Live advancement policy", () => {
    expect(getLegacyResultPolicy().newLive).toMatch(/blocked/);
  });

  it("31. active sessions unaffected policy", () => {
    expect(getLegacyResultPolicy().activeSessions).toMatch(/unaffected/);
  });

  it("32. Settings/engine unit mismatch captured", () => {
    const s = getSettingsUnitMismatch();
    expect(s.classification).toBe("DISPLAY_ONLY_DEBT");
    expect(s.settings.takerFeePct).toBe(0.04);
    expect(s.engine.feeRate).toBe(0.0004);
    expect(s.workbench.postsRates).toBe(false);
  });

  it("33. Research provenance schema boundary", () => {
    const r = getResearchProvenanceBoundary();
    expect(r.RESEARCH_CAN_REUSE_PROVENANCE_SCHEMA).toBe("PARTIAL");
    expect(r.recommendedEngineCostModelField.eventSequence).toBe(
      "event_sequence_ledger_v0",
    );
  });

  it("34. frozen P3-A6.2 contract", () => {
    const f = getFrozenP3A62Contract();
    expect(f.P3_A6_2_READY).toBe("YES");
    expect(f.B_COST_ASSUMPTIONS_VERSION).toBe(COST_ASSUMPTIONS_VERSION_V1);
    expect(f.D_HASH_VERSIONING_RULE).toContain("HASH-B");
    expect(f.F_ELIGIBILITY_COST_RATIO_RULE).toContain("totalEconomicFrictionUsdt");
    expect(getP3A62FilePlan().newFile).toContain("costAssumptions.ts");
    expect(getDefectClassification().ELIGIBILITY_COST_RATIO_SEMANTIC_DRIFT.status).toBe(
      "PROVEN",
    );
  });

  it("35. no production records modified", () => {
    const after = productionReadonlyHashes(ROOT);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  });

  it("36. no Research execution", () => {
    expect(contract.safety.researchExecutions).toBe(0);
  });

  it("37. no Paper/Live actions", () => {
    expect(contract.safety.paperLive).toBe(0);
  });

  it("38. no orders", () => {
    expect(contract.safety.orders).toBe(0);
  });

  it("39. retired SAFE file remains absent", () => {
    expect(sha256(SAFE_PATH)).toBeNull();
  });

  it("artifacts written", () => {
    const required = [
      "cost-input-authorities.json",
      "result-determining-fields.json",
      "primary-stress-assumptions.json",
      "cost-assumptions-type-design.json",
      "normalization-contract.json",
      "legacy-hash-forensic.json",
      "hash-model-comparison.json",
      "inactive-field-identity.json",
      "report-reproducibility-target.json",
      "eligibility-source-trace.json",
      "eligibility-model-comparison.json",
      "approval-provenance-gate.json",
      "legacy-result-policy.json",
      "settings-unit-mismatch.json",
      "research-provenance-boundary.json",
      "defect-classification.json",
      "p3-a6-2-frozen-contract.json",
      "production-readonly-hashes.json",
    ];
    const dir = join(
      ROOT,
      ".validation/backtest-p3-a6-1-cost-provenance-contract",
      P3A61_ARTIFACT_TS,
    );
    expect(written.dir).toBe(dir);
    for (const f of required) expect(existsSync(join(dir, f))).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThanOrEqual(required.length);
  });
});

afterAll(() => {
  const after = productionReadonlyHashes(ROOT);
  expect(after.safeSha256).toBe(hashesBefore.safeSha256);
  expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
  expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
});
