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
  description: string;
  type: string;
  timeframe: StrategyTimeframe;
  paramsHash: string;
  params: SafeV44Params;
  locked: boolean;
  sourceFile: string | null;
  sourceStatus: StrategySourceStatus;
  paperActive: boolean;
  liveActive: boolean;
  liveEligible: boolean;
  createdAt: string;
  updatedAt: string;
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
}

export interface StrategyIndexFile {
  version: 1;
  updatedAt: string;
  strategies: Array<{
    id: string;
    name: string;
    paramsHash: string;
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

export const EXPECTED_SAFE_PARAMS_HASH = "7893ca3f0e30";
export const SAFE_STRATEGY_NAME = "SAFE_v44_i4060";
export const SAFE_STRATEGY_ID = "SAFE_v44_i4060";
