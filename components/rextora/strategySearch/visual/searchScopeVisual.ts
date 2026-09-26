import {
  HISTORICAL_PERIOD_PRESETS,
  isAutomaticQualifiedTargetMode,
  SEARCHABLE_PATTERN_SPACE_OPTIONS,
  SEARCHABLE_SPACE_OPTIONS,
  resolveQualifiedTarget,
  type HistoricalPeriodPresetId,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import { formatCustomerSearchValue } from "../customerDisplay";
import type { StrategySearchActivityEvent } from "../types";
import {
  DIRECT_LAYER_OPTIONS,
  periodPresetHint,
  supplementalDirectSpaceIds,
  visibleDirectLayerIds,
} from "./searchVisualCopy";

export const AUTOMATIC_SEARCH_SPACE_IDS = SEARCHABLE_SPACE_OPTIONS.map(
  (space) => space.id,
);

export const SEARCH_SCOPE_FLOW = [
  { id: "market", title: "시장 범위", keyword: "마켓" },
  { id: "families", title: "전략군", keyword: "탐색 공간" },
  { id: "candidates", title: "후보 조합", keyword: "생성" },
  { id: "history", title: "과거 검증", keyword: "평가" },
  { id: "cost", title: "비용/합격 검증", keyword: "필터" },
  { id: "top", title: "TOP 후보", keyword: "결과" },
] as const;

const TIMEFRAME_BAR_LABEL: Record<string, string> = {
  "1m": "1분봉",
  "3m": "3분봉",
  "5m": "5분봉",
  "15m": "15분봉",
  "1h": "1시간봉",
};

export function timeframeBarLabel(timeframe: string): string {
  return TIMEFRAME_BAR_LABEL[timeframe] ?? timeframe;
}

export function periodScopeLabel(preset: HistoricalPeriodPresetId): string {
  if (preset === "custom") return periodPresetHint(preset);
  return `${HISTORICAL_PERIOD_PRESETS[preset].days}일 검증`;
}

export function searchFamilyLabelKo(id: string): string {
  const auto = SEARCHABLE_SPACE_OPTIONS.find((space) => space.id === id);
  if (auto) return auto.labelKo;
  const visual = DIRECT_LAYER_OPTIONS.find((layer) => layer.id === id);
  if (visual) return visual.label;
  const pattern = SEARCHABLE_PATTERN_SPACE_OPTIONS.find(
    (space) => space.id === id,
  );
  if (pattern) return pattern.labelKo;
  return id;
}

/**
 * Engine search-space labels stay internal. User-facing Strategy Search copy
 * maps known engine aliases onto SEARCHABLE_SPACE_OPTIONS without changing ids.
 */
const ENGINE_FAMILY_LABEL_TO_ID: Record<string, string> = {
  "SAFE 종합": "full_safe",
  "EMA 추세": "ema_core",
  "RSI 되돌림": "rsi_pullback",
  "ATR 손익": "risk_exits",
};

export function presentSearchFamilyLabelKo(
  value?: string | null,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const formatted = formatCustomerSearchValue(trimmed);
  if (formatted !== trimmed) return formatted;
  const engineId = ENGINE_FAMILY_LABEL_TO_ID[trimmed];
  if (engineId) return searchFamilyLabelKo(engineId);
  const byUi = SEARCHABLE_SPACE_OPTIONS.find((space) => space.labelKo === trimmed);
  if (byUi) return byUi.labelKo;
  return trimmed;
}

export function visualizedAutomaticSpaceIds(): string[] {
  return [...AUTOMATIC_SEARCH_SPACE_IDS];
}

/** Manual scope chips: selected visual families plus proven risk_exits only. */
export function visualizedManualSpaceIds(
  selectedSpaceIds: readonly string[],
): string[] {
  return [
    ...visibleDirectLayerIds(selectedSpaceIds),
    ...supplementalDirectSpaceIds(selectedSpaceIds),
  ];
}

export function visualizedSearchSpaceIds(input: {
  automatic: boolean;
  selectedSpaceIds: readonly string[];
}): string[] {
  if (input.automatic) return visualizedAutomaticSpaceIds();
  return visualizedManualSpaceIds(input.selectedSpaceIds);
}

export function periodScopeDays(
  preset: HistoricalPeriodPresetId,
): number | null {
  if (preset === "custom") return null;
  return HISTORICAL_PERIOD_PRESETS[preset].days;
}

export function costStressChannels(form: StrategySearchOperatorFormState): {
  id: "fee" | "slip" | "spread";
  label: string;
  multiplier: number;
}[] {
  if (!form.stressEnabled) return [];
  const fee = Number(form.stressFeeMultiplier) || 1.5;
  const slip = Number(form.stressSlippageMultiplier) || 1.5;
  const channels: {
    id: "fee" | "slip" | "spread";
    label: string;
    multiplier: number;
  }[] = [
    { id: "fee", label: "수수료", multiplier: fee },
    { id: "slip", label: "슬리피지", multiplier: slip },
  ];
  if (form.applySpread) {
    channels.push({ id: "spread", label: "스프레드", multiplier: fee });
  }
  return channels;
}

export function costStressChannelLines(form: StrategySearchOperatorFormState): {
  enabled: boolean;
  lines: string[];
} {
  const channels = costStressChannels(form);
  return {
    enabled: channels.length > 0,
    lines: channels.map((channel) => `${channel.label} ${channel.multiplier}×`),
  };
}

export function qualificationTargetCopy(
  form: StrategySearchOperatorFormState,
): {
  target: number;
  title: string;
  hint: string;
} {
  const target = resolveQualifiedTarget(form);
  return {
    target,
    title: `목표 합격 후보 ${target}개`,
    hint: isAutomaticQualifiedTargetMode(form)
      ? "조건을 만족하는 후보가 이 수에 도달하면 탐색을 종료합니다."
      : "진행 상황을 확인하기 위한 목표이며 자동 종료 조건이 아닙니다.",
  };
}

export type SearchProgressionItem = {
  id: string;
  labelKo: string;
  status: string;
};

export type SearchScopeProgress = {
  status?: string | null;
  qualifiedCount?: number | null;
  evaluatedCount?: number | null;
  gatePassedCount?: number | null;
  rejectedCount?: number | null;
  errorCount?: number | null;
  recentActivityEvents?: StrategySearchActivityEvent[] | null;
  top10Count?: number | null;
  progressRatio?: number | null;
  overallProgressPct?: number | null;
  maxRuntimeMs?: number | null;
  elapsedMs?: number | null;
  uniqueEvaluatedCount?: number | null;
  candidateBudgetUsed?: number | null;
  completedIterations?: number | null;
  searchProgression?: SearchProgressionItem[] | null;
  currentSearchFamily?: string | null;
};

export type RunningProgressMode = "idle" | "indeterminate";
export type LaunchPanelState = "ready" | "running" | "paused" | "stopping";

export type RunningProgressVisual = {
  running: boolean;
  mode: RunningProgressMode;
  percent: number | null;
  denominator: null;
};

export function isLiveSearchStatus(status?: string | null): boolean {
  return (
    status === "running" ||
    status === "queued" ||
    status === "pause_requested" ||
    status === "cancel_requested" ||
    status === "cancelling"
  );
}

export const LIVE_TOP10_EVALUATING_TITLE = "후보를 평가하고 있습니다.";
export const LIVE_TOP10_EVALUATING_DETAIL =
  "평가가 진행되면 상위 후보가 여기에 실시간으로 표시됩니다.";
export const LIVE_TOP10_GENERIC_EMPTY_TITLE = "표시할 순위 데이터가 없습니다";

export function liveTop10EmptyPresentation(input: {
  running: boolean;
  candidateCount: number;
}): {
  evaluating: boolean;
  title: string;
  detail: string;
} {
  if (input.running && input.candidateCount === 0) {
    return {
      evaluating: true,
      title: LIVE_TOP10_EVALUATING_TITLE,
      detail: LIVE_TOP10_EVALUATING_DETAIL,
    };
  }
  return {
    evaluating: false,
    title: LIVE_TOP10_GENERIC_EMPTY_TITLE,
    detail: "",
  };
}

export function resolveLaunchPanelState(
  progress?: SearchScopeProgress | null,
): LaunchPanelState {
  const status = progress?.status;
  if (status === "cancel_requested" || status === "cancelling") {
    return "stopping";
  }
  if (status === "paused" || status === "interrupted") return "paused";
  if (isLiveSearchStatus(status)) return "running";
  return "ready";
}

/**
 * Elapsed-time utilization only. Never a candidate-completion percentage.
 * progressRatio = elapsedMs / operatorPlan.maxRuntimeMs.
 */
export function runtimeUtilizationPct(
  progress?: SearchScopeProgress | null,
): number | null {
  const maxRuntimeMs = progress?.maxRuntimeMs;
  const hasDenom =
    maxRuntimeMs != null && Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0;
  if (!hasDenom) return null;
  const ratio = progress?.progressRatio;
  if (typeof ratio === "number" && Number.isFinite(ratio)) {
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }
  const pct = progress?.overallProgressPct;
  if (typeof pct === "number" && Number.isFinite(pct)) {
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  return null;
}

/**
 * Running search has no proven work denominator.
 * Time-budget ratio must never drive the primary ring.
 */
export function resolveRunningProgressVisual(
  progress?: SearchScopeProgress | null,
): RunningProgressVisual {
  const running = isLiveSearchStatus(progress?.status);
  if (!running) {
    return { running: false, mode: "idle", percent: null, denominator: null };
  }
  return {
    running: true,
    mode: "indeterminate",
    percent: null,
    denominator: null,
  };
}

export function liveEvaluatedCount(
  progress?: SearchScopeProgress | null,
): number | null {
  const live = progress?.evaluatedCount;
  if (typeof live === "number" && Number.isFinite(live)) return live;
  const unique = progress?.uniqueEvaluatedCount;
  if (typeof unique === "number" && Number.isFinite(unique)) return unique;
  const used = progress?.candidateBudgetUsed;
  if (typeof used === "number" && Number.isFinite(used)) return used;
  const completed = progress?.completedIterations;
  if (typeof completed === "number" && Number.isFinite(completed)) {
    return completed;
  }
  return null;
}

export function formatLiveCount(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.trunc(n).toLocaleString("ko-KR");
}

export function formatElapsedCompact(
  ms: number | null | undefined,
): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}초`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}시간 ${rem}분` : `${hours}시간`;
}

export function qualificationFillRatio(input: {
  target: number;
  qualifiedCount?: number | null;
}): number | null {
  if (!(input.target > 0)) return null;
  if (
    input.qualifiedCount == null ||
    !Number.isFinite(input.qualifiedCount)
  ) {
    return null;
  }
  return Math.max(0, Math.min(1, input.qualifiedCount / input.target));
}

export function provenSearchStageLabel(
  progress?: SearchScopeProgress | null,
): string | null {
  const active = progress?.searchProgression?.find(
    (item) => item.status === "active",
  );
  if (active?.labelKo) return presentSearchFamilyLabelKo(active.labelKo);
  const family = progress?.currentSearchFamily;
  if (family && family.trim()) return presentSearchFamilyLabelKo(family);
  return null;
}

export function familyProgressState(
  id: string,
  progression?: SearchProgressionItem[] | null,
  currentSearchFamily?: string | null,
): "idle" | "pending" | "active" | "completed" {
  if (progression && progression.length > 0) {
    const item = progression.find((entry) => entry.id === id);
    if (item) {
      if (item.status === "active") return "active";
      if (item.status === "completed" || item.status === "exhausted") {
        return "completed";
      }
      if (item.status === "pending") return "pending";
    }
  }
  const current = currentSearchFamily?.trim();
  const presented = presentSearchFamilyLabelKo(current);
  if (
    current &&
    (current === id ||
      current === searchFamilyLabelKo(id) ||
      presented === searchFamilyLabelKo(id) ||
      presented === id)
  ) {
    return "active";
  }
  return "idle";
}

export function topResultCopy(progress: SearchScopeProgress | null | undefined): {
  state: "idle" | "running" | "completed" | "other";
  title: string;
  detail: string;
} {
  const status = progress?.status ?? null;
  const qualified =
    progress?.qualifiedCount != null && Number.isFinite(progress.qualifiedCount)
      ? progress.qualifiedCount
      : null;
  const top10 =
    progress?.top10Count != null && Number.isFinite(progress.top10Count)
      ? Math.max(0, Math.trunc(progress.top10Count))
      : null;
  const qualifiedPart =
    qualified != null ? `통과 후보 ${qualified}개` : null;
  if (
    status === "running" ||
    status === "queued" ||
    status === "paused" ||
    status === "pause_requested" ||
    status === "interrupted" ||
    status === "cancel_requested" ||
    status === "cancelling"
  ) {
    const topPart =
      top10 != null && top10 > 0 ? `TOP10 ${top10}개` : "상위 후보 준비 중";
    return {
      state: "running",
      title: "통과 후보 → 상위 결과",
      detail:
        [qualifiedPart, topPart].filter(Boolean).join(" · ") ||
        "실제 집계가 아직 없습니다.",
    };
  }
  if (status === "completed") {
    return {
      state: "completed",
      title: "통과 후보 → 상위 결과",
      detail:
        [
          qualifiedPart,
          top10 != null && top10 > 0 ? `결과 ${top10}개` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "완료된 탐색 결과가 아래에 연결됩니다.",
    };
  }
  if (status) {
    return {
      state: "other",
      title: "통과 후보 → 상위 결과",
      detail: "탐색 후 통과한 후보가 여기에 연결됩니다.",
    };
  }
  return {
    state: "idle",
    title: "통과 후보 → 상위 결과",
    detail: "탐색 후 통과한 후보가 여기에 연결됩니다.",
  };
}
