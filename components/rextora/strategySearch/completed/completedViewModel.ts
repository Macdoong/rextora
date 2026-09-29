/**
 * Completed Strategy Search dashboard view model (presentation only).
 * Joins ranking authority to customer top10 metrics — no ranking logic changes.
 */

import { hasAuthoritativeRankingGroups } from "@/src/lib/rextora/researchRankingReadModel";
import { completionReasonLabelKo } from "../formatters";
import type {
  CompletedAnalysisContextView,
  ResearchResultsSummaryView,
  StrategySearchJobDetail,
  StrategySearchTrialsPage,
} from "../types";
import {
  buildCustomerCandidateLabel,
  formatTimeframeCustomerKo,
  strategyDescriptorWithoutMarket,
} from "./completedDisplayFormat";
import { finalizeCompareRowPresentation } from "./completedComparePresentation";
import { resolveCompletedQualifiedCount } from "./completedLoadingGate";

export type CompletedHeroTone =
  | "success"
  | "neutral"
  | "no-qualified"
  | "stopped"
  | "error";

export type CompletedTop10Entry = NonNullable<
  StrategySearchJobDetail["liveTop10"]
>["entries"][number];

export type CompletedRecommendationView = {
  candidateId: string;
  iteration: number;
  paramsHash: string;
  readableName: string;
  strategyFamily: string | null;
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  winRate: number | null;
  score: number | null;
  passed: true;
  rankingCompatibilityGroup: string;
};

export type CompletedCandidateCompareRow = {
  id: string;
  label: string;
  displayPrimary: string;
  displaySecondary: string | null;
  differentiatorChips: string[];
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  score: number | null;
  rankingCompatibilityGroup: string;
  rank: number;
  isRecommended: boolean;
};

export type CompletedQualificationCriterion = {
  id: string;
  label: string;
  thresholdLabel: string;
  resultLabel: string;
  met: boolean;
};

export type CompletedGroupRankingSummary = {
  totalGroups: number;
  withRecommendation: number;
  withoutRecommendation: number;
};

export type CompletedDashboardViewModel = {
  jobId: string;
  symbol: string;
  timeframe: string;
  analysisContext: CompletedAnalysisContextView | null;
  completionReason: string | null;
  completionReasonLabel: string | null;
  heroTone: CompletedHeroTone;
  heroTitle: string;
  heroMessage: string;
  elapsedMs: number | null;
  qualifiedCount: number;
  funnel: {
    generated: number | null;
    evaluated: number | null;
    passed: number | null;
    qualified: number;
  };
  passFail: { passed: number | null; failed: number | null };
  passRatePct: number | null;
  recommendation: CompletedRecommendationView | null;
  qualificationCriteria: CompletedQualificationCriterion[];
  minScoreEnabled: boolean;
  compareCandidates: CompletedCandidateCompareRow[];
  compareCommonStrategyContext: string | null;
  primaryRankingGroup: string | null;
  groupAware: boolean;
  groupRankingSummary: CompletedGroupRankingSummary | null;
  resultsHref: string;
  reviewAvailable: boolean;
  dataStable: boolean;
};

const STOP_REASONS = new Set([
  "USER_CANCELLED",
  "USER_STOPPED",
  "FATAL_ERROR",
  "ENGINE_ERROR",
  "CONFIGURATION_INVALID",
  "DATA_UNAVAILABLE",
  "RECOVERY_FAILED",
]);

const NEUTRAL_REASONS = new Set([
  "DEADLINE_REACHED",
  "MAX_RUNTIME",
  "MAX_CANDIDATE_BUDGET",
  "MAX_ITERATIONS",
  "HARD_SAFETY_LIMIT",
  "RESOURCE_SAFETY_LIMIT",
  "SEARCH_SPACE_EXHAUSTED",
]);

function top10Catalog(job: StrategySearchJobDetail): CompletedTop10Entry[] {
  const snap = job.liveTop10;
  if (!snap) return [];
  const finals = snap.finalEntries ?? [];
  if (finals.length > 0) return finals;
  return snap.entries ?? [];
}

function joinTop10Entry(
  catalog: CompletedTop10Entry[],
  paramsHash: string,
): CompletedTop10Entry | null {
  return (
    catalog.find((row) => row.strategyHash === paramsHash) ??
    catalog.find((row) => row.displayAlias === paramsHash) ??
    null
  );
}

export function resolveCompletedRecommendation(
  job: StrategySearchJobDetail,
): {
  ref: {
    candidateId: string;
    iteration: number;
    paramsHash: string;
    passed: boolean;
  };
  group: string;
} | null {
  const groups = job.rankingGroups ?? [];
  for (const group of groups) {
    const ref = group.bestPassedCandidate;
    if (ref && ref.passed === true) {
      return {
        ref: {
          candidateId: ref.candidateId,
          iteration: ref.iteration,
          paramsHash: ref.paramsHash,
          passed: true,
        },
        group: group.rankingCompatibilityGroup,
      };
    }
  }
  const scalar = job.checkpoint?.bestPassedCandidate;
  if (scalar && scalar.passed === true) {
    return {
      ref: {
        candidateId: scalar.candidateId,
        iteration: scalar.iteration,
        paramsHash: scalar.paramsHash,
        passed: true,
      },
      group: groups[0]?.rankingCompatibilityGroup ?? "safe_execution_price_v1",
    };
  }
  return null;
}

export function buildCompletedRecommendationView(
  job: StrategySearchJobDetail,
): CompletedRecommendationView | null {
  const resolved = resolveCompletedRecommendation(job);
  if (!resolved) return null;
  const catalog = top10Catalog(job);
  const row = joinTop10Entry(catalog, resolved.ref.paramsHash);
  return {
    candidateId: resolved.ref.candidateId,
    iteration: resolved.ref.iteration,
    paramsHash: resolved.ref.paramsHash,
    readableName: row?.readableName ?? row?.displayAlias ?? "추천 후보",
    strategyFamily: null,
    netReturn: row?.netReturn ?? null,
    maxDrawdown: row?.maxDrawdown ?? null,
    tradeCount: row?.tradeCount ?? null,
    winRate: row?.winRate ?? null,
    score:
      row?.score ??
      job.rankingGroups
        ?.find((g) => g.rankingCompatibilityGroup === resolved.group)
        ?.bestPassedCandidate?.score ??
      null,
    passed: true,
    rankingCompatibilityGroup: resolved.group,
  };
}

function resolveHero(
  job: StrategySearchJobDetail,
  qualifiedCount: number,
): Pick<CompletedDashboardViewModel, "heroTone" | "heroTitle" | "heroMessage"> {
  const reason = job.completionReason ?? null;
  const status = job.status;

  if (status === "paused" || reason === "PAUSED") {
    return {
      heroTone: "stopped",
      heroTitle: "전략 탐색 일시정지",
      heroMessage: "탐색이 일시정지되었습니다. 재개하거나 결과를 확인할 수 있습니다.",
    };
  }

  if (
    status === "cancelled" ||
    status === "cancel_requested" ||
    reason === "USER_CANCELLED" ||
    reason === "USER_STOPPED"
  ) {
    return {
      heroTone: "stopped",
      heroTitle: "전략 탐색 중지",
      heroMessage: "탐색이 중지되었습니다. 지금까지의 결과를 확인할 수 있습니다.",
    };
  }

  if (reason && STOP_REASONS.has(reason)) {
    return {
      heroTone: "error",
      heroTitle: "전략 탐색 종료",
      heroMessage:
        "탐색이 예상과 다르게 종료되었습니다. 아래 결과와 종료 사유를 확인하세요.",
    };
  }

  if (status === "failed") {
    return {
      heroTone: qualifiedCount > 0 ? "neutral" : "error",
      heroTitle: qualifiedCount > 0 ? "전략 탐색 부분 완료" : "전략 탐색 실패",
      heroMessage:
        qualifiedCount > 0
          ? "일부 결과는 확인할 수 있지만 탐색은 정상적으로 끝나지 않았습니다."
          : "탐색이 실패했습니다. 설정과 데이터 상태를 확인하세요.",
    };
  }

  if (qualifiedCount === 0) {
    return {
      heroTone: "no-qualified",
      heroTitle: "전략 탐색 완료",
      heroMessage:
        "탐색은 완료됐지만 현재 조건을 모두 충족한 후보는 없습니다.",
    };
  }

  if (reason === "QUALIFIED_TARGET_REACHED") {
    return {
      heroTone: "success",
      heroTitle: "전략 탐색 완료",
      heroMessage: "목표 조건을 만족하는 후보를 찾았습니다.",
    };
  }

  if (reason && NEUTRAL_REASONS.has(reason)) {
    return {
      heroTone: "neutral",
      heroTitle: "전략 탐색 완료",
      heroMessage: "탐색 한도에 도달해 현재까지의 결과를 정리했습니다.",
    };
  }

  return {
    heroTone: qualifiedCount > 0 ? "success" : "no-qualified",
    heroTitle: "전략 탐색 완료",
    heroMessage:
      qualifiedCount > 0
        ? "탐색이 완료되었습니다. 추천 후보와 결과를 확인하세요."
        : "탐색은 완료됐지만 현재 조건을 모두 충족한 후보는 없습니다.",
  };
}

export function buildCompareCandidatesForGroup(input: {
  job: StrategySearchJobDetail;
  groupId: string;
  limit?: number;
  recommendedParamsHash?: string | null;
}): CompletedCandidateCompareRow[] {
  const limit = input.limit ?? 6;
  const catalog = top10Catalog(input.job);
  const recHash = input.recommendedParamsHash ?? null;
  const group = input.job.rankingGroups?.find(
    (g) => g.rankingCompatibilityGroup === input.groupId,
  );
  const fromTop = (group?.topCandidates ?? []).slice(0, limit);
  const seenNames = new Map<string, number>();
  const meta: Array<{
    readableName?: string | null;
    displayAlias?: string | null;
    iteration?: number | null;
  }> = [];
  let baseRows: Omit<
    CompletedCandidateCompareRow,
    "displayPrimary" | "displaySecondary" | "differentiatorChips"
  >[] = [];

  if (fromTop.length > 0) {
    baseRows = fromTop.map((c, index) => {
      const row = joinTop10Entry(catalog, c.paramsHash);
      const rank = index + 1;
      meta.push({
        readableName: row?.readableName,
        displayAlias: row?.displayAlias,
        iteration: c.iteration,
      });
      return {
        id: `${c.iteration}-${c.paramsHash}`,
        label: buildCustomerCandidateLabel({
          readableName: row?.readableName,
          displayAlias: row?.displayAlias,
          rank,
          seenNames,
        }),
        netReturn: row?.netReturn ?? null,
        maxDrawdown: row?.maxDrawdown ?? null,
        tradeCount: row?.tradeCount ?? null,
        score: c.score ?? row?.score ?? null,
        rankingCompatibilityGroup: input.groupId,
        rank,
        isRecommended: recHash != null && c.paramsHash === recHash,
      };
    });
  } else {
    baseRows = catalog.slice(0, limit).map((row, index) => {
      const rank = index + 1;
      meta.push({
        readableName: row.readableName,
        displayAlias: row.displayAlias,
        iteration: null,
      });
      return {
        id: row.strategyHash || String(index),
        label: buildCustomerCandidateLabel({
          readableName: row.readableName,
          displayAlias: row.displayAlias,
          rank,
          seenNames,
        }),
        netReturn: row.netReturn,
        maxDrawdown: row.maxDrawdown,
        tradeCount: row.tradeCount ?? null,
        score: row.score ?? null,
        rankingCompatibilityGroup: input.groupId,
        rank,
        isRecommended: recHash != null && row.strategyHash === recHash,
      };
    });
  }

  return finalizeCompareRowPresentation(
    baseRows as CompletedCandidateCompareRow[],
    meta,
  );
}

function buildQualificationCriteria(
  job: StrategySearchJobDetail,
  recommendation: CompletedRecommendationView | null,
): CompletedQualificationCriterion[] {
  const ctx = job.completedAnalysisContext;
  const t = ctx?.passThresholds;
  const r = recommendation;
  if (!t || !r) return [];
  const rows: CompletedQualificationCriterion[] = [];
  if (t.minTotalReturn != null && r.netReturn != null) {
    rows.push({
      id: "minTotalReturn",
      label: "최소 수익률",
      thresholdLabel: `기준 ${(t.minTotalReturn * 100).toFixed(2)}%`,
      resultLabel: `결과 ${(r.netReturn * 100).toFixed(2)}%`,
      met: r.netReturn >= t.minTotalReturn,
    });
  }
  if (t.maxMdd != null && r.maxDrawdown != null) {
    const met = r.maxDrawdown >= t.maxMdd;
    rows.push({
      id: "maxMdd",
      label: "최대 낙폭",
      thresholdLabel: `기준 ${(Math.abs(t.maxMdd) * 100).toFixed(2)}%`,
      resultLabel: `결과 ${(Math.abs(r.maxDrawdown) * 100).toFixed(2)}%`,
      met,
    });
  }
  if (t.minTradeCount != null && r.tradeCount != null) {
    rows.push({
      id: "minTradeCount",
      label: "최소 거래수",
      thresholdLabel: `기준 ${t.minTradeCount}회`,
      resultLabel: `결과 ${r.tradeCount}회`,
      met: r.tradeCount >= t.minTradeCount,
    });
  }
  if (t.minWinRate != null && r.winRate != null) {
    rows.push({
      id: "minWinRate",
      label: "최소 승률",
      thresholdLabel: `기준 ${(t.minWinRate * 100).toFixed(2)}%`,
      resultLabel: `결과 ${(r.winRate * 100).toFixed(2)}%`,
      met: r.winRate >= t.minWinRate,
    });
  }
  if (ctx?.jitterEnabled === true && r.passed) {
    rows.push({
      id: "jitter",
      label: "안정성 검증",
      thresholdLabel: "지터 검증",
      resultLabel: "지터 검증 통과",
      met: true,
    });
  }
  return rows;
}

function buildCompareCommonStrategyContext(input: {
  symbol: string;
  timeframe: string;
  rows: CompletedCandidateCompareRow[];
}): string | null {
  const secondaries = input.rows
    .map((r) => r.displaySecondary?.trim())
    .filter((s): s is string => Boolean(s));
  if (secondaries.length < 2) return null;
  const first = secondaries[0];
  if (!secondaries.every((s) => s === first)) return null;
  const tf = formatTimeframeCustomerKo(input.timeframe);
  const descriptor = strategyDescriptorWithoutMarket({
    readableName: first,
    symbol: input.symbol,
    timeframe: input.timeframe,
  });
  return `${input.symbol} · ${tf} · ${descriptor}`;
}

function buildGroupRankingSummary(
  job: StrategySearchJobDetail,
): CompletedGroupRankingSummary | null {
  const groups = job.rankingGroups ?? [];
  if (groups.length === 0) return null;
  let withRecommendation = 0;
  for (const g of groups) {
    if (g.bestPassedCandidate?.passed === true) withRecommendation += 1;
  }
  return {
    totalGroups: groups.length,
    withRecommendation,
    withoutRecommendation: groups.length - withRecommendation,
  };
}

export function buildCompletedDashboardViewModel(input: {
  job: StrategySearchJobDetail;
  qualifiedCount?: number | null;
  payloadReady: boolean;
  trials?: StrategySearchTrialsPage | null;
  summary?: ResearchResultsSummaryView | null;
}): CompletedDashboardViewModel {
  const { job } = input;
  const stats = job.statistics;
  const resolvedQualified = resolveCompletedQualifiedCount({
    job,
    trials: input.trials ?? null,
    payloadReady: input.payloadReady,
  });
  const qualifiedCount = Math.max(0, resolvedQualified ?? 0);
  const recommendation = buildCompletedRecommendationView(job);
  const primaryRankingGroup =
    recommendation?.rankingCompatibilityGroup ??
    job.rankingGroups?.find((g) => g.bestPassedCandidate?.passed)?.rankingCompatibilityGroup ??
    job.rankingGroups?.[0]?.rankingCompatibilityGroup ??
    null;

  const compareCandidates = primaryRankingGroup
    ? buildCompareCandidatesForGroup({
        job,
        groupId: primaryRankingGroup,
        recommendedParamsHash: recommendation?.paramsHash ?? null,
      })
    : [];

  const hero = resolveHero(job, qualifiedCount);
  const evaluated =
    job.evaluatedCount ??
    job.uniqueEvaluatedCount ??
    stats?.evaluated ??
    null;
  const passed = job.gatePassedCount ?? stats?.passed ?? null;
  const failed = job.rejectedCount ?? stats?.failed ?? null;
  const evaluatedForRate = evaluated ?? 0;
  const passedForRate = passed ?? 0;
  const passRatePct =
    evaluatedForRate > 0 ? (passedForRate / evaluatedForRate) * 100 : null;
  const thresholds = job.completedAnalysisContext?.passThresholds;

  return {
    jobId: job.id,
    symbol: job.symbols?.[0] ?? "—",
    timeframe: job.timeframe ?? "—",
    analysisContext: job.completedAnalysisContext ?? null,
    completionReason: job.completionReason ?? null,
    completionReasonLabel: completionReasonLabelKo(job.completionReason ?? null),
    ...hero,
    elapsedMs: job.elapsedMs ?? stats?.elapsedMs ?? null,
    qualifiedCount,
    funnel: {
      generated: stats?.generated ?? null,
      evaluated,
      passed,
      qualified: qualifiedCount,
    },
    passFail: { passed, failed },
    passRatePct,
    recommendation,
    qualificationCriteria: buildQualificationCriteria(job, recommendation),
    minScoreEnabled: thresholds?.minScore != null,
    compareCandidates,
    compareCommonStrategyContext: buildCompareCommonStrategyContext({
      symbol: job.symbols?.[0] ?? "—",
      timeframe: job.timeframe ?? "—",
      rows: compareCandidates,
    }),
    primaryRankingGroup,
    groupAware: hasAuthoritativeRankingGroups(job),
    groupRankingSummary: buildGroupRankingSummary(job),
    resultsHref: `/results?jobId=${encodeURIComponent(job.id)}`,
    reviewAvailable: true,
    dataStable: input.payloadReady,
  };
}
