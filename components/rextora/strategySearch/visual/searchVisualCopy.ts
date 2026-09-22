import { catalogDefaultsForPatternFamily } from "@/src/lib/rextora/patternParameterCatalog";
import {
  HISTORICAL_PERIOD_PRESETS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  type HistoricalPeriodPresetId,
} from "../formDefaults";

const ORDER_BLOCK_DEFAULTS = catalogDefaultsForPatternFamily("order_block");

export const PREVIEW_ENTRY_RULE = "패턴 구간";
export const PREVIEW_STOP_ATR = Number(ORDER_BLOCK_DEFAULTS.stopAtrMult);
export const PREVIEW_TP_ATR = Number(ORDER_BLOCK_DEFAULTS.tpAtrMult);
export const PREVIEW_STOP_RULE = `진입 기준 − ${PREVIEW_STOP_ATR} ATR`;
export const PREVIEW_TP_RULE = `${PREVIEW_TP_ATR.toFixed(1)} ATR`;

export const TIMEFRAME_CANDLE_HINT: Record<
  (typeof OPERATOR_SUPPORTED_TIMEFRAMES)[number],
  string
> = {
  "1m": "캔들 1개 = 1분",
  "3m": "캔들 1개 = 3분",
  "5m": "캔들 1개 = 5분",
  "15m": "캔들 1개 = 15분",
  "1h": "캔들 1개 = 1시간",
};

export function timeframeCandleHint(timeframe: string): string {
  if (
    (OPERATOR_SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)
  ) {
    return TIMEFRAME_CANDLE_HINT[
      timeframe as (typeof OPERATOR_SUPPORTED_TIMEFRAMES)[number]
    ];
  }
  return "";
}

export function periodPresetHint(preset: HistoricalPeriodPresetId): string {
  if (preset === "custom") return "직접 지정한 구간으로 검증";
  const days = HISTORICAL_PERIOD_PRESETS[preset].days;
  return `최근 ${days}일 데이터로 검증`;
}

export const AUTO_PIPELINE_STEPS = [
  { title: "시장 조건 확인", keyword: "필터" },
  { title: "진입 후보 생성", keyword: "후보" },
  { title: "롱·숏 비교", keyword: "방향" },
  { title: "손절·익절 검증", keyword: "손익" },
  { title: "비용 스트레스", keyword: "비용" },
] as const;

export const PATTERN_LAYER_HELP: Record<string, { title: string; help: string }> =
  {
    order_block: {
      title: "오더블럭 (OB)",
      help: "큰 움직임이 시작된 핵심 가격대 (Order Block)",
    },
    fvg: {
      title: "FVG",
      help: "빠른 움직임으로 생긴 불균형 구간 (Fair Value Gap)",
    },
    ema_core: {
      title: "EMA",
      help: "최근 가격을 강조한 추세선 (EMA)",
    },
    support_resistance: {
      title: "지지 · 저항",
      help: "가격이 반복해서 반응한 기준 구간 (Support / Resistance)",
    },
    trendline: {
      title: "추세선",
      help: "고점·저점을 연결한 추세 방향선 (Trendline)",
    },
    supply_demand: {
      title: "공급 · 수요",
      help: "매도·매수 압력이 강했던 영역 (Supply / Demand)",
    },
  };

export const DIRECT_LAYER_OPTIONS = [
  { id: "order_block", label: "오더블럭 (OB)" },
  { id: "fvg", label: "FVG" },
  { id: "ema_core", label: "EMA" },
  { id: "support_resistance", label: "지지 · 저항" },
  { id: "trendline", label: "추세선" },
  { id: "supply_demand", label: "공급 · 수요" },
] as const;

export const DIRECT_LAYER_IDS = DIRECT_LAYER_OPTIONS.map((layer) => layer.id);

/** Expert Direct can independently enable this ATR 손익 space (`ss-space-risk_exits`). */
export const DIRECT_SUPPLEMENTAL_SPACE_IDS = ["risk_exits"] as const;

/** Default automatic leftovers that Direct visual mode must not reintroduce. */
export const DIRECT_AUTOMATIC_ONLY_SPACE_IDS = [
  "rsi_pullback",
  "breakout",
  "full_safe",
] as const;

export const PREVIEW_LAYER_MARK = {
  order_block: { short: "OB", color: "#60a5fa" },
  fvg: { short: "FVG", color: "#f59e0b" },
  ema_core: { short: "EMA", color: "#22d3ee" },
  support_resistance: { short: "S/R", color: "#94a3b8" },
  trendline: { short: "TL", color: "#a78bfa" },
  supply_demand: { short: "S/D", color: "#22c55e" },
} as const;

export function visibleDirectLayerIds(current: readonly string[]): string[] {
  const visual = new Set<string>(DIRECT_LAYER_IDS);
  return current.filter((id) => visual.has(id));
}

/** Direct mode shows only the six chart layers; drop leftover automatic-space ids. */
export function visualSpaceIdsForDirectMode(
  current: readonly string[],
): string[] {
  const visual = new Set<string>(DIRECT_LAYER_IDS);
  const kept = visibleDirectLayerIds(current);
  const hasNonVisual = current.some((id) => !visual.has(id));
  if (hasNonVisual || kept.length === 0) {
    return [...DIRECT_LAYER_IDS];
  }
  return kept;
}

export function supplementalDirectSpaceIds(
  current: readonly string[],
): string[] {
  const allowed = new Set<string>(DIRECT_SUPPLEMENTAL_SPACE_IDS);
  return current.filter((id) => allowed.has(id));
}

/**
 * Merge Direct visual-layer ids with proven Expert supplemental ids.
 * Preserves `risk_exits` across layer toggles. Does not keep
 * rsi_pullback / breakout / full_safe or unknown ids.
 */
export function mergeDirectVisualSpaceIds(
  currentSelectedSpaceIds: readonly string[],
  nextVisualLayerIds: readonly string[],
): string[] {
  const visualAllowed = new Set<string>(DIRECT_LAYER_IDS);
  const visual: string[] = [];
  const seen = new Set<string>();
  for (const id of nextVisualLayerIds) {
    if (!visualAllowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    visual.push(id);
  }
  const merged = [...visual];
  for (const id of supplementalDirectSpaceIds(currentSelectedSpaceIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export const COST_STRESS_LABEL = "보수적 비용 검증";
export const COST_STRESS_HELP =
  "수수료·슬리피지·스프레드를 높여 전략을 재검증합니다.";
export const COST_STRESS_SUMMARY = "수수료 1.5× · 슬리피지 1.5× · 스프레드 1.5×";
