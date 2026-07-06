export type TradingModeSetting = "PAPER" | "LIVE";
export type MarginTypeSetting = "ISOLATED" | "CROSSED";
export type PositionModeSetting = "oneWayMode" | "hedgeMode";
export type OrderTypeSetting = "MARKET" | "LIMIT";
export type PositionSizeModeSetting = "FIXED_USDT" | "BALANCE_PERCENT";

export interface TradingSettings {
  defaultMode: TradingModeSetting;
  liveTradingEnabled: boolean;
  allowLiveTrading: boolean;
  operatorLiveStartRequired: boolean;
  /** @deprecated no longer used as LIVE blocker */
  manualLiveConfirmationRequired: boolean;
  /** @deprecated no longer used as LIVE blocker */
  liveConfirmationText: string;
  testnetMode: boolean;
  positionMode: PositionModeSetting;
  marginType: MarginTypeSetting;
  defaultLeverage: number;
  maxLeverage: number;
}

export interface MarketWatcherSettings {
  watchedSymbolCount: number;
  allowedSymbols: string[];
  excludedSymbols: string[];
  minQuoteVolume: number;
  scanIntervalMs: number;
  marketCacheTtlMs: number;
  staleDataThresholdMs: number;
  maxKlineSymbolsPerScan: number;
  klineInterval: string;
  candidateRefreshIntervalMs: number;
}

export interface SignalSettings {
  enableLong: boolean;
  enableShort: boolean;
  enableBreakout: boolean;
  enablePullback: boolean;
  enableVolumeSpike: boolean;
  enableTrendReversal: boolean;
  enableOverheatedFilter: boolean;
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
  atrPeriod: number;
  breakoutLookback: number;
  volumeSpikeMultiplier: number;
  maxSpreadPct: number;
  minVolatilityPct: number;
  maxVolatilityPct: number;
}

export interface CostSettings {
  makerFeePct: number;
  takerFeePct: number;
  useTakerFeeForMarketOrders: boolean;
  slippageBasePct: number;
  slippageVolatilityMultiplier: number;
  safetyMarginPct: number;
  minExpectedEdgePct: number;
  includeFundingFee: boolean;
  maxFundingFeePct: number;
  maxSpreadPct: number;
}

export interface RiskSettingsConfig {
  maxDailyLossPct: number;
  maxTotalLossPct: number;
  maxConsecutiveLosses: number;
  maxPositions: number;
  maxPositionSizePct: number;
  maxPositionNotionalUsdt: number;
  maxTradesPerDay: number;
  maxTradesPerSymbolPerDay: number;
  cooldownMs: number;
  emergencyStopOnDailyLoss: boolean;
  emergencyStopOnConsecutiveLosses: boolean;
  requireServerTpSl: boolean;
  requireTelegramForLive: boolean;
  blockWhenMarketDataStale: boolean;
  riskSettingsConfirmed: boolean;
}

export interface ExecutionSettings {
  orderType: OrderTypeSetting;
  entryPriceProtectionPct: number;
  positionSizeMode: PositionSizeModeSetting;
  fixedOrderUsdt: number;
  balancePositionPct: number;
  positionSizePct: number;
  maxConcurrentPositions: number;
  defaultLeverage: number;
  reduceOnlyForExit: boolean;
  closePositionOnTpSlFailure: boolean;
  cancelOpenOrdersBeforeEntry: boolean;
  preventDuplicateSymbolPosition: boolean;
  allowPartialTakeProfit: boolean;
  partialTakeProfitPct: number;
  partialTakeProfitSizePct: number;
}

export interface TpSlSettings {
  takeProfitPct: number;
  stopLossPct: number;
  useAtrBasedTpSl: boolean;
  atrTpMultiplier: number;
  atrSlMultiplier: number;
  serverTpSlRequired: boolean;
  verifyTpSlAfterEntry: boolean;
  cancelTpSlOnPositionClose: boolean;
  fallbackCloseIfTpSlFails: boolean;
  closePositionIfTpSlFails: boolean;
}

export interface TelegramSettingsConfig {
  telegramEnabled: boolean;
  alertOnBotStart: boolean;
  alertOnBotStop: boolean;
  alertOnCandidate: boolean;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  alertOnTpSlPlaced: boolean;
  alertOnRiskBlock: boolean;
  alertOnEmergency: boolean;
  alertOnDailyReport: boolean;
  minCandidateScoreForAlert: number;
  alertRateLimitMs: number;
}

export interface UiSettings {
  dashboardRefreshMs: number;
  marketWatchRefreshMs: number;
  systemStatusRefreshMs: number;
  showAdvancedSettings: boolean;
  compactMode: boolean;
}

export interface RextoraSettings {
  version: number;
  updatedAt: string;
  trading: TradingSettings;
  market: MarketWatcherSettings;
  signal: SignalSettings;
  cost: CostSettings;
  risk: RiskSettingsConfig;
  execution: ExecutionSettings;
  tpSl: TpSlSettings;
  telegram: TelegramSettingsConfig;
  ui: UiSettings;
}

export type SettingsCategory = keyof Omit<RextoraSettings, "version" | "updatedAt">;

export interface SettingsValidationError {
  field: string;
  message: string;
}

export interface SettingsValidationResult {
  ok: boolean;
  errors: SettingsValidationError[];
}
