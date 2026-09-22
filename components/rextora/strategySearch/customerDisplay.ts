/**
 * Customer-facing display labels for Strategy Search / job-scoped Results.
 * Does not rename stored ids, enums, or engine values.
 */

const CUSTOMER_VALUE_LABELS: Record<string, string> = {
  automatic: "자동",
  basic: "기본",
  expert: "전문가",
  manual: "직접 선택",
  recommended: "추천",
  conservative: "보수적",
  balanced: "균형형",
  aggressive: "공격형",
  custom: "직접 입력",
  support_resistance: "지지·저항",
  supply_demand: "공급·수요",
  ema_core: "EMA / 추세 추종",
  rsi_pullback: "RSI / 되돌림",
  breakout: "변동성 돌파",
  risk_exits: "위험 관리",
  full_safe: "통합 기술 전략",
  order_block: "오더블럭",
  fvg: "FVG",
  trendline: "추세선",
  loose: "느슨",
  standard: "표준",
  strict: "엄격",
  tight: "타이트",
  both: "양방향",
  long: "롱",
  short: "숏",
  fixed: "고정",
  range: "범위 탐색",
  disabled: "사용 안 함",
  stable: "안전형",
  scalping: "공격형",
  confluence: "동시 확인",
  breakout_retest: "돌파 후 재시험",
  ordered_sequence: "순서 조합",
  AND: "그리고",
  OR: "또는",
  SEQUENCE: "순서",
  required: "필수",
  optional: "선택",
  single_close: "한 봉 마감",
  consecutive_closes: "연속 마감",
  threshold_count: "횟수 기준",
};

const LOOKS_INTERNAL =
  /^(manual|automatic|conservative|support_resistance|supply_demand|ema_core|order_block|fvg|trendline|risk_exits|rsi_pullback|full_safe|breakout)$/i;

export function formatCustomerSearchValue(value: string | null | undefined): string {
  if (value == null) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (CUSTOMER_VALUE_LABELS[trimmed]) return CUSTOMER_VALUE_LABELS[trimmed]!;
  const lower = trimmed.toLowerCase();
  if (CUSTOMER_VALUE_LABELS[lower]) return CUSTOMER_VALUE_LABELS[lower]!;
  return trimmed;
}

export function formatCustomerSearchValues(
  values: ReadonlyArray<string> | null | undefined,
  empty = "—",
): string {
  if (!values || values.length === 0) return empty;
  return values.map((value) => formatCustomerSearchValue(value)).join(" · ");
}

export function looksLikeInternalSearchId(value: string | null | undefined): boolean {
  if (!value) return false;
  return LOOKS_INTERNAL.test(value.trim());
}

export function tradingStyleCustomerLabel(
  style: "stable" | "balanced" | "scalping" | string,
): string {
  if (style === "stable") return "안전형";
  if (style === "scalping") return "공격형";
  if (style === "balanced") return "균형형";
  return formatCustomerSearchValue(style);
}

export function searchModeCustomerLabel(mode: "automatic" | "manual" | string): string {
  if (mode === "automatic") return "자동 탐색";
  if (mode === "manual") return "탐색 범위 직접 선택";
  return formatCustomerSearchValue(mode);
}

export function fieldOriginLabel(
  origin: "editable" | "auto" | "preset" | "readonly",
): string | null {
  if (origin === "auto") return "자동 적용";
  if (origin === "preset") return "프리셋 적용";
  if (origin === "readonly") return "읽기 전용";
  return null;
}
