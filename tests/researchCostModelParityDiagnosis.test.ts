import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BACKTEST_API_DEFAULT_APPLY_SPREAD,
  BACKTEST_API_DEFAULT_COST_GUARD_K,
  P3A71_ARTIFACT_TS,
  RESEARCH_DEFAULT_APPLY_FUNDING,
  RESEARCH_DEFAULT_APPLY_SPREAD,
  RESEARCH_DEFAULT_FEE_RATE,
  RESEARCH_DEFAULT_FUNDING_MULTIPLIER,
  RESEARCH_DEFAULT_FUNDING_RATE,
  RESEARCH_DEFAULT_SLIPPAGE_RATE,
  compareExecutionPriceVsLedger,
  getCanonicalEngineCostMatrix,
  getFixOrderComparison,
  getFrozenP3A72Contract,
  getHistoricalResearchPolicy,
  getResearchCandidateEngineMatrix,
  getResearchCostIdentity,
  getResearchDefaultAuthorities,
  getResearchProvenanceInventory,
  getRepeatedSignatureImpact,
  getRootDefects,
  getScoringPipeline,
  proveConditionBuilderCostModel,
  proveCostGuardParity,
  proveFundingStressParity,
  proveRankingSensitivity,
  proveSafeResearchBacktestParity,
  proveSpreadParity,
  proveTinyCandidateFamily,
  writeP3A71Artifacts,
} from "../src/lib/rextora/strategySearch/researchCostModelParityDiagnosis";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";

const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const EXPECTED_SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const hashesBefore = productionReadonlyHashes(ROOT);
const researchIndexBefore = hashesBefore.researchIndexSha256;
const backtestIndexBefore = hashesBefore.backtestIndexSha256;

function sha256(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const written = await writeP3A71Artifacts(ROOT);
const safeParity = await proveSafeResearchBacktestParity();
const family = await proveTinyCandidateFamily();
const condition = proveConditionBuilderCostModel();
const ranking = proveRankingSensitivity();
const funding = proveFundingStressParity();
const guard = proveCostGuardParity();

describe("P3-A7.1 Research cost-model parity diagnosis", () => {
  it("1. SAFE Research engine path identified", () => {
    expect(getResearchCandidateEngineMatrix().SAFE.engine).toBe(
      "runSafeV44Backtest",
    );
    expect(source("src/lib/rextora/strategySearch/backtestAdapter.ts")).toContain(
      "runSafeV44Backtest",
    );
  });

  it("2. pattern engine path identified", () => {
    expect(getResearchCandidateEngineMatrix().PATTERN.engine).toBe(
      "runEventSequenceBacktest",
    );
    expect(source("src/lib/rextora/strategySearch/backtestAdapter.ts")).toContain(
      "isPatternCandidateParams",
    );
  });

  it("3. condition-builder path identified if reachable", () => {
    const cb = getResearchCandidateEngineMatrix().CONDITION_BUILDER;
    expect(cb.productionReachableAsResearchEngine).toBe(false);
    expect(cb.productionReachableAsPromotedType).toBe(true);
    expect(
      source("src/lib/rextora/strategySearch/backtestAdapter.ts"),
    ).not.toContain("runConditionBuilderBacktest");
  });

  it("4. SAFE Backtest default fee", () => {
    expect(source("app/api/rextora/backtest/run/route.ts")).toContain(
      "normalizeCostAssumptions",
    );
    expect(RESEARCH_DEFAULT_FEE_RATE).toBe(0.0004);
  });

  it("5. SAFE Research default fee", () => {
    expect(getResearchDefaultAuthorities().feeRate.value).toBe(0.0004);
  });

  it("6. SAFE Backtest default slippage", () => {
    expect(RESEARCH_DEFAULT_SLIPPAGE_RATE).toBe(0.0002);
  });

  it("7. SAFE Research default slippage", () => {
    expect(getResearchDefaultAuthorities().slippageRate.value).toBe(0.0002);
  });

  it("8. funding defaults", () => {
    expect(RESEARCH_DEFAULT_FUNDING_RATE).toBe(0.0001);
    expect(RESEARCH_DEFAULT_APPLY_FUNDING).toBe(false);
  });

  it("9. spread defaults", () => {
    expect(RESEARCH_DEFAULT_APPLY_SPREAD).toBe(true);
    expect(BACKTEST_API_DEFAULT_APPLY_SPREAD).toBe(false);
  });

  it("10. cost guard defaults", () => {
    expect(BACKTEST_API_DEFAULT_COST_GUARD_K).toBe(3);
    expect(getResearchDefaultAuthorities().costGuardK.patternStressFallback).toBe(
      3,
    );
  });

  it("11. SAFE Research vs Backtest same-fixture trade count", () => {
    expect(safeParity.tradeCount.equal).toBe(true);
    expect(safeParity.paramsHashProtected).toBe(false);
  });

  it("12. SAFE Research vs Backtest execution prices", () => {
    expect(safeParity.slippageModelVersion).toBe("execution_price_v1");
    expect(safeParity.SAFE_RESEARCH_BACKTEST_COST_PARITY).toBe("YES");
  });

  it("13. SAFE Research vs Backtest net result", () => {
    expect(safeParity.totalReturn.equal).toBe(true);
    expect(safeParity.endingBalance.equal).toBe(true);
  });

  it("14. event-sequence long cost comparison", () => {
    const row = compareExecutionPriceVsLedger({
      side: "LONG",
      rawEntry: 100,
      rawExit: 110,
      margin: 1000,
      leverage: 1,
      slippageRate: 0.0002,
      feeRate: 0,
    });
    expect(row.entryExecution).toBeCloseTo(100.02, 6);
    expect(row.exitExecution).toBeCloseTo(109.978, 6);
    expect(row.differenceUsdt).not.toBe(0);
  });

  it("15. event-sequence short cost comparison", () => {
    const row = compareExecutionPriceVsLedger({
      side: "SHORT",
      rawEntry: 100,
      rawExit: 90,
      margin: 1000,
      leverage: 1,
      slippageRate: 0.0002,
      feeRate: 0,
    });
    expect(row.entryExecution).toBeCloseTo(99.98, 6);
    expect(row.exitExecution).toBeCloseTo(90.018, 6);
    expect(row.differenceUsdt).not.toBe(0);
  });

  it("16. condition TP cost behavior", () => {
    expect(condition.tp.appliesLedgerSlip).toBe(true);
  });

  it("17. condition SL cost behavior", () => {
    expect(condition.sl.appliesLedgerSlip).toBe(true);
  });

  it("18. condition max_hold cost behavior", () => {
    expect(condition.maxHold.appliesLedgerSlip).toBe(true);
  });

  it("19. condition END cost behavior", () => {
    expect(condition.end.omitsLedgerSlip).toBe(true);
    expect(condition.end.exitReason).toBe("end");
  });

  it("20. Backtest funding stress ×1", () => {
    expect(funding.BACKTEST_STRESS_FUNDING.resolved[0]?.fundingRate).toBe(0.0001);
  });

  it("21. Backtest funding stress ×1.5", () => {
    expect(funding.BACKTEST_STRESS_FUNDING.resolved[1]?.fundingRate).toBe(0.0001);
  });

  it("22. Backtest funding stress ×2", () => {
    expect(funding.BACKTEST_STRESS_FUNDING.resolved[2]?.fundingRate).toBe(0.0001);
  });

  it("23. Research funding stress ×1", () => {
    expect(
      funding.RESEARCH_STRESS_FUNDING.mechanismWhenMultiplierMatchesStress[0]
        ?.fundingRate,
    ).toBeCloseTo(0.0001);
  });

  it("24. Research funding stress ×1.5", () => {
    expect(
      funding.RESEARCH_STRESS_FUNDING.mechanismWhenMultiplierMatchesStress[1]
        ?.fundingRate,
    ).toBeCloseTo(0.00015);
    expect(RESEARCH_DEFAULT_FUNDING_MULTIPLIER).toBe(1);
  });

  it("25. Research funding stress ×2", () => {
    expect(
      funding.RESEARCH_STRESS_FUNDING.mechanismWhenMultiplierMatchesStress[2]
        ?.fundingRate,
    ).toBeCloseTo(0.0002);
  });

  it("26. spread parity", () => {
    expect(proveSpreadParity().researchUiDefault).toBe(true);
    expect(proveSpreadParity().backtestApiDefault).toBe(false);
  });

  it("27. cost guard boundary comparison", () => {
    expect(guard.selectionDifferenceDueSolelyToK).toBe("YES");
    expect(guard.researchK2Accepted).toBe(true);
    expect(guard.backtestApiK3Rejected).toBe(true);
  });

  it("28. scoring consumers captured", () => {
    expect(getScoringPipeline().order[2]).toContain("calculateCandidateScore");
    expect(getScoringPipeline().costSensitiveFields.length).toBeGreaterThan(4);
  });

  it("29. ranking sensitivity candidate A", () => {
    expect(ranking.beforeCosts.aBetter).toBe(true);
    expect(ranking.sameEngineSafe.aSafe).toBeGreaterThan(
      ranking.sameEngineSafe.bSafe,
    );
  });

  it("30. ranking sensitivity candidate B", () => {
    expect(ranking.beforeCosts.bRaw).toBeLessThan(ranking.beforeCosts.aRaw);
  });

  it("31. cost-model ranking inversion check", () => {
    expect(ranking.RANKING_INVERSION_DUE_TO_COST_MODEL).toBe("YES");
    expect(ranking.mixedEnginePool.inverted).toBe(true);
  });

  it("32. tiny candidate-family evaluation", () => {
    expect(family.rows.length).toBe(3);
    expect(family.rows.every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it("33. mixed-engine ranking-pool behavior", () => {
    expect(family.MIXED_ENGINE_CANDIDATES_COMPARED_IN_SAME_POOL).toBe(true);
    const engines = new Set(family.rows.map((r) => r.engineFamily));
    expect(engines.has("safe_execution_price_v1")).toBe(true);
    expect(engines.has("event_sequence_ledger_v0")).toBe(true);
  });

  it("34. champion-impact trace", () => {
    expect(getFrozenP3A72Contract().C_mixedEngineRankingBeforeParity).toMatch(
      /blocked/,
    );
    expect(ranking.RANKING_INVERSION_DUE_TO_COST_MODEL).toBe("YES");
  });

  it("35. Research trial provenance inventory", () => {
    expect(getResearchProvenanceInventory().RESEARCH_TRIAL_COST_PROVENANCE).toBe(
      "PARTIAL",
    );
  });

  it("36. Research cost identity behavior", () => {
    expect(getResearchCostIdentity().RESEARCH_COSTS_INCLUDED_IN_IDENTITY).toBe(
      "NO",
    );
    expect(getResearchCostIdentity().sameCandidateDifferentFeeTreatedAsSame).toBe(
      true,
    );
  });

  it("37. provenance-without-parity feasibility", () => {
    expect(getCanonicalEngineCostMatrix().SAFE_EXECUTION_PRICE_V1.MODEL_ID).toBe(
      "safe_execution_price_v1",
    );
    expect(getFixOrderComparison().RECOMMENDED_RESEARCH_COST_FIX_ORDER).toBe(
      "MODEL_C",
    );
  });

  it("38. historical Research policy", () => {
    expect(getHistoricalResearchPolicy().view).toMatch(/allowed/);
    expect(getHistoricalResearchPolicy().promote).toMatch(/Final PASS/);
  });

  it("39. P3-A7.2 readiness", () => {
    expect(getFrozenP3A72Contract().P3_A7_2_READY).toBe("YES");
    expect(getRootDefects().MIXED_ENGINE_RANKING_COST_BIAS.status).toBe(
      "PROVEN",
    );
  });

  it("40. no production Research execution", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(source("src/lib/rextora/strategySearch/researchCostModelParityDiagnosis.ts")).not.toContain(
      "runOrchestratedSearchJob",
    );
  });

  it("41. no production records modified", () => {
    expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
      backtestIndexBefore,
    );
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(existsSync(written.dir)).toBe(true);
    expect(written.dir).toContain(P3A71_ARTIFACT_TS);
  });

  it("42. no Paper/Live actions", () => {
    expect(getRepeatedSignatureImpact().interactsWithCostModel).toBe(false);
    expect(
      source("src/lib/rextora/strategySearch/researchCostModelParityDiagnosis.ts"),
    ).not.toMatch(/placeOrder|paper-sessions/);
  });

  it("43. no orders", () => {
    expect(hashesBefore.paperSessionsDirExists).toBe(
      productionReadonlyHashes(ROOT).paperSessionsDirExists,
    );
  });

  it("44. SAFE unchanged", () => {
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
  });
});

afterAll(() => {
  expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
  expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
    researchIndexBefore,
  );
});
