import {
  MAX_CONDITION_DEPTH,
  MAX_CONDITIONS_PER_GROUP,
  STRATEGY_SCHEMA_VERSION,
  emptyGroup,
  type CanonicalStrategyDefinition,
  type ConditionGroup,
  type ConditionNode,
  type LeafCondition,
  type LeafConditionType
} from "./types";

const SUPPORTED_LEAF = new Set<LeafConditionType>([
  "higher_high",
  "higher_low",
  "lower_high",
  "lower_low",
  "bullish_structure",
  "bearish_structure",
  "break_of_structure",
  "change_of_character",
  "bullish_order_block",
  "bearish_order_block",
  "bullish_fvg",
  "bearish_fvg",
  "ascending_trend_line",
  "descending_trend_line",
  "support_trend_line",
  "resistance_trend_line",
  "support_zone",
  "resistance_zone",
  "previous_high",
  "previous_low",
  "repeated_touch_zone",
  "sr_flip",
  "sma",
  "ema",
  "rsi",
  "atr",
  "vwap",
  "roc",
  "volume",
  "min_quote_volume",
  "quote_volume_rank",
  "min_volatility",
  "max_volatility",
  "spread_limit",
  "cost_guard",
  "candle_body_ratio",
  "breakout_volume_multiplier"
]);

export class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyValidationError";
  }
}

export function assertSafeStrategyId(id: string): void {
  if (!id || id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new StrategyValidationError("잘못된 전략 고유번호입니다. 영문·숫자·_-만 사용할 수 있습니다.");
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new StrategyValidationError("전략 고유번호에 경로 문자를 사용할 수 없습니다.");
  }
}

function validateNode(node: ConditionNode, depth: number): string[] {
  const errors: string[] = [];
  if (depth > MAX_CONDITION_DEPTH) {
    errors.push(`조건 그룹 깊이가 ${MAX_CONDITION_DEPTH}를 초과합니다.`);
    return errors;
  }
  if (node.type === "group") {
    const group = node as ConditionGroup;
    if (group.operator !== "AND" && group.operator !== "OR") {
      errors.push("조건 그룹 연산자는 AND 또는 OR만 지원합니다.");
    }
    if (group.children.length > MAX_CONDITIONS_PER_GROUP) {
      errors.push(`한 그룹의 조건 수는 최대 ${MAX_CONDITIONS_PER_GROUP}개입니다.`);
    }
    for (const child of group.children) {
      errors.push(...validateNode(child, depth + 1));
    }
    return errors;
  }

  const leaf = node as LeafCondition;
  if (!SUPPORTED_LEAF.has(leaf.type)) {
    errors.push(`지원하지 않는 조건입니다: ${leaf.type}`);
    leaf.validationStatus = "error";
    leaf.validationMessage = `지원하지 않는 조건: ${leaf.type}`;
  } else {
    leaf.validationStatus = "ok";
    leaf.validationMessage = undefined;
  }
  if (!leaf.comparison) {
    errors.push(`조건 ${leaf.id}에 비교 연산자가 없습니다.`);
  }
  return errors;
}

export function validateConditionTree(root: ConditionGroup, label: string): string[] {
  if (root.type !== "group") return [`${label}: 루트는 그룹이어야 합니다.`];
  return validateNode(root, 0).map((e) => `${label}: ${e}`);
}

export function validateCanonicalDefinition(def: CanonicalStrategyDefinition): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  try {
    assertSafeStrategyId(def.strategyId);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "고유번호 오류");
  }
  if (def.schemaVersion !== STRATEGY_SCHEMA_VERSION) {
    errors.push(`스키마 버전이 지원되지 않습니다 (현재 ${STRATEGY_SCHEMA_VERSION}).`);
  }
  if (!def.strategyName?.trim()) errors.push("전략 이름이 필요합니다.");
  if (def.timeframe === "unknown" && def.strategyType === "condition_builder") {
    errors.push("적용 시간봉이 확인되지 않았습니다. 시간봉을 선택하세요.");
  }
  if (def.strategyType !== "safe_params" && def.strategyType !== "condition_builder") {
    errors.push("전략 유형이 올바르지 않습니다.");
  }
  if (def.locked && def.strategyId !== "SAFE_v44_i4060") {
    errors.push("잠금 전략은 SAFE 원본만 허용됩니다.");
  }
  errors.push(...validateConditionTree(def.entryConditions.long, "매수 진입"));
  errors.push(...validateConditionTree(def.entryConditions.short, "매도 진입"));
  errors.push(...validateConditionTree(def.exitConditions.long, "매수 청산"));
  errors.push(...validateConditionTree(def.exitConditions.short, "매도 청산"));

  if (def.risk.stopLossAtrMult <= 0) errors.push("손절 기준(ATR 배수)은 0보다 커야 합니다.");
  if (def.risk.takeProfitAtrMult <= 0) errors.push("익절 기준(ATR 배수)은 0보다 커야 합니다.");
  if (def.positionSizing.baseBalancePct <= 0 || def.positionSizing.baseBalancePct > 1) {
    errors.push("진입 금액 비율은 0과 1 사이여야 합니다.");
  }
  if (def.execution.costGuardEnabled && def.execution.costGuardK < 1) {
    errors.push("거래 비용 제한 배수는 1 이상이어야 합니다.");
  }

  if (def.strategyType === "safe_params" && !def.safeParams) {
    errors.push("SAFE 파라미터 전략에는 파라미터 세트가 필요합니다.");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function defaultDefinition(partial: Partial<CanonicalStrategyDefinition> & Pick<CanonicalStrategyDefinition, "strategyId" | "strategyName">): CanonicalStrategyDefinition {
  const now = new Date().toISOString();
  return {
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategyId: partial.strategyId,
    strategyName: partial.strategyName,
    description: partial.description ?? "",
    version: partial.version ?? "1.0.0",
    strategyType: partial.strategyType ?? "condition_builder",
    sourceStrategyId: partial.sourceStrategyId ?? null,
    locked: partial.locked ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    timeframe: partial.timeframe ?? "15m",
    symbols: partial.symbols ?? ["BTCUSDT"],
    longEnabled: partial.longEnabled ?? true,
    shortEnabled: partial.shortEnabled ?? true,
    entryConditions: partial.entryConditions ?? { long: emptyGroup("AND"), short: emptyGroup("AND") },
    exitConditions: partial.exitConditions ?? { long: emptyGroup("OR"), short: emptyGroup("OR") },
    filters: partial.filters ?? {},
    risk: partial.risk ?? {
      stopLossAtrMult: 1.5,
      takeProfitAtrMult: 3,
      useTrailing: false,
      trailAtrMult: 2,
      maxHoldBars: 48,
      oppositeSignalExit: true,
      structureInvalidationExit: false,
      partialExitEnabled: false
    },
    positionSizing: partial.positionSizing ?? {
      baseBalancePct: 0.02,
      sizeMin: 0.5,
      sizeMax: 1.5,
      useVolTarget: false,
      targetAtrPct: 0.02
    },
    execution: partial.execution ?? {
      costGuardEnabled: true,
      costGuardK: 3,
      cooldownBars: 2,
      longEnabled: true,
      shortEnabled: true
    },
    metadata: partial.metadata ?? {},
    paramsHash: partial.paramsHash ?? "",
    safeParams: partial.safeParams
  };
}
