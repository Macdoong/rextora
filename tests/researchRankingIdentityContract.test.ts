import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_SAFE,
  P3A711_ARTIFACT_TS,
  RESEARCH_EVALUATION_IDENTITY_VERSION,
  buildCostIdentity,
  computeResearchEvaluationHash,
  getChampionPolicy,
  getComparabilityKey,
  getCostIdentityDesign,
  getDataContextIdentity,
  getEvaluationIdentityDesign,
  getFrozenP3A72IdentityContract,
  getLegacyPolicy,
  getParamsHashConsumers,
  getPromotionContract,
  getPromotionEvidenceDesign,
  getQualifiedHashesSemantics,
  getRankingModelComparison,
  getRankingPipeline,
  getResumePolicyComparison,
  getSeenHashesSemantics,
  makePatternParams,
  makeSafeParams,
  productionSafetySnapshot,
  proveEvaluationIdentitySensitivity,
  proveGroupRanking,
  proveResumeMixing,
  proveSameParamsDifferentCostContext,
  reconstructLegacyTrials,
  writeP3A711Artifacts,
} from "../src/lib/rextora/strategySearch/researchRankingIdentityContract";

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

const written = writeP3A711Artifacts(ROOT);
const sameParams = proveSameParamsDifferentCostContext();
const identity = proveEvaluationIdentitySensitivity();
const recon = reconstructLegacyTrials(ROOT);
const mixing = proveResumeMixing();
const groups = proveGroupRanking();
const frozen = getFrozenP3A72IdentityContract(ROOT);

describe("P3-A7.1.1 Research ranking + identity contract", () => {
  it("1. paramsHash consumer inventory", () => {
    const inventory = getParamsHashConsumers();
    expect(inventory.consumers.length).toBeGreaterThanOrEqual(10);
    expect(inventory.semantic).toBe("STRATEGY_PARAMETER_IDENTITY");
    expect(source("src/lib/rextora/strategy/strategyHash.ts")).toContain(
      "export function computeParamsHash",
    );
  });

  it("2. same params → same paramsHash", () => {
    const params = makeSafeParams(7);
    expect(computeParamsHash(params)).toBe(computeParamsHash(params));
    expect(sameParams.safe.sameParamsHash).toBe(true);
  });

  it("3. different fee → same paramsHash", () => {
    expect(sameParams.safe.paramsHashA).toBe(sameParams.safe.paramsHashB);
    expect(sameParams.safe.costA.feeRate).not.toBe(sameParams.safe.costB.feeRate);
  });

  it("4. different slippage → same paramsHash", () => {
    expect(sameParams.safe.costA.slippageRate).not.toBe(
      sameParams.safe.costB.slippageRate,
    );
    expect(computeParamsHash(makeSafeParams(7))).toBe(
      sameParams.safe.paramsHashUnchangedWhenFeeChanges,
    );
  });

  it("5. different engine cost model → same paramsHash when strategy params same", () => {
    const pattern = makePatternParams();
    expect(sameParams.pattern.sameParamsHashAcrossEngineStamp).toBe(true);
    expect(computeParamsHash(pattern)).toBe(sameParams.pattern.paramsHash);
  });

  it("6. paramsHash remains strategy identity", () => {
    expect(getParamsHashConsumers().PARAMS_HASH_CAN_SAFELY_CHANGE).toBe("NO");
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
  });

  it("7. evaluation identity field requirements", () => {
    const design = getEvaluationIdentityDesign();
    expect(design.fields.paramsHash).toBe("REQUIRED");
    expect(design.fields.engineCostModel).toBe("REQUIRED");
    expect(design.fields.costAssumptionsConfigured).toBe("REQUIRED");
    expect(design.fields.evaluationWindowsIdFromTo).toBe("REQUIRED");
    expect(design.fields.inventedCandleFingerprint).toBe("NOT_INCLUDED");
    expect(design.recommendedName).toBe("researchEvaluationHash");
  });

  it("8. same evaluation context → stable identity", () => {
    expect(identity.stableSameContext).toBe(true);
  });

  it("9. fee change → different evaluation identity", () => {
    expect(identity.feeChangesHash).toBe(true);
    expect(identity.paramsHashUnchanged).toBe(true);
  });

  it("10. slippage change → different evaluation identity", () => {
    expect(identity.slippageChangesHash).toBe(true);
  });

  it("11. engineCostModel change → different evaluation identity", () => {
    expect(identity.engineChangesHash).toBe(true);
  });

  it("12. funding configured change → different evaluation identity", () => {
    expect(identity.fundingChangesHash).toBe(true);
  });

  it("13. spread configured change → different evaluation identity", () => {
    expect(identity.spreadChangesHash).toBe(true);
  });

  it("14. effective Pattern funding = not applied", () => {
    expect(identity.patternFundingNotApplied).toBe(true);
    expect(getCostIdentityDesign().pattern.funding).toMatch(/engineApplied MUST be false/);
  });

  it("15. effective Pattern spread = not applied", () => {
    expect(identity.patternSpreadNotApplied).toBe(true);
    const stamped = buildCostIdentity({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      spreadRate: 0.0001,
      applySpread: true,
      costGuardK: 3,
    });
    expect(stamped.spread.configuredEnabled).toBe(true);
    expect(stamped.spread.engineApplied).toBe(false);
    expect(stamped.spread.effectiveRate).toBe(0);
  });

  it("16. data-window identity behavior", () => {
    expect(getDataContextIdentity().EVALUATION_DATA_CONTEXT_INCLUDED).toBe("NO");
    expect(identity.windowChangesHash).toBe(true);
  });

  it("17. symbol identity behavior", () => {
    expect(getDataContextIdentity().symbolRule).toMatch(/REQUIRED/);
    expect(identity.symbolChangesHash).toBe(true);
  });

  it("18. timeframe identity behavior", () => {
    expect(getDataContextIdentity().timeframeRule).toMatch(/REQUIRED/);
    expect(identity.timeframeChangesHash).toBe(true);
  });

  it("19. comparability key decision", () => {
    expect(getComparabilityKey().RECOMMENDED_COMPARABILITY_KEY).toBe(
      "rankingCompatibilityGroup",
    );
    expect(getComparabilityKey().values).toContain(ENGINE_COST_MODEL_SAFE);
    expect(getComparabilityKey().values).toContain(
      ENGINE_COST_MODEL_EVENT_SEQUENCE,
    );
  });

  it("20. first mixed ranking point captured", () => {
    expect(getRankingPipeline().FIRST_CROSS_ENGINE_COMPARISON_POINT).toContain(
      "jobRunner.ts",
    );
    expect(getRankingPipeline().FIRST_CROSS_ENGINE_COMPARISON_POINT).toContain(
      "isBetterScore",
    );
    expect(source("src/lib/rextora/strategySearch/jobRunner.ts")).not.toContain(
      "isBetterScore",
    );
    expect(source("src/lib/rextora/strategySearch/jobRunner.ts")).toContain(
      "applyGroupChampA",
    );
  });

  it("21. SAFE group ranking", () => {
    expect(groups.safeChampion.id).toBe("S2");
    expect(groups.safeChampion.group).toBe(ENGINE_COST_MODEL_SAFE);
  });

  it("22. Pattern group ranking", () => {
    expect(groups.patternChampion.id).toBe("P1");
    expect(groups.patternChampion.group).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
  });

  it("23. cross-group score comparison blocked in selected model", () => {
    expect(getRankingModelComparison().RECOMMENDED_RANKING_MODEL).toBe("RANK-B");
    expect(groups.crossGroupComparisonBlocked).toBe(true);
    expect(getRankingModelComparison().RANK_C.assessment).toMatch(/Rejected/);
  });

  it("24. no global champion in selected model unless explicitly operator-selected", () => {
    expect(getChampionPolicy().GLOBAL_CHAMPION_ALLOWED_BEFORE_PARITY).toBe("NO");
    expect(groups.noGlobalChampion).toBe(true);
  });

  it("25. group champion behavior", () => {
    expect(getChampionPolicy().RECOMMENDED_CHAMPION_POLICY).toMatch(
      /one champion per rankingCompatibilityGroup/,
    );
    expect(groups.safeChampion.score).toBe(0.55);
    expect(groups.patternChampion.score).toBe(0.56);
  });

  it("26. promotion contract", () => {
    expect(getPromotionContract().FAMILY_SCOPED_PROMOTION_FEASIBLE).toBe("YES");
    expect(getPromotionContract().currentInput.required).toEqual([
      "jobId",
      "iteration",
    ]);
  });

  it("27. paramsHash preserved on promotion", () => {
    expect(source("src/lib/rextora/strategySearch/promoteFromSearch.ts")).toContain(
      "sourceParamsHash: trial.paramsHash",
    );
    expect(getPromotionEvidenceDesign().strategyIdentityRemains).toBe("paramsHash");
  });

  it("28. evaluation evidence attached to promotion design", () => {
    expect(getPromotionContract().recommendedEvidence.promotionEvidence).toContain(
      "researchEvaluationHash",
    );
    expect(getPromotionEvidenceDesign().evidenceReferences).toMatch(
      /researchEvaluationHash/,
    );
  });

  it("29. historical SAFE trial reconstruction", () => {
    expect(recon.safe.length).toBeGreaterThanOrEqual(3);
    for (const row of recon.safe.slice(0, 3)) {
      expect(row.family).toBe("SAFE");
      expect(row.engineModelReconstructable).toBe(true);
      expect(["PARTIALLY_RECONSTRUCTABLE", "NOT_RECONSTRUCTABLE"]).toContain(
        row.classification,
      );
    }
  });

  it("30. historical Pattern trial reconstruction", () => {
    expect(recon.pattern.length).toBeGreaterThanOrEqual(3);
    for (const row of recon.pattern.slice(0, 3)) {
      expect(row.family).toBe("PATTERN");
      expect(row.engineModelReconstructable).toBe(true);
    }
  });

  it("31. legacy/new resume mixing current behavior", () => {
    expect(mixing.LEGACY_NEW_TRIAL_RANKING_MIX).toBe("YES");
    expect(mixing.bestScoreWinner?.paramsHash).toBe("new_pattern_dddd");
  });

  it("32. selected resume policy", () => {
    expect(getResumePolicyComparison().RECOMMENDED_RESUME_POLICY).toBe(
      "RESUME-A",
    );
  });

  it("33. seenHashes cost-independence", () => {
    expect(getSeenHashesSemantics().SEEN_HASHES_SHOULD_INCLUDE_COSTS).toBe("NO");
    expect(source("src/lib/rextora/strategySearch/candidateGenerator.ts")).toContain(
      "existingHashes.has(candidate.paramsHash)",
    );
  });

  it("34. qualifiedHashes semantic", () => {
    expect(getQualifiedHashesSemantics().stores).toMatch(/strategy-params qualification/);
    expect(getQualifiedHashesSemantics().a72MustChange).toMatch(/^YES/);
  });

  it("35. historical view policy", () => {
    expect(getLegacyPolicy().view).toMatch(/allowed/);
  });

  it("36. historical resume policy", () => {
    expect(getLegacyPolicy().resume).toMatch(/RESUME-A/);
  });

  it("37. historical rerun policy", () => {
    expect(getLegacyPolicy().rerun).toMatch(/NEW job/);
  });

  it("38. historical ranking policy", () => {
    expect(getLegacyPolicy().ranking).toMatch(/group-scoped/);
  });

  it("39. historical promotion policy", () => {
    expect(getLegacyPolicy().promotion).toMatch(/family-scoped/);
  });

  it("40. already promoted strategy unaffected", () => {
    expect(getLegacyPolicy().alreadyPromotedStrategy).toBe("untouched");
    expect(getPromotionEvidenceDesign().alreadyPromoted).toMatch(/untouched/);
  });

  it("41. P3-A7.2 frozen contract", () => {
    expect(frozen.P3_A7_2_READY).toBe("YES");
    expect(frozen.C_identityVersion).toBe(RESEARCH_EVALUATION_IDENTITY_VERSION);
    expect(frozen.E_rankingModel).toBe("RANK-B");
    expect(frozen.H_seenHashesRule).toMatch(/paramsHash only/);
    expect(frozen.productionMigrationRequired).toBe("NO");
  });

  it("42. no production Research execution", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(
      source("src/lib/rextora/strategySearch/researchRankingIdentityContract.ts"),
    ).not.toContain("runOrchestratedSearchJob");
    expect(written.diagnosis.productionSafety.researchExecutions).toBe(0);
  });

  it("43. no production records modified", () => {
    expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
      backtestIndexBefore,
    );
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(existsSync(written.dir)).toBe(true);
    expect(written.dir).toContain(P3A711_ARTIFACT_TS);
  });

  it("44. no Paper/Live actions", () => {
    expect(
      source("src/lib/rextora/strategySearch/researchRankingIdentityContract.ts"),
    ).not.toMatch(/placeOrder|startPaper|liveOrder/);
    expect(written.diagnosis.productionSafety.paperLiveActions).toBe(0);
  });

  it("45. no orders", () => {
    expect(hashesBefore.paperSessionsDirExists).toBe(
      productionReadonlyHashes(ROOT).paperSessionsDirExists,
    );
    expect(written.diagnosis.productionSafety.orders).toBe(0);
  });

  it("46. SAFE unchanged", () => {
    expect(EXPECTED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
    expect(computeResearchEvaluationHash).toBeTypeOf("function");
  });
});

afterAll(() => {
  expect(sha256(SAFE_PATH)).toBe(EXPECTED_SAFE_SHA);
  expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
    researchIndexBefore,
  );
  expect(productionSafetySnapshot(ROOT).safeSha256Now).toBe(EXPECTED_SAFE_SHA);
});
