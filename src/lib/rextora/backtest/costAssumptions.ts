/**
 * Canonical Backtest cost-assumption provenance (cost_assumptions_v1).
 *
 * Resolves defaults once. Does not change fee / slippage / funding / spread
 * arithmetic — it only names the rates and models the runner already applies.
 */

import {
  SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
  SLIPPAGE_MODEL_LEGACY_V0,
  type SlippageModelVersion,
} from "./executionSlippage";
import type { BacktestConfig, BacktestReport } from "./backtestTypes";

export const COST_ASSUMPTIONS_VERSION = "cost_assumptions_v1" as const;

export const FEE_MODEL_ROUND_TRIP_TAKER_2X = "round_trip_taker_2x" as const;
export const FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE =
  "synthetic_flat_per_trade" as const;
export const SPREAD_MODEL_FLAT_FRACTION_PER_TRADE =
  "flat_fraction_per_trade" as const;
export const COST_GUARD_SLIPPAGE_ESTIMATE_RATE_TIMES_TWO =
  "rate_times_two" as const;
export const RATE_UNIT_DECIMAL_FRACTION = "decimal_fraction" as const;

export const DEFAULT_FEE_RATE = 0.0004;
export const DEFAULT_SLIPPAGE_RATE = 0.0002;
export const DEFAULT_FUNDING_RATE = 0.0001;
export const DEFAULT_SPREAD_RATE = 0.0001;
export const DEFAULT_APPLY_FUNDING = false;
export const DEFAULT_APPLY_SPREAD = false;
export const DEFAULT_COST_GUARD_K = 3;
export const DEFAULT_COST_GUARD_ENABLED = true;
export const DEFAULT_COST_STRESS_MULTIPLIERS = [1, 1.5, 2] as const;
export const FEE_LEG_COUNT = 2;
export const SLIPPAGE_LEG_COUNT = 2;

export const RECOGNIZED_FEE_MODELS = [FEE_MODEL_ROUND_TRIP_TAKER_2X] as const;
export const RECOGNIZED_FUNDING_MODELS = [
  FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE,
] as const;
export const RECOGNIZED_SPREAD_MODELS = [
  SPREAD_MODEL_FLAT_FRACTION_PER_TRADE,
] as const;
export const RECOGNIZED_SLIPPAGE_MODEL_VERSIONS = [
  SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
  SLIPPAGE_MODEL_LEGACY_V0,
] as const;

export type CostAssumptionsV1 = {
  readonly version: typeof COST_ASSUMPTIONS_VERSION;
  readonly fee: {
    readonly configuredRate: number;
    readonly effectiveRate: number;
    readonly model: typeof FEE_MODEL_ROUND_TRIP_TAKER_2X;
    readonly unit: typeof RATE_UNIT_DECIMAL_FRACTION;
    readonly legCount: typeof FEE_LEG_COUNT;
  };
  readonly slippage: {
    readonly configuredRate: number;
    readonly effectiveRate: number;
    readonly modelVersion: string;
    readonly unit: typeof RATE_UNIT_DECIMAL_FRACTION;
    readonly legCount: typeof SLIPPAGE_LEG_COUNT;
  };
  readonly funding: {
    readonly enabled: boolean;
    readonly configuredRate: number;
    readonly effectiveRate: number;
    readonly model: typeof FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE;
    readonly unit: typeof RATE_UNIT_DECIMAL_FRACTION;
  };
  readonly spread: {
    readonly enabled: boolean;
    readonly configuredRate: number;
    readonly effectiveRate: number;
    readonly model: typeof SPREAD_MODEL_FLAT_FRACTION_PER_TRADE;
    readonly unit: typeof RATE_UNIT_DECIMAL_FRACTION;
  };
  readonly costGuard: {
    readonly enabled: boolean;
    readonly k: number;
    readonly slippageEstimateModel: typeof COST_GUARD_SLIPPAGE_ESTIMATE_RATE_TIMES_TWO;
  };
};

export type ResolvedScenarioCostAssumptions = {
  readonly multiplier: number;
  readonly feeRate: number;
  readonly slippageRate: number;
  readonly slippageModelVersion: string;
  readonly fundingEnabled: boolean;
  readonly fundingConfiguredRate: number;
  readonly fundingEffectiveRate: number;
  readonly spreadEnabled: boolean;
  readonly spreadRate: number;
  readonly costGuardK: number;
};

export type NormalizeCostAssumptionsInput = {
  feeRate?: number | null;
  slippageRate?: number | null;
  fundingRate?: number | null;
  applyFunding?: boolean | null;
  spreadRate?: number | null;
  applySpread?: boolean | null;
  costGuardK?: number | null;
  costGuardEnabled?: boolean | null;
  slippageModelVersion?: string | null;
};

export type EffectiveCostRates = {
  readonly feeRate: number;
  readonly slippageRate: number;
  readonly applyFunding: boolean;
  readonly fundingRate: number;
  readonly applySpread: boolean;
  readonly spreadRate: number;
  readonly costGuardK: number;
};

export class CostAssumptionsError extends Error {
  readonly code = "INVALID_COST_ASSUMPTIONS";

  constructor(message: string) {
    super(message);
    this.name = "CostAssumptionsError";
  }
}

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CostAssumptionsError(`${name} must be a finite rate >= 0`);
  }
}

function resolveRequestedRate(
  requested: number | null | undefined,
  fallback: number,
): number {
  if (requested == null) return fallback;
  assertNonNegativeFinite("rate", requested);
  return requested;
}

export function resolveEffectiveRates(
  assumptions: CostAssumptionsV1,
): EffectiveCostRates {
  return Object.freeze({
    feeRate: assumptions.fee.effectiveRate,
    slippageRate: assumptions.slippage.effectiveRate,
    applyFunding: assumptions.funding.enabled,
    fundingRate: assumptions.funding.configuredRate,
    applySpread: assumptions.spread.enabled,
    spreadRate: assumptions.spread.configuredRate,
    costGuardK: assumptions.costGuard.k,
  });
}

export function normalizeCostAssumptions(
  input: NormalizeCostAssumptionsInput = {},
): CostAssumptionsV1 {
  const feeConfigured = resolveRequestedRate(input.feeRate, DEFAULT_FEE_RATE);
  const slipConfigured = resolveRequestedRate(
    input.slippageRate,
    DEFAULT_SLIPPAGE_RATE,
  );
  const fundingConfigured = resolveRequestedRate(
    input.fundingRate,
    DEFAULT_FUNDING_RATE,
  );
  const spreadConfigured = resolveRequestedRate(
    input.spreadRate,
    DEFAULT_SPREAD_RATE,
  );
  const applyFunding = input.applyFunding ?? DEFAULT_APPLY_FUNDING;
  const applySpread = input.applySpread ?? DEFAULT_APPLY_SPREAD;
  const k = resolveRequestedRate(input.costGuardK, DEFAULT_COST_GUARD_K);
  const modelVersion =
    input.slippageModelVersion ?? SLIPPAGE_MODEL_EXECUTION_PRICE_V1;
  if (
    !RECOGNIZED_SLIPPAGE_MODEL_VERSIONS.includes(
      modelVersion as (typeof RECOGNIZED_SLIPPAGE_MODEL_VERSIONS)[number],
    )
  ) {
    throw new CostAssumptionsError(
      `unsupported slippage model version: ${modelVersion}`,
    );
  }

  const assumptions: CostAssumptionsV1 = {
    version: COST_ASSUMPTIONS_VERSION,
    fee: {
      configuredRate: feeConfigured,
      effectiveRate: feeConfigured,
      model: FEE_MODEL_ROUND_TRIP_TAKER_2X,
      unit: RATE_UNIT_DECIMAL_FRACTION,
      legCount: FEE_LEG_COUNT,
    },
    slippage: {
      configuredRate: slipConfigured,
      effectiveRate: slipConfigured,
      modelVersion,
      unit: RATE_UNIT_DECIMAL_FRACTION,
      legCount: SLIPPAGE_LEG_COUNT,
    },
    funding: {
      enabled: applyFunding,
      configuredRate: fundingConfigured,
      effectiveRate: applyFunding ? fundingConfigured : 0,
      model: FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE,
      unit: RATE_UNIT_DECIMAL_FRACTION,
    },
    spread: {
      enabled: applySpread,
      configuredRate: spreadConfigured,
      effectiveRate: applySpread ? spreadConfigured : 0,
      model: SPREAD_MODEL_FLAT_FRACTION_PER_TRADE,
      unit: RATE_UNIT_DECIMAL_FRACTION,
    },
    costGuard: {
      enabled: input.costGuardEnabled ?? DEFAULT_COST_GUARD_ENABLED,
      k,
      slippageEstimateModel: COST_GUARD_SLIPPAGE_ESTIMATE_RATE_TIMES_TWO,
    },
  };
  return Object.freeze({
    version: assumptions.version,
    fee: Object.freeze({ ...assumptions.fee }),
    slippage: Object.freeze({ ...assumptions.slippage }),
    funding: Object.freeze({ ...assumptions.funding }),
    spread: Object.freeze({ ...assumptions.spread }),
    costGuard: Object.freeze({ ...assumptions.costGuard }),
  });
}

export function resolveScenarioCostAssumptions(
  assumptions: CostAssumptionsV1,
  multiplier: number,
): ResolvedScenarioCostAssumptions {
  const mult = Number.isFinite(multiplier) ? multiplier : 1;
  return Object.freeze({
    multiplier: mult,
    feeRate: assumptions.fee.effectiveRate * mult,
    slippageRate: assumptions.slippage.effectiveRate * mult,
    slippageModelVersion: assumptions.slippage.modelVersion,
    fundingEnabled: assumptions.funding.enabled,
    fundingConfiguredRate: assumptions.funding.configuredRate,
    fundingEffectiveRate: assumptions.funding.effectiveRate,
    spreadEnabled: assumptions.spread.enabled,
    spreadRate:
      (assumptions.spread.enabled ? assumptions.spread.configuredRate : 0) *
      mult,
    costGuardK: assumptions.costGuard.k,
  });
}

export function resolvePrimaryCostAssumptions(
  assumptions: CostAssumptionsV1,
  multiplier: number,
): ResolvedScenarioCostAssumptions {
  return resolveScenarioCostAssumptions(assumptions, multiplier);
}

export function costAssumptionsFromConfigRates(
  config: Pick<
    BacktestConfig,
    | "feeRate"
    | "slippageRate"
    | "fundingRate"
    | "applyFunding"
    | "spreadRate"
    | "applySpread"
    | "costGuardK"
  >,
  slippageModelVersion?: string | null,
): CostAssumptionsV1 {
  return normalizeCostAssumptions({
    feeRate: config.feeRate,
    slippageRate: config.slippageRate,
    fundingRate: config.fundingRate,
    applyFunding: config.applyFunding,
    spreadRate: config.spreadRate,
    applySpread: config.applySpread,
    costGuardK: config.costGuardK,
    slippageModelVersion:
      slippageModelVersion ?? SLIPPAGE_MODEL_EXECUTION_PRICE_V1,
  });
}

export function adaptCostAssumptionsSlippageModel(
  assumptions: CostAssumptionsV1,
  slippageModelVersion: string,
): CostAssumptionsV1 {
  if (assumptions.slippage.modelVersion === slippageModelVersion) {
    return assumptions;
  }
  return Object.freeze({
    ...assumptions,
    slippage: Object.freeze({
      ...assumptions.slippage,
      modelVersion: slippageModelVersion,
    }),
  });
}

export function isCostStressSnapshotComplete(row: {
  multiplier?: number;
  feeRate?: number;
  slippageRate?: number;
  slippageModelVersion?: string | null;
  fundingEnabled?: boolean;
  fundingConfiguredRate?: number;
  fundingEffectiveRate?: number;
  spreadEnabled?: boolean;
  spreadRate?: number;
  costGuardK?: number;
}): boolean {
  return (
    typeof row.multiplier === "number" &&
    Number.isFinite(row.multiplier) &&
    typeof row.feeRate === "number" &&
    Number.isFinite(row.feeRate) &&
    typeof row.slippageRate === "number" &&
    Number.isFinite(row.slippageRate) &&
    typeof row.slippageModelVersion === "string" &&
    row.slippageModelVersion.length > 0 &&
    typeof row.fundingEnabled === "boolean" &&
    typeof row.fundingConfiguredRate === "number" &&
    Number.isFinite(row.fundingConfiguredRate) &&
    typeof row.fundingEffectiveRate === "number" &&
    Number.isFinite(row.fundingEffectiveRate) &&
    typeof row.spreadEnabled === "boolean" &&
    typeof row.spreadRate === "number" &&
    Number.isFinite(row.spreadRate) &&
    typeof row.costGuardK === "number" &&
    Number.isFinite(row.costGuardK)
  );
}

export function reconstructAppliedCostAssumptions(report: {
  costAssumptions?: CostAssumptionsV1 | null;
  primaryCostAssumptions?: ResolvedScenarioCostAssumptions | null;
  costStress?: BacktestReport["costStress"];
}): {
  REPORT_ONLY_COST_REPRODUCIBLE: "YES" | "PARTIAL" | "NO";
  base: CostAssumptionsV1 | null;
  primary: ResolvedScenarioCostAssumptions | null;
  stress: ResolvedScenarioCostAssumptions[];
  missing: string[];
} {
  const missing: string[] = [];
  const base = report.costAssumptions ?? null;
  if (!base) missing.push("costAssumptions");
  else if (base.version !== COST_ASSUMPTIONS_VERSION) {
    missing.push("costAssumptions.version");
  }
  const primary = report.primaryCostAssumptions ?? null;
  if (!primary) missing.push("primaryCostAssumptions");
  const stress: ResolvedScenarioCostAssumptions[] = [];
  if (report.costStress && report.costStress.length > 0) {
    for (const row of report.costStress) {
      if (!isCostStressSnapshotComplete(row)) {
        missing.push(`costStress[${row.multiplier}]`);
        continue;
      }
      stress.push(
        Object.freeze({
          multiplier: row.multiplier,
          feeRate: row.feeRate as number,
          slippageRate: row.slippageRate as number,
          slippageModelVersion: String(row.slippageModelVersion),
          fundingEnabled: Boolean(row.fundingEnabled),
          fundingConfiguredRate: row.fundingConfiguredRate as number,
          fundingEffectiveRate: row.fundingEffectiveRate as number,
          spreadEnabled: Boolean(row.spreadEnabled),
          spreadRate: row.spreadRate as number,
          costGuardK: row.costGuardK as number,
        }),
      );
    }
  }
  const complete =
    missing.length === 0 &&
    base?.version === COST_ASSUMPTIONS_VERSION &&
    primary != null;
  return {
    REPORT_ONLY_COST_REPRODUCIBLE: complete
      ? "YES"
      : base
        ? "PARTIAL"
        : "NO",
    base,
    primary,
    stress,
    missing,
  };
}

/** 0.0004 decimal fraction → "0.04%" */
export function formatDecimalRateAsPercentLabel(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  const pct = rate * 100;
  const trimmed = pct.toFixed(4).replace(/\.?0+$/, "");
  return `${trimmed}%`;
}

export function formatCostAssumptionsDisclosure(report: {
  costAssumptions?: CostAssumptionsV1 | null;
  primaryCostAssumptions?: ResolvedScenarioCostAssumptions | null;
  slippageModelVersion?: string | null;
}): string {
  const a = report.costAssumptions;
  if (!a) {
    return report.slippageModelVersion
      ? `레거시 결과 · 슬리피지 ${report.slippageModelVersion}`
      : "레거시 결과 · 비용 가정 미기록";
  }
  const primary = report.primaryCostAssumptions;
  const fee = primary?.feeRate ?? a.fee.effectiveRate;
  const slip = primary?.slippageRate ?? a.slippage.effectiveRate;
  const fundingLabel = a.funding.enabled
    ? `적용 ${formatDecimalRateAsPercentLabel(a.funding.configuredRate)}`
    : `미적용 ${formatDecimalRateAsPercentLabel(a.funding.configuredRate)}`;
  const spreadLabel = a.spread.enabled
    ? `적용 ${formatDecimalRateAsPercentLabel(primary?.spreadRate ?? a.spread.effectiveRate)}`
    : "미적용";
  return [
    `수수료 ${formatDecimalRateAsPercentLabel(fee)}`,
    `슬리피지 ${formatDecimalRateAsPercentLabel(slip)} (${a.slippage.modelVersion})`,
    `펀딩 ${fundingLabel}`,
    `스프레드 ${spreadLabel}`,
    `비용가드 k=${a.costGuard.k}`,
    a.version,
  ].join(" · ");
}

export function stampReportCostProvenance(input: {
  report: BacktestReport;
  config: BacktestConfig;
  isSafeEngine: boolean;
  multipliers: number[];
}): BacktestReport {
  const baseFromConfig =
    input.config.costAssumptions ??
    costAssumptionsFromConfigRates(
      input.config,
      input.report.slippageModelVersion,
    );
  const stampedModel = input.isSafeEngine
    ? baseFromConfig.slippage.modelVersion
    : (input.report.slippageModelVersion ?? SLIPPAGE_MODEL_LEGACY_V0);
  const base = input.config.costAssumptions
    ? adaptCostAssumptionsSlippageModel(baseFromConfig, stampedModel)
    : null;
  const snapshotSource = base ?? baseFromConfig;
  const primaryMult = input.multipliers[0] ?? 1;
  const primary = resolvePrimaryCostAssumptions(snapshotSource, primaryMult);
  return {
    ...input.report,
    costAssumptions: base ?? undefined,
    primaryCostAssumptions: input.config.costAssumptions ? primary : undefined,
  };
}

export function enrichCostStressRow(
  row: NonNullable<BacktestReport["costStress"]>[number],
  config: BacktestConfig,
  assumptions: CostAssumptionsV1 | null | undefined,
): NonNullable<BacktestReport["costStress"]>[number] {
  const source =
    assumptions ??
    costAssumptionsFromConfigRates(config, row.slippageModelVersion);
  const resolved = resolveScenarioCostAssumptions(source, row.multiplier);
  return {
    ...row,
    feeRate: resolved.feeRate,
    slippageRate: resolved.slippageRate,
    slippageModelVersion: (row.slippageModelVersion ??
      resolved.slippageModelVersion) as SlippageModelVersion,
    fundingEnabled: resolved.fundingEnabled,
    fundingConfiguredRate: resolved.fundingConfiguredRate,
    fundingEffectiveRate: resolved.fundingEffectiveRate,
    spreadEnabled: resolved.spreadEnabled,
    spreadRate: resolved.spreadRate,
    costGuardK: resolved.costGuardK,
  };
}

export function hasPersistedCostAssumptions(report: {
  costAssumptions?: CostAssumptionsV1 | null;
}): boolean {
  return report.costAssumptions != null && typeof report.costAssumptions === "object";
}

export function hasPersistedSlippageModelVersion(report: {
  slippageModelVersion?: string | null;
}): boolean {
  return (
    typeof report.slippageModelVersion === "string" &&
    report.slippageModelVersion.length > 0
  );
}

export function isValidCostRate(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isRecognizedFeeModel(model: unknown): boolean {
  return model === FEE_MODEL_ROUND_TRIP_TAKER_2X;
}

export function isRecognizedFundingModel(model: unknown): boolean {
  return model === FUNDING_MODEL_SYNTHETIC_FLAT_PER_TRADE;
}

export function isRecognizedSpreadModel(model: unknown): boolean {
  return model === SPREAD_MODEL_FLAT_FRACTION_PER_TRADE;
}
