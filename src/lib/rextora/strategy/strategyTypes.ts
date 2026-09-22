import type { StrategyExecutionProvenance } from "./strategyExecutionProvenance";

export type StrategySourceStatus =
  | "locked_file"
  | "data_file"
  | "context_fallback"
  | "hash_mismatch"
  | "user_copy"
  | "user_created";

export interface SafeV44Params {
  ema_fast: number;
  ema_mid: number;
  ema_slow: number;
  rsi_period: number;
  atr_period: number;
  vol_lookback: number;
  res_lookback: number;
  slope_lookback: number;
  slope_min: number;
  pullback_max_dist: number;
  vol_ratio_min: number;
  max_atr_pct: number;
  min_room_to_resist: number;
  confirm_bull: boolean;
  rsi_max_long: number;
  break_lookback: number;
  break_margin: number;
  vol_ratio_min_break: number;
  max_atr_pct_break: number;
  confirm_bear: boolean;
  rsi_min_short: number;
  sl_atr_mult: number;
  tp_atr_mult: number;
  cooldown_bars: number;
  allow_in_range: boolean;
  range_vol_ratio_min: number;
  max_hold_bars: number;
  use_trailing: boolean;
  trail_atr_mult: number;
  use_vol_target: boolean;
  target_atr_pct: number;
  size_min: number;
  size_max: number;
  use_dynamic_leverage: boolean;
  lev_min: number;
  lev_base: number;
  lev_max: number;
  lev_atr_ok_max: number;
  lev_atr_too_high: number;
  lev_down_on_dd: number;
  lev_up_on_dd: number;
  risk_mult_cap: number;
  range_risk_mult: number;
  mark_to_market: boolean;
  base_bal_pct: number;
  cost_guard: boolean;
  cost_guard_k: number;
}

export type StrategyTimeframe = "1m" | "3m" | "5m" | "15m" | "1h" | "unknown";

export interface StoredStrategy {
  id: string;
  name: string;
  /**
   * Operator-facing alias (e.g. "Z11 · 변동성 돌파 · 공격형").
   * Editable; never participates in paramsHash / strategy identity.
   */
  displayAlias?: string | null;
  /** Optional free-form display name override (editable, non-identity). */
  displayName?: string | null;
  /** Bounded display-only rename audit; never participates in identity hashing. */
  renameAudit?: Array<{
    at: string;
    from: string | null;
    to: string | null;
    field: "displayAlias" | "displayName" | "name";
  }>;
  description: string;
  type: string;
  timeframe: StrategyTimeframe;
  paramsHash: string;
  /** Original search-candidate params hash, when this record was promoted. */
  sourceParamsHash?: string;
  /** Canonical definition-based behavior identity. */
  strategyHash?: string;
  params: SafeV44Params;
  locked: boolean;
  sourceFile: string | null;
  sourceStatus: StrategySourceStatus;
  paperActive: boolean;
  liveActive: boolean;
  liveEligible: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Customer user who created/registered this strategy.
   * Absent/null on pre-ownership records. Locked SAFE remains product-shared.
   */
  ownerUserId?: string | null;
  lastBacktest?: {
    totalReturn: number;
    mdd: number;
    trades: number;
    winRate: number;
    at: string;
  };
  longConditionSummary: string;
  shortConditionSummary: string;
  stopLossSummary: string;
  takeProfitSummary: string;
  /**
   * Optional structured Research execution provenance (P3-A8.3.1).
   * Absent on historical records. Never required for parse.
   * When present, this is machine execution authority — description is display/audit only.
   */
  executionProvenance?: StrategyExecutionProvenance;
}

export interface StrategyIndexFile {
  version: 1;
  updatedAt: string;
  strategies: Array<{
    id: string;
    name: string;
    paramsHash: string;
    sourceParamsHash?: string;
    strategyHash?: string;
    locked: boolean;
    paperActive: boolean;
    liveActive: boolean;
    file: string;
  }>;
}

export interface SafeV44StrategyMetadata {
  name: string;
  paramsHash: string;
  params: SafeV44Params;
  sourceFile: string | null;
  sourceStatus: StrategySourceStatus;
  lockedResearchFilesFound: boolean;
  dataStrategyFileFound: boolean;
  hashVerified: boolean;
  notes: string[];
}
