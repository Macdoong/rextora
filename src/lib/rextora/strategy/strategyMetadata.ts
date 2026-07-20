import { getStrategyById, listStrategies } from "./strategyStore";
import type { StoredStrategyV1 } from "./definition/bridge";
import { SAFE_STRATEGY_ID, type StoredStrategy } from "./strategyTypes";
import { displaySourceStatus, displayTimeframeLabel } from "../displayLabels";
import { isPollutionCloneName, isTestStrategyRecord } from "./strategyTestFilter";

export type StrategyPublicMeta = {
  id: string;
  name: string;
  paramsHash: string;
  timeframe: string;
  timeframeLabel: string;
  sourceStrategyId: string | null;
  locked: boolean;
  paperActive: boolean;
  liveEligible: boolean;
  liveActive: boolean;
  sourceStatus: string;
  sourceStatusLabel: string;
  lastBacktestAt: string | null;
  isTestData: boolean;
  strategyType: string;
};

export { isPollutionCloneName, isTestStrategyRecord };

export function isTestStrategy(s: StoredStrategy | StoredStrategyV1): boolean {
  return isTestStrategyRecord(s as StoredStrategy & { testData?: boolean });
}

export function listProductionStrategies(): StoredStrategy[] {
  return listStrategies().filter((s) => !isTestStrategy(s));
}

export function getStrategyPublicMeta(id: string): StrategyPublicMeta | null {
  const s = getStrategyById(id) as StoredStrategyV1 | undefined;
  if (!s) return null;
  const tf = s.id === SAFE_STRATEGY_ID && (s.timeframe === "unknown" || !s.timeframe) ? "15m" : s.timeframe;
  return {
    id: s.id,
    name: s.name,
    paramsHash: s.paramsHash,
    timeframe: tf,
    timeframeLabel: displayTimeframeLabel(tf),
    sourceStrategyId: s.sourceStrategyId ?? null,
    locked: s.locked,
    paperActive: s.paperActive,
    liveEligible: s.liveEligible,
    liveActive: s.liveActive,
    sourceStatus: s.sourceStatus,
    sourceStatusLabel: displaySourceStatus(s.sourceStatus),
    lastBacktestAt: s.lastBacktest?.at ?? null,
    isTestData: isTestStrategy(s),
    strategyType: s.strategyType ?? "safe_params"
  };
}

export function listStrategyPublicMeta(includeTest = false): StrategyPublicMeta[] {
  const list = includeTest ? listStrategies() : listProductionStrategies();
  return list
    .map((s) => getStrategyPublicMeta(s.id))
    .filter((m): m is StrategyPublicMeta => m != null);
}
