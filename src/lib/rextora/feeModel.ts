import { getConfig } from "./config";

export function getRoundTripFeePct(): number {
  return 0.08;
}

export function getMakerTakerFeePct(isMaker = false): number {
  return isMaker ? 0.02 : 0.04;
}

export function estimateRoundTripFeePct(): number {
  return getRoundTripFeePct();
}

export function getFundingFeePctFromRate(rate: number, holdHours = 8): number {
  const hourly = Math.abs(rate) * 100;
  return Number(((hourly * holdHours) / 8).toFixed(3));
}

export function getDefaultSafetyMarginPct(): number {
  return getConfig().risk.safetyMarginPct;
}
