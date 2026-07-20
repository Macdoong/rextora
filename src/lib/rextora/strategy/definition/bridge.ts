import type { SafeV44Params, StoredStrategy, StrategyTimeframe } from "../strategyTypes";
import { SAFE_STRATEGY_ID } from "../strategyTypes";
import { computeParamsHash } from "../strategyHash";
import {
  STRATEGY_SCHEMA_VERSION,
  emptyGroup,
  type CanonicalStrategyDefinition,
  type StrategyKind
} from "./types";
import { defaultDefinition } from "./validator";

/** Extend StoredStrategy with canonical fields (backward compatible). */
export type StoredStrategyV1 = StoredStrategy & {
  schemaVersion?: number;
  strategyType?: StrategyKind;
  sourceStrategyId?: string | null;
  version?: string;
  symbols?: string[];
  longEnabled?: boolean;
  shortEnabled?: boolean;
  definition?: CanonicalStrategyDefinition;
};

export function storedToDefinition(s: StoredStrategyV1): CanonicalStrategyDefinition {
  if (s.definition && s.definition.schemaVersion === STRATEGY_SCHEMA_VERSION) {
    return {
      ...s.definition,
      strategyId: s.id,
      strategyName: s.name,
      locked: s.locked,
      paramsHash: s.paramsHash,
      safeParams: s.params as unknown as Record<string, number | boolean>
    };
  }

  const kind: StrategyKind = s.strategyType ?? (s.sourceStatus === "user_created" && s.definition ? "condition_builder" : "safe_params");
  return defaultDefinition({
    strategyId: s.id,
    strategyName: s.name,
    description: s.description,
    version: s.version ?? "1.0.0",
    strategyType: kind,
    sourceStrategyId: s.sourceStrategyId ?? (s.id === SAFE_STRATEGY_ID ? null : s.sourceStatus === "user_copy" ? SAFE_STRATEGY_ID : null),
    locked: s.locked,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    timeframe: (s.timeframe as CanonicalStrategyDefinition["timeframe"]) ?? "unknown",
    symbols: s.symbols ?? ["BTCUSDT"],
    longEnabled: s.longEnabled ?? true,
    shortEnabled: s.shortEnabled ?? s.params.confirm_bear,
    entryConditions: { long: emptyGroup("AND"), short: emptyGroup("AND") },
    exitConditions: { long: emptyGroup("OR"), short: emptyGroup("OR") },
    risk: {
      stopLossAtrMult: s.params.sl_atr_mult,
      takeProfitAtrMult: s.params.tp_atr_mult,
      useTrailing: s.params.use_trailing,
      trailAtrMult: s.params.trail_atr_mult,
      maxHoldBars: s.params.max_hold_bars,
      oppositeSignalExit: true,
      structureInvalidationExit: false,
      partialExitEnabled: false
    },
    positionSizing: {
      baseBalancePct: s.params.base_bal_pct,
      sizeMin: s.params.size_min,
      sizeMax: s.params.size_max,
      useVolTarget: s.params.use_vol_target,
      targetAtrPct: s.params.target_atr_pct
    },
    execution: {
      costGuardEnabled: s.params.cost_guard,
      costGuardK: s.params.cost_guard_k,
      cooldownBars: s.params.cooldown_bars,
      longEnabled: s.longEnabled ?? true,
      shortEnabled: s.shortEnabled ?? s.params.confirm_bear
    },
    metadata: {
      sourceStatus: s.sourceStatus,
      sourceFile: s.sourceFile
    },
    paramsHash: s.paramsHash,
    safeParams: s.params as unknown as Record<string, number | boolean>
  });
}

export function definitionToStoredPatch(def: CanonicalStrategyDefinition, base: StoredStrategy): Partial<StoredStrategyV1> {
  const params = { ...base.params };
  if (def.safeParams) {
    for (const [k, v] of Object.entries(def.safeParams)) {
      if (k in params) (params as Record<string, unknown>)[k] = v;
    }
  }
  // Map risk/sizing/execution back onto SafeV44Params for pipeline compatibility
  params.sl_atr_mult = def.risk.stopLossAtrMult;
  params.tp_atr_mult = def.risk.takeProfitAtrMult;
  params.use_trailing = def.risk.useTrailing;
  params.trail_atr_mult = def.risk.trailAtrMult;
  params.max_hold_bars = def.risk.maxHoldBars;
  params.base_bal_pct = def.positionSizing.baseBalancePct;
  params.size_min = def.positionSizing.sizeMin;
  params.size_max = def.positionSizing.sizeMax;
  params.use_vol_target = def.positionSizing.useVolTarget;
  params.target_atr_pct = def.positionSizing.targetAtrPct;
  params.cost_guard = def.execution.costGuardEnabled;
  params.cost_guard_k = def.execution.costGuardK;
  params.cooldown_bars = def.execution.cooldownBars;
  params.confirm_bear = def.shortEnabled && def.execution.shortEnabled;

  return {
    name: def.strategyName,
    description: def.description,
    timeframe: def.timeframe as StrategyTimeframe,
    params,
    paramsHash: computeParamsHash(params),
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategyType: def.strategyType,
    sourceStrategyId: def.sourceStrategyId,
    version: def.version,
    symbols: def.symbols,
    longEnabled: def.longEnabled,
    shortEnabled: def.shortEnabled,
    definition: { ...def, paramsHash: computeParamsHash(params), safeParams: params as unknown as Record<string, number | boolean> }
  };
}

export function applyDefinitionRiskToParams(def: CanonicalStrategyDefinition, params: SafeV44Params): SafeV44Params {
  return {
    ...params,
    sl_atr_mult: def.risk.stopLossAtrMult,
    tp_atr_mult: def.risk.takeProfitAtrMult,
    use_trailing: def.risk.useTrailing,
    trail_atr_mult: def.risk.trailAtrMult,
    max_hold_bars: def.risk.maxHoldBars,
    base_bal_pct: def.positionSizing.baseBalancePct,
    cost_guard: def.execution.costGuardEnabled,
    cost_guard_k: def.execution.costGuardK
  };
}
