/**
 * Customer-safe completed analysis context for Strategy Search job detail API.
 * Presentation only — no scoring/ranking/qualification changes.
 */

import type { StrategySearchJob } from "./types";
import type { StrategySearchPlan } from "./searchPlan";
import { getJobExecutionProfile } from "./jobExecutionProfile";
import { getQualificationProfile, getSearchDepthProfile } from "./operatorProfiles";
import type { StrategySearchStoreOptions } from "./jobStore";

export type CompletedAnalysisContextApi = {
  symbol: string;
  timeframe: string;
  evaluationWindowLabel: string | null;
  evaluationStartUtc: string | null;
  evaluationEndUtc: string | null;
  searchApproachKo: string | null;
  completionReason: string | null;
  completionReasonLabelKo: string | null;
  passThresholds: {
    minTotalReturn: number | null;
    maxMdd: number | null;
    minTradeCount: number | null;
    minWinRate: number | null;
    minScore: number | null;
  };
  jitterEnabled: boolean | null;
};

function completionReasonLabelKo(
  reason: string | null | undefined,
): string | null {
  if (reason == null || reason === "") return null;
  switch (reason) {
    case "QUALIFIED_TARGET_REACHED":
      return "합격 목표 달성";
    case "MAX_CANDIDATE_BUDGET":
    case "MAX_ITERATIONS":
      return "탐색 반복 한도 도달";
    case "DEADLINE_REACHED":
    case "MAX_RUNTIME":
      return "탐색 시간 종료";
    case "HARD_SAFETY_LIMIT":
    case "RESOURCE_SAFETY_LIMIT":
      return "자원 안전 한도 도달";
    case "SEARCH_SPACE_EXHAUSTED":
      return "탐색 범위 소진";
    case "USER_CANCELLED":
    case "USER_STOPPED":
      return "사용자가 중지함";
    case "FATAL_ERROR":
    case "ENGINE_ERROR":
      return "오류로 종료";
    case "PAUSED":
      return "일시정지";
    default:
      return reason;
  }
}

function buildSearchApproachKo(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
): string | null {
  const parts: string[] = [];
  if (plan?.patternSelectionMode === "automatic") {
    parts.push("자동 전략 조합 탐색");
  } else if (plan?.patternSelectionMode === "manual") {
    parts.push("선택형 패턴 탐색");
  }
  if (plan?.qualificationProfile && plan.qualificationProfile !== "custom") {
    parts.push(getQualificationProfile(plan.qualificationProfile).labelKo);
  }
  if (plan?.depthProfile) {
    parts.push(getSearchDepthProfile(plan.depthProfile).labelKo);
  }
  if (plan?.qualifiedTarget != null) {
    parts.push(`목표 적격 ${plan.qualifiedTarget}개`);
  }
  if (parts.length === 0) {
    return job.config.strategyTemplateId ?? null;
  }
  return parts.join(" · ");
}

function primaryRequiredWindow(job: StrategySearchJob) {
  const windows = job.config.evaluationWindows ?? [];
  return (
    windows.find((w) => w.requiredForPass === true) ?? windows[0] ?? null
  );
}

function readPassThresholds(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
  store?: StrategySearchStoreOptions,
): CompletedAnalysisContextApi["passThresholds"] {
  try {
    const profile = getJobExecutionProfile(job.id, store);
    if (!profile) throw new Error("missing execution profile");
    const t = profile.passPolicy.thresholds;
    return {
      minTotalReturn: t.minTotalReturn ?? null,
      maxMdd: t.maxMdd ?? null,
      minTradeCount: t.minTradeCount ?? null,
      minWinRate: t.minWinRate ?? null,
      minScore: plan?.minScore ?? null,
    };
  } catch {
    const criteria = job.config.passCriteria;
    return {
      minTotalReturn: criteria?.minTotalReturn ?? null,
      maxMdd: criteria?.maxMdd ?? null,
      minTradeCount: criteria?.minTradeCount ?? null,
      minWinRate: null,
      minScore: plan?.minScore ?? null,
    };
  }
}

export function buildCompletedAnalysisContextApi(
  job: StrategySearchJob,
  plan: StrategySearchPlan | null,
  store?: StrategySearchStoreOptions,
): CompletedAnalysisContextApi | null {
  if (job.status !== "completed") return null;
  const window = primaryRequiredWindow(job);
  const startMs = window?.fromOpenTime;
  const endMs = window?.toOpenTime;
  return {
    symbol: job.config.symbols[0] ?? "—",
    timeframe: job.config.timeframe,
    evaluationWindowLabel: window?.label ?? null,
    evaluationStartUtc:
      startMs != null && Number.isFinite(startMs)
        ? new Date(startMs).toISOString()
        : null,
    evaluationEndUtc:
      endMs != null && Number.isFinite(endMs)
        ? new Date(endMs).toISOString()
        : null,
    searchApproachKo: buildSearchApproachKo(job, plan),
    completionReason: plan?.completionReason ?? null,
    completionReasonLabelKo: completionReasonLabelKo(
      plan?.completionReason ?? null,
    ),
    passThresholds: readPassThresholds(job, plan, store),
    jitterEnabled: job.config.jitter?.enabled ?? null,
  };
}
