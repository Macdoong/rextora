import { getEnv } from "./env";
import type { RiskSettings } from "./types";

export type EffectiveTradingMode = "PAPER" | "LIVE";

/**
 * Rextora always boots into PAPER regardless of REXTORA_DEFAULT_MODE unless the full
 * LIVE safety gate (see liveSafetyGate.ts) explicitly passes at request time.
 * REXTORA_DEFAULT_MODE only expresses operator *intent*; it never bypasses the gate.
 */
export function getBootMode(): EffectiveTradingMode {
  return "PAPER";
}

export interface RextoraConfig {
  mode: {
    /** Operator intent only. Never trusted to allow LIVE without passing the gate. */
    requestedDefaultMode: EffectiveTradingMode;
    bootMode: EffectiveTradingMode;
  };
  binance: {
    testnet: boolean;
    baseUrl: string;
    futuresBaseUrl: string;
    configured: boolean;
    recvWindowMs: number;
    timeoutMs: number;
    maxRetries: number;
  };
  telegram: {
    configured: boolean;
  };
  live: {
    approved: boolean;
    confirmationTextConfigured: boolean;
  };
  risk: RiskSettings & {
    minExpectedEdgePct: number;
    safetyMarginPct: number;
  };
  market: {
    maxWatchedSymbols: number;
    minWatchedSymbols: number;
    staleAfterMs: number;
    scanIntervalMs: number;
    cacheTtlMs: number;
    candidateCacheTtlMs: number;
    jsonStoreTtlMs: number;
  };
  serverTpSlRequired: boolean;
}

export function getConfig(): RextoraConfig {
  const env = getEnv();

  return {
    mode: {
      requestedDefaultMode: env.REXTORA_DEFAULT_MODE,
      bootMode: getBootMode()
    },
    binance: {
      testnet: env.BINANCE_TESTNET,
      baseUrl: env.BINANCE_BASE_URL,
      futuresBaseUrl: env.BINANCE_FUTURES_BASE_URL,
      configured: Boolean(env.BINANCE_API_KEY && env.BINANCE_API_SECRET),
      recvWindowMs: 5000,
      timeoutMs: 7000,
      maxRetries: 2
    },
    telegram: {
      configured: Boolean(env.TG_TOKEN && env.TG_CHAT_ID)
    },
    live: {
      approved: env.REXTORA_LIVE_APPROVED,
      confirmationTextConfigured: Boolean(env.REXTORA_LIVE_CONFIRMATION_TEXT)
    },
    risk: {
      dailyLossLimitPct: env.REXTORA_MAX_DAILY_LOSS_PCT,
      totalLossLimitPct: env.REXTORA_MAX_TOTAL_LOSS_PCT,
      consecutiveLossLimit: env.REXTORA_MAX_CONSECUTIVE_LOSSES,
      maxDailyTrades: env.REXTORA_MAX_TRADES_PER_DAY,
      maxLeverage: env.REXTORA_MAX_LEVERAGE,
      maxSimultaneousPositions: env.REXTORA_MAX_POSITIONS,
      maxPositionSizePerCoinPct: 3,
      overtradingCooldownMinutes: 15,
      minExpectedEdgePct: env.REXTORA_MIN_EXPECTED_EDGE_PCT,
      safetyMarginPct: env.REXTORA_SAFETY_MARGIN_PCT
    },
    market: {
      maxWatchedSymbols: 50,
      minWatchedSymbols: 30,
      staleAfterMs: 60_000,
      scanIntervalMs: 15_000,
      cacheTtlMs: 30_000,
      candidateCacheTtlMs: 30_000,
      jsonStoreTtlMs: 5_000
    },
    serverTpSlRequired: env.REXTORA_SERVER_TPSL_REQUIRED
  };
}
