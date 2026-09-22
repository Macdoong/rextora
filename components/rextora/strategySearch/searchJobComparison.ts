/**
 * Read-model for customer Strategy Search job-to-job comparison.
 * Uses results-summary + job detail only. Does not read trial files,
 * rank across compatibility groups, or declare a winner.
 */

import { rankingGroupLabel } from "@/src/lib/rextora/researchRankingReadModel";
import { formatCustomerSearchValue } from "./customerDisplay";
import { formatMs, formatScore, formatTimeKo } from "./formatters";
import { displayJobSearchTitle } from "./jobDisplayName";
import type {
  ResearchResultsSummaryView,
  StrategySearchJobDetail,
  StrategySearchJobSummary,
} from "./types";

export const SEARCH_JOB_COMPARE_PATH = "/strategy-search/compare";
export const COMPARABLE_SEARCH_JOB_STATUS = "completed" as const;
export const INCOMPARABLE_JOB_COPY = "정상 완료된 탐색만 비교할 수 있습니다.";
export const SAME_JOB_COMPARE_COPY = "같은 탐색은 서로 비교할 수 없습니다.";
export const NEED_TWO_JOBS_COPY = "비교하려면 정상 완료된 탐색이 2건 이상 필요합니다.";
export const NO_SHARED_GROUP_COPY = "비교 가능한 동일 전략군 없음";

export type CompareTone = "same" | "different" | "unavailable";

export type CompareSide = "left" | "right";

export type SearchJobCompareIdentity = {
  jobId: string;
  searchName: string;
  symbol: string;
  timeframe: string;
  completedAt: string | null;
  elapsedLabel: string;
};

export type SearchJobCompareRow = {
  id: string;
  label: string;
  left: string;
  right: string;
  tone: CompareTone;
};

export type SearchJobCompareCandidate = {
  label: string;
  passed: boolean;
  scoreLabel: string;
  present: boolean;
};

export type SearchJobCompareGroup = {
  groupId: string;
  groupLabel: string;
  comparable: boolean;
  leftRecommended: SearchJobCompareCandidate;
  rightRecommended: SearchJobCompareCandidate;
  leftRawBest: SearchJobCompareCandidate;
  rightRawBest: SearchJobCompareCandidate;
};

export type SearchJobCompareModel = {
  left: SearchJobCompareIdentity;
  right: SearchJobCompareIdentity;
  overview: SearchJobCompareRow[];
  settings: SearchJobCompareRow[];
  funnel: SearchJobCompareRow[];
  costRisk: SearchJobCompareRow[];
  groups: SearchJobCompareGroup[];
  hasSharedComparableGroup: boolean;
};

const SETTINGS_SECTION_IDS = new Set([
  "target",
  "period",
  "strategy_scope",
  "engine",
  "pattern_config",
  "validation",
]);
const COST_SECTION_IDS = new Set(["risk", "validation"]);

const SETTING_LABELS = [
  "심볼",
  "타임프레임",
  "분석 구간 시작",
  "분석 구간 종료",
  "깊이 프로필",
  "합격 프로필",
  "탐색 이름",
  "시장 모드",
  "활성 전략 패밀리",
];

const COST_LABELS = [
  "최대 낙폭 기준",
  "최소 거래",
  "최소 수익",
  "수수료",
  "슬리피지",
  "비용 스트레스",
  "거래 안정성(지터)",
  "레버리지 모드",
  "레버리지 값",
];

export function isComparableSearchJobStatus(
  status: string | null | undefined,
): boolean {
  return status === COMPARABLE_SEARCH_JOB_STATUS;
}

export function comparableSearchJobs<T extends { status: string }>(
  jobs: readonly T[],
): T[] {
  return jobs.filter((job) => isComparableSearchJobStatus(job.status));
}

export function buildSearchCompareHref(input: {
  left?: string | null;
  right?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.left) params.set("left", input.left);
  if (input.right) params.set("right", input.right);
  const qs = params.toString();
  return qs ? `${SEARCH_JOB_COMPARE_PATH}?${qs}` : SEARCH_JOB_COMPARE_PATH;
}

export function compareTone(left: string, right: string): CompareTone {
  if (left === "—" && right === "—") return "unavailable";
  return left === right ? "same" : "different";
}

export function safeRate(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return numerator / denominator;
}

export function formatRate(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function identityFromSources(
  job: StrategySearchJobDetail,
  summary: ResearchResultsSummaryView,
): SearchJobCompareIdentity {
  const symbol = summary.symbol || job.symbols[0] || "—";
  const timeframe = summary.timeframe || job.timeframe || "—";
  return {
    jobId: job.id,
    searchName: displayJobSearchTitle({
      id: job.id,
      searchName: summary.searchName || job.searchName,
      symbols: job.symbols,
      timeframe: job.timeframe,
    }),
    symbol,
    timeframe,
    completedAt: formatTimeKo(job.finishedAt),
    elapsedLabel: formatMs(job.elapsedMs) ?? "—",
  };
}

function row(
  id: string,
  label: string,
  left: string,
  right: string,
): SearchJobCompareRow {
  return { id, label, left, right, tone: compareTone(left, right) };
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.trunc(value).toLocaleString("ko-KR");
}

function summaryRowValue(
  summary: StrategySearchJobDetail["appliedSearchSummary"],
  sectionIds: Set<string>,
  labelKo: string,
): string {
  const sections = summary?.sections ?? [];
  for (const section of sections) {
    if (!sectionIds.has(section.id)) continue;
    const found = section.rows.find((item) => item.labelKo === labelKo);
    if (found) return formatCustomerSearchValue(found.valueKo);
  }
  return "—";
}

function candidateView(
  label: string,
  candidate:
    | {
        score: number | null;
        passed: boolean;
      }
    | null
    | undefined,
): SearchJobCompareCandidate {
  if (!candidate) {
    return { label, passed: false, scoreLabel: "—", present: false };
  }
  return {
    label,
    passed: candidate.passed === true,
    scoreLabel: formatScore(candidate.score) ?? "—",
    present: true,
  };
}

function pairRankingGroups(
  left: ResearchResultsSummaryView["rankingGroups"],
  right: ResearchResultsSummaryView["rankingGroups"],
): SearchJobCompareGroup[] {
  const leftMap = new Map(
    (left ?? []).map((group) => [group.rankingCompatibilityGroup, group]),
  );
  const rightMap = new Map(
    (right ?? []).map((group) => [group.rankingCompatibilityGroup, group]),
  );
  const keys = [...new Set([...leftMap.keys(), ...rightMap.keys()])];
  return keys.map((groupId) => {
    const leftGroup = leftMap.get(groupId);
    const rightGroup = rightMap.get(groupId);
    const comparable = Boolean(leftGroup && rightGroup);
    return {
      groupId,
      groupLabel: rankingGroupLabel(groupId),
      comparable,
      leftRecommended: candidateView(
        "최종 추천 후보",
        leftGroup?.bestPassedCandidate ?? null,
      ),
      rightRecommended: candidateView(
        "최종 추천 후보",
        rightGroup?.bestPassedCandidate ?? null,
      ),
      leftRawBest: candidateView(
        "최고 점수 후보",
        leftGroup?.bestCandidate ?? null,
      ),
      rightRawBest: candidateView(
        "최고 점수 후보",
        rightGroup?.bestCandidate ?? null,
      ),
    };
  });
}

export function searchJobCompareEligibilityError(
  leftId: string | null | undefined,
  rightId: string | null | undefined,
): string | null {
  if (!leftId || !rightId) return null;
  if (leftId === rightId) return SAME_JOB_COMPARE_COPY;
  return null;
}

export function buildSearchJobComparison(input: {
  leftJob: StrategySearchJobDetail;
  rightJob: StrategySearchJobDetail;
  leftSummary: ResearchResultsSummaryView;
  rightSummary: ResearchResultsSummaryView;
}):
  | { ok: true; model: SearchJobCompareModel }
  | { ok: false; error: string } {
  if (!isComparableSearchJobStatus(input.leftJob.status)) {
    return { ok: false, error: INCOMPARABLE_JOB_COPY };
  }
  if (!isComparableSearchJobStatus(input.rightJob.status)) {
    return { ok: false, error: INCOMPARABLE_JOB_COPY };
  }
  if (input.leftJob.id === input.rightJob.id) {
    return { ok: false, error: SAME_JOB_COMPARE_COPY };
  }

  const left = identityFromSources(input.leftJob, input.leftSummary);
  const right = identityFromSources(input.rightJob, input.rightSummary);
  const leftCounts = input.leftSummary.counts;
  const rightCounts = input.rightSummary.counts;

  const settings = SETTING_LABELS.map((label) =>
    row(
      `setting-${label}`,
      label,
      summaryRowValue(input.leftJob.appliedSearchSummary, SETTINGS_SECTION_IDS, label),
      summaryRowValue(input.rightJob.appliedSearchSummary, SETTINGS_SECTION_IDS, label),
    ),
  ).filter((item) => item.left !== "—" || item.right !== "—");

  const costRisk = COST_LABELS.map((label) =>
    row(
      `cost-${label}`,
      label,
      summaryRowValue(input.leftJob.appliedSearchSummary, COST_SECTION_IDS, label),
      summaryRowValue(input.rightJob.appliedSearchSummary, COST_SECTION_IDS, label),
    ),
  ).filter((item) => item.left !== "—" || item.right !== "—");

  const groups = pairRankingGroups(
    input.leftSummary.rankingGroups,
    input.rightSummary.rankingGroups,
  );

  return {
    ok: true,
    model: {
      left,
      right,
      overview: [
        row("overview-name", "탐색 이름", left.searchName, right.searchName),
        row("overview-symbol", "시장", left.symbol, right.symbol),
        row("overview-timeframe", "시간봉", left.timeframe, right.timeframe),
        row(
          "overview-completed",
          "완료 시각",
          left.completedAt ?? "—",
          right.completedAt ?? "—",
        ),
        row("overview-elapsed", "소요 시간", left.elapsedLabel, right.elapsedLabel),
      ],
      settings,
      funnel: [
        row(
          "funnel-evaluated",
          "평가 후보",
          formatCount(leftCounts.evaluatedStrategies),
          formatCount(rightCounts.evaluatedStrategies),
        ),
        row(
          "funnel-qualified",
          "통과 후보",
          formatCount(leftCounts.qualifiedStrategies),
          formatCount(rightCounts.qualifiedStrategies),
        ),
        row(
          "funnel-final",
          "최종 적격",
          formatCount(leftCounts.stageFinalRecommendable),
          formatCount(rightCounts.stageFinalRecommendable),
        ),
        row(
          "funnel-top10",
          "저장 후보",
          formatCount(leftCounts.top10Saved),
          formatCount(rightCounts.top10Saved),
        ),
        row(
          "funnel-registered",
          "등록 전략",
          formatCount(leftCounts.registeredStrategies),
          formatCount(rightCounts.registeredStrategies),
        ),
        row(
          "funnel-pass-rate",
          "통과율",
          formatRate(
            safeRate(
              leftCounts.qualifiedStrategies,
              leftCounts.evaluatedStrategies,
            ),
          ),
          formatRate(
            safeRate(
              rightCounts.qualifiedStrategies,
              rightCounts.evaluatedStrategies,
            ),
          ),
        ),
        row(
          "funnel-final-rate",
          "최종 적격률",
          formatRate(
            safeRate(
              leftCounts.stageFinalRecommendable,
              leftCounts.evaluatedStrategies,
            ),
          ),
          formatRate(
            safeRate(
              rightCounts.stageFinalRecommendable,
              rightCounts.evaluatedStrategies,
            ),
          ),
        ),
        row("funnel-elapsed", "소요 시간", left.elapsedLabel, right.elapsedLabel),
      ],
      costRisk,
      groups,
      hasSharedComparableGroup: groups.some((group) => group.comparable),
    },
  };
}

export function compareSelectorLabel(job: StrategySearchJobSummary): string {
  const title = displayJobSearchTitle(job);
  const market = [job.symbols[0] || null, job.timeframe || null]
    .filter(Boolean)
    .join(" · ");
  const when = formatTimeKo(job.finishedAt);
  return [title, market || null, when].filter(Boolean).join(" · ");
}
