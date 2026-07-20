/**
 * Fee helpers — delegate to unified cost engine (no independent formulas).
 */
import { getConfig } from "./config";
import {
  BINANCE_FUTURES_TAKER_FEE,
  computeRoundTripFee
} from "./metrics/unifiedCost";

/** Round-trip fee in percent points (0.08 = 0.08%). */
export function getRoundTripFeePct(): number {
  return Number((computeRoundTripFee(BINANCE_FUTURES_TAKER_FEE) * 100).toFixed(3));
}

export function getMakerTakerFeePct(isMaker = false): number {
  return isMaker ? 0.02 : Number((BINANCE_FUTURES_TAKER_FEE * 100).toFixed(3));
}

export function estimateRoundTripFeePct(): number {
  return getRoundTripFeePct();
}

/** Funding cost in percent points for holdHours (default one funding interval). */
export function getFundingFeePctFromRate(rate: number, holdHours = 8): number {
  const periods = holdHours / 8;
  return Number((Math.abs(rate) * 100 * periods).toFixed(3));
}

export function getDefaultSafetyMarginPct(): number {
  return getConfig().risk.safetyMarginPct;
}
