/**
 * Classify Strategy Search engine errors into recoverable vs fatal classes.
 * Candidate-level failures must not terminate the Research Job unless fatal.
 */

import { StrategySearchGenerationError } from "./candidateGenerator";
import { StrategySearchJitterError } from "./jitterEvaluator";

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

export function classifyEngineError(
  err: unknown,
  stage = "unknown",
): ClassifiedEngineError {
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
