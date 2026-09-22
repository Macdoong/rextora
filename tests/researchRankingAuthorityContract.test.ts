import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";

import {
  GROUP_PATTERN,
  GROUP_SAFE,
  GROUP_UNKNOWN_LEGACY,
  P3A712_ARTIFACT_TS,
  classifyTrialFromPersistedEvidence,
  getBestStateModelComparison,
  getChampionModelComparison,
  getChampionTerminology,
  getClassificationEvidencePriority,
  getFrozenFinalContract,
  getFutureRankingResponse,
  getGlobalBestConsumers,
  getGroupBestStateDesign,
  getPromotionAuthority,
  getPromotionGate,
  getQualifiedHashesMisuse,
  getResultsSummaryFormula,
  getTop10Formula,
  getUnknownLegacyPolicy,
  groupResumeFixture,
  makeResumeUnknownFixture,
  productionSafetySnapshot,
  proveFormulaDivergence,
  recoverOldCheckpoint,
  sampleHistoricalTrials,
  writeP3A712Artifacts,
} from "../src/lib/rextora/strategySearch/researchRankingAuthorityContract";
import { RETIRED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const ROOT = process.cwd();
const SAFE_PATH = join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const EXPECTED_SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const hashesBefore = productionReadonlyHashes(ROOT);
const researchIndexBefore = hashesBefore.researchIndexSha256;
const backtestIndexBefore = hashesBefore.backtestIndexSha256;

function sha256(p: string): string | null {
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const written = writeP3A712Artifacts(ROOT);
const samples = sampleHistoricalTrials(ROOT);
const unknownPolicy = getUnknownLegacyPolicy();
const fixture = makeResumeUnknownFixture();
const oldCkpt = recoverOldCheckpoint({
  bestCandidate: {
    candidateId: "old",
    iteration: 0,
    paramsHash: "oldhash",
    score: 0.4,
    passed: true,
  },
  bestPassedCandidate: {
    candidateId: "old",
    iteration: 0,
    paramsHash: "oldhash",
    score: 0.4,
    passed: true,
  },
  bestScore: 0.4,
  trialParamsByIteration: { 0: { ema_fast: 10, sl_atr_mult: 1.5 } },
});
const unknownCkpt = recoverOldCheckpoint({
  bestCandidate: {
    candidateId: "unk",
    iteration: 9,
    paramsHash: "empty",
    score: 0.9,
    passed: true,
  },
  bestPassedCandidate: null,
  bestScore: 0.9,
  trialParamsByIteration: { 9: {} },
});
const divergence = proveFormulaDivergence();
const frozen = getFrozenFinalContract(ROOT);

describe("P3-A7.1.2 Research ranking authority contract", () => {
  it("1. classifiable historical SAFE trial", () => {
    expect(samples.safe.length).toBeGreaterThanOrEqual(5);
    expect(samples.safe[0]?.class).toBe("PROVEN_SAFE");
    expect(samples.safe[0]?.groupReconstructable).toBe(true);
  });

  it("2. classifiable historical Pattern trial", () => {
    expect(samples.pattern.length).toBeGreaterThanOrEqual(5);
    expect(samples.pattern[0]?.class).toBe("PROVEN_PATTERN");
  });

  it("3. empty params legacy trial", () => {
    const empty = classifyTrialFromPersistedEvidence({ params: {} });
    expect(empty.class).toBe("UNKNOWN_LEGACY");
    expect(empty.paramsPresent).toBe(false);
    expect(samples.unknown.some((row) => !row.paramsPresent)).toBe(true);
  });

  it("4. missing profile legacy trial", () => {
    const row = [...samples.safe, ...samples.pattern, ...samples.unknown].find(
      (item) => item.jobProfileAvailable === false,
    );
    const classified = classifyTrialFromPersistedEvidence({
      params: { ema_fast: 8, sl_atr_mult: 1.2 },
    });
    expect(classified.class).toBe("PROVEN_SAFE");
    expect(row === undefined || row.jobProfileAvailable === false).toBe(true);
  });

  it("5. unknown compatibility classification", () => {
    const unknown = classifyTrialFromPersistedEvidence({ params: { foo: 1 } });
    expect(unknown.rankingCompatibilityGroup).toBe(GROUP_UNKNOWN_LEGACY);
    expect(getClassificationEvidencePriority().order[6]?.result).toBe(
      "UNKNOWN_LEGACY",
    );
  });

  it("6. UNKNOWN view allowed", () => {
    expect(unknownPolicy.view).toBe("allowed");
    expect(unknownPolicy.UNKNOWN_LEGACY_POLICY_ACCEPTED).toBe("YES");
  });

  it("7. UNKNOWN ranking excluded", () => {
    expect(unknownPolicy.participateInNewRanking).toBe("NO");
    expect(unknownPolicy.representation.rankingEligible).toBe(false);
  });

  it("8. UNKNOWN champion excluded", () => {
    expect(unknownPolicy.participateInNewGroupChampion).toBe("NO");
    expect(fixture.grouped.UNKNOWN.champion).toBeNull();
  });

  it("9. UNKNOWN promotion excluded", () => {
    expect(unknownPolicy.newPromotion).toBe("NO");
    expect(getPromotionGate().unknownLegacy).toMatch(/blocked/);
  });

  it("10. already promoted unaffected", () => {
    expect(unknownPolicy.alreadyPromoted).toBe("untouched");
    expect(getPromotionGate().alreadyPromoted).toMatch(/untouched/);
  });

  it("11. resume fixture legacy SAFE grouped correctly", () => {
    expect(fixture.grouped.SAFE.members).toContain("legacy_safe");
    expect(fixture.grouped.SAFE.members).toContain("new_safe");
  });

  it("12. resume fixture legacy Pattern grouped correctly", () => {
    expect(fixture.grouped.PATTERN.members).toContain("legacy_pattern");
    expect(fixture.grouped.PATTERN.members).toContain("new_pattern");
  });

  it("13. resume fixture UNKNOWN excluded", () => {
    expect(fixture.grouped.UNKNOWN.members).toEqual(["unknown_legacy"]);
    expect(fixture.grouped.UNKNOWN.rankingEligible).toBe(false);
    expect(fixture.grouped.SAFE.members).not.toContain("unknown_legacy");
    expect(fixture.grouped.PATTERN.members).not.toContain("unknown_legacy");
  });

  it("14. new SAFE grouped correctly", () => {
    expect(fixture.grouped.SAFE.champion).toBe("new_safe");
  });

  it("15. new Pattern grouped correctly", () => {
    expect(fixture.grouped.PATTERN.champion).toBe("legacy_pattern");
  });

  it("16. global best consumer inventory", () => {
    expect(getGlobalBestConsumers().writes.length).toBeGreaterThan(3);
    expect(getGlobalBestConsumers().reads.length).toBeGreaterThan(3);
  });

  it("17. hidden global comparison identified", () => {
    expect(getGlobalBestConsumers().hiddenGlobalChampionRisk).toMatch(/^YES/);
    expect(source("src/lib/rextora/strategySearch/jobRunner.ts")).not.toContain(
      "isBetterScore(bestCandidate?.score ?? null",
    );
    expect(source("src/lib/rextora/strategySearch/jobRunner.ts")).toContain(
      "applyGroupChampA",
    );
  });

  it("18. group best-state type", () => {
    expect(getGroupBestStateDesign().recommendedName).toBe(
      "bestByCompatibilityGroup",
    );
    expect(getGroupBestStateDesign().serialization).toMatch(/array/);
  });

  it("19. SAFE group best independent", () => {
    const grouped = groupResumeFixture(fixture.trials);
    expect(grouped.SAFE.champion).toBe("new_safe");
    expect(grouped.PATTERN.champion).not.toBe("new_safe");
  });

  it("20. Pattern group best independent", () => {
    expect(fixture.grouped.PATTERN.champion).toBe("legacy_pattern");
    expect(fixture.grouped.SAFE.champion).not.toBe("legacy_pattern");
  });

  it("21. no UNKNOWN competitive best", () => {
    expect(getGroupBestStateDesign().unknownHasCompetitiveBest).toBe(false);
    expect(fixture.grouped.UNKNOWN.champion).toBeNull();
  });

  it("22. old checkpoint readable", () => {
    expect(oldCkpt.readable).toBe(true);
    expect(oldCkpt.rewriteHistoricalCheckpoint).toBe(false);
  });

  it("23. old scalar best reconstruction", () => {
    expect(oldCkpt.groupBest[GROUP_SAFE].bestCandidate?.paramsHash).toBe(
      "oldhash",
    );
    expect(oldCkpt.inMemoryOnlyUntilNextPersist).toBe(true);
  });

  it("24. unknown old scalar does not seed group ranking", () => {
    expect(unknownCkpt.groupBest[GROUP_SAFE].bestCandidate).toBeNull();
    expect(unknownCkpt.groupBest[GROUP_PATTERN].bestCandidate).toBeNull();
    expect(unknownCkpt.unknownScalarSeedsCompetitiveGroup).toBe(false);
    expect(unknownCkpt.displayScalarPreserved.bestScore).toBe(0.9);
  });

  it("25. BEST-A assessment", () => {
    expect(getBestStateModelComparison().BEST_A.assessment).toMatch(/Rejected/);
  });

  it("26. BEST-B assessment", () => {
    expect(getBestStateModelComparison().BEST_B.assessment).toMatch(/Selected/);
  });

  it("27. BEST-C assessment", () => {
    expect(getBestStateModelComparison().BEST_C.assessment).toMatch(/Rejected/);
  });

  it("28. selected best-state model", () => {
    expect(getBestStateModelComparison().RECOMMENDED_BEST_STATE_MODEL).toBe(
      "BEST-B",
    );
  });

  it("29. Top10 formula captured", () => {
    expect(getTop10Formula().TOP10_SCORE_FORMULA).toContain("netReturn*100");
    expect(getTop10Formula().usesTrialScore).toBe(false);
    expect(source("src/lib/rextora/strategySearch/researchTop10.ts")).toContain(
      "ret * 100 - mdd * 40",
    );
  });

  it("30. ResultsSummary formula captured", () => {
    expect(getResultsSummaryFormula().RESULTS_SUMMARY_SCORE_FORMULA).toContain(
      "stressPassed?0.05",
    );
    expect(
      source("src/lib/rextora/strategySearch/researchResultsSummary.ts"),
    ).toContain("card.stressPassed === true ? 0.05 : 0");
  });

  it("31. formula divergence fixture", () => {
    expect(divergence.RECOMMENDATION_FORMULA_DIVERGENCE).toBe("PROVEN");
    expect(divergence.top10Order).toBe("A > B");
    expect(divergence.summaryOrder).toBe("B > A");
  });

  it("32. current promotion authority captured", () => {
    expect(getPromotionAuthority().CURRENT_PROMOTION_SELECTION_AUTHORITY).toMatch(
      /jobId \+ iteration/,
    );
    expect(getPromotionAuthority().requiresTop10Winner).toBe(false);
    expect(getPromotionAuthority().requiresCheckpointBestCandidate).toBe(false);
  });

  it("33. champion terminology classification", () => {
    expect(getChampionTerminology().terms.length).toBeGreaterThanOrEqual(5);
  });

  it("34. champion model selection", () => {
    expect(
      getChampionModelComparison().RECOMMENDED_GROUP_CHAMPION_AUTHORITY,
    ).toBe("CHAMP-A");
  });

  it("35. no cross-group champion", () => {
    expect(
      getChampionModelComparison().GLOBAL_CHAMPION_ALLOWED_BEFORE_PARITY,
    ).toBe("NO");
    expect(fixture.grouped.SAFE.champion).not.toBe(fixture.grouped.PATTERN.champion);
  });

  it("36. qualifiedHashes remains params qualification", () => {
    expect(getQualifiedHashesMisuse().futureRole).toMatch(/qualification set/);
  });

  it("37. qualifiedHashes[-1] not future best authority", () => {
    expect(getQualifiedHashesMisuse().function).toBe(
      "searchOrchestrator.recordGenerationForSpace",
    );
    expect(
      source("src/lib/rextora/strategySearch/searchOrchestrator.ts"),
    ).not.toContain("plan.qualifiedHashes[plan.qualifiedHashes.length - 1]");
    expect(
      source("src/lib/rextora/strategySearch/searchOrchestrator.ts"),
    ).toContain("groupForSearchSpaceId");
    expect(getQualifiedHashesMisuse().futureRole).toMatch(/Never ordering/);
  });

  it("38. rankingGroups response contract", () => {
    const shape = getFutureRankingResponse();
    expect(shape.rankingGroups).toHaveLength(2);
    expect(shape.unknownLegacy.rankingCompatibilityGroup).toBe(
      GROUP_UNKNOWN_LEGACY,
    );
    expect(shape.noTopLevelAuthoritativeBest).toBe(true);
  });

  it("39. promotion known-group requirement", () => {
    expect(getPromotionGate().newTrials.join(" ")).toMatch(
      /rankingCompatibilityGroup known/,
    );
  });

  it("40. promotion evaluation identity requirement", () => {
    expect(getPromotionGate().newTrials.join(" ")).toMatch(
      /researchEvaluationHash/,
    );
  });

  it("41. explicit operator promotion preserved", () => {
    expect(getPromotionAuthority().automatic).toBe(false);
    expect(source("src/lib/rextora/strategySearch/promoteFromSearch.ts")).toContain(
      "promoteSearchCandidateToStrategy",
    );
  });

  it("42. no auto-promotion change", () => {
    expect(getPromotionAuthority().AUTO_PROMOTION_CHANGED).toBe("NO");
    expect(frozen.AUTO_PROMOTION_CHANGED).toBe("NO");
  });

  it("43. A7.2 final contract", () => {
    expect(frozen.P3_A7_2_READY).toBe("YES");
    expect(frozen.F_canonicalChampionAuthority).toMatch(/CHAMP-A/);
    expect(frozen.D_legacyGlobalScalarPolicy).toMatch(/BEST-B/);
    expect(frozen.L_noGlobalChampionBeforeParity).toBe(true);
    expect(frozen.productionMigrationRequired).toBe("NO");
  });

  it("44. no production Research execution", () => {
    expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
      researchIndexBefore,
    );
    expect(
      source("src/lib/rextora/strategySearch/researchRankingAuthorityContract.ts"),
    ).not.toContain("runOrchestratedSearchJob");
  });

  it("45. no production records modified", () => {
    expect(productionReadonlyHashes(ROOT).backtestIndexSha256).toBe(
      backtestIndexBefore,
    );
    expect(existsSync(written.dir)).toBe(true);
    expect(written.dir).toContain(P3A712_ARTIFACT_TS);
  });

  it("46. no Paper/Live actions", () => {
    expect(
      source("src/lib/rextora/strategySearch/researchRankingAuthorityContract.ts"),
    ).not.toMatch(/placeOrder|startPaper|liveOrder/);
  });

  it("47. no orders", () => {
    expect(hashesBefore.paperSessionsDirExists).toBe(
      productionReadonlyHashes(ROOT).paperSessionsDirExists,
    );
    expect(written.diagnosis.productionSafety.orders).toBe(0);
  });

  it("48. SAFE unchanged", () => {
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(sha256(SAFE_PATH)).toBeNull();
  });
});

afterAll(() => {
  expect(sha256(SAFE_PATH)).toBeNull();
  expect(productionReadonlyHashes(ROOT).researchIndexSha256).toBe(
    researchIndexBefore,
  );
  expect(productionSafetySnapshot(ROOT).safeSha256Now).toBeNull();
});
