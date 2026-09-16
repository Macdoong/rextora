/** Presentation helpers for Settings Data symbols and Cost field units. Does not mutate stored values. */

export const SETTINGS_ALLOWED_SYMBOL_PREVIEW_LIMIT = 8;

export function compactSymbolPreview(
  values: readonly string[],
  expanded: boolean,
  limit = SETTINGS_ALLOWED_SYMBOL_PREVIEW_LIMIT,
): {
  visible: string[];
  hiddenCount: number;
  compact: boolean;
} {
  if (values.length <= limit || expanded) {
    return {
      visible: [...values],
      hiddenCount: 0,
      compact: values.length > limit,
    };
  }
  return {
    visible: values.slice(0, limit),
    hiddenCount: values.length - limit,
    compact: true,
  };
}

export const SETTINGS_MARKET_FIELD_KEYS = [
  "watchedSymbolCount",
  "allowedSymbols",
  "excludedSymbols",
  "minQuoteVolume",
  "scanIntervalMs",
  "marketCacheTtlMs",
  "staleDataThresholdMs",
  "maxKlineSymbolsPerScan",
  "klineInterval",
  "candidateRefreshIntervalMs",
] as const;

export const SETTINGS_COST_FIELD_KEYS = [
  "makerFeePct",
  "takerFeePct",
  "useTakerFeeForMarketOrders",
  "slippageBasePct",
  "slippageVolatilityMultiplier",
  "safetyMarginPct",
  "minExpectedEdgePct",
  "includeFundingFee",
  "maxFundingFeePct",
  "maxSpreadPct",
] as const;

/** Display unit only. Does not convert stored numeric values. */
export const SETTINGS_COST_FIELD_UNITS: Record<
  (typeof SETTINGS_COST_FIELD_KEYS)[number],
  "%" | "배수" | null
> = {
  makerFeePct: "%",
  takerFeePct: "%",
  useTakerFeeForMarketOrders: null,
  slippageBasePct: "%",
  slippageVolatilityMultiplier: "배수",
  safetyMarginPct: "%",
  minExpectedEdgePct: "%",
  includeFundingFee: null,
  maxFundingFeePct: "%",
  maxSpreadPct: "%",
};

export function settingsCostDisplayUnit(fieldKey: string): "%" | "배수" | null {
  if ((SETTINGS_COST_FIELD_KEYS as readonly string[]).includes(fieldKey)) {
    return SETTINGS_COST_FIELD_UNITS[fieldKey as (typeof SETTINGS_COST_FIELD_KEYS)[number]];
  }
  return null;
}

export type SettingsCostSummaryFact = { label: string; value: string };

export function settingsCostSummaryFacts(cost: {
  useTakerFeeForMarketOrders: boolean;
  includeFundingFee: boolean;
}): SettingsCostSummaryFact[] {
  return [
    { label: "적용 기준", value: "시스템 설정값" },
    { label: "입력 방식", value: "직접 설정 · 저장 가능" },
    {
      label: "시장가 주문",
      value: cost.useTakerFeeForMarketOrders ? "테이커 수수료 적용" : "테이커 수수료 미적용",
    },
    {
      label: "펀딩 비용",
      value: cost.includeFundingFee ? "포함" : "제외",
    },
  ];
}
