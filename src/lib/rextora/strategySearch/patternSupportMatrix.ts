/**
 * Honest support matrix for Strategy Search pattern / family enablement.
 * OB/FVG/Trendline/SR are searchable via event-sequence templates + adapters.
 * Paper/Live remain partial — signal path exists; real orders are never sent.
 */

export type PatternSupportLevel =
  | "fully_supported"
  | "backtest_only"
  | "render_only"
  | "unsupported";

export type LifecycleSupport =
  | "supported"
  | "partial"
  | "unsupported"
  | "experimental"
  | "verification_required";

export interface PatternSupportEntry {
  id: string;
  labelKo: string;
  support: PatternSupportLevel;
  searchable: boolean;
  reasonKo: string;
  /** Maps to searchSpaces id when searchable. */
  searchSpaceId?: string;
  /** Capability columns for operator matrix UX. */
  search: LifecycleSupport;
  backtest: LifecycleSupport;
  paper: LifecycleSupport;
  live: LifecycleSupport;
}

/** SafeV44 families that Strategy Search can actually generate and evaluate. */
export const SEARCHABLE_STRATEGY_FAMILIES: PatternSupportEntry[] = [
  {
    id: "ema_trend",
    labelKo: "EMA / 추세 추종",
    support: "fully_supported",
    searchable: true,
    reasonKo: "SafeV44 ema_core 탐색 공간에서 생성·평가됩니다.",
    searchSpaceId: "ema_core",
    search: "supported",
    backtest: "supported",
    paper: "supported",
    live: "supported",
  },
  {
    id: "rsi_pullback",
    labelKo: "RSI / 되돌림",
    support: "fully_supported",
    searchable: true,
    reasonKo: "SafeV44 rsi_pullback 탐색 공간에서 생성·평가됩니다.",
    searchSpaceId: "rsi_pullback",
    search: "supported",
    backtest: "supported",
    paper: "supported",
    live: "supported",
  },
  {
    id: "volatility_breakout",
    labelKo: "변동성 돌파",
    support: "fully_supported",
    searchable: true,
    reasonKo: "SafeV44 breakout 탐색 공간에서 생성·평가됩니다.",
    searchSpaceId: "breakout",
    search: "supported",
    backtest: "supported",
    paper: "supported",
    live: "supported",
  },
  {
    id: "atr_risk",
    labelKo: "ATR 위험 관리",
    support: "fully_supported",
    searchable: true,
    reasonKo: "SafeV44 risk_exits 탐색 공간에서 생성·평가됩니다.",
    searchSpaceId: "risk_exits",
    search: "supported",
    backtest: "supported",
    paper: "supported",
    live: "supported",
  },
  {
    id: "full_safe",
    labelKo: "통합 SafeV44 (전체 파라미터)",
    support: "fully_supported",
    searchable: true,
    reasonKo: "full_safe 단계에서 전체 SafeV44 파라미터를 탐색합니다.",
    searchSpaceId: "full_safe",
    search: "supported",
    backtest: "supported",
    paper: "supported",
    live: "supported",
  },
];

const PATTERN_PARTIAL_PAPER_LIVE =
  "이벤트 시퀀스 신호 평가(Paper/Live dry-run)는 가능하나 실주문은 게이트·승인 없이 실행되지 않습니다.";

/**
 * Pattern types with Search→event-sequence→Backtest→promote path.
 */
export const PATTERN_SEARCH_SUPPORT: PatternSupportEntry[] = [
  {
    id: "order_block",
    labelKo: "Order Block",
    support: "backtest_only",
    searchable: true,
    reasonKo:
      "Search→이벤트 시퀀스→승격 경로는 구현되어 있으나, 폐기 가능 연구→백테스트 브라우저 증명 전까지 Verification Required입니다.",
    searchSpaceId: "order_block",
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
  },
  {
    id: "fvg",
    labelKo: "Fair Value Gap",
    support: "backtest_only",
    searchable: true,
    reasonKo:
      "FVG 시퀀스 템플릿은 구현되어 있으나, 폐기 가능 연구→백테스트 브라우저 증명 전까지 Verification Required입니다.",
    searchSpaceId: "fvg",
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
  },
  {
    id: "trendline",
    labelKo: "Trendline",
    support: "backtest_only",
    searchable: true,
    reasonKo:
      "Trendline 시퀀스 템플릿은 구현되어 있으나, 폐기 가능 연구→백테스트 브라우저 증명 전까지 Verification Required입니다.",
    searchSpaceId: "trendline",
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
  },
  {
    id: "support_resistance",
    labelKo: "Support / Resistance",
    support: "backtest_only",
    searchable: true,
    reasonKo:
      "S/R 시퀀스 템플릿은 구현되어 있으나, 폐기 가능 연구→백테스트 브라우저 증명 전까지 Verification Required입니다.",
    searchSpaceId: "support_resistance",
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
  },
  {
    id: "supply_demand",
    labelKo: "Supply / Demand",
    support: "backtest_only",
    searchable: true,
    reasonKo:
      "Supply/Demand 완료 봉 감지기와 이벤트 시퀀스 경로가 구현되어 있으나 브라우저 증명 전까지 Verification Required입니다.",
    searchSpaceId: "supply_demand",
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
  },
];

export function patternPartialReasonKo(): string {
  return PATTERN_PARTIAL_PAPER_LIVE;
}

export function isSearchableSpaceId(spaceId: string): boolean {
  return (
    SEARCHABLE_STRATEGY_FAMILIES.some((f) => f.searchSpaceId === spaceId) ||
    PATTERN_SEARCH_SUPPORT.some(
      (f) => f.searchable && f.searchSpaceId === spaceId,
    )
  );
}

export function defaultSelectedSpaceIds(): string[] {
  return SEARCHABLE_STRATEGY_FAMILIES.map((f) => f.searchSpaceId!).filter(
    Boolean,
  );
}

/** Rows for the operator capability matrix (Pattern / Search / Backtest / Paper / Live). */
export function patternCapabilityMatrixRows(): PatternSupportEntry[] {
  return [...PATTERN_SEARCH_SUPPORT];
}
