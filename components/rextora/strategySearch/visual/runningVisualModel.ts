import {
  formatActivityEventLineKo,
  SEARCH_ACTIVITY_BUFFER_SIZE,
  SEARCH_ACTIVITY_FEED_LIMIT,
  type CustomerCandidateMetrics,
  type StrategySearchActivityEvent,
  type StrategySearchCustomerFailureReasonCode,
} from "@/src/lib/rextora/strategySearch/activityTelemetry";
import { formatCustomerSearchValue } from "../customerDisplay";
import {
  HISTORICAL_PERIOD_PRESETS,
  type HistoricalPeriodPresetId,
} from "../formDefaults";
import {
  familyProgressState,
  formatLiveCount,
  liveEvaluatedCount,
  presentSearchFamilyLabelKo,
  searchFamilyLabelKo,
  type SearchScopeProgress,
} from "./searchScopeVisual";

export type RunningVisualMode =
  | "queued"
  | "running"
  | "pause_requested"
  | "paused"
  | "cancelling"
  | "hidden";

export const RUNNING_ENGINE_TITLE_KO = "전략 탐색 엔진 가동 중";
export const RUNNING_ENGINE_SUBCOPY_KO =
  "선택한 시장과 전략군을 조합해 후보 전략을 생성하고 검증하고 있습니다.";
export const PAUSE_PREPARING_TITLE_KO = "일시정지를 준비하고 있습니다.";
export const CANCELLING_TITLE_KO = "안전하게 탐색을 종료하고 있습니다.";
export const WORKFLOW_LABEL_KO = "탐색 작업 흐름";

export const RUNNING_WORKFLOW_STEPS = [
  "시장 조건 분석",
  "후보 전략 생성",
  "백테스트 평가",
  "적격 조건 검증",
  "후보 정리",
] as const;

export const RUNNING_NETWORK_WIDTH = 160;
export const RUNNING_NETWORK_HEIGHT = 160;
const NETWORK_CX = 80;
const NETWORK_CY = 80;
const NETWORK_R = 52;
export const RECENT_CANDIDATE_STRIP_LIMIT = SEARCH_ACTIVITY_BUFFER_SIZE;
export const CANDIDATE_FLOW_VISIBLE_LIMIT = 8;
/** Full-width line chart when at least this many real observations exist. */
export const METRIC_CHART_FULL_LINE_MIN = 4;
/** @deprecated use METRIC_CHART_FULL_LINE_MIN */
export const SPARKLINE_MIN_POINTS = METRIC_CHART_FULL_LINE_MIN;

export const METRIC_CHART_WIDTH = 280;
export const METRIC_CHART_HEIGHT = 76;

export type MetricChartKind = "return" | "mdd";

export type MetricChartMode = "empty" | "single" | "compact" | "line";

export type MetricChartLayout = {
  mode: MetricChartMode;
  width: number;
  height: number;
  min: number;
  max: number;
  zeroY: number | null;
  points: Array<{ x: number; y: number; index: number }>;
  linePoints: string | null;
};

export function resolveMetricChartMode(
  pointCount: number,
): MetricChartMode {
  if (pointCount <= 0) return "empty";
  if (pointCount === 1) return "single";
  if (pointCount <= 3) return "compact";
  return "line";
}

function plotValueForMetric(value: number, kind: MetricChartKind): number {
  return kind === "mdd" ? Math.abs(value) : value;
}

export function buildCandidateMetricChart(
  values: readonly number[],
  kind: MetricChartKind,
  width = METRIC_CHART_WIDTH,
  height = METRIC_CHART_HEIGHT,
  pad = 10,
): MetricChartLayout | null {
  if (values.length === 0) return null;
  const mode = resolveMetricChartMode(values.length);
  const plotValues = values.map((value) => plotValueForMetric(value, kind));
  let min = Math.min(...plotValues);
  let max = Math.max(...plotValues);
  if (kind === "return") {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  } else {
    min = 0;
  }
  let span = max - min;
  if (span === 0) {
    const bump =
      kind === "return"
        ? 0.002
        : Math.max(Math.abs(max) * 0.15, 0.002);
    min = kind === "mdd" ? 0 : min - bump / 2;
    max = max + bump / 2;
    span = max - min;
  } else {
    const padding = span * 0.1;
    min = kind === "mdd" ? 0 : min - padding;
    max = max + padding;
    span = max - min;
  }
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const toX = (index: number) =>
    pad +
    (values.length === 1
      ? innerW / 2
      : (index / (values.length - 1)) * innerW);
  const toY = (plotValue: number) =>
    pad + innerH - ((plotValue - min) / span) * innerH;
  const zeroY =
    kind === "return" && min <= 0 && max >= 0 ? toY(0) : null;
  const points = plotValues.map((plotValue, index) => ({
    x: toX(index),
    y: toY(plotValue),
    index,
  }));
  const linePoints =
    mode === "single"
      ? null
      : points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return {
    mode,
    width,
    height,
    min: Math.min(...values),
    max: Math.max(...values),
    zeroY,
    points,
    linePoints,
  };
}

const COMPACT_FAMILY_LABEL: Record<string, string> = {
  ema_core: "EMA",
  rsi_pullback: "RSI",
  breakout: "변동성 돌파",
  risk_exits: "위험 관리",
  full_safe: "통합",
  order_block: "오더블럭",
  fvg: "FVG",
  trendline: "추세선",
  support_resistance: "지지·저항",
  supply_demand: "공급·수요",
};

const COMPACT_TIMEFRAME: Record<string, string> = {
  "1m": "1분",
  "3m": "3분",
  "5m": "5분",
  "15m": "15분",
  "1h": "1시간",
};

export function resolveRunningVisualMode(
  status?: string | null,
): RunningVisualMode {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "pause_requested") return "pause_requested";
  if (status === "paused" || status === "interrupted") return "paused";
  if (status === "cancel_requested" || status === "cancelling") {
    return "cancelling";
  }
  return "hidden";
}

export function shouldRenderRunningVisual(
  status?: string | null,
): boolean {
  return resolveRunningVisualMode(status) !== "hidden";
}

export function runningVisualCopy(mode: RunningVisualMode): {
  titleKo: string;
  subcopyKo: string;
  claimsActiveEngine: boolean;
} {
  if (mode === "queued") {
    return {
      titleKo: "탐색 대기 중",
      subcopyKo: "선택한 설정으로 탐색 순서를 준비하고 있습니다.",
      claimsActiveEngine: false,
    };
  }
  if (mode === "pause_requested") {
    return {
      titleKo: PAUSE_PREPARING_TITLE_KO,
      subcopyKo: "현재 평가를 안전하게 마친 뒤 일시정지합니다.",
      claimsActiveEngine: false,
    };
  }
  if (mode === "paused") {
    return {
      titleKo: "탐색 일시정지",
      subcopyKo: "탐색이 멈춰 있습니다. 재개하면 이어서 검증합니다.",
      claimsActiveEngine: false,
    };
  }
  if (mode === "cancelling") {
    return {
      titleKo: CANCELLING_TITLE_KO,
      subcopyKo: "진행 중인 평가를 정리한 뒤 탐색을 종료합니다.",
      claimsActiveEngine: false,
    };
  }
  return {
    titleKo: RUNNING_ENGINE_TITLE_KO,
    subcopyKo: RUNNING_ENGINE_SUBCOPY_KO,
    claimsActiveEngine: true,
  };
}

export function formatElapsedClock(
  ms: number | null | undefined,
): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function runningFamilyLabel(
  progress?: SearchScopeProgress | null,
): string | null {
  const family = progress?.currentSearchFamily;
  if (family && family.trim()) {
    return (
      presentSearchFamilyLabelKo(family) ??
      formatCustomerSearchValue(family)
    );
  }
  const active = progress?.searchProgression?.find(
    (item) => item.status === "active",
  );
  if (active?.labelKo) {
    return (
      presentSearchFamilyLabelKo(active.labelKo) ??
      formatCustomerSearchValue(active.labelKo)
    );
  }
  return null;
}

export function runningFamilyNodeLabel(id: string): string {
  if (COMPACT_FAMILY_LABEL[id]) return COMPACT_FAMILY_LABEL[id];
  const formatted = formatCustomerSearchValue(id);
  const compact = formatted.split(" / ")[0]?.trim();
  return compact || formatted;
}

export type RunningFamilyNode = {
  id: string;
  labelKo: string;
  x: number;
  y: number;
  xPct: number;
  yPct: number;
  state: "idle" | "pending" | "active" | "completed";
};

export function runningFamilyNodes(
  familyIds: readonly string[],
  progress?: SearchScopeProgress | null,
): RunningFamilyNode[] {
  const n = familyIds.length;
  return familyIds.map((id, index) => {
    const angle =
      n === 0 ? 0 : -Math.PI / 2 + (index * 2 * Math.PI) / n;
    const x = Number((NETWORK_CX + NETWORK_R * Math.cos(angle)).toFixed(1));
    const y = Number((NETWORK_CY + NETWORK_R * Math.sin(angle)).toFixed(1));
    return {
      id,
      labelKo: runningFamilyNodeLabel(id),
      x,
      y,
      xPct: Number(((x / RUNNING_NETWORK_WIDTH) * 100).toFixed(2)),
      yPct: Number(((y / RUNNING_NETWORK_HEIGHT) * 100).toFixed(2)),
      state: familyProgressState(
        id,
        progress?.searchProgression,
        progress?.currentSearchFamily,
      ),
    };
  });
}

export const RUNNING_NETWORK_CENTER = {
  cx: NETWORK_CX,
  cy: NETWORK_CY,
} as const;

export function runningMetricValues(progress?: SearchScopeProgress | null): {
  evaluated: string;
  gatePassed: string;
  rejected: string;
  qualified: string;
  elapsed: string;
  family: string | null;
} {
  const gatePassed =
    typeof progress?.gatePassedCount === "number" &&
    Number.isFinite(progress.gatePassedCount)
      ? progress.gatePassedCount
      : null;
  const rejected =
    typeof progress?.rejectedCount === "number" &&
    Number.isFinite(progress.rejectedCount)
      ? progress.rejectedCount
      : null;
  return {
    evaluated: formatLiveCount(liveEvaluatedCount(progress)) ?? "—",
    gatePassed: formatLiveCount(gatePassed) ?? "—",
    rejected: formatLiveCount(rejected) ?? "—",
    qualified: formatLiveCount(progress?.qualifiedCount ?? null) ?? "—",
    elapsed: formatElapsedClock(progress?.elapsedMs) ?? "—",
    family: runningFamilyLabel(progress),
  };
}

export function recentActivityEventsForFeed(
  progress?: SearchScopeProgress | null,
): StrategySearchActivityEvent[] {
  const events = progress?.recentActivityEvents;
  if (!Array.isArray(events) || events.length === 0) return [];
  return events.slice(-SEARCH_ACTIVITY_FEED_LIMIT).reverse();
}

export function formatActivityClock(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function latestCandidateMetricsEvent(
  progress?: SearchScopeProgress | null,
): Extract<
  StrategySearchActivityEvent,
  | { type: "candidate_evaluated" }
  | { type: "candidate_rejected" }
  | { type: "candidate_gate_passed" }
> | null {
  const events = progress?.recentActivityEvents;
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      event &&
      (event.type === "candidate_evaluated" ||
        event.type === "candidate_rejected" ||
        event.type === "candidate_gate_passed") &&
      event.metrics
    ) {
      return event;
    }
  }
  return null;
}

export { formatActivityEventLineKo, SEARCH_ACTIVITY_BUFFER_SIZE, SEARCH_ACTIVITY_FEED_LIMIT };

export type CandidateVisualOutcome = "evaluated" | "rejected" | "gate_passed";

export type CandidateVisualItem = {
  key: string;
  eventKeys: string[];
  outcome: CandidateVisualOutcome;
  evaluatedCount: number;
  sequenceLabel: string;
  at: string;
  familyLabel?: string;
  metrics?: CustomerCandidateMetrics;
  reasonCodes?: StrategySearchCustomerFailureReasonCode[];
};

export type SparklinePoint = {
  sequenceLabel: string;
  value: number;
};

type CandidateActivityEvent = Extract<
  StrategySearchActivityEvent,
  | { type: "candidate_evaluated" }
  | { type: "candidate_rejected" }
  | { type: "candidate_gate_passed" }
>;

function isCandidateActivityEvent(
  event: StrategySearchActivityEvent,
): event is CandidateActivityEvent {
  return (
    event.type === "candidate_evaluated" ||
    event.type === "candidate_rejected" ||
    event.type === "candidate_gate_passed"
  );
}

export function activityEventKey(event: StrategySearchActivityEvent): string {
  const evaluated =
    "evaluatedCount" in event && typeof event.evaluatedCount === "number"
      ? String(event.evaluatedCount)
      : "";
  const family =
    "familyLabel" in event && typeof event.familyLabel === "string"
      ? event.familyLabel
      : "";
  const qualified =
    "qualifiedCount" in event && typeof event.qualifiedCount === "number"
      ? String(event.qualifiedCount)
      : "";
  return `${event.type}|${event.at}|${evaluated}|${family}|${qualified}`;
}

export function activityEventKeys(
  events: readonly StrategySearchActivityEvent[] | null | undefined,
): string[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  return events.map(activityEventKey);
}

export function establishActivityBaseline(
  currentKeys: readonly string[],
): Set<string> {
  return new Set(currentKeys);
}

export function incomingActivityKeys(
  currentKeys: readonly string[],
  seenKeys: ReadonlySet<string>,
): string[] {
  return currentKeys.filter((key) => !seenKeys.has(key));
}

export function candidateVisualItems(
  events: readonly StrategySearchActivityEvent[] | null | undefined,
): CandidateVisualItem[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const groups = new Map<number, CandidateVisualItem>();
  const order: number[] = [];
  for (const event of events) {
    if (!isCandidateActivityEvent(event)) continue;
    if (
      typeof event.evaluatedCount !== "number" ||
      !Number.isFinite(event.evaluatedCount)
    ) {
      continue;
    }
    const eventKey = activityEventKey(event);
    const existing = groups.get(event.evaluatedCount);
    if (!existing) {
      groups.set(event.evaluatedCount, {
        key: `cand-${event.evaluatedCount}`,
        eventKeys: [eventKey],
        outcome:
          event.type === "candidate_rejected"
            ? "rejected"
            : event.type === "candidate_gate_passed"
              ? "gate_passed"
              : "evaluated",
        evaluatedCount: event.evaluatedCount,
        sequenceLabel: `#${event.evaluatedCount}`,
        at: event.at,
        familyLabel: event.familyLabel,
        metrics: event.metrics,
        reasonCodes:
          event.type === "candidate_rejected" ? event.reasonCodes : undefined,
      });
      order.push(event.evaluatedCount);
      continue;
    }
    existing.eventKeys.push(eventKey);
    if (event.familyLabel) existing.familyLabel = event.familyLabel;
    if (event.metrics) existing.metrics = event.metrics;
    if (event.type === "candidate_rejected") {
      existing.outcome = "rejected";
      existing.reasonCodes = event.reasonCodes;
    } else if (event.type === "candidate_gate_passed") {
      existing.outcome = "gate_passed";
    }
  }
  return order.map((count) => groups.get(count)!);
}

export function recentCandidateStripItems(
  items: readonly CandidateVisualItem[],
): CandidateVisualItem[] {
  return items.slice(-RECENT_CANDIDATE_STRIP_LIMIT);
}

export function candidateFlowItems(
  items: readonly CandidateVisualItem[],
): CandidateVisualItem[] {
  return items.slice(-CANDIDATE_FLOW_VISIBLE_LIMIT);
}

export function candidateMetricSparklinePoints(
  items: readonly CandidateVisualItem[],
  metric: "netReturn" | "mdd" | "score",
): SparklinePoint[] {
  const points: SparklinePoint[] = [];
  for (const item of items) {
    const value = item.metrics?.[metric];
    if (typeof value === "number" && Number.isFinite(value)) {
      points.push({ sequenceLabel: item.sequenceLabel, value });
    }
  }
  return points;
}

export function sparklinePolyline(
  values: readonly number[],
  width: number,
  height: number,
  pad = 4,
): { points: string; min: number; max: number; last: number } | null {
  if (values.length < METRIC_CHART_FULL_LINE_MIN) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const coords = values.map((value, index) => {
    const x =
      pad +
      (values.length === 1
        ? innerW / 2
        : (index / (values.length - 1)) * innerW);
    const y =
      span === 0
        ? pad + innerH / 2
        : pad + innerH - ((value - min) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return {
    points: coords.join(" "),
    min,
    max,
    last: values[values.length - 1]!,
  };
}

export function latestCampaignQualifiedEvent(
  events: readonly StrategySearchActivityEvent[] | null | undefined,
): Extract<StrategySearchActivityEvent, { type: "campaign_qualified" }> | null {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === "campaign_qualified") return event;
  }
  return null;
}

export function candidateItemIsEntering(
  item: CandidateVisualItem,
  freshKeys: ReadonlySet<string>,
): boolean {
  return item.eventKeys.some((key) => freshKeys.has(key));
}

export function enteringStaggerIndex(
  items: readonly CandidateVisualItem[],
  item: CandidateVisualItem,
  freshKeys: ReadonlySet<string>,
): number {
  let index = 0;
  for (const entry of items) {
    if (!candidateItemIsEntering(entry, freshKeys)) continue;
    if (entry.key === item.key) return index;
    index += 1;
  }
  return 0;
}

export function familyTransitionLabels(
  events: readonly StrategySearchActivityEvent[] | null | undefined,
  freshKeys: ReadonlySet<string>,
): { started: Set<string>; completed: Set<string> } {
  const started = new Set<string>();
  const completed = new Set<string>();
  if (!Array.isArray(events) || freshKeys.size === 0) {
    return { started, completed };
  }
  for (const event of events) {
    if (
      event.type !== "family_started" &&
      event.type !== "family_completed"
    ) {
      continue;
    }
    if (!freshKeys.has(activityEventKey(event))) continue;
    if (event.type === "family_started") started.add(event.familyLabel);
    else completed.add(event.familyLabel);
  }
  return { started, completed };
}

export function familyNodeMatchesLabel(
  node: RunningFamilyNode,
  label: string,
): boolean {
  return (
    node.id === label ||
    node.labelKo === label ||
    searchFamilyLabelKo(node.id) === label ||
    presentSearchFamilyLabelKo(node.id) === label ||
    formatCustomerSearchValue(node.id) === label
  );
}

export function runningCompactTimeframe(timeframe: string): string {
  return COMPACT_TIMEFRAME[timeframe] ?? timeframe;
}

export function runningPeriodLine(
  periodPreset: HistoricalPeriodPresetId,
): string {
  if (periodPreset === "custom") return "직접 기간";
  return `최근 ${HISTORICAL_PERIOD_PRESETS[periodPreset].days}일`;
}

export function buildRunningConfigSummary(input: {
  symbol: string;
  timeframe: string;
  periodPreset: HistoricalPeriodPresetId;
  automatic: boolean;
  familyCount: number;
}): {
  titleKo: string;
  marketLine: string;
  scopeLine: string;
} {
  return {
    titleKo: "탐색 설정",
    marketLine: [
      input.symbol || "—",
      runningCompactTimeframe(input.timeframe),
      runningPeriodLine(input.periodPreset),
    ].join(" · "),
    scopeLine: `${input.automatic ? "자동 탐색" : "직접 선택"} · 전략군 ${input.familyCount}개`,
  };
}
