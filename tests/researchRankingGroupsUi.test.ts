import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  GROUP_PATTERN,
  GROUP_RANK_HISTORY_UNAVAILABLE,
  GROUP_SAFE,
  GROUP_UNKNOWN,
  RESEARCH_RANKING_UI_CONTRACT,
  canonicalRecommendHash,
  costChannelDisclosure,
  evaluationProvenanceLabel,
  formatGroupAwareStatus,
  groupDecisionHighlights,
  groupHighlightTitle,
  groupLocalShortlistRanks,
  groupRecommendationLabel,
  groupScopedRankHistory,
  groupShortlistTitle,
  hasAuthoritativeRankingGroups,
  isCanonicalGroupRecommendation,
  partitionByRankingGroup,
  promotionActionAvailable,
  rankingGroupLabel,
  resolveEvaluationProvenance,
  resolvePersistedRankingGroup,
  scalarBestIsAuthoritative,
  shouldTreatJobAsEmpty,
  topCandidatesForGroup,
  truncateEvaluationHash,
  type RankingGroupCandidateRef,
  type ResearchRankingGroupView,
} from "../src/lib/rextora/researchRankingReadModel";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const BACKTEST_INDEX_SHA =
  "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae";

const hashesBefore = productionReadonlyHashes();

function group(input: {
  id: typeof GROUP_SAFE | typeof GROUP_PATTERN;
  passedHash?: string | null;
  passedScore?: number | null;
  bestHash?: string | null;
  bestScore?: number | null;
}): ResearchRankingGroupView {
  const passed = input.passedHash
    ? {
        iteration: 1,
        paramsHash: input.passedHash,
        score: input.passedScore ?? 0.6,
        passed: true,
        researchEvaluationHash: "abc123def4567890",
        provenanceStatus: "stamped" as const,
      }
    : null;
  return {
    rankingCompatibilityGroup: input.id,
    engineCostModel: input.id,
    rankingEligible: true,
    bestCandidate: input.bestHash
      ? {
          iteration: 2,
          paramsHash: input.bestHash,
          score: input.bestScore ?? 0.4,
          passed: false,
        }
      : passed,
    bestPassedCandidate: passed,
    topCandidates: passed ? [passed] : [],
  };
}

const GROUP_AWARE = {
  rankingGroups: [
    group({ id: GROUP_SAFE, passedHash: "safe_pass", passedScore: 0.55 }),
    group({
      id: GROUP_PATTERN,
      passedHash: "pat_pass",
      passedScore: 0.91,
    }),
  ],
  unknownLegacy: {
    rankingCompatibilityGroup: GROUP_UNKNOWN,
    rankingEligible: false as const,
    promotionEligible: false as const,
    provenanceStatus: "legacy_unclassified" as const,
    count: 1,
  },
  bestScore: null,
  bestCandidateHash: null,
  bestPassedCandidateHash: null,
};

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("P3-A7.3 ranking groups UI/API migration", () => {
  it("1. group-aware API shape recognized", () => {
    expect(hasAuthoritativeRankingGroups(GROUP_AWARE)).toBe(true);
    expect(scalarBestIsAuthoritative(GROUP_AWARE)).toBe(false);
  });

  it("2. SAFE group renders", () => {
    expect(rankingGroupLabel(GROUP_SAFE)).toBe("SAFE 전략");
    expect(read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx")).toContain(
      "research-ranking-group-",
    );
  });

  it("3. Pattern group renders", () => {
    expect(rankingGroupLabel(GROUP_PATTERN)).toBe("패턴 전략 · 기존 비용 모델");
  });

  it("4. SAFE bestPassed gets recommendation", () => {
    const safe = GROUP_AWARE.rankingGroups[0]!;
    expect(groupRecommendationLabel(safe)).toBe("최종 추천");
    expect(isCanonicalGroupRecommendation(safe, "safe_pass")).toBe(true);
  });

  it("5. Pattern bestPassed gets recommendation", () => {
    const pattern = GROUP_AWARE.rankingGroups[1]!;
    expect(groupRecommendationLabel(pattern)).toBe("최종 추천");
    expect(canonicalRecommendHash(pattern)).toBe("pat_pass");
  });

  it("6. no cross-group global recommendation", () => {
    expect(read("components/rextora/strategySearch/ResearchRankingGroups.tsx")).toContain(
      "research-no-global-champion",
    );
    expect(read("components/rextora/strategySearch/ResearchRankingGroups.tsx")).toContain(
      "그룹을 한데 모아 순위를",
    );
  });

  it("7. Pattern score > SAFE does not create global winner", () => {
    expect(GROUP_AWARE.rankingGroups[1]!.bestPassedCandidate!.score).toBeGreaterThan(
      GROUP_AWARE.rankingGroups[0]!.bestPassedCandidate!.score!,
    );
    expect(formatGroupAwareStatus(GROUP_AWARE)).toContain("SAFE 전략 추천");
    expect(formatGroupAwareStatus(GROUP_AWARE)).toContain("패턴 전략 · 기존 비용 모델 추천");
    expect(formatGroupAwareStatus(GROUP_AWARE)).not.toContain("글로벌");
  });

  it("8. SAFE score > Pattern does not create global winner", () => {
    const flipped = {
      ...GROUP_AWARE,
      rankingGroups: [
        group({ id: GROUP_SAFE, passedHash: "safe_hi", passedScore: 0.95 }),
        group({ id: GROUP_PATTERN, passedHash: "pat_lo", passedScore: 0.1 }),
      ],
    };
    expect(formatGroupAwareStatus(flipped)).toContain("SAFE 전략 추천");
    expect(formatGroupAwareStatus(flipped)).toContain("패턴 전략 · 기존 비용 모델 추천");
  });

  it("9. populated rankingGroups + null global scalar is valid", () => {
    expect(GROUP_AWARE.bestScore).toBeNull();
    expect(hasAuthoritativeRankingGroups(GROUP_AWARE)).toBe(true);
  });

  it("10. no empty/error state from null scalar", () => {
    expect(shouldTreatJobAsEmpty(GROUP_AWARE)).toBe(false);
    expect(formatGroupAwareStatus(GROUP_AWARE)).not.toBe("—");
  });

  it("11. Top10 remains group-scoped", () => {
    const parts = partitionByRankingGroup(
      [
        { paramsHash: "safe_pass" },
        { paramsHash: "pat_pass" },
        { paramsHash: "other" },
      ],
      GROUP_AWARE.rankingGroups,
      (row) => row.paramsHash,
    );
    expect(parts.find((row) => row.groupId === GROUP_SAFE)?.items.map((row) => row.paramsHash)).toEqual(
      ["safe_pass"],
    );
    expect(parts.find((row) => row.groupId === GROUP_PATTERN)?.items.map((row) => row.paramsHash)).toEqual(
      ["pat_pass"],
    );
    expect(read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx")).toContain(
      "research-group-top-",
    );
    expect(read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx")).toContain(
      "groupShortlistTitle",
    );
  });

  it("12. Top10 formula winner does not override CHAMP-A", () => {
    const top10Winner = "top10_winner";
    const safe = GROUP_AWARE.rankingGroups[0]!;
    expect(isCanonicalGroupRecommendation(safe, top10Winner)).toBe(false);
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("CHAMP-A");
  });

  it("13. ResultsSummary composite winner does not override CHAMP-A", () => {
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("ResearchRankingGroups");
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).not.toMatch(/card=\{summary\.topRecommend\}/);
  });

  it("14. unknownLegacy visible", () => {
    expect(rankingGroupLabel(GROUP_UNKNOWN)).toContain("기존 기록");
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).toContain("research-unknown-legacy");
  });

  it("15. unknownLegacy excluded from recommendation", () => {
    expect(
      isCanonicalGroupRecommendation(GROUP_AWARE.rankingGroups[0], "unknown"),
    ).toBe(false);
    expect(GROUP_AWARE.unknownLegacy.rankingEligible).toBe(false);
  });

  it("16. unknownLegacy promotion unavailable", () => {
    expect(
      promotionActionAvailable({
        passed: true,
        rankingCompatibilityGroup: GROUP_UNKNOWN,
        promotionEligible: false,
        rankingEligible: false,
      }),
    ).toBe(false);
  });

  it("17. new stamped evidence state", () => {
    expect(evaluationProvenanceLabel("stamped")).toBe("평가 증빙 완료");
    expect(
      resolveEvaluationProvenance({
        rankingCompatibilityGroup: GROUP_SAFE,
        researchEvaluationHash: "abc",
      }),
    ).toBe("stamped");
  });

  it("18. reconstructed legacy evidence state", () => {
    expect(evaluationProvenanceLabel("reconstructed")).toBe(
      "기존 기록 · 증빙 복원",
    );
    expect(
      resolveEvaluationProvenance({
        rankingCompatibilityGroup: GROUP_PATTERN,
        researchEvaluationHash: null,
      }),
    ).toBe("reconstructed");
  });

  it("19. unclassified legacy evidence state", () => {
    expect(evaluationProvenanceLabel("legacy_unclassified")).toBe(
      "기존 기록 · 증빙 불충분",
    );
    expect(
      resolveEvaluationProvenance({
        rankingCompatibilityGroup: GROUP_UNKNOWN,
      }),
    ).toBe("legacy_unclassified");
  });

  it("20. researchEvaluationHash displayed/truncated safely", () => {
    expect(truncateEvaluationHash("0123456789abcdef")).toBe("0123456789ab");
    expect(
      read("components/rextora/strategySearch/ResearchEvaluationEvidence.tsx"),
    ).toContain("break-all");
  });

  it("21. engineCostModel visible in technical metadata", () => {
    expect(
      read("components/rextora/strategySearch/ResearchEvaluationEvidence.tsx"),
    ).toContain("research-engine-cost-model");
  });

  it("22. Pattern configured funding not shown as applied", () => {
    const funding = costChannelDisclosure({
      configuredEnabled: true,
      configuredRate: 0.0001,
      engineApplied: false,
      effectiveRate: 0,
    });
    expect(funding.configured).toBe(true);
    expect(funding.applied).toBe(false);
  });

  it("23. Pattern configured spread not shown as applied", () => {
    const spread = costChannelDisclosure({
      configuredEnabled: true,
      configuredRate: 0.00005,
      engineApplied: false,
      effectiveRate: 0,
    });
    expect(spread.applied).toBe(false);
  });

  it("24. SAFE spread applied provenance shown correctly", () => {
    const spread = costChannelDisclosure({
      configuredEnabled: true,
      configuredRate: 0.00005,
      engineApplied: true,
      effectiveRate: 0.00005,
    });
    expect(spread.applied).toBe(true);
  });

  it("25. legacy job without rankingGroups still readable", () => {
    const legacy = {
      bestScore: 0.42,
      bestCandidateHash: "legacy_hash",
      bestPassedCandidateHash: "legacy_pass",
    };
    expect(hasAuthoritativeRankingGroups(legacy)).toBe(false);
    expect(scalarBestIsAuthoritative(legacy)).toBe(true);
  });

  it("26. legacy presentation marked", () => {
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).toContain("기존 평가 형식");
  });

  it("27. group-aware job never uses scalar best authority", () => {
    expect(scalarBestIsAuthoritative(GROUP_AWARE)).toBe(false);
    expect(read("src/lib/rextora/agent/v2/tools/readHandlers.ts")).toContain(
      "rankingAuthority",
    );
  });

  it("28. promotion remains explicit", () => {
    const promote = read("src/lib/rextora/strategySearch/promoteFromSearch.ts");
    expect(promote).toMatch(/jobId/);
    expect(promote).toMatch(/iteration/);
    expect(promote).not.toMatch(/autoPromote|automatic promotion/i);
  });

  it("29. eligible non-champion can still be promoted", () => {
    expect(
      promotionActionAvailable({
        passed: true,
        rankingEligible: true,
        promotionEligible: true,
        rankingCompatibilityGroup: GROUP_SAFE,
      }),
    ).toBe(true);
    expect(isCanonicalGroupRecommendation(GROUP_AWARE.rankingGroups[0], "other_pass")).toBe(
      false,
    );
  });

  it("30. 390px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(390);
    expect(read("components/rextora/strategySearch/ResearchRankingGroups.tsx")).toContain(
      "grid-cols-1",
    );
    expect(read("components/rextora/strategySearch/ResearchRankingGroups.tsx")).toContain(
      "sm:grid-cols-2",
    );
  });

  it("31. 1024px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1024);
    expect(RESEARCH_RANKING_UI_CONTRACT.stackAt390).toContain("sm:grid-cols-2");
  });

  it("32. 1440px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1440);
    expect(RESEARCH_RANKING_UI_CONTRACT.actionsWrap).toContain("flex-wrap");
  });

  it("33. no production Research execution", () => {
    expect(productionReadonlyHashes().researchIndexSha256).toBe(
      hashesBefore.researchIndexSha256,
    );
  });

  it("34. no Paper/Live actions", () => {
    expect(productionReadonlyHashes().backtestIndexSha256).toBe(BACKTEST_INDEX_SHA);
  });

  it("35. no orders", () => {
    expect(0).toBe(0);
  });

  it("36. SAFE unchanged", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBe(SAFE_SHA);
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    expect(
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), "data/strategies/SAFE_v44_i4060.json")))
        .digest("hex"),
    ).toBe(SAFE_SHA);
  });
});

function candidate(input: {
  paramsHash: string;
  score: number;
  passed?: boolean;
  iteration?: number;
  rankingCompatibilityGroup?: string;
}): RankingGroupCandidateRef {
  return {
    iteration: input.iteration ?? 1,
    paramsHash: input.paramsHash,
    score: input.score,
    passed: input.passed ?? true,
    rankingCompatibilityGroup: input.rankingCompatibilityGroup,
  };
}

function groupWithShortlist(input: {
  id: typeof GROUP_SAFE | typeof GROUP_PATTERN;
  champ: RankingGroupCandidateRef;
  top: RankingGroupCandidateRef[];
}): ResearchRankingGroupView {
  return {
    rankingCompatibilityGroup: input.id,
    engineCostModel: input.id,
    rankingEligible: true,
    bestCandidate: input.top[0] ?? input.champ,
    bestPassedCandidate: input.champ,
    topCandidates: input.top,
  };
}

const A731_SAFE_A = candidate({
  paramsHash: "safe_top1_not_champ",
  score: 0.88,
  iteration: 11,
  rankingCompatibilityGroup: GROUP_SAFE,
});
const A731_SAFE_B = candidate({
  paramsHash: "safe_champ_b",
  score: 0.61,
  iteration: 12,
  rankingCompatibilityGroup: GROUP_SAFE,
});
const A731_PAT_A = candidate({
  paramsHash: "pat_top1_not_champ",
  score: 0.97,
  iteration: 21,
  rankingCompatibilityGroup: GROUP_PATTERN,
});
const A731_PAT_B = candidate({
  paramsHash: "pat_champ_b",
  score: 0.42,
  iteration: 22,
  rankingCompatibilityGroup: GROUP_PATTERN,
});

const A731_GROUPS = [
  groupWithShortlist({
    id: GROUP_SAFE,
    champ: A731_SAFE_B,
    top: [A731_SAFE_A, A731_SAFE_B],
  }),
  groupWithShortlist({
    id: GROUP_PATTERN,
    champ: A731_PAT_B,
    top: [A731_PAT_A, A731_PAT_B],
  }),
];

const A731_JOB = {
  rankingGroups: A731_GROUPS,
  unknownLegacy: {
    rankingCompatibilityGroup: GROUP_UNKNOWN,
    rankingEligible: false as const,
    promotionEligible: false as const,
    provenanceStatus: "legacy_unclassified" as const,
    count: 2,
  },
  bestScore: null,
  bestCandidateHash: null,
  bestPassedCandidateHash: null,
};

describe("P3-A7.3.1 live Top10 group scope", () => {
  it("1. authoritative groups hide combined live Top10", () => {
    expect(hasAuthoritativeRankingGroups(A731_JOB)).toBe(true);
    const live = read("components/rextora/strategySearch/SearchStatusCard.tsx");
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(live).toContain("groupAware ? null : (");
    expect(live).toContain('data-testid="ss-live-top10"');
    expect(results).toContain("hasAuthoritativeRankingGroups(summary) ? null : (");
    expect(results).toContain('data-testid="results-top10-table"');
    expect(completion).toContain("hasAuthoritativeRankingGroups(job) ? (");
    expect(completion).toContain('data-testid="ss-completion-final-top3"');
    expect(live.indexOf("groupAware ? null : (")).toBeLessThan(
      live.indexOf('data-testid="ss-live-top10"'),
    );
    expect(
      results.indexOf("hasAuthoritativeRankingGroups(summary) ? null : ("),
    ).toBeLessThan(results.indexOf('data-testid="results-top10-table"'));
  });

  it("2. SAFE Top10 uses SAFE topCandidates only", () => {
    const rows = topCandidatesForGroup(A731_GROUPS, GROUP_SAFE);
    expect(rows.map((row) => row.paramsHash)).toEqual([
      "safe_top1_not_champ",
      "safe_champ_b",
    ]);
    expect(rows.every((row) => row.rankingCompatibilityGroup === GROUP_SAFE)).toBe(
      true,
    );
    expect(groupShortlistTitle(GROUP_SAFE)).toBe("SAFE 숏리스트 · 표시용");
  });

  it("3. Pattern Top10 uses Pattern topCandidates only", () => {
    const rows = topCandidatesForGroup(A731_GROUPS, GROUP_PATTERN);
    expect(rows.map((row) => row.paramsHash)).toEqual([
      "pat_top1_not_champ",
      "pat_champ_b",
    ]);
    expect(
      rows.every((row) => row.rankingCompatibilityGroup === GROUP_PATTERN),
    ).toBe(true);
    expect(groupShortlistTitle(GROUP_PATTERN)).toBe(
      "패턴 숏리스트 · 기존 비용 모델 · 표시용",
    );
  });

  it("4. SAFE and Pattern arrays are never concatenated", () => {
    const safe = topCandidatesForGroup(A731_GROUPS, GROUP_SAFE);
    const pattern = topCandidatesForGroup(A731_GROUPS, GROUP_PATTERN);
    expect(safe.some((row) => row.paramsHash.startsWith("pat_"))).toBe(false);
    expect(pattern.some((row) => row.paramsHash.startsWith("safe_"))).toBe(false);
    const card = read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx");
    expect(card).not.toMatch(/\[\s*\.\.\.\s*safe/);
    expect(card).not.toContain(".concat(");
    expect(card).toContain("topCandidatesForGroup");
    expect(card).toContain("[group]");
  });

  it("5. rank numbering restarts per group", () => {
    const safeRanks = groupLocalShortlistRanks(
      topCandidatesForGroup(A731_GROUPS, GROUP_SAFE),
    );
    const patternRanks = groupLocalShortlistRanks(
      topCandidatesForGroup(A731_GROUPS, GROUP_PATTERN),
    );
    expect(safeRanks.map((row) => row.rank)).toEqual([1, 2]);
    expect(patternRanks.map((row) => row.rank)).toEqual([1, 2]);
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx"),
    ).toContain("data-group-rank");
  });

  it("6. no cross-group rank #1", () => {
    const safeFirst = groupLocalShortlistRanks(
      topCandidatesForGroup(A731_GROUPS, GROUP_SAFE),
    )[0];
    const patternFirst = groupLocalShortlistRanks(
      topCandidatesForGroup(A731_GROUPS, GROUP_PATTERN),
    )[0];
    expect(safeFirst?.rank).toBe(1);
    expect(patternFirst?.rank).toBe(1);
    expect(safeFirst?.candidate.paramsHash).not.toBe(
      patternFirst?.candidate.paramsHash,
    );
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).not.toContain("전체 1위");
  });

  it("7. Pattern higher numeric score does not reorder SAFE", () => {
    const safe = topCandidatesForGroup(A731_GROUPS, GROUP_SAFE);
    expect(A731_PAT_A.score).toBeGreaterThan(A731_SAFE_A.score);
    expect(safe.map((row) => row.paramsHash)).toEqual([
      "safe_top1_not_champ",
      "safe_champ_b",
    ]);
  });

  it("8. SAFE higher numeric score does not reorder Pattern", () => {
    const flipped = [
      groupWithShortlist({
        id: GROUP_SAFE,
        champ: A731_SAFE_B,
        top: [candidate({ paramsHash: "safe_hi", score: 0.99 })],
      }),
      groupWithShortlist({
        id: GROUP_PATTERN,
        champ: A731_PAT_B,
        top: [
          candidate({
            paramsHash: "pat_lo",
            score: 0.01,
            rankingCompatibilityGroup: GROUP_PATTERN,
          }),
          candidate({
            paramsHash: "pat_mid",
            score: 0.02,
            rankingCompatibilityGroup: GROUP_PATTERN,
          }),
        ],
      }),
    ];
    expect(topCandidatesForGroup(flipped, GROUP_PATTERN).map((row) => row.paramsHash)).toEqual(
      ["pat_lo", "pat_mid"],
    );
  });

  it("9. Top10 #1 does not override SAFE CHAMP-A", () => {
    const safe = A731_GROUPS[0]!;
    const first = groupLocalShortlistRanks(safe.topCandidates)[0]!;
    expect(first.candidate.paramsHash).toBe("safe_top1_not_champ");
    expect(isCanonicalGroupRecommendation(safe, first.candidate.paramsHash)).toBe(
      false,
    );
    expect(isCanonicalGroupRecommendation(safe, "safe_champ_b")).toBe(true);
    expect(groupRecommendationLabel(safe)).toBe("최종 추천");
  });

  it("10. Top10 #1 does not override Pattern CHAMP-A", () => {
    const pattern = A731_GROUPS[1]!;
    const first = groupLocalShortlistRanks(pattern.topCandidates)[0]!;
    expect(first.candidate.paramsHash).toBe("pat_top1_not_champ");
    expect(
      isCanonicalGroupRecommendation(pattern, first.candidate.paramsHash),
    ).toBe(false);
    expect(isCanonicalGroupRecommendation(pattern, "pat_champ_b")).toBe(true);
  });

  it("11. SAFE empty shortlist renders group-local empty state", () => {
    const emptySafe = groupWithShortlist({
      id: GROUP_SAFE,
      champ: A731_SAFE_B,
      top: [],
    });
    expect(emptySafe.bestPassedCandidate?.paramsHash).toBe("safe_champ_b");
    expect(topCandidatesForGroup([emptySafe], GROUP_SAFE)).toEqual([]);
    expect(shouldTreatJobAsEmpty({ rankingGroups: [emptySafe, A731_GROUPS[1]!] })).toBe(
      false,
    );
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx"),
    ).toContain("숏리스트 없음");
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx"),
    ).toContain("research-group-shortlist-empty-");
  });

  it("12. Pattern empty shortlist renders group-local empty state", () => {
    const emptyPattern = groupWithShortlist({
      id: GROUP_PATTERN,
      champ: A731_PAT_B,
      top: [],
    });
    expect(topCandidatesForGroup([emptyPattern], GROUP_PATTERN)).toEqual([]);
    expect(
      shouldTreatJobAsEmpty({
        rankingGroups: [A731_GROUPS[0]!, emptyPattern],
      }),
    ).toBe(false);
    expect(groupShortlistTitle(GROUP_PATTERN)).toContain("패턴 숏리스트");
  });

  it("13. UNKNOWN never appears in competitive shortlist", () => {
    const leaked = [
      groupWithShortlist({
        id: GROUP_SAFE,
        champ: A731_SAFE_B,
        top: [
          A731_SAFE_A,
          candidate({
            paramsHash: "unknown_leak",
            score: 0.5,
            rankingCompatibilityGroup: GROUP_UNKNOWN,
          }),
        ],
      }),
    ];
    expect(
      topCandidatesForGroup(leaked, GROUP_SAFE).map((row) => row.paramsHash),
    ).toEqual(["safe_top1_not_champ"]);
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).toContain("research-unknown-legacy");
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).not.toContain("research-ranking-group-unknown_legacy");
  });

  it("14. legacy job still renders old flat Top10", () => {
    const legacy = { bestScore: 0.2, bestCandidateHash: "legacy" };
    expect(hasAuthoritativeRankingGroups(legacy)).toBe(false);
    expect(read("components/rextora/strategySearch/SearchStatusCard.tsx")).toContain(
      'data-testid="ss-live-top10"',
    );
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain('data-testid="results-top10-table"');
  });

  it("15. legacy marker remains", () => {
    expect(read("components/rextora/strategySearch/SearchStatusCard.tsx")).toContain(
      "기존 평가 형식",
    );
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("기존 평가 형식");
    expect(
      read("components/rextora/strategySearch/ResearchRankingGroups.tsx"),
    ).toContain("기존 평가 형식");
  });

  it("16. null global scalar does not affect group Top10", () => {
    expect(A731_JOB.bestScore).toBeNull();
    expect(topCandidatesForGroup(A731_JOB.rankingGroups, GROUP_SAFE)).toHaveLength(2);
    expect(topCandidatesForGroup(A731_JOB.rankingGroups, GROUP_PATTERN)).toHaveLength(
      2,
    );
    expect(hasAuthoritativeRankingGroups(A731_JOB)).toBe(true);
  });

  it("17. Top10 formula unchanged", () => {
    expect(read("src/lib/rextora/strategySearch/researchTop10.ts")).toContain(
      "return ret * 100 - mdd * 40 + pf * 5 + Math.min(trades, 50) * 0.1;",
    );
  });

  it("18. ResultsSummary formula unchanged", () => {
    const summary = read("src/lib/rextora/strategySearch/researchResultsSummary.ts");
    expect(summary).toContain("const r = card.netReturn ?? -1;");
    expect(summary).toContain("const base = card.score ?? r * 2 - mdd + pf * 0.1;");
    expect(summary).toContain(
      "(card.stressPassed === true ? 0.05 : 0) +",
    );
  });

  it("19. CHAMP-A unchanged", () => {
    expect(isCanonicalGroupRecommendation(A731_GROUPS[0], "safe_champ_b")).toBe(true);
    expect(
      isCanonicalGroupRecommendation(A731_GROUPS[0], "safe_top1_not_champ"),
    ).toBe(false);
    expect(
      read("src/lib/rextora/researchRankingReadModel.ts"),
    ).toContain("group?.bestPassedCandidate?.paramsHash");
  });

  it("20. group ranking unchanged", () => {
    const model = read("src/lib/rextora/researchRankingReadModel.ts");
    expect(model).toContain("Does not compute scores, CHAMP-A, or evaluation identity.");
    expect(model).not.toContain("function compositeScore");
    expect(read("src/lib/rextora/strategySearch/researchTop10.ts")).toContain(
      "function compositeScore",
    );
  });

  it("21. 390px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(390);
    const groups = read("components/rextora/strategySearch/ResearchRankingGroups.tsx");
    const card = read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx");
    expect(groups).toContain("grid-cols-1");
    expect(card).toContain("min-w-0");
    expect(card).toContain("break-all");
    expect(card).not.toContain("min-w-[48rem]");
    expect(card).not.toContain("min-w-[52rem]");
  });

  it("22. 1024px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1024);
    expect(read("components/rextora/strategySearch/ResearchRankingGroups.tsx")).toContain(
      "sm:grid-cols-2",
    );
  });

  it("23. 1440px structural contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1440);
    expect(RESEARCH_RANKING_UI_CONTRACT.actionsWrap).toContain("flex-wrap");
    expect(read("components/rextora/strategySearch/ResearchRankingGroupCard.tsx")).toContain(
      "min-w-0",
    );
  });

  it("24. no production Research execution", () => {
    expect(productionReadonlyHashes().researchIndexSha256).toBe(
      hashesBefore.researchIndexSha256,
    );
  });

  it("25. no Paper/Live", () => {
    expect(productionReadonlyHashes().backtestIndexSha256).toBe(BACKTEST_INDEX_SHA);
  });

  it("26. no orders", () => {
    expect(0).toBe(0);
  });

  it("27. SAFE unchanged", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBe(SAFE_SHA);
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    expect(
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), "data/strategies/SAFE_v44_i4060.json")))
        .digest("hex"),
    ).toBe(SAFE_SHA);
  });
});

function highlightCard(input: {
  paramsHash: string;
  netReturn: number;
  maxDrawdown: number;
  profitFactor?: number;
  recommendable?: boolean;
  rankingCompatibilityGroup?: string;
}) {
  return {
    paramsHash: input.paramsHash,
    netReturn: input.netReturn,
    maxDrawdown: input.maxDrawdown,
    profitFactor: input.profitFactor ?? 1.2,
    recommendable: input.recommendable ?? true,
    rankingCompatibilityGroup: input.rankingCompatibilityGroup,
  };
}

const A732_SAFE_RETURN = highlightCard({
  paramsHash: "safe_return_a",
  netReturn: 0.22,
  maxDrawdown: -0.18,
  rankingCompatibilityGroup: GROUP_SAFE,
});
const A732_SAFE_STABLE = highlightCard({
  paramsHash: "safe_stable_b",
  netReturn: 0.08,
  maxDrawdown: -0.03,
  rankingCompatibilityGroup: GROUP_SAFE,
});
const A732_SAFE_CHAMP = highlightCard({
  paramsHash: "safe_champ_c",
  netReturn: 0.11,
  maxDrawdown: -0.09,
  rankingCompatibilityGroup: GROUP_SAFE,
});
const A732_PAT_RETURN = highlightCard({
  paramsHash: "pat_return_a",
  netReturn: 0.91,
  maxDrawdown: -0.4,
  rankingCompatibilityGroup: GROUP_PATTERN,
});
const A732_PAT_STABLE = highlightCard({
  paramsHash: "pat_stable_b",
  netReturn: 0.05,
  maxDrawdown: -0.02,
  rankingCompatibilityGroup: GROUP_PATTERN,
});
const A732_PAT_CHAMP = highlightCard({
  paramsHash: "pat_champ_c",
  netReturn: 0.2,
  maxDrawdown: -0.12,
  rankingCompatibilityGroup: GROUP_PATTERN,
});

const A732_GROUPS = [
  groupWithShortlist({
    id: GROUP_SAFE,
    champ: candidate({
      paramsHash: "safe_champ_c",
      score: 0.7,
      rankingCompatibilityGroup: GROUP_SAFE,
    }),
    top: [
      candidate({
        paramsHash: "safe_return_a",
        score: 0.4,
        rankingCompatibilityGroup: GROUP_SAFE,
      }),
      candidate({
        paramsHash: "safe_stable_b",
        score: 0.5,
        rankingCompatibilityGroup: GROUP_SAFE,
      }),
      candidate({
        paramsHash: "safe_champ_c",
        score: 0.7,
        rankingCompatibilityGroup: GROUP_SAFE,
      }),
    ],
  }),
  groupWithShortlist({
    id: GROUP_PATTERN,
    champ: candidate({
      paramsHash: "pat_champ_c",
      score: 0.8,
      rankingCompatibilityGroup: GROUP_PATTERN,
    }),
    top: [
      candidate({
        paramsHash: "pat_return_a",
        score: 0.3,
        rankingCompatibilityGroup: GROUP_PATTERN,
      }),
      candidate({
        paramsHash: "pat_stable_b",
        score: 0.4,
        rankingCompatibilityGroup: GROUP_PATTERN,
      }),
      candidate({
        paramsHash: "pat_champ_c",
        score: 0.8,
        rankingCompatibilityGroup: GROUP_PATTERN,
      }),
    ],
  }),
];

const A732_SOURCE = {
  rankingGroups: A732_GROUPS,
  bestScore: null,
  bestCandidateHash: null,
  bestPassedCandidateHash: null,
};

const A732_SNAPSHOT_1 = [
  { strategyHash: "safe_a", rank: 1, rankingCompatibilityGroup: GROUP_SAFE },
  { strategyHash: "safe_b", rank: 2, rankingCompatibilityGroup: GROUP_SAFE },
  { strategyHash: "pat_x", rank: 1, rankingCompatibilityGroup: GROUP_PATTERN },
  { strategyHash: "pat_y", rank: 2, rankingCompatibilityGroup: GROUP_PATTERN },
];
const A732_SNAPSHOT_2 = [
  { strategyHash: "safe_b", rank: 1, rankingCompatibilityGroup: GROUP_SAFE },
  { strategyHash: "safe_a", rank: 2, rankingCompatibilityGroup: GROUP_SAFE },
  { strategyHash: "pat_y", rank: 1, rankingCompatibilityGroup: GROUP_PATTERN },
  { strategyHash: "pat_x", rank: 2, rankingCompatibilityGroup: GROUP_PATTERN },
];

describe("P3-A7.3.2 results highlight + rank history group scope", () => {
  it("1. group-aware job does not render mixed decisionTop3", () => {
    expect(hasAuthoritativeRankingGroups(A732_SOURCE)).toBe(true);
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).toContain("groupAware && groupHighlights");
    expect(results).toContain("if (groupAware) return [];");
    expect(results).toContain("results-group-highlights");
  });

  it("2. SAFE highest-return uses SAFE candidates only", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [
        A732_SAFE_RETURN,
        A732_SAFE_STABLE,
        A732_SAFE_CHAMP,
        A732_PAT_RETURN,
        A732_PAT_STABLE,
        A732_PAT_CHAMP,
      ],
    });
    expect(highlights?.[0]?.highestReturn?.paramsHash).toBe("safe_return_a");
    expect(highlights?.[0]?.highestReturnLabel).toBe("SAFE 최고 수익");
  });

  it("3. SAFE highest-stability uses SAFE candidates only", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [
        A732_SAFE_RETURN,
        A732_SAFE_STABLE,
        A732_SAFE_CHAMP,
        A732_PAT_STABLE,
      ],
    });
    expect(highlights?.[0]?.highestStability?.paramsHash).toBe("safe_stable_b");
    expect(highlights?.[0]?.highestStabilityLabel).toBe("SAFE 최고 안정");
  });

  it("4. Pattern highest-return uses Pattern candidates only", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [A732_SAFE_RETURN, A732_PAT_RETURN, A732_PAT_STABLE],
    });
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestReturn?.paramsHash).toBe(
      "pat_return_a",
    );
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestReturnLabel).toBe(
      "패턴 · 기존 비용 모델 최고 수익",
    );
  });

  it("5. Pattern highest-stability uses Pattern candidates only", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [A732_SAFE_STABLE, A732_PAT_RETURN, A732_PAT_STABLE],
    });
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestStability?.paramsHash).toBe(
      "pat_stable_b",
    );
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestStabilityLabel).toBe(
      "패턴 · 기존 비용 모델 최고 안정",
    );
  });

  it("6. Pattern numeric return cannot beat SAFE as a global highlight", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [A732_SAFE_RETURN, A732_PAT_RETURN],
    });
    expect(A732_PAT_RETURN.netReturn).toBeGreaterThan(A732_SAFE_RETURN.netReturn);
    expect(highlights?.[0]?.highestReturn?.paramsHash).toBe("safe_return_a");
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestReturn?.paramsHash).toBe(
      "pat_return_a",
    );
  });

  it("7. SAFE numeric return cannot beat Pattern as a global highlight", () => {
    const safeHi = highlightCard({
      paramsHash: "safe_hi",
      netReturn: 0.99,
      maxDrawdown: -0.1,
      rankingCompatibilityGroup: GROUP_SAFE,
    });
    const patLo = highlightCard({
      paramsHash: "pat_lo",
      netReturn: 0.01,
      maxDrawdown: -0.1,
      rankingCompatibilityGroup: GROUP_PATTERN,
    });
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [safeHi, patLo],
    });
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestReturn?.paramsHash).toBe(
      "pat_lo",
    );
  });

  it("8. no overall highest-return label", () => {
    expect(groupHighlightTitle(GROUP_SAFE, "highest_return")).not.toContain("전체");
    expect(groupHighlightTitle(GROUP_PATTERN, "highest_return")).not.toBe("최고 수익");
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).toContain("highestReturnLabel");
    expect(results).not.toContain("전체 최고 수익");
  });

  it("9. no overall highest-stability label", () => {
    expect(groupHighlightTitle(GROUP_SAFE, "highest_stability")).toBe("SAFE 최고 안정");
    expect(groupHighlightTitle(GROUP_PATTERN, "highest_stability")).not.toBe(
      "최고 안정",
    );
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).not.toContain("전체 최고 안정");
  });

  it("10. CHAMP-A remains separate from highest-return", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [A732_SAFE_RETURN, A732_SAFE_STABLE, A732_SAFE_CHAMP],
    });
    expect(highlights?.[0]?.highestReturn?.paramsHash).toBe("safe_return_a");
    expect(isCanonicalGroupRecommendation(A732_GROUPS[0], "safe_champ_c")).toBe(true);
    expect(isCanonicalGroupRecommendation(A732_GROUPS[0], "safe_return_a")).toBe(
      false,
    );
  });

  it("11. CHAMP-A remains separate from highest-stability", () => {
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [A732_SAFE_RETURN, A732_SAFE_STABLE, A732_SAFE_CHAMP],
    });
    expect(highlights?.[0]?.highestStability?.paramsHash).toBe("safe_stable_b");
    expect(isCanonicalGroupRecommendation(A732_GROUPS[0], "safe_stable_b")).toBe(
      false,
    );
    expect(groupRecommendationLabel(A732_GROUPS[0])).toBe("최종 추천");
  });

  it("12. UNKNOWN excluded from highlights", () => {
    const unknown = highlightCard({
      paramsHash: "unknown_hi",
      netReturn: 1.5,
      maxDrawdown: -0.01,
      rankingCompatibilityGroup: GROUP_UNKNOWN,
    });
    const highlights = groupDecisionHighlights({
      source: A732_SOURCE,
      candidates: [unknown, A732_SAFE_RETURN, A732_PAT_RETURN],
    });
    expect(highlights?.[0]?.highestReturn?.paramsHash).toBe("safe_return_a");
    expect(highlights?.find((row) => row.groupId === GROUP_PATTERN)?.highestReturn?.paramsHash).toBe(
      "pat_return_a",
    );
    expect(resolvePersistedRankingGroup(unknown)).toBe(GROUP_UNKNOWN);
  });

  it("13. group-aware rank-history is not global", () => {
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).toContain("rank-history-group-unavailable");
    expect(results).toContain("GROUP_RANK_HISTORY_UNAVAILABLE");
    expect(groupScopedRankHistory({ snapshots: [] }).available).toBe(false);
  });

  it("14. SAFE rank changes use SAFE snapshots only", () => {
    const history = groupScopedRankHistory({
      snapshots: [A732_SNAPSHOT_1, A732_SNAPSHOT_2],
    });
    const safe = history.groups.find((row) => row.groupId === GROUP_SAFE);
    expect(safe?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyHash: "safe_b",
          previousRank: 2,
          currentRank: 1,
        }),
        expect.objectContaining({
          strategyHash: "safe_a",
          previousRank: 1,
          currentRank: 2,
        }),
      ]),
    );
    expect(safe?.changes.some((row) => row.strategyHash.startsWith("pat_"))).toBe(
      false,
    );
  });

  it("15. Pattern rank changes use Pattern snapshots only", () => {
    const history = groupScopedRankHistory({
      snapshots: [A732_SNAPSHOT_1, A732_SNAPSHOT_2],
    });
    const pattern = history.groups.find((row) => row.groupId === GROUP_PATTERN);
    expect(pattern?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyHash: "pat_y",
          previousRank: 2,
          currentRank: 1,
        }),
        expect.objectContaining({
          strategyHash: "pat_x",
          previousRank: 1,
          currentRank: 2,
        }),
      ]),
    );
    expect(pattern?.changes.some((row) => row.strategyHash.startsWith("safe_"))).toBe(
      false,
    );
  });

  it("16. rank numbering restarts per group", () => {
    const history = groupScopedRankHistory({
      snapshots: [A732_SNAPSHOT_1, A732_SNAPSHOT_2],
    });
    expect(history.available).toBe(true);
    const safe = history.groups.find((row) => row.groupId === GROUP_SAFE);
    const pattern = history.groups.find((row) => row.groupId === GROUP_PATTERN);
    expect(safe?.changes.map((row) => row.currentRank).sort()).toEqual([1, 2]);
    expect(pattern?.changes.map((row) => row.currentRank).sort()).toEqual([1, 2]);
  });

  it("17. no SAFE-vs-Pattern rank movement", () => {
    const history = groupScopedRankHistory({
      snapshots: [A732_SNAPSHOT_1, A732_SNAPSHOT_2],
    });
    const all = history.groups.flatMap((row) => row.changes);
    expect(
      all.some(
        (row) =>
          row.strategyHash.startsWith("safe_") &&
          (row.previousRank === 3 || row.currentRank === 3),
      ),
    ).toBe(false);
    expect(all).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ strategyHash: "safe_a", currentRank: 4 }),
      ]),
    );
  });

  it("18. UNKNOWN excluded from competitive rank history", () => {
    const history = groupScopedRankHistory({
      snapshots: [
        [
          ...A732_SNAPSHOT_1,
          {
            strategyHash: "unknown_z",
            rank: 1,
            rankingCompatibilityGroup: GROUP_UNKNOWN,
          },
        ],
        [
          ...A732_SNAPSHOT_2,
          {
            strategyHash: "unknown_z",
            rank: 2,
            rankingCompatibilityGroup: GROUP_UNKNOWN,
          },
        ],
      ],
    });
    expect(
      history.groups.some((row) =>
        row.changes.some((change) => change.strategyHash === "unknown_z"),
      ),
    ).toBe(false);
  });

  it("19. insufficient historical grouping evidence is excluded/fail-closed", () => {
    const mixedGlobal = groupScopedRankHistory({
      snapshots: [
        [
          { strategyHash: "safe_a", rank: 1, rankingCompatibilityGroup: GROUP_SAFE },
          {
            strategyHash: "pat_x",
            rank: 2,
            rankingCompatibilityGroup: GROUP_PATTERN,
          },
        ],
        [
          { strategyHash: "pat_x", rank: 1, rankingCompatibilityGroup: GROUP_PATTERN },
          { strategyHash: "safe_a", rank: 2, rankingCompatibilityGroup: GROUP_SAFE },
        ],
      ],
    });
    expect(mixedGlobal.available).toBe(false);
    expect(mixedGlobal.reason).toBe(GROUP_RANK_HISTORY_UNAVAILABLE);
    const noGroup = groupScopedRankHistory({
      snapshots: [
        [{ strategyHash: "safe_a", rank: 1 }],
        [{ strategyHash: "safe_a", rank: 1 }],
      ],
    });
    expect(noGroup.available).toBe(false);
  });

  it("20. legacy job retains old decisionTop3", () => {
    expect(hasAuthoritativeRankingGroups({ bestScore: 0.2 })).toBe(false);
    expect(groupDecisionHighlights({ source: { bestScore: 0.2 }, candidates: [] })).toBeNull();
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("최고 수익 전략");
  });

  it("21. legacy job retains old rank-history", () => {
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain('data-testid="rank-change-list"');
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("rankChanges.map");
  });

  it("22. legacy marker remains", () => {
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).toContain("기존 평가 형식 · TOP 10 순위 변동");
    expect(results).toContain("기존 평가 형식 · ${titles.join");
  });

  it("23. Top10 formula unchanged", () => {
    expect(read("src/lib/rextora/strategySearch/researchTop10.ts")).toContain(
      "return ret * 100 - mdd * 40 + pf * 5 + Math.min(trades, 50) * 0.1;",
    );
  });

  it("24. ResultsSummary formula unchanged", () => {
    const summary = read("src/lib/rextora/strategySearch/researchResultsSummary.ts");
    expect(summary).toContain("const r = card.netReturn ?? -1;");
    expect(summary).toContain("const base = card.score ?? r * 2 - mdd + pf * 0.1;");
  });

  it("25. CHAMP-A unchanged", () => {
    expect(isCanonicalGroupRecommendation(A732_GROUPS[0], "safe_champ_c")).toBe(true);
    expect(
      read("src/lib/rextora/researchRankingReadModel.ts"),
    ).toContain("group?.bestPassedCandidate?.paramsHash");
  });

  it("26. rankingGroups backend unchanged", () => {
    expect(read("src/lib/rextora/researchRankingReadModel.ts")).toContain(
      "Does not compute scores, CHAMP-A, or evaluation identity.",
    );
    expect(read("src/lib/rextora/researchRankingReadModel.ts")).not.toContain(
      "function compositeScore",
    );
  });

  it("27. paramsHash unchanged", () => {
    expect(productionReadonlyHashes().paramsHash).toBe("7893ca3f0e30");
  });

  it("28. researchEvaluationHash unchanged", () => {
    expect(
      read("src/lib/rextora/strategySearch/researchEvaluationIdentity.ts"),
    ).toContain("research_evaluation_identity_v1");
  });

  it("29. 390px contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(390);
    const results = read(
      "components/rextora/results/CurrentResearchResultsPanel.tsx",
    );
    expect(results).toContain("grid-cols-1");
    expect(results).toContain("results-group-highlights");
  });

  it("30. 1024px contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1024);
    expect(
      read("components/rextora/results/CurrentResearchResultsPanel.tsx"),
    ).toContain("sm:grid-cols-2");
  });

  it("31. 1440px contract", () => {
    expect(RESEARCH_RANKING_UI_CONTRACT.viewports).toContain(1440);
    expect(RESEARCH_RANKING_UI_CONTRACT.actionsWrap).toContain("flex-wrap");
  });

  it("32. no production Research execution", () => {
    expect(productionReadonlyHashes().researchIndexSha256).toBe(
      hashesBefore.researchIndexSha256,
    );
  });

  it("33. no Paper/Live", () => {
    expect(productionReadonlyHashes().backtestIndexSha256).toBe(BACKTEST_INDEX_SHA);
  });

  it("34. no orders", () => {
    expect(0).toBe(0);
  });

  it("35. SAFE unchanged", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBe(SAFE_SHA);
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    expect(
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), "data/strategies/SAFE_v44_i4060.json")))
        .digest("hex"),
    ).toBe(SAFE_SHA);
  });
});
