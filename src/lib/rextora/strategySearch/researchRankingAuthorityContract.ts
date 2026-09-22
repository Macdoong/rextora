/**
 * P3-A7.1.2 read-only forensic: UNKNOWN_LEGACY classification, group-scoped
 * best-state authority, and one canonical group-champion selector.
 *
 * Design only. Does not change paramsHash, scoring formulas, ranking,
 * checkpoint production format, promotion, SAFE, jobs, trials, or Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionReadonlyHashes } from "../backtest/backtestCostAssumptionsDiagnosis";
import { RETIRED_SAFE_FILE_NAME } from "../strategy/retiredSafeBaseline";
import { isBetterScore } from "./jobStatistics";
import { isPatternCandidateParams } from "./patternSearchSpaces";
import type { StrategySearchBestCandidateReference } from "./types";

export const P3A712_ARTIFACT_TS = "2026-09-04T02-20-00-000Z";

export const GROUP_SAFE = "safe_execution_price_v1" as const;
export const GROUP_PATTERN = "event_sequence_ledger_v0" as const;
export const GROUP_UNKNOWN_LEGACY = "unknown_legacy" as const;

export type RankingCompatibilityGroupId =
  | typeof GROUP_SAFE
  | typeof GROUP_PATTERN
  | typeof GROUP_UNKNOWN_LEGACY;

export type LegacyClass = "PROVEN_SAFE" | "PROVEN_PATTERN" | "UNKNOWN_LEGACY";

export type BestConsumerKind =
  | "CHECKPOINT_RECOVERY"
  | "RUNNER_CONTROL"
  | "UI_DISPLAY"
  | "API_RESPONSE"
  | "PROMOTION"
  | "SUMMARY"
  | "LEGACY_ONLY"
  | "OTHER";

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function isSafeSearchParams(params: Record<string, unknown>): boolean {
  return (
    typeof params.ema_fast === "number" ||
    typeof params.sl_atr_mult === "number"
  );
}

export function getClassificationEvidencePriority() {
  return {
    order: [
      {
        rank: 1,
        evidence: "explicit future engineCostModel / rankingCompatibilityGroup on trial",
        persistedToday: false,
        sufficient: true,
      },
      {
        rank: 2,
        evidence: "explicit trial.strategyType / candidateType / pattern family field",
        persistedToday: false,
        sufficient: true,
        note: "StrategySearchTrial has no strategyType. strategyType exists only after promote.",
      },
      {
        rank: 3,
        evidence: "trial.params shape via isPatternCandidateParams / ema_fast|sl_atr_mult",
        persistedToday: true,
        sufficient: true,
        when: "params object is non-empty and matches exactly one family",
      },
      {
        rank: 4,
        evidence: "job execution profile",
        persistedToday: true,
        sufficient: false,
        note: "baseCostConfig has rates/flags only — no engine family",
      },
      {
        rank: 5,
        evidence: "job.config / plan.spaces",
        persistedToday: true,
        sufficient: false,
        note: "strategyTemplateId is market/timeframe label (agent_draft_ETHUSDT_15m). currentSpaceIndex is campaign-now, not per-trial. Using it would misclassify earlier-space trials.",
      },
      {
        rank: 6,
        evidence: "source strategy metadata / sourceParamsHash",
        persistedToday: false,
        sufficient: false,
        note: "sourceParamsHash is written on promoted strategies, not on Research trials",
      },
      {
        rank: 7,
        evidence: "no sufficient evidence",
        persistedToday: true,
        sufficient: false,
        result: "UNKNOWN_LEGACY",
      },
    ],
    forbidden: [
      "paramsHash alone",
      "score",
      "iteration",
      "job current space as trial family",
    ],
  };
}

export function classifyTrialFromPersistedEvidence(input: {
  params?: Record<string, unknown> | null;
  engineCostModel?: string | null;
  rankingCompatibilityGroup?: string | null;
  strategyType?: string | null;
}): {
  class: LegacyClass;
  rankingCompatibilityGroup: RankingCompatibilityGroupId;
  rankingEligible: boolean;
  paramsPresent: boolean;
  familyReconstructable: boolean;
  engineModelReconstructable: boolean;
  groupReconstructable: boolean;
  evidenceUsed: string;
} {
  if (
    input.rankingCompatibilityGroup === GROUP_SAFE ||
    input.engineCostModel === GROUP_SAFE ||
    input.strategyType === "safe_params"
  ) {
    return {
      class: "PROVEN_SAFE",
      rankingCompatibilityGroup: GROUP_SAFE,
      rankingEligible: true,
      paramsPresent: Boolean(input.params && Object.keys(input.params).length > 0),
      familyReconstructable: true,
      engineModelReconstructable: true,
      groupReconstructable: true,
      evidenceUsed: "explicit type/model",
    };
  }
  if (
    input.rankingCompatibilityGroup === GROUP_PATTERN ||
    input.engineCostModel === GROUP_PATTERN ||
    input.strategyType === "condition_builder"
  ) {
    return {
      class: "PROVEN_PATTERN",
      rankingCompatibilityGroup: GROUP_PATTERN,
      rankingEligible: true,
      paramsPresent: Boolean(input.params && Object.keys(input.params).length > 0),
      familyReconstructable: true,
      engineModelReconstructable: true,
      groupReconstructable: true,
      evidenceUsed: "explicit type/model",
    };
  }

  const params = input.params;
  const present = Boolean(params && typeof params === "object" && Object.keys(params).length > 0);
  if (present && params) {
    if (isPatternCandidateParams(params)) {
      return {
        class: "PROVEN_PATTERN",
        rankingCompatibilityGroup: GROUP_PATTERN,
        rankingEligible: true,
        paramsPresent: true,
        familyReconstructable: true,
        engineModelReconstructable: true,
        groupReconstructable: true,
        evidenceUsed: "trial.params shape (pattern)",
      };
    }
    if (isSafeSearchParams(params)) {
      return {
        class: "PROVEN_SAFE",
        rankingCompatibilityGroup: GROUP_SAFE,
        rankingEligible: true,
        paramsPresent: true,
        familyReconstructable: true,
        engineModelReconstructable: true,
        groupReconstructable: true,
        evidenceUsed: "trial.params shape (SAFE)",
      };
    }
  }

  return {
    class: "UNKNOWN_LEGACY",
    rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
    rankingEligible: false,
    paramsPresent: present,
    familyReconstructable: false,
    engineModelReconstructable: false,
    groupReconstructable: false,
    evidenceUsed: present ? "params present but unrecognized" : "empty/missing params",
  };
}

export interface LegacySampleRow {
  trialId: string;
  jobId: string;
  iteration: number;
  paramsHash: string;
  paramsPresent: boolean;
  jobProfileAvailable: boolean;
  familyReconstructable: boolean;
  engineModelReconstructable: boolean;
  groupReconstructable: boolean;
  class: LegacyClass;
}

const sampleCache = new Map<
  string,
  {
    safe: LegacySampleRow[];
    pattern: LegacySampleRow[];
    unknown: LegacySampleRow[];
  }
>();

export function sampleHistoricalTrials(cwd = process.cwd()): {
  safe: LegacySampleRow[];
  pattern: LegacySampleRow[];
  unknown: LegacySampleRow[];
} {
  const cached = sampleCache.get(cwd);
  if (cached) return cached;
  const root = path.join(cwd, "data/rextora/strategy-search");
  const trialsRoot = path.join(root, "trials");
  const safe: LegacySampleRow[] = [];
  const pattern: LegacySampleRow[] = [];
  const unknown: LegacySampleRow[] = [];
  if (!fs.existsSync(trialsRoot)) return { safe, pattern, unknown };

  const jobIds = fs
    .readdirSync(trialsRoot)
    .filter((name) => name.startsWith("search_"));

  for (const jobId of jobIds) {
    if (safe.length >= 5 && pattern.length >= 5 && unknown.length >= 5) break;
    const trialDir = path.join(trialsRoot, jobId);
    const profile = readJsonIfExists(path.join(root, "jobs", `${jobId}.execution.json`));
    const files = fs
      .readdirSync(trialDir)
      .filter((name) => /^\d{8}\.json$/.test(name))
      .sort();
    const mid = Math.floor(files.length / 2);
    const stride = Math.max(1, Math.floor(files.length / 12));
    const picks = [
      ...files.slice(0, 4),
      ...files.slice(Math.max(0, mid - 2), mid + 3),
      ...files.slice(Math.max(4, files.length - 4)),
      ...files.filter((_, index) => index % stride === 0).slice(0, 8),
    ].filter((name, i, arr) => arr.indexOf(name) === i);

    for (const file of picks) {
      if (safe.length >= 5 && pattern.length >= 5 && unknown.length >= 5) break;
      const trial = readJsonIfExists<{
        iteration: number;
        paramsHash: string;
        params?: Record<string, unknown>;
      }>(path.join(trialDir, file));
      if (!trial?.paramsHash) continue;
      const classified = classifyTrialFromPersistedEvidence({
        params: trial.params ?? null,
      });
      if (
        trial.paramsHash.startsWith("invalid_") &&
        classified.class !== "UNKNOWN_LEGACY"
      ) {
        continue;
      }
      const row: LegacySampleRow = {
        trialId: `${jobId}#${trial.iteration}`,
        jobId,
        iteration: trial.iteration,
        paramsHash: trial.paramsHash,
        paramsPresent: classified.paramsPresent,
        jobProfileAvailable: profile != null,
        familyReconstructable: classified.familyReconstructable,
        engineModelReconstructable: classified.engineModelReconstructable,
        groupReconstructable: classified.groupReconstructable,
        class: classified.class,
      };
      if (classified.class === "PROVEN_SAFE" && safe.length < 5) safe.push(row);
      else if (classified.class === "PROVEN_PATTERN" && pattern.length < 5) {
        pattern.push(row);
      } else if (classified.class === "UNKNOWN_LEGACY" && unknown.length < 5) {
        unknown.push(row);
      }
    }
  }

  if (unknown.filter((row) => !row.paramsPresent).length < 5) {
    for (const jobId of jobIds) {
      if (unknown.filter((row) => !row.paramsPresent).length >= 5) break;
      const trialDir = path.join(trialsRoot, jobId);
      const profile = readJsonIfExists(
        path.join(root, "jobs", `${jobId}.execution.json`),
      );
      const files = fs
        .readdirSync(trialDir)
        .filter((name) => /^\d{8}\.json$/.test(name))
        .sort();
      if (files.length < 20) continue;
      const stride = Math.max(1, Math.floor(files.length / 40));
      for (let i = 0; i < files.length; i += stride) {
        if (unknown.filter((row) => !row.paramsPresent).length >= 5) break;
        const trial = readJsonIfExists<{
          iteration: number;
          paramsHash: string;
          params?: Record<string, unknown> | null;
        }>(path.join(trialDir, files[i]));
        if (!trial?.paramsHash) continue;
        const keys = trial.params ? Object.keys(trial.params) : [];
        if (keys.length > 0) continue;
        const classified = classifyTrialFromPersistedEvidence({
          params: trial.params ?? {},
        });
        if (classified.class !== "UNKNOWN_LEGACY") continue;
        unknown.push({
          trialId: `${jobId}#${trial.iteration}`,
          jobId,
          iteration: trial.iteration,
          paramsHash: trial.paramsHash,
          paramsPresent: false,
          jobProfileAvailable: profile != null,
          familyReconstructable: false,
          engineModelReconstructable: false,
          groupReconstructable: false,
          class: "UNKNOWN_LEGACY",
        });
      }
    }
  }

  const result = { safe, pattern, unknown };
  sampleCache.set(cwd, result);
  return result;
}

export function getUnknownLegacyPolicy() {
  return {
    UNKNOWN_LEGACY_POLICY_ACCEPTED: "YES" as const,
    definition:
      "rankingCompatibilityGroup cannot be established from persisted evidence without guessing",
    rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
    view: "allowed",
    historyDisplay: "allowed",
    compareDescriptively: "allowed",
    resumeJob: "allowed only if job lifecycle itself is resumable (seenHashes/PRNG unchanged)",
    participateInNewRanking: "NO",
    participateInNewGroupChampion: "NO",
    participateInNewFinalRecommendation: "NO",
    newPromotion: "NO",
    alreadyPromoted: "untouched",
    architectureCompatible: true,
    whyCompatible: [
      "Resume generation uniqueness is paramsHash, not family",
      "View/list already renders trials without requiring family",
      "Promotion is explicit jobId+iteration — adding a group gate is additive",
      "No trial rewrite required — classification is rank-time",
    ],
    representation: {
      rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
      rankingEligible: false,
      promotionEligible: false,
      provenanceStatus: "legacy_unclassified",
    },
  };
}

export interface AuthorityTrial {
  id: string;
  paramsHash: string;
  score: number;
  passed: boolean;
  class: LegacyClass;
  provenance: "LEGACY" | "NEW";
}

export function groupResumeFixture(trials: AuthorityTrial[]) {
  const safe: AuthorityTrial[] = [];
  const pattern: AuthorityTrial[] = [];
  const unknown: AuthorityTrial[] = [];
  for (const trial of trials) {
    if (trial.class === "UNKNOWN_LEGACY") {
      unknown.push(trial);
      continue;
    }
    if (trial.class === "PROVEN_SAFE") safe.push(trial);
    else pattern.push(trial);
  }
  const pickBest = (rows: AuthorityTrial[]) => {
    let best: AuthorityTrial | null = null;
    for (const row of rows) {
      if (isBetterScore(best?.score ?? null, row.score)) best = row;
    }
    return best;
  };
  return {
    SAFE: {
      members: safe.map((t) => t.id),
      champion: pickBest(safe)?.id ?? null,
    },
    PATTERN: {
      members: pattern.map((t) => t.id),
      champion: pickBest(pattern)?.id ?? null,
    },
    UNKNOWN: {
      members: unknown.map((t) => t.id),
      champion: null,
      rankingEligible: false,
    },
  };
}

export function makeResumeUnknownFixture() {
  const trials: AuthorityTrial[] = [
    {
      id: "legacy_safe",
      paramsHash: "ls1",
      score: 0.5,
      passed: true,
      class: "PROVEN_SAFE",
      provenance: "LEGACY",
    },
    {
      id: "legacy_pattern",
      paramsHash: "lp1",
      score: 0.52,
      passed: true,
      class: "PROVEN_PATTERN",
      provenance: "LEGACY",
    },
    {
      id: "unknown_legacy",
      paramsHash: "u1",
      score: 0.99,
      passed: true,
      class: "UNKNOWN_LEGACY",
      provenance: "LEGACY",
    },
    {
      id: "new_safe",
      paramsHash: "ns1",
      score: 0.55,
      passed: true,
      class: "PROVEN_SAFE",
      provenance: "NEW",
    },
    {
      id: "new_pattern",
      paramsHash: "np1",
      score: 0.51,
      passed: true,
      class: "PROVEN_PATTERN",
      provenance: "NEW",
    },
  ];
  return { trials, grouped: groupResumeFixture(trials) };
}

export function getGlobalBestConsumers() {
  return {
    fields: ["bestCandidate", "bestPassedCandidate", "bestScore"],
    writes: [
      {
        file: "jobRunner.ts",
        kind: "RUNNER_CONTROL" as BestConsumerKind,
        note: "isBetterScore updates both best slots; persist via buildPersistedCheckpoint",
        hiddenGlobalChampion: true,
      },
      {
        file: "jobStatistics.recordEvaluation",
        kind: "RUNNER_CONTROL" as BestConsumerKind,
        note: "bestScore = max score across all evaluations",
        hiddenGlobalChampion: true,
      },
      {
        file: "jobRecordRecovery.ts",
        kind: "CHECKPOINT_RECOVERY" as BestConsumerKind,
        note: "rebuilds global best from all trial.score",
        hiddenGlobalChampion: true,
      },
      {
        file: "jobStore.createSearchJob",
        kind: "CHECKPOINT_RECOVERY" as BestConsumerKind,
        note: "initializes both best slots to null",
        hiddenGlobalChampion: false,
      },
      {
        file: "jobCheckpoint.buildPersistedCheckpoint",
        kind: "CHECKPOINT_RECOVERY" as BestConsumerKind,
        note: "serializes scalar best fields",
        hiddenGlobalChampion: false,
      },
      {
        file: "searchOrchestrator reopen payload statistics.bestScore=null",
        kind: "OTHER" as BestConsumerKind,
        hiddenGlobalChampion: false,
      },
    ],
    reads: [
      {
        file: "jobRunner.ts resume seed",
        kind: "RUNNER_CONTROL" as BestConsumerKind,
        hiddenGlobalChampion: true,
      },
      {
        file: "jobApiService.ts bestScore / bestCandidateHash / detail checkpoint",
        kind: "API_RESPONSE" as BestConsumerKind,
        hiddenGlobalChampion: true,
      },
      {
        file: "researchResultsSummary.ts liveRef = bestPassed ?? bestCandidate",
        kind: "SUMMARY" as BestConsumerKind,
        hiddenGlobalChampion: true,
      },
      {
        file: "agent/v2/tools/readHandlers.ts",
        kind: "API_RESPONSE" as BestConsumerKind,
        hiddenGlobalChampion: true,
      },
      {
        file: "components/rextora/strategySearch types + JobCreate/status cards",
        kind: "UI_DISPLAY" as BestConsumerKind,
        hiddenGlobalChampion: true,
      },
      {
        file: "promoteFromSearch.ts",
        kind: "PROMOTION" as BestConsumerKind,
        note: "does NOT read checkpoint.bestCandidate — uses explicit iteration",
        hiddenGlobalChampion: false,
      },
    ],
    hiddenGlobalChampionRisk:
      "YES — continuing to update scalars with family-agnostic isBetterScore recreates a hidden global champion even if group maps exist (BEST-A).",
  };
}

export function getGroupBestStateDesign() {
  return {
    recommendedName: "bestByCompatibilityGroup",
    serialization: "array of fixed group rows (matches spaces/promotions), not a free-form map",
    type: {
      bestByCompatibilityGroup: [
        {
          rankingCompatibilityGroup: GROUP_SAFE,
          bestCandidate: "StrategySearchBestCandidateReference | null",
          bestPassedCandidate: "StrategySearchBestCandidateReference | null",
          bestScore: "number | null",
        },
        {
          rankingCompatibilityGroup: GROUP_PATTERN,
          bestCandidate: "StrategySearchBestCandidateReference | null",
          bestPassedCandidate: "StrategySearchBestCandidateReference | null",
          bestScore: "number | null",
        },
      ],
    },
    unknownHasCompetitiveBest: false,
    deterministicOrder: [GROUP_SAFE, GROUP_PATTERN],
    namingRationale:
      "Keeps bestCandidate/bestPassedCandidate/bestScore nouns. Array serialization matches plan.spaces. Do not use Record<string,...> as primary persist shape.",
  };
}

export function getBestStateModelComparison() {
  return {
    BEST_A: {
      name: "Keep updating global scalars and add group maps",
      assessment: "Rejected — preserves hidden global champion via isBetterScore on scalars.",
    },
    BEST_B: {
      name: "Group map authoritative for new provenance-aware jobs; scalars read-compatibility only",
      assessment:
        "Selected — old checkpoints remain readable; new writes do not update scalars from cross-group compares; scalars may stay last-known display/history or null on brand-new jobs.",
    },
    BEST_C: {
      name: "Delete scalar fields immediately",
      assessment: "Rejected — breaks historical checkpoint loading and API/UI readers.",
    },
    BEST_D: {
      name: "Rewrite historical checkpoints now",
      assessment: "Rejected — historical rewrite forbidden.",
    },
    RECOMMENDED_BEST_STATE_MODEL: "BEST-B" as const,
  };
}

export function recoverOldCheckpoint(input: {
  bestCandidate: StrategySearchBestCandidateReference | null;
  bestPassedCandidate: StrategySearchBestCandidateReference | null;
  bestScore: number | null;
  trialParamsByIteration: Record<number, Record<string, unknown> | null>;
}) {
  const seedGroup = (
    ref: StrategySearchBestCandidateReference | null,
  ): RankingCompatibilityGroupId | null => {
    if (!ref) return null;
    const params = input.trialParamsByIteration[ref.iteration] ?? null;
    const classified = classifyTrialFromPersistedEvidence({ params });
    return classified.groupReconstructable
      ? classified.rankingCompatibilityGroup
      : GROUP_UNKNOWN_LEGACY;
  };
  const bestGroup = seedGroup(input.bestCandidate);
  const passedGroup = seedGroup(input.bestPassedCandidate);
  const groupBest = {
    [GROUP_SAFE]: {
      bestCandidate: null as StrategySearchBestCandidateReference | null,
      bestPassedCandidate: null as StrategySearchBestCandidateReference | null,
      bestScore: null as number | null,
    },
    [GROUP_PATTERN]: {
      bestCandidate: null as StrategySearchBestCandidateReference | null,
      bestPassedCandidate: null as StrategySearchBestCandidateReference | null,
      bestScore: null as number | null,
    },
  };
  if (bestGroup === GROUP_SAFE || bestGroup === GROUP_PATTERN) {
    groupBest[bestGroup].bestCandidate = input.bestCandidate;
    groupBest[bestGroup].bestScore = input.bestCandidate?.score ?? null;
  }
  if (passedGroup === GROUP_SAFE || passedGroup === GROUP_PATTERN) {
    groupBest[passedGroup].bestPassedCandidate = input.bestPassedCandidate;
  }
  return {
    readable: true,
    inMemoryOnlyUntilNextPersist: true,
    rewriteHistoricalCheckpoint: false,
    groupBest,
    unknownScalarSeedsCompetitiveGroup:
      bestGroup === GROUP_UNKNOWN_LEGACY ? false : bestGroup != null,
    displayScalarPreserved: {
      bestCandidate: input.bestCandidate,
      bestPassedCandidate: input.bestPassedCandidate,
      bestScore: input.bestScore,
    },
    rule:
      "Reconstruct group from stored candidate iteration → trial.params. Populate in-memory groupBest only. Do not write migration until the next natural checkpoint persist. If group is unknown, scalar remains display/history only and does not seed a competitive group.",
  };
}

export function getTop10Formula() {
  return {
    TOP10_SCORE_FORMULA:
      "netReturn*100 - abs(maxDrawdown)*40 + profitFactor*5 + min(tradeCount,50)*0.1",
    file: "src/lib/rextora/strategySearch/researchTop10.ts",
    function: "compositeScore / selectResearchTop10",
    inputs: ["netReturn", "maxDrawdown", "profitFactor", "tradeCount", "recommendable"],
    filtering: "recommendable subset for 안정/최종 추천/백테스트 추천; remainder may fill",
    tieBreakers: "stability: lower |mdd| then higher profitFactor; otherwise array sort stability",
    ordering: [
      "highest netReturn → TOP 수익",
      "lowest |mdd| among recommendable → TOP 안정",
      "highest Top10 composite among recommendable → 최종 추천",
      "fill remaining recommendable by same composite",
      "fill leftover slots by composite among all reps",
    ],
    usesTrialScore: false,
    usesStressJitterBonus: false,
    persisted: true,
    persistPath: "jobs/<jobId>.top10.json",
    promotionDepends: false,
    futureRole:
      "DISPLAY-ONLY group-scoped shortlist. Must not assign champion/최종 추천 from its own composite. Badge binds to CHAMP-A group bestPassed.",
  };
}

export function getResultsSummaryFormula() {
  return {
    RESULTS_SUMMARY_SCORE_FORMULA:
      "(score ?? netReturn*2 - abs(maxDrawdown) + profitFactor*0.1) + (stressPassed?0.05:0) + (jitterPassed?0.05:0)",
    file: "src/lib/rextora/strategySearch/researchResultsSummary.ts",
    function: "compositeScore",
    inputs: [
      "netReturn",
      "maxDrawdown",
      "profitFactor",
      "trial.score",
      "stressPassed",
      "jitterPassed",
    ],
    filtering: "unique passed reps after clustering; recommendable for 최종 추천",
    bonuses: "+0.05 stressPassed, +0.05 jitterPassed",
    tieBreakers: "strict greater-than on composite; first remaining if equal",
    ordering: "representatives sorted by composite; 최종 추천 = max among recommendable",
    finalRecommendationMeaning:
      "Display role badge on the highest-summary-composite recommendable representative — not promotion authority",
    promotionDepends: false,
    futureRole:
      "DISPLAY-ONLY clustering/summary. Keep formula unchanged. Must not own champion. 최종 추천 label binds to CHAMP-A group champion.",
  };
}

export function proveFormulaDivergence() {
  const a = {
    id: "A",
    netReturn: 0.1,
    maxDrawdown: -0.05,
    profitFactor: 1.2,
    tradeCount: 5,
    score: 0.4,
    stressPassed: false,
    jitterPassed: false,
    recommendable: true,
  };
  const b = {
    id: "B",
    netReturn: 0.08,
    maxDrawdown: -0.1,
    profitFactor: 1.0,
    tradeCount: 40,
    score: 0.5,
    stressPassed: true,
    jitterPassed: true,
    recommendable: true,
  };
  const top10 = (c: typeof a) =>
    c.netReturn * 100 -
    Math.abs(c.maxDrawdown) * 40 +
    c.profitFactor * 5 +
    Math.min(c.tradeCount, 50) * 0.1;
  const summary = (c: typeof a) => {
    const base = c.score ?? c.netReturn * 2 - Math.abs(c.maxDrawdown) + c.profitFactor * 0.1;
    return (
      base +
      (c.stressPassed ? 0.05 : 0) +
      (c.jitterPassed ? 0.05 : 0)
    );
  };
  return {
    RECOMMENDATION_FORMULA_DIVERGENCE: "PROVEN" as const,
    a: { top10: top10(a), summary: summary(a) },
    b: { top10: top10(b), summary: summary(b) },
    top10Order: top10(a) > top10(b) ? "A > B" : "B >= A",
    summaryOrder: summary(b) > summary(a) ? "B > A" : "A >= B",
  };
}

export function getPromotionAuthority() {
  return {
    CURRENT_PROMOTION_SELECTION_AUTHORITY:
      "explicit operator jobId + iteration (promoteSearchCandidateToStrategy / promoteSelectedTrialsFromJob)",
    requiresTop10Winner: false,
    requiresResultsSummaryFinalRecommendation: false,
    requiresCheckpointBestCandidate: false,
    automatic: false,
    AUTO_PROMOTION_CHANGED: "NO" as const,
    eligibleToday: "trial.passed (Final PASS) and non-protected paramsHash",
  };
}

export function getChampionTerminology() {
  return {
    terms: [
      {
        term: "bestCandidate / bestPassedCandidate / bestScore",
        role: "ranking authority today (global) + API/UI display",
      },
      {
        term: "실시간 탐색 최고",
        role: "display-only label from checkpoint best",
      },
      {
        term: "TOP 수익 / TOP 안정 / 최종 추천 / 백테스트 추천",
        role: "display-only role badges from Top10/Summary formulas — not promotion evidence",
      },
      {
        term: "Top-10",
        role: "persisted display shortlist",
      },
      {
        term: "recommendable / 추천 전략",
        role: "display/eligibility label; operator still chooses iteration",
      },
      {
        term: "champion",
        role: "not a persisted field; forensic/design term only",
      },
      {
        term: "promoteFromSearch",
        role: "promotion evidence — explicit selected trial",
      },
    ],
  };
}

export function getChampionModelComparison() {
  return {
    CHAMP_A: {
      name: "jobRunner trial.score / isBetterScore",
      assessment:
        "Selected — already persisted on every trial; already checkpoint/resume authority; deterministic; no formula change.",
    },
    CHAMP_B: {
      name: "researchTop10 composite",
      assessment:
        "Rejected — different formula, ignores trial.score/stress/jitter; would create a second winner vs checkpoint.",
    },
    CHAMP_C: {
      name: "researchResultsSummary compositeScore",
      assessment:
        "Rejected — diverges from Top10 and from raw trial.score; display/clustering only.",
    },
    CHAMP_D: {
      name: "no automatic champion",
      assessment:
        "Compatible with promotion (already explicit) but contradicts frozen one-champion-per-group. Not selected.",
    },
    CHAMP_E: {
      name: "qualifiedHashes[-1]",
      assessment: "Rejected — insertion order, not score.",
    },
    RECOMMENDED_GROUP_CHAMPION_AUTHORITY: "CHAMP-A" as const,
    GLOBAL_CHAMPION_ALLOWED_BEFORE_PARITY: "NO" as const,
    groupChampionMeaning:
      "Within one rankingCompatibilityGroup, the trial with the better trial.score via isBetterScore. bestPassedCandidate is the group champion used as recommendation evidence. Promotion remains operator-explicit.",
  };
}

export function getQualifiedHashesMisuse() {
  return {
    function: "searchOrchestrator.recordGenerationForSpace",
    code: "plan.qualifiedHashes[plan.qualifiedHashes.length - 1]",
    impact:
      "Weakness analysis / next-space mutation uses last insertion, not highest score, and mixes families.",
    futureRole:
      "paramsHash qualification set/list only. Never ordering authority. Group best comes from CHAMP-A selector.",
  };
}

export function getFutureRankingResponse() {
  return {
    rankingGroups: [
      {
        rankingCompatibilityGroup: GROUP_SAFE,
        engineCostModel: GROUP_SAFE,
        rankingEligible: true,
        bestCandidate: null,
        bestPassedCandidate: null,
        topCandidates: [],
      },
      {
        rankingCompatibilityGroup: GROUP_PATTERN,
        engineCostModel: GROUP_PATTERN,
        rankingEligible: true,
        bestCandidate: null,
        bestPassedCandidate: null,
        topCandidates: [],
      },
    ],
    unknownLegacy: {
      rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
      rankingEligible: false,
      promotionEligible: false,
      provenanceStatus: "legacy_unclassified",
      trials: [],
    },
    noTopLevelAuthoritativeBest: true,
    historyFlatList: "allowed for display only",
  };
}

export function getPromotionGate() {
  return {
    newTrials: [
      "existing Final PASS rules",
      "rankingCompatibilityGroup known (not unknown_legacy)",
      "researchEvaluationHash present",
      "engineCostModel present",
      "evaluation provenance present",
    ],
    historicalReconstructed:
      "allowed if PROVEN_SAFE or PROVEN_PATTERN from params shape AND job execution profile exists so reconstructed evidence can be attached without rewriting the trial",
    unknownLegacy: "promotion MUST be blocked",
    alreadyPromoted: "untouched; no automatic invalidation",
  };
}

export function getIdentitySeparation() {
  return {
    paramsHash: "strategy-parameter identity — unchanged",
    researchEvaluationHash: "evaluation identity — costs + engine + data context",
    rankingCompatibilityGroup: "score comparability key",
    groupChampionSelector: "CHAMP-A isBetterScore within group",
    promotion: "explicit operator action using selected evaluation evidence",
    collapsed: false,
  };
}

export function getFrozenFinalContract(cwd = process.cwd()) {
  const samples = sampleHistoricalTrials(cwd);
  const divergence = proveFormulaDivergence();
  const unresolved: string[] = [];
  if (samples.safe.length < 5) unresolved.push("fewer than 5 SAFE samples");
  if (samples.pattern.length < 5) unresolved.push("fewer than 5 Pattern samples");
  if (samples.unknown.length < 5) unresolved.push("fewer than 5 UNKNOWN samples");
  if (divergence.RECOMMENDATION_FORMULA_DIVERGENCE !== "PROVEN") {
    unresolved.push("formula divergence not proven");
  }
  return {
    P3_A7_2_READY: unresolved.length === 0 ? ("YES" as const) : ("NO" as const),
    unresolved,
    A_unknownClassificationEvidence:
      "priority: explicit model/type (future) → trial.params shape → else UNKNOWN_LEGACY. Never paramsHash/score/iteration/current space.",
    B_unknownPolicy: getUnknownLegacyPolicy(),
    C_groupBestStateType: getGroupBestStateDesign(),
    D_legacyGlobalScalarPolicy: "BEST-B — scalars read-compatibility only; not updated from cross-group compares",
    E_oldCheckpointRecovery:
      "load scalars; reconstruct group from trial.params at stored iteration; in-memory groupBest only; unknown scalar does not seed competitive group; no historical rewrite",
    F_canonicalChampionAuthority: "CHAMP-A trial.score / isBetterScore per group",
    G_top10FutureRole: "display-only group-scoped shortlist; formula unchanged; no champion authority",
    H_resultsSummaryFutureRole:
      "display-only clustering/summary; formula unchanged; 최종 추천 badge binds to CHAMP-A",
    I_qualifiedHashesFutureRole: "paramsHash qualification set only; never best authority",
    J_promotionSelectionAuthority: "explicit operator jobId+iteration",
    K_promotionProvenanceGate: getPromotionGate(),
    L_noGlobalChampionBeforeParity: true,
    AUTO_PROMOTION_CHANGED: "NO",
    implementationFiles: [
      "src/lib/rextora/strategySearch/types.ts — additive bestByCompatibilityGroup + optional trial identity fields",
      "NEW src/lib/rextora/strategySearch/researchEvaluationIdentity.ts — hash, classify, group selector",
      "src/lib/rextora/strategySearch/jobCheckpoint.ts — persist/load additive groupBest; keep scalar fields",
      "src/lib/rextora/strategySearch/jobRunner.ts — CHAMP-A updates per group; do not cross-compare scalars",
      "src/lib/rextora/strategySearch/jobStatistics.ts — keep isBetterScore math; callers pass group-local currentBest",
      "src/lib/rextora/strategySearch/jobRecordRecovery.ts — reconstruct groupBest in memory; no trial rewrite",
      "src/lib/rextora/strategySearch/searchOrchestrator.ts — stop qualifiedHashes[-1] as best; use group selector",
      "src/lib/rextora/strategySearch/backtestAdapter.ts — stamp engineCostModel (no arithmetic change)",
      "src/lib/rextora/strategySearch/researchTop10.ts — group-scope lists; do not own 최종 추천",
      "src/lib/rextora/strategySearch/researchResultsSummary.ts — group-scope display; bind 최종 추천 to CHAMP-A",
      "src/lib/rextora/strategySearch/promoteFromSearch.ts — known-group + provenance gate; no auto-promote",
      "src/lib/rextora/strategySearch/jobApiService.ts — additive rankingGroups; scalars compatibility-only",
    ],
    productionMigrationRequired: "NO",
  };
}

export function buildP3A712Diagnosis(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  return {
    hashes,
    evidence: getClassificationEvidencePriority(),
    samples: sampleHistoricalTrials(cwd),
    unknownPolicy: getUnknownLegacyPolicy(),
    resumeFixture: makeResumeUnknownFixture(),
    globalBest: getGlobalBestConsumers(),
    groupBest: getGroupBestStateDesign(),
    bestModels: getBestStateModelComparison(),
    oldCheckpoint: recoverOldCheckpoint({
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
      trialParamsByIteration: {
        0: { ema_fast: 10, sl_atr_mult: 1.5 },
      },
    }),
    unknownOldCheckpoint: recoverOldCheckpoint({
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
    }),
    top10: getTop10Formula(),
    summary: getResultsSummaryFormula(),
    divergence: proveFormulaDivergence(),
    promotion: getPromotionAuthority(),
    terminology: getChampionTerminology(),
    champModels: getChampionModelComparison(),
    qualifiedMisuse: getQualifiedHashesMisuse(),
    rankingResponse: getFutureRankingResponse(),
    promotionGate: getPromotionGate(),
    identity: getIdentitySeparation(),
    frozen: getFrozenFinalContract(cwd),
    productionSafety: {
      researchExecutions: 0,
      paperLiveActions: 0,
      orders: 0,
    },
  };
}

export function writeP3A712Artifacts(cwd = process.cwd()) {
  const diagnosis = buildP3A712Diagnosis(cwd);
  const dir = path.join(
    cwd,
    ".validation",
    "research-p3-a7-1-2-ranking-authority",
    P3A712_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const files: Record<string, unknown> = {
    "legacy-classification-evidence.json": diagnosis.evidence,
    "legacy-sample-classification.json": diagnosis.samples,
    "unknown-legacy-policy.json": diagnosis.unknownPolicy,
    "resume-unknown-fixture.json": diagnosis.resumeFixture,
    "global-best-consumers.json": diagnosis.globalBest,
    "group-best-state-design.json": diagnosis.groupBest,
    "legacy-best-policy.json": diagnosis.bestModels,
    "old-checkpoint-recovery.json": {
      classifiable: diagnosis.oldCheckpoint,
      unknown: diagnosis.unknownOldCheckpoint,
    },
    "top10-formula.json": diagnosis.top10,
    "results-summary-formula.json": diagnosis.summary,
    "formula-divergence.json": diagnosis.divergence,
    "promotion-authority.json": diagnosis.promotion,
    "champion-terminology.json": diagnosis.terminology,
    "champion-model-comparison.json": diagnosis.champModels,
    "qualified-hashes-best-misuse.json": diagnosis.qualifiedMisuse,
    "future-ranking-response.json": diagnosis.rankingResponse,
    "promotion-gate.json": diagnosis.promotionGate,
    "p3-a7-2-final-contract.json": diagnosis.frozen,
    "production-readonly-hashes.json": diagnosis.hashes,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  }
  return { dir, diagnosis };
}

export function productionSafetySnapshot(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  return {
    ...hashes,
    safeSha256Now: sha256File(path.join(cwd, "data/strategies", RETIRED_SAFE_FILE_NAME)),
    researchExecutions: 0,
    paperLiveActions: 0,
    orders: 0,
  };
}
