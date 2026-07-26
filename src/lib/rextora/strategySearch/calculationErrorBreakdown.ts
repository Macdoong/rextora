/**
 * Breakdown of Strategy Search evaluation failures vs calculation errors.
 * Qualification gate failures are NOT calculation errors.
 */

import type { StrategySearchTrial } from "./types";
import type { StrategySearchEngineErrorClass } from "./engineErrorClassification";

export type CalculationErrorCategory =
  | "candidate_invalid"
  | "parameter_out_of_range"
  | "normalization_failed"
  | "market_data_missing"
  | "backtest_failed"
  | "cost_calculation_failed"
  | "robustness_failed"
  | "overfitting_analysis_failed"
  | "persistence_failed"
  | "worker_failed"
  | "unknown_engine_error";

export interface ErrorSignatureRow {
  signature: string;
  code: string;
  category: CalculationErrorCategory;
  count: number;
  recoverable: boolean;
  sampleMessage: string;
  generations: number[];
}

export interface CalculationErrorBreakdown {
  totalTrials: number;
  passed: number;
  /** Normal qualification failures (EVALUATION_FAILED_GATES, etc.). */
  rejectedQualification: number;
  /** Robustness sampling failures counted as rejection, not calc error. */
  robustnessRejects: number;
  /** True engine/calculation errors. */
  calculationErrors: number;
  byCode: Record<string, number>;
  byCategory: Record<CalculationErrorCategory, number>;
  topSignatures: ErrorSignatureRow[];
}

const QUALIFICATION_CODES = new Set([
  "EVALUATION_FAILED_GATES",
  "FAILED_GATES",
  "QUALIFICATION_FAILED",
]);

const ROBUSTNESS_CODES = new Set([
  "JITTER_DUPLICATE_EXHAUSTED",
  "ROBUSTNESS_FAILED",
]);

function categoryForCode(code: string): CalculationErrorCategory {
  const c = code.toUpperCase();
  if (c.includes("OUT_OF_RANGE") || c.includes("PARAMETER")) {
    return "parameter_out_of_range";
  }
  if (c.includes("NORMALIZ")) return "normalization_failed";
  if (c.includes("CANDLE") || c.includes("MARKET") || c.includes("DATA")) {
    return "market_data_missing";
  }
  if (c.includes("BACKTEST")) return "backtest_failed";
  if (c.includes("COST") || c.includes("STRESS")) return "cost_calculation_failed";
  if (c.includes("JITTER") || c.includes("ROBUST")) return "robustness_failed";
  if (c.includes("OVERFIT")) return "overfitting_analysis_failed";
  if (c.includes("PERSIST")) return "persistence_failed";
  if (c.includes("WORKER")) return "worker_failed";
  if (
    c.includes("INVALID") ||
    c.includes("VALIDATION") ||
    c.includes("DUPLICATE")
  ) {
    return "candidate_invalid";
  }
  return "unknown_engine_error";
}

function isRecoverableCategory(cat: CalculationErrorCategory): boolean {
  return (
    cat !== "persistence_failed" &&
    cat !== "worker_failed" &&
    cat !== "unknown_engine_error"
  );
}

/**
 * Classify trial failureReasons into qualification / robustness / calc-error buckets.
 */
export function buildCalculationErrorBreakdown(
  trials: StrategySearchTrial[],
): CalculationErrorBreakdown {
  const byCode: Record<string, number> = {};
  const byCategory = {
    candidate_invalid: 0,
    parameter_out_of_range: 0,
    normalization_failed: 0,
    market_data_missing: 0,
    backtest_failed: 0,
    cost_calculation_failed: 0,
    robustness_failed: 0,
    overfitting_analysis_failed: 0,
    persistence_failed: 0,
    worker_failed: 0,
    unknown_engine_error: 0,
  } satisfies Record<CalculationErrorCategory, number>;

  const sigMap = new Map<string, ErrorSignatureRow>();
  let passed = 0;
  let rejectedQualification = 0;
  let robustnessRejects = 0;
  let calculationErrors = 0;

  for (const t of trials) {
    if (t.passed) {
      passed += 1;
      continue;
    }
    const reasons = t.failureReasons ?? [];
    if (reasons.length === 0) {
      rejectedQualification += 1;
      continue;
    }
    const primary = reasons[0]!;
    const code = primary.code || "UNKNOWN";
    if (QUALIFICATION_CODES.has(code)) {
      rejectedQualification += 1;
      continue;
    }
    if (ROBUSTNESS_CODES.has(code) || categoryForCode(code) === "robustness_failed") {
      robustnessRejects += 1;
      byCode[code] = (byCode[code] ?? 0) + 1;
      byCategory.robustness_failed += 1;
      const signature = `${code}|robustness`;
      const row = sigMap.get(signature) ?? {
        signature,
        code,
        category: "robustness_failed" as const,
        count: 0,
        recoverable: true,
        sampleMessage: primary.message,
        generations: [],
      };
      row.count += 1;
      if (!row.generations.includes(t.iteration)) {
        row.generations.push(t.iteration);
      }
      sigMap.set(signature, row);
      continue;
    }

    calculationErrors += 1;
    byCode[code] = (byCode[code] ?? 0) + 1;
    const category = categoryForCode(code);
    byCategory[category] += 1;
    const signature = `${code}|${category}|${(primary.message || "").slice(0, 80)}`;
    const row = sigMap.get(signature) ?? {
      signature,
      code,
      category,
      count: 0,
      recoverable: isRecoverableCategory(category),
      sampleMessage: primary.message,
      generations: [],
    };
    row.count += 1;
    if (!row.generations.includes(t.iteration)) {
      row.generations.push(t.iteration);
    }
    sigMap.set(signature, row);
  }

  const topSignatures = [...sigMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalTrials: trials.length,
    passed,
    rejectedQualification,
    robustnessRejects,
    calculationErrors,
    byCode,
    byCategory,
    topSignatures,
  };
}

/** Current error rate among evaluated trials (calc errors / total non-pass attempts). */
export function calculationErrorRate(breakdown: CalculationErrorBreakdown): number {
  const denom =
    breakdown.rejectedQualification +
    breakdown.robustnessRejects +
    breakdown.calculationErrors;
  if (denom <= 0) return 0;
  return breakdown.calculationErrors / denom;
}

export function mapCategoryToEngineClass(
  category: CalculationErrorCategory,
): StrategySearchEngineErrorClass {
  if (category === "market_data_missing") return "data_unavailable";
  if (category === "robustness_failed") return "robustness_failed";
  if (category === "persistence_failed") return "persistence_failed";
  if (category === "worker_failed") return "worker_failed";
  if (category === "unknown_engine_error") return "unknown_engine_error";
  return "candidate_evaluation_failed";
}
