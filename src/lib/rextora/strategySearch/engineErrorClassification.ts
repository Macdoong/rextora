/**
 * Classify Strategy Search engine errors into recoverable vs fatal classes.
 * Candidate-level failures must not terminate the Research Job unless fatal.
 */

import { HistoricalDataCoverageError } from "../data/historicalDataCoverage";
import { HistoricalCandleLoadError } from "../data/historicalCandleLoader";
import { StrategySearchAdapterError } from "./backtestAdapter";
import { StrategySearchGenerationError } from "./candidateGenerator";
import { StrategySearchJitterError } from "./jitterEvaluator";

const RESEARCH_DATA_ADAPTER_CODES = new Set([
  "EMPTY_CANDLES",
  "UNSORTED_CANDLES",
  "DUPLICATE_CANDLE_TIME",
  "CANDLE_OUTSIDE_WINDOW",
  "DATA_COVERAGE_INSUFFICIENT",
]);

export type StrategySearchEngineErrorClass =
  | "candidate_invalid"
  | "parameter_out_of_range"
  | "normalization_failed"
  | "market_data_missing"
  | "backtest_failed"
  | "cost_calculation_failed"
  | "candidate_evaluation_failed"
  | "data_unavailable"
  | "robustness_failed"
  | "overfitting_analysis_failed"
  | "persistence_failed"
  | "worker_failed"
  | "unknown_engine_error"
  | "fatal_engine_error";

export interface ClassifiedEngineError {
  class: StrategySearchEngineErrorClass;
  /** Only fatal_engine_error / persistence_failed (unrecoverable) may kill the job. */
  fatal: boolean;
  code: string;
  message: string;
  stage: string;
  retryable: boolean;
}

function dataUnavailableClassification(
  err: { code: string; message: string },
  stage: string,
): ClassifiedEngineError {
  return {
    class: "data_unavailable",
    fatal: true,
    code: err.code,
    message: err.message,
    stage: stage || "evaluation",
    retryable: true,
  };
}

export function isResearchMarketDataError(err: unknown): boolean {
  if (err instanceof HistoricalCandleLoadError) return true;
  if (err instanceof HistoricalDataCoverageError) return true;
  if (err instanceof StrategySearchAdapterError) {
    return RESEARCH_DATA_ADAPTER_CODES.has(err.code);
  }
  return false;
}

export function classifyEngineError(
  err: unknown,
  stage = "unknown",
): ClassifiedEngineError {
  if (err instanceof HistoricalCandleLoadError) {
    return dataUnavailableClassification(err, stage);
  }
  if (err instanceof HistoricalDataCoverageError) {
    return dataUnavailableClassification(
      { code: err.sourceReason, message: err.message },
      stage,
    );
  }
  if (err instanceof StrategySearchAdapterError) {
    if (RESEARCH_DATA_ADAPTER_CODES.has(err.code)) {
      return dataUnavailableClassification(
        {
          code: err.sourceReason ?? err.code,
          message: err.message,
        },
        stage,
      );
    }
  }
  if (err instanceof StrategySearchJitterError) {
    return {
      class: "robustness_failed",
      fatal: false,
      code: err.code,
      message: err.message,
      stage: stage || "robustness",
      retryable: err.code === "JITTER_DUPLICATE_EXHAUSTED",
    };
  }
  if (err instanceof StrategySearchGenerationError) {
    if (err.code === "CONFIGURATION_INVALID") {
      return {
        class: "fatal_engine_error",
        fatal: true,
        code: "CONFIGURATION_INVALID",
        message: err.message,
        stage: stage || "candidate_generation",
        retryable: false,
      };
    }
    if (
      err.code === "VALIDATION_FAILED" ||
      err.code === "INVALID_INPUT" ||
      err.code === "DUPLICATE_EXHAUSTED"
    ) {
      return {
        class:
          err.code === "DUPLICATE_EXHAUSTED"
            ? "candidate_invalid"
            : "candidate_invalid",
        fatal: false,
        code: err.code,
        message: err.message,
        stage: stage || "candidate_generation",
        retryable: err.code !== "DUPLICATE_EXHAUSTED",
      };
    }
    if (err.code === "PROTECTED_HASH_COLLISION") {
      return {
        class: "candidate_invalid",
        fatal: false,
        code: err.code,
        message: err.message,
        stage: stage || "candidate_generation",
        retryable: true,
      };
    }
    return {
      class: "fatal_engine_error",
      fatal: true,
      code: err.code,
      message: err.message,
      stage: stage || "candidate_generation",
      retryable: false,
    };
  }

  const message = err instanceof Error ? err.message : String(err ?? "unknown");
  const lower = message.toLowerCase();
  if (
    lower.includes("nextint mininclusive") ||
    lower.includes("nextfloat mininclusive") ||
    lower.includes("integer range empty") ||
    lower.includes("numeric range inverted")
  ) {
    return {
      class: "parameter_out_of_range",
      fatal: false,
      code: "PARAMETER_OUT_OF_RANGE",
      message,
      stage: stage || "candidate_generation",
      retryable: true,
    };
  }
  if (lower.includes("trial already exists with different contents")) {
    return {
      class: "persistence_failed",
      fatal: false,
      code: "TRIAL_COLLISION",
      message,
      stage: stage || "persistence",
      retryable: true,
    };
  }
  if (lower.includes("invalid strategy-search status transition")) {
    return {
      class: "unknown_engine_error",
      fatal: false,
      code: "INVALID_STATUS_TRANSITION",
      message,
      stage: stage || "job_state",
      retryable: true,
    };
  }
  if (
    lower.includes("candle") ||
    lower.includes("klines") ||
    lower.includes("data unavailable") ||
    lower.includes("no market data")
  ) {
    return {
      class: "data_unavailable",
      fatal: false,
      code: "DATA_UNAVAILABLE",
      message,
      stage: stage || "evaluation",
      retryable: true,
    };
  }
  if (
    lower.includes("persist") ||
    lower.includes("enospc") ||
    lower.includes("eacces") ||
    lower.includes("checkpoint")
  ) {
    return {
      class: "persistence_failed",
      fatal: true,
      code: "PERSISTENCE_FAILED",
      message,
      stage: stage || "persistence",
      retryable: true,
    };
  }
  if (lower.includes("worker") || lower.includes("timeout")) {
    return {
      class: "worker_failed",
      fatal: true,
      code: "WORKER_FAILED",
      message,
      stage: stage || "worker",
      retryable: true,
    };
  }
  if (lower.includes("jitter") || lower.includes("stress") || lower.includes("robust")) {
    return {
      class: "robustness_failed",
      fatal: false,
      code: "ROBUSTNESS_FAILED",
      message,
      stage: stage || "robustness",
      retryable: true,
    };
  }
  if (
    lower.includes("evaluation") ||
    lower.includes("backtest") ||
    lower.includes("score")
  ) {
    return {
      class: "candidate_evaluation_failed",
      fatal: false,
      code: "CANDIDATE_EVALUATION_FAILED",
      message,
      stage: stage || "evaluation",
      retryable: true,
    };
  }
  return {
    class: "fatal_engine_error",
    fatal: true,
    code: "FATAL_ENGINE_ERROR",
    message,
    stage,
    retryable: false,
  };
}

export function isRecoverableGenerationError(err: unknown): boolean {
  const c = classifyEngineError(err, "candidate_generation");
  return !c.fatal && c.class === "candidate_invalid";
}

/**
 * Stable generation-error fingerprint for repeatedSignatureThreshold.
 * Uses only classifier-owned structured fields (code + class).
 * Never includes raw messages, timestamps, iterations, or parameter values.
 *
 * The classifier emits a closed set of codes and StrategySearchEngineErrorClass
 * values, so the fingerprint domain is finite and does not require eviction.
 */
export function buildRepeatedGenerationErrorFingerprint(
  classified: Pick<ClassifiedEngineError, "code" | "class">,
): string {
  return `${classified.code}|${classified.class}`;
}

export function isInvalidParameterRangesError(err: unknown): boolean {
  return (
    err instanceof StrategySearchGenerationError &&
    err.code === "CONFIGURATION_INVALID"
  );
}
