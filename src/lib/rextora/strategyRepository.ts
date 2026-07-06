import safeStrategyFile from "@/data/strategies/SAFE_v44_i4060.json";
import { preservedStrategies } from "./seedData";
import type { Strategy } from "./types";

export const SAFE_STRATEGY_ID = "SAFE_v44_i4060";
export const SAFE_PARAMS_HASH = "7893ca3f0e30";

export interface SafeStrategyFile {
  name: string;
  params_hash: string;
  type: string;
  live_eligible_candidate: boolean;
  verified_for_live: boolean;
  interpretation: string;
  recent_3m: Record<string, number>;
  prev_3m: Record<string, number>;
  full_10m: Record<string, number>;
  params: Record<string, boolean | number | string>;
}

export function loadSafeStrategyFile(): SafeStrategyFile {
  return safeStrategyFile as SafeStrategyFile;
}

export function validateSafeStrategyHash(): { ok: boolean; expected: string; actual: string; message: string } {
  const actual = loadSafeStrategyFile().params_hash;
  const ok = actual === SAFE_PARAMS_HASH;

  return {
    ok,
    expected: SAFE_PARAMS_HASH,
    actual,
    message: ok ? "SAFE 전략 해시가 일치합니다." : `SAFE 전략 해시 불일치: expected ${SAFE_PARAMS_HASH}, actual ${actual}`
  };
}

export function getStrategies(): Strategy[] {
  const safeExists = preservedStrategies.some((strategy) => strategy.id === SAFE_STRATEGY_ID);

  if (safeExists) return preservedStrategies;
  return [getPreservedSafeStrategy(), ...preservedStrategies];
}

export function getStrategyById(id: string): Strategy | undefined {
  return getStrategies().find((strategy) => strategy.id === id);
}

export function getPreservedSafeStrategy(): Strategy {
  const strategy = preservedStrategies.find((item) => item.id === SAFE_STRATEGY_ID);
  if (!strategy) {
    throw new Error("SAFE_v44_i4060 must always exist.");
  }
  return strategy;
}

export function isStrategyLiveEligible(strategy: Strategy): boolean {
  const hash = strategy.id === SAFE_STRATEGY_ID ? validateSafeStrategyHash().ok : true;
  const blockedByType = strategy.type === "공격형 후보" || strategy.type === "탐색 중";

  return Boolean(strategy.liveEligibleCandidate && strategy.verifiedForLive && hash && !blockedByType);
}
