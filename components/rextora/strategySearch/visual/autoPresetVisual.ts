import {
  QUALIFICATION_PROFILES,
  SEARCH_DEPTH_PROFILES,
  TRADING_STYLE_MAP,
  type SearchDepthProfileId,
  type TradingStyleId,
} from "../formDefaults";

const STYLES: TradingStyleId[] = ["stable", "balanced", "scalping"];

export function engineMapForTradingStyle(style: TradingStyleId) {
  return TRADING_STYLE_MAP[style];
}

export function autoPresetEngineValues(style: TradingStyleId) {
  const mapped = TRADING_STYLE_MAP[style];
  const depth = SEARCH_DEPTH_PROFILES[mapped.depth];
  const qual = QUALIFICATION_PROFILES[mapped.qualification];
  return {
    depthId: mapped.depth,
    qualificationId: mapped.qualification,
    candidateBudget: depth.candidateBudget,
    stageBatchSize: depth.stageBatchSize,
    maxRuntimeMs: depth.maxRuntimeMs,
    jitterEnabled: depth.jitterEnabled,
    maxMddAbs: qual.maxMddAbs,
    minTradeCount: qual.minTradeCount,
    minTotalReturn: qual.minTotalReturn,
  };
}

function maxAmong(
  pick: (style: TradingStyleId) => number,
): number {
  return Math.max(...STYLES.map(pick));
}

export type AutoPresetVisualDim = {
  key: "candidateBudget" | "stageBatchSize" | "maxMddAbs";
  labelKo: string;
  valueLabel: string;
  fill: number;
};

export function autoPresetDepthOrdinal(style: TradingStyleId): {
  id: SearchDepthProfileId;
  rank: number;
  total: 3;
} {
  const id = TRADING_STYLE_MAP[style].depth;
  const rank = id === "fast" ? 1 : id === "standard" ? 2 : 3;
  return { id, rank, total: 3 };
}

export function autoPresetIntentCopy(style: TradingStyleId): string {
  const values = autoPresetEngineValues(style);
  const mddPct = Math.round((values.maxMddAbs ?? 0) * 100);
  if (style === "stable") {
    return `낙폭 ${mddPct}% · 최소 ${values.minTradeCount}회`;
  }
  if (style === "scalping") {
    return `낙폭 ${mddPct}% · 빠른 탐색`;
  }
  return `낙폭 ${mddPct}% · 최소 ${values.minTradeCount}회`;
}

export function autoPresetSuitableCopy(style: TradingStyleId): string {
  const values = autoPresetEngineValues(style);
  const returnPct = Math.round((values.minTotalReturn ?? 0) * 100);
  if (style === "stable") {
    return `최소 수익 ${returnPct}% 기준으로 더 많은 거래를 요구할 때`;
  }
  if (style === "scalping") {
    return `후보 ${values.candidateBudget}개 · 배치 ${values.stageBatchSize}로 빠르게 볼 때`;
  }
  return `최소 수익 ${returnPct}% · 표준 깊이로 균형 있게 볼 때`;
}

export function autoPresetShortCopy(style: TradingStyleId): string {
  const values = autoPresetEngineValues(style);
  const depth = SEARCH_DEPTH_PROFILES[values.depthId];
  const qual = QUALIFICATION_PROFILES[values.qualificationId];
  return `${depth.labelKo} · ${qual.descriptionKo}`;
}

export function autoPresetVisualDims(
  style: TradingStyleId,
): AutoPresetVisualDim[] {
  const values = autoPresetEngineValues(style);
  const maxBudget = maxAmong(
    (item) => autoPresetEngineValues(item).candidateBudget,
  );
  const maxBatch = maxAmong(
    (item) => autoPresetEngineValues(item).stageBatchSize,
  );
  const maxMdd = maxAmong(
    (item) => autoPresetEngineValues(item).maxMddAbs ?? 0,
  );
  const mddPct = Math.round((values.maxMddAbs ?? 0) * 100);
  return [
    {
      key: "candidateBudget",
      labelKo: "후보 수",
      valueLabel: `${values.candidateBudget}개`,
      fill: maxBudget > 0 ? values.candidateBudget / maxBudget : 0,
    },
    {
      key: "stageBatchSize",
      labelKo: "탐색 배치",
      valueLabel: `${values.stageBatchSize}`,
      fill: maxBatch > 0 ? values.stageBatchSize / maxBatch : 0,
    },
    {
      key: "maxMddAbs",
      labelKo: "낙폭 한도",
      valueLabel: `${mddPct}%`,
      fill: maxMdd > 0 ? (values.maxMddAbs ?? 0) / maxMdd : 0,
    },
  ];
}
