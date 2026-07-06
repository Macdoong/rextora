import { FUTURES_SYMBOLS } from "../seedData";
import type { RextoraSettings } from "./settingsTypes";

export const SETTINGS_VERSION = 1;
export const SETTINGS_FILENAME = "settings.json";

export function createDefaultSettings(): RextoraSettings {
  const now = new Date().toISOString();
  return {
    version: SETTINGS_VERSION,
    updatedAt: now,
    trading: {
      defaultMode: "PAPER",
      liveTradingEnabled: false,
      allowLiveTrading: false,
      operatorLiveStartRequired: true,
      manualLiveConfirmationRequired: false,
      liveConfirmationText: "",
      testnetMode: true,
      positionMode: "oneWayMode",
      marginType: "ISOLATED",
      defaultLeverage: 2,
      maxLeverage: 2.5
    },
    market: {
      watchedSymbolCount: Math.min(40, FUTURES_SYMBOLS.length),
      allowedSymbols: FUTURES_SYMBOLS.slice(0, 40),
      excludedSymbols: [],
      minQuoteVolume: 5_000_000,
      scanIntervalMs: 15_000,
      marketCacheTtlMs: 30_000,
      staleDataThresholdMs: 60_000,
      maxKlineSymbolsPerScan: 10,
      klineInterval: "5m",
      candidateRefreshIntervalMs: 30_000
    },
    signal: {
      enableLong: true,
      enableShort: true,
      enableBreakout: true,
      enablePullback: true,
      enableVolumeSpike: true,
      enableTrendReversal: true,
      enableOverheatedFilter: true,
      rsiPeriod: 14,
      emaFast: 20,
      emaSlow: 60,
      atrPeriod: 14,
      breakoutLookback: 20,
      volumeSpikeMultiplier: 1.5,
      maxSpreadPct: 0.15,
      minVolatilityPct: 0.2,
      maxVolatilityPct: 5
    },
    cost: {
      makerFeePct: 0.02,
      takerFeePct: 0.04,
      useTakerFeeForMarketOrders: true,
      slippageBasePct: 0.05,
      slippageVolatilityMultiplier: 1.2,
      safetyMarginPct: 0.14,
      minExpectedEdgePct: 0.3,
      includeFundingFee: true,
      maxFundingFeePct: 0.1,
      maxSpreadPct: 0.15
    },
    risk: {
      maxDailyLossPct: -5,
      maxTotalLossPct: -10,
      maxConsecutiveLosses: 3,
      maxPositions: 3,
      maxPositionSizePct: 3,
      maxPositionNotionalUsdt: 500,
      maxTradesPerDay: 20,
      maxTradesPerSymbolPerDay: 5,
      cooldownMs: 900_000,
      emergencyStopOnDailyLoss: true,
      emergencyStopOnConsecutiveLosses: true,
      requireServerTpSl: true,
      requireTelegramForLive: true,
      blockWhenMarketDataStale: true,
      riskSettingsConfirmed: false
    },
    execution: {
      orderType: "MARKET",
      entryPriceProtectionPct: 0.1,
      positionSizeMode: "FIXED_USDT",
      fixedOrderUsdt: 50,
      balancePositionPct: 2,
      positionSizePct: 2,
      maxConcurrentPositions: 3,
      defaultLeverage: 2,
      reduceOnlyForExit: true,
      closePositionOnTpSlFailure: true,
      cancelOpenOrdersBeforeEntry: true,
      preventDuplicateSymbolPosition: true,
      allowPartialTakeProfit: false,
      partialTakeProfitPct: 0.5,
      partialTakeProfitSizePct: 50
    },
    tpSl: {
      takeProfitPct: 0.8,
      stopLossPct: 0.4,
      useAtrBasedTpSl: true,
      atrTpMultiplier: 4.5,
      atrSlMultiplier: 1.9,
      serverTpSlRequired: true,
      verifyTpSlAfterEntry: true,
      cancelTpSlOnPositionClose: true,
      fallbackCloseIfTpSlFails: true,
      closePositionIfTpSlFails: true
    },
    telegram: {
      telegramEnabled: true,
      alertOnBotStart: true,
      alertOnBotStop: true,
      alertOnCandidate: true,
      alertOnEntry: true,
      alertOnExit: true,
      alertOnTpSlPlaced: true,
      alertOnRiskBlock: true,
      alertOnEmergency: true,
      alertOnDailyReport: true,
      minCandidateScoreForAlert: 70,
      alertRateLimitMs: 30_000
    },
    ui: {
      dashboardRefreshMs: 8_000,
      marketWatchRefreshMs: 10_000,
      systemStatusRefreshMs: 12_000,
      showAdvancedSettings: false,
      compactMode: true
    }
  };
}
