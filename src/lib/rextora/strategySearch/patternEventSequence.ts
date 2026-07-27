/**
 * Build Canonical eventSequence + definition shell from Pattern Search params.
 */

import {
  buildFvgSequence,
  buildOrderBlockLongSequence,
  buildSupportResistanceSequence,
  buildSupplyDemandSequence,
  buildTrendlineSequence,
  type StrategyEventSequence,
} from "../strategy/definition/eventSequence";
import { defaultDefinition } from "../strategy/definition/validator";
import type { CanonicalStrategyDefinition } from "../strategy/definition/types";
import {
  buildCombinedEventSequence,
  combinationLabelKo,
  resolveCombinationFromParams,
} from "./patternCombination";
import {
  type PatternSearchFamilyId,
  readFvgParams,
  readOrderBlockParams,
  readSupportResistanceParams,
  readSupplyDemandParams,
  readTrendlineParams,
  resolvePatternFamilyFromParams,
} from "./patternSearchSpaces";

export function buildPatternEventSequence(
  params: Record<string, unknown>,
  family?: PatternSearchFamilyId | null,
): StrategyEventSequence | null {
  const combo = resolveCombinationFromParams(params);
  if (combo && combo.blocks.length > 1) {
    return buildCombinedEventSequence(combo, params);
  }
  const fam =
    family ??
    combo?.blocks[0]?.family ??
    resolvePatternFamilyFromParams(params);
  if (!fam) return null;
  switch (fam) {
    case "fvg":
      return buildFvgSequence(readFvgParams(params));
    case "trendline":
      return buildTrendlineSequence(readTrendlineParams(params));
    case "support_resistance":
      return buildSupportResistanceSequence(readSupportResistanceParams(params));
    case "supply_demand":
      return buildSupplyDemandSequence(readSupplyDemandParams(params));
    default:
      return buildOrderBlockLongSequence(readOrderBlockParams(params));
  }
}

export function buildPatternSearchDefinition(input: {
  candidateId: string;
  strategyName: string;
  timeframe: "5m" | "15m" | "1h";
  symbols?: string[];
  params: Record<string, unknown>;
  family?: PatternSearchFamilyId | null;
}): CanonicalStrategyDefinition | null {
  const combo = resolveCombinationFromParams(input.params);
  const fam =
    input.family ??
    combo?.blocks.find((b) => b.role === "entry_zone")?.family ??
    combo?.blocks[0]?.family ??
    resolvePatternFamilyFromParams(input.params);
  const seq = buildPatternEventSequence(input.params, fam);
  if (!seq || !fam) return null;
  const comboLabel = combo ? combinationLabelKo(combo) : null;
  const stop =
    typeof input.params.stopAtrMult === "number"
      ? input.params.stopAtrMult
      : 1.2;
  const tp =
    typeof input.params.tpAtrMult === "number" ? input.params.tpAtrMult : 2;
  const hold =
    typeof input.params.maxHoldBars === "number"
      ? Math.trunc(input.params.maxHoldBars)
      : 48;
  const levMin = Number(input.params.lev_min);
  const levBase = Number(input.params.lev_base);
  const levMax = Number(input.params.lev_max);
  const hasLev =
    Number.isFinite(levBase) ||
    Number.isFinite(levMin) ||
    Number.isFinite(levMax) ||
    input.params.use_dynamic_leverage != null;
  return defaultDefinition({
    strategyId: input.candidateId,
    strategyName: input.strategyName,
    strategyType: "condition_builder",
    timeframe: input.timeframe,
    symbols: input.symbols ?? ["BTCUSDT"],
    longEnabled: seq.direction !== "short",
    shortEnabled: seq.direction === "short" || seq.direction === "both",
    eventSequence: seq,
    risk: {
      stopLossAtrMult: stop,
      takeProfitAtrMult: tp,
      useTrailing: false,
      trailAtrMult: 1,
      maxHoldBars: hold,
      oppositeSignalExit: false,
      structureInvalidationExit: false,
      partialExitEnabled: false,
    },
    positionSizing: {
      baseBalancePct: 0.1,
      sizeMin: 0.5,
      sizeMax: 1.5,
      useVolTarget: false,
      targetAtrPct: 0.02,
    },
    execution: {
      costGuardEnabled: false,
      costGuardK: 3,
      cooldownBars: 0,
      longEnabled: seq.direction !== "short",
      shortEnabled: seq.direction === "short" || seq.direction === "both",
    },
    metadata: {
      searchFamily: fam,
      pattern: fam,
      ...(comboLabel ? { patternCombination: comboLabel } : {}),
      ...(combo
        ? {
            combinationTemplate: combo.templateId,
            combinationOperator: combo.operator,
            combinationFamilies: combo.blocks
              .map((b) => b.family)
              .join("+"),
          }
        : {}),
      ...(hasLev
        ? {
            lev_min: Number.isFinite(levMin) ? levMin : 1,
            lev_base: Number.isFinite(levBase) ? levBase : 1,
            lev_max: Number.isFinite(levMax) ? levMax : 1,
            use_dynamic_leverage: Boolean(input.params.use_dynamic_leverage),
          }
        : {}),
    },
  });
}
