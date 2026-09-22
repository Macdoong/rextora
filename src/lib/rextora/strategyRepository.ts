import { preservedStrategies } from "./seedData";
import type { Strategy } from "./types";
import {
  isRetiredSafeId,
  RETIRED_SAFE_PARAMS_HASH,
} from "./strategy/retiredSafeBaseline";

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
  throw new Error("SAFE_v44_i4060 is retired and is not available as a strategy.");
}

export function validateSafeStrategyHash(): {
  ok: boolean;
  expected: string;
  actual: string;
  message: string;
} {
  return {
    ok: false,
    expected: RETIRED_SAFE_PARAMS_HASH,
    actual: "",
    message: "SAFE 기준 전략은 폐기되어 해시 검증을 수행하지 않습니다.",
  };
}

export function getStrategies(): Strategy[] {
  return preservedStrategies.filter((strategy) => !isRetiredSafeId(strategy.id));
}

export function getStrategyById(id: string): Strategy | undefined {
  if (isRetiredSafeId(id)) return undefined;
  return getStrategies().find((strategy) => strategy.id === id);
}

export function getPreservedSafeStrategy(): Strategy {
  throw new Error("SAFE_v44_i4060 is retired. No implicit baseline strategy exists.");
}

export function isStrategyLiveEligible(strategy: Strategy): boolean {
  if (isRetiredSafeId(strategy.id)) return false;
  const blockedByType = strategy.type === "공격형 후보" || strategy.type === "탐색 중";
  return Boolean(strategy.liveEligibleCandidate && strategy.verifiedForLive && !blockedByType);
}
