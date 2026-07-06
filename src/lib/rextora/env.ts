/**
 * Centralized environment variable access for Rextora.
 *
 * Rules:
 * - Never hardcode secrets. All credentials come from process.env only.
 * - PAPER is the safe default trading mode.
 * - REXTORA_LIVE_APPROVED defaults to false; LIVE requires many additional gates
 *   (see liveSafetyGate.ts) even when this flag is true.
 */

export type BooleanEnvDefault = boolean;

function readString(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(name: string, fallback: BooleanEnvDefault): boolean {
  const raw = readString(name);
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

function readNumber(name: string, fallback: number): number {
  const raw = readString(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInt(name: string, fallback: number): number {
  const value = readNumber(name, fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export interface RextoraEnv {
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  BINANCE_TESTNET: boolean;
  BINANCE_BASE_URL: string;
  BINANCE_FUTURES_BASE_URL: string;

  TG_TOKEN?: string;
  TG_CHAT_ID?: string;

  REXTORA_DEFAULT_MODE: "PAPER" | "LIVE";
  REXTORA_LIVE_APPROVED: boolean;
  REXTORA_LIVE_CONFIRMATION_TEXT?: string;

  REXTORA_MAX_DAILY_LOSS_PCT: number;
  REXTORA_MAX_TOTAL_LOSS_PCT: number;
  REXTORA_MAX_CONSECUTIVE_LOSSES: number;
  REXTORA_MAX_POSITIONS: number;
  REXTORA_MAX_LEVERAGE: number;
  REXTORA_MAX_TRADES_PER_DAY: number;
  REXTORA_MIN_EXPECTED_EDGE_PCT: number;
  REXTORA_SAFETY_MARGIN_PCT: number;
  REXTORA_SERVER_TPSL_REQUIRED: boolean;
}

const DEFAULT_MAINNET_BASE_URL = "https://fapi.binance.com";
const DEFAULT_TESTNET_BASE_URL = "https://testnet.binancefuture.com";

function resolveDefaultMode(): "PAPER" | "LIVE" {
  const raw = readString("REXTORA_DEFAULT_MODE");
  return raw?.toUpperCase() === "LIVE" ? "LIVE" : "PAPER";
}

/** Read and normalize all Rextora environment variables. Safe to call repeatedly (no caching of secrets beyond process lifetime). */
export function getEnv(): RextoraEnv {
  const testnet = readBoolean("BINANCE_TESTNET", true);

  return {
    BINANCE_API_KEY: readString("BINANCE_API_KEY"),
    BINANCE_API_SECRET: readString("BINANCE_API_SECRET"),
    BINANCE_TESTNET: testnet,
    BINANCE_BASE_URL: readString("BINANCE_BASE_URL") ?? (testnet ? DEFAULT_TESTNET_BASE_URL : DEFAULT_MAINNET_BASE_URL),
    BINANCE_FUTURES_BASE_URL: readString("BINANCE_FUTURES_BASE_URL") ?? (testnet ? DEFAULT_TESTNET_BASE_URL : DEFAULT_MAINNET_BASE_URL),

    TG_TOKEN: readString("TG_TOKEN"),
    TG_CHAT_ID: readString("TG_CHAT_ID"),

    // PAPER is always the effective default regardless of this flag; see config.ts#getEffectiveMode.
    REXTORA_DEFAULT_MODE: resolveDefaultMode(),
    REXTORA_LIVE_APPROVED: readBoolean("REXTORA_LIVE_APPROVED", false),
    REXTORA_LIVE_CONFIRMATION_TEXT: readString("REXTORA_LIVE_CONFIRMATION_TEXT"),

    REXTORA_MAX_DAILY_LOSS_PCT: readNumber("REXTORA_MAX_DAILY_LOSS_PCT", -5),
    REXTORA_MAX_TOTAL_LOSS_PCT: readNumber("REXTORA_MAX_TOTAL_LOSS_PCT", -10),
    REXTORA_MAX_CONSECUTIVE_LOSSES: readInt("REXTORA_MAX_CONSECUTIVE_LOSSES", 3),
    REXTORA_MAX_POSITIONS: readInt("REXTORA_MAX_POSITIONS", 3),
    REXTORA_MAX_LEVERAGE: readNumber("REXTORA_MAX_LEVERAGE", 2.5),
    REXTORA_MAX_TRADES_PER_DAY: readInt("REXTORA_MAX_TRADES_PER_DAY", 20),
    REXTORA_MIN_EXPECTED_EDGE_PCT: readNumber("REXTORA_MIN_EXPECTED_EDGE_PCT", 0.3),
    REXTORA_SAFETY_MARGIN_PCT: readNumber("REXTORA_SAFETY_MARGIN_PCT", 0.14),
    REXTORA_SERVER_TPSL_REQUIRED: readBoolean("REXTORA_SERVER_TPSL_REQUIRED", true)
  };
}

export function hasBinanceCredentials(): boolean {
  const env = getEnv();
  return Boolean(env.BINANCE_API_KEY && env.BINANCE_API_SECRET);
}

export function hasTelegramCredentials(): boolean {
  const env = getEnv();
  return Boolean(env.TG_TOKEN && env.TG_CHAT_ID);
}
