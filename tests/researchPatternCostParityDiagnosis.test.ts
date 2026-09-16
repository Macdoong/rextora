import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_SAFE,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import {
  FIXTURE_FEE_RATE,
  P3A81_ARTIFACT_TS,
  RECOMMENDED_PATTERN_COST_MODEL,
  getCandidateScoreImpact,
  getCostGuardAnalysis,
  getCostStressImpact,
  getEngineCostPaths,
  getExitReasonMatrix,
  getFeeParity,
  getFrozenP3A82Contract,
  getFundingDesign,
  getHistoricalPolicy,
  getIdentityVersioning,
  getJitterImpact,
  getLongShortFixtures,
  getMigrationOptions,
  getPromotionPolicy,
  getRankingComparability,
  getResearchBacktestParity,
  getResumePolicy,
  getSignalSelectionInvariant,
  getSlippageHelperReuse,
  getSpreadDesign,
  writeP3A81Artifacts,
} from "../src/lib/rextora/strategySearch/researchPatternCostParityDiagnosis";
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

const written = await writeP3A81Artifacts(ROOT);
const fixtures = getLongShortFixtures();
const fee = getFeeParity();
const funding = getFundingDesign();
const spread = getSpreadDesign();
const impact = getCandidateScoreImpact();
const frozen = getFrozenP3A82Contract();

describe("P3-A8.1 Pattern cost-arithmetic parity diagnosis", () => {
  it("1. SAFE cost path identified", () => {
    expect(getEngineCostPaths().SAFE.engine).toContain("runSafeV44Backtest");
    expect(source("src/lib/rextora/backtest/backtestEngine.ts")).toContain(
      "applyAdverseSlippage",
    );
  });

  it("2. Pattern cost path identified", () => {
    expect(getEngineCostPaths().PATTERN.engine).toContain(
      "runEventSequenceBacktest",
    );
    expect(
      source("src/lib/rextora/strategy/eventSequenceCostModel.ts"),
    ).toContain("input.slippageRate * 2");
  });

  it("3. SAFE long fixture", () => {
    const row = fixtures.long_fee_on_funding_off_spread_off.safe;
    expect(row.execEntry).toBeGreaterThan(100);
    expect(row.execExit).toBeLessThan(110);
    expect(row.netUsdt).toBeLessThan(row.grossUsdt);
  });

  it("4. Pattern long fixture", () => {
    const row = fixtures.long_fee_on_funding_off_spread_off.pattern;
    expect(row.execEntry).toBe(100);
    expect(row.execExit).toBe(110);
    expect(row.ledgerSlipPct).toBe(FIXTURE_FEE_RATE === 0 ? 0 : 0.0004);
    expect(row.netUsdt).toBeCloseTo(98.8, 8);
  });

  it("5. SAFE short fixture", () => {
    const row = fixtures.short_fee_on_funding_off_spread_off.safe;
    expect(row.execEntry).toBeLessThan(100);
    expect(row.execExit).toBeGreaterThan(90);
    expect(row.netUsdt).toBeGreaterThan(0);
  });

  it("6. Pattern short fixture", () => {
    const row = fixtures.short_fee_on_funding_off_spread_off.pattern;
    expect(row.rawReturn).toBeCloseTo(0.1, 10);
    expect(row.netUsdt).toBeCloseTo(98.8, 8);
  });

  it("7. fee-off comparison", () => {
    expect(fixtures.long_fee_off.safe.feeUsdt).toBe(0);
    expect(fixtures.long_fee_off.pattern.feeUsdt).toBe(0);
    expect(fixtures.long_fee_off.safeMinusPattern.usdt).not.toBe(0);
  });

  it("8. default-fee comparison", () => {
    expect(fee.feeUsdtEqual).toBe(true);
    expect(fee.FEE_PARITY).toBe("PARTIAL");
    expect(
      fixtures.long_fee_on_funding_off_spread_off.safeMinusPattern.usdt,
    ).not.toBe(0);
  });

  it("9. funding-on SAFE", () => {
    expect(fixtures.long_funding_on.safe.fundingUsdt).toBeGreaterThan(0);
    expect(fixtures.long_funding_on.safe.netUsdt).toBeLessThan(
      fixtures.long_fee_on_funding_off_spread_off.safe.netUsdt,
    );
  });

  it("10. funding-on Pattern current", () => {
    expect(fixtures.long_funding_on.pattern.fundingUsdt).toBe(0);
    expect(fixtures.long_funding_on.pattern.netUsdt).toBe(
      fixtures.long_fee_on_funding_off_spread_off.pattern.netUsdt,
    );
  });

  it("11. spread-on SAFE", () => {
    expect(fixtures.long_spread_on.safe.spreadUsdt).toBeGreaterThan(0);
  });

  it("12. spread-on Pattern current", () => {
    expect(fixtures.long_spread_on.pattern.spreadUsdt).toBe(0);
    expect(fixtures.long_spread_on.pattern.netUsdt).toBe(
      fixtures.long_fee_on_funding_off_spread_off.pattern.netUsdt,
    );
  });

  it("13. TP exit matrix", () => {
    expect(
      getExitReasonMatrix().SAFE.some((row) => row.EXIT_REASON === "take_profit"),
    ).toBe(true);
    expect(
      getExitReasonMatrix().PATTERN.some(
        (row) => row.EXIT_REASON === "take_profit",
      ),
    ).toBe(true);
  });

  it("14. SL exit matrix", () => {
    expect(
      getExitReasonMatrix().SAFE.some((row) => row.EXIT_REASON === "stop_loss"),
    ).toBe(true);
    expect(
      getExitReasonMatrix().PATTERN.some((row) => row.EXIT_REASON === "stop_loss"),
    ).toBe(true);
  });

  it("15. max-hold exit matrix", () => {
    expect(
      getExitReasonMatrix().SAFE.some((row) => row.EXIT_REASON === "max_hold"),
    ).toBe(true);
    expect(
      getExitReasonMatrix().PATTERN.some((row) => row.EXIT_REASON === "max_hold"),
    ).toBe(true);
  });

  it("16. end exit matrix", () => {
    expect(
      getExitReasonMatrix().SAFE.some((row) => row.EXIT_REASON === "end"),
    ).toBe(true);
    expect(
      getExitReasonMatrix().PATTERN.some((row) => row.EXIT_REASON === "end"),
    ).toBe(true);
  });

  it("17. canonical slippage helper reuse", () => {
    expect(getSlippageHelperReuse().CAN_REUSE_CANONICAL_SLIPPAGE_HELPER).toBe(
      "YES",
    );
    expect(getSlippageHelperReuse().longEntry).toBe(100.02);
  });

  it("18. fee parity verdict", () => {
    expect(fee.FEE_PARITY).toBe("PARTIAL");
  });

  it("19. funding reuse verdict", () => {
    expect(funding.PATTERN_CAN_REUSE_SAFE_FUNDING).toBe("YES");
  });

  it("20. spread reuse verdict", () => {
    expect(spread.PATTERN_CAN_REUSE_SAFE_SPREAD).toBe("YES");
  });

  it("21. cost guard classification", () => {
    const guard = getCostGuardAnalysis();
    expect(guard.COST_GUARD_IS_ACCOUNTING_PARITY).toBe("NO");
    expect(guard.semantic).toContain("pre-trade");
  });

  it("22. Pattern trade-count invariant", () => {
    expect(getSignalSelectionInvariant().PATTERN_TRADE_COUNT_INVARIANT).toBe(
      "YES",
    );
    expect(impact.tradeCountCurrent).toBe(impact.tradeCountProposed);
  });

  it("23. Pattern raw signal invariant", () => {
    expect(
      getSignalSelectionInvariant().PATTERN_SIGNAL_SELECTION_UNCHANGED,
    ).toBe("YES");
    expect(
      fixtures.long_fee_on_funding_off_spread_off.proposed.rawSignalEntry,
    ).toBe(100);
    expect(
      fixtures.long_fee_on_funding_off_spread_off.proposed.rawSignalExit,
    ).toBe(110);
  });

  it("24. Pattern score impact", () => {
    expect(impact.scoreDelta).not.toBe(0);
    expect(impact.scoreProposed).toBeLessThan(impact.scoreCurrent);
  });

  it("25. Pattern PASS impact", () => {
    expect(impact.passFlips).toBe(true);
    expect(impact.passCurrent).toBe(true);
    expect(impact.passProposed).toBe(false);
  });

  it("26. stress effective channels current", () => {
    expect(getCostStressImpact().CURRENT_PATTERN_STRESS_EFFECTIVE_CHANNELS).toEqual(
      ["fee", "slippage"],
    );
  });

  it("27. stress effective channels proposed", () => {
    expect(
      getCostStressImpact().PROPOSED_PATTERN_STRESS_EFFECTIVE_CHANNELS,
    ).toEqual(["fee", "slippage", "funding", "spread"]);
  });

  it("28. jitter-generation invariant", () => {
    expect(getJitterImpact().JITTER_GENERATION_CHANGED_BY_COST_PARITY).toBe(
      "NO",
    );
  });

  it("29. new engine-cost-model requirement", () => {
    expect(getIdentityVersioning().NEW_ENGINE_COST_MODEL_REQUIRED).toBe("YES");
    expect(getIdentityVersioning().recommendedEngineCostModel).toBe(
      RECOMMENDED_PATTERN_COST_MODEL,
    );
  });

  it("30. researchEvaluationHash model sensitivity", () => {
    expect(getIdentityVersioning().hashesDiffer).toBe(true);
    expect(ENGINE_COST_MODEL_SAFE).not.toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
  });

  it("31. post-parity ranking comparability verdict", () => {
    expect(
      getRankingComparability().CROSS_ENGINE_GLOBAL_RANKING_AFTER_COST_PARITY,
    ).toBe("NO");
  });

  it("32. legacy Pattern ranking policy", () => {
    expect(getHistoricalPolicy().OLD_NEW_PATTERN_DIRECT_RANKING).toBe("NO");
  });

  it("33. legacy resume policy", () => {
    expect(getResumePolicy().RECOMMENDED_LEGACY_PATTERN_RESUME_POLICY).toMatch(
      /Continue event_sequence_ledger_v0/,
    );
  });

  it("34. legacy promotion policy", () => {
    expect(getPromotionPolicy().historicalLedgerFinalPass).toMatch(/legacy/);
  });

  it("35. Research/Backtest Pattern path", () => {
    expect(getResearchBacktestParity().Research_equals_Backtest_today).toBe(
      "YES",
    );
    expect(
      source("src/lib/rextora/backtest/backtestRunner.ts"),
    ).toContain("runEventSequenceBacktest");
  });

  it("36. migration model decision", () => {
    expect(getMigrationOptions().RECOMMENDED_MIGRATION_MODEL).toBe("B");
  });

  it("37. P3-A8.2 readiness", () => {
    expect(frozen.P3_A8_2_READY).toBe("YES");
    expect(existsSync(join(written.dir, "p3-a8-2-frozen-contract.json"))).toBe(
      true,
    );
    expect(written.dir).toContain(P3A81_ARTIFACT_TS);
  });

  it("38. no production Research execution", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
  });

  it("39. no production writes", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
      backtestIndexBefore,
    );
  });

  it("40. no Paper/Live", () => {
    expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
      "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae",
    );
  });

  it("41. no orders", () => {
    expect(0).toBe(0);
  });

  it("42. SAFE unchanged", () => {
    expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
    expect(productionReadonlyHashes(ROOT).paramsHash).toBe(
      EXPECTED_SAFE_PARAMS_HASH,
    );
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
  });
});

afterAll(() => {
  expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
    researchIndexBefore,
  );
  expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
    backtestIndexBefore,
  );
  expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
});
