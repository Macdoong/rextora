/**
 * Canonical multi-candle confirmation schema for pattern eventSequence.
 * Legacy requireCloseInDirection boolean remains compatible.
 */

export type ConfirmationMode =
  | "none"
  | "single_close"
  | "consecutive_closes"
  | "threshold_count";

export type PatternConfirmCloseLegacy = "required" | "disabled";

export interface PatternConfirmationSpec {
  confirmationMode: ConfirmationMode;
  /** Required closes in direction (ignored when mode is none). */
  confirmationCandleCount: number;
  /** Bars allowed to accumulate confirmations (defaults to count). */
  confirmationWindow: number;
  confirmationDirection: "trade_side";
}

export function clampConfirmCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(n)));
}

export function clampConfirmWindow(n: number, count: number): number {
  if (!Number.isFinite(n)) return count;
  return Math.max(count, Math.min(24, Math.trunc(n)));
}

/** Map legacy on/off + optional count into canonical confirmation. */
export function resolvePatternConfirmation(input: {
  confirmationMode?: ConfirmationMode | string | null;
  confirmationCandleCount?: number | null;
  confirmationWindow?: number | null;
  /** Legacy Search UI / params. */
  requireCloseInDirection?: boolean | null;
  patternConfirmClose?: PatternConfirmCloseLegacy | null;
}): PatternConfirmationSpec {
  const count = clampConfirmCount(Number(input.confirmationCandleCount ?? 1));
  const window = clampConfirmWindow(
    Number(input.confirmationWindow ?? count),
    count,
  );

  const rawMode = input.confirmationMode;
  if (
    rawMode === "none" ||
    rawMode === "single_close" ||
    rawMode === "consecutive_closes" ||
    rawMode === "threshold_count"
  ) {
    if (rawMode === "none") {
      return {
        confirmationMode: "none",
        confirmationCandleCount: 1,
        confirmationWindow: 1,
        confirmationDirection: "trade_side",
      };
    }
    if (rawMode === "single_close") {
      return {
        confirmationMode: "single_close",
        confirmationCandleCount: 1,
        confirmationWindow: 1,
        confirmationDirection: "trade_side",
      };
    }
    return {
      confirmationMode: rawMode,
      confirmationCandleCount: count,
      confirmationWindow: window,
      confirmationDirection: "trade_side",
    };
  }

  // Infer from count when mode omitted but multi-candle requested.
  if (count > 1) {
    return {
      confirmationMode: "consecutive_closes",
      confirmationCandleCount: count,
      confirmationWindow: window,
      confirmationDirection: "trade_side",
    };
  }

  const legacyClose = input.patternConfirmClose;
  if (legacyClose === "disabled" || input.requireCloseInDirection === false) {
    return {
      confirmationMode: "none",
      confirmationCandleCount: 1,
      confirmationWindow: 1,
      confirmationDirection: "trade_side",
    };
  }

  return {
    confirmationMode: "single_close",
    confirmationCandleCount: 1,
    confirmationWindow: 1,
    confirmationDirection: "trade_side",
  };
}

/** Params written onto the confirmation eventSequence step. */
export function confirmationStepParams(
  spec: PatternConfirmationSpec,
): Record<string, number | boolean | string> {
  return {
    confirmationMode: spec.confirmationMode,
    confirmationCandleCount: spec.confirmationCandleCount,
    confirmationWindow: spec.confirmationWindow,
    confirmationDirection: spec.confirmationDirection,
    // Legacy mirror for older readers / hashes stability.
    requireCloseInDirection: spec.confirmationMode !== "none",
  };
}

/** Base-param keys used by Search candidate identity / mutation. */
export function confirmationParamsForCandidate(
  spec: PatternConfirmationSpec,
): Record<string, number | boolean | string> {
  return {
    confirmationMode: spec.confirmationMode,
    confirmationCandleCount: spec.confirmationCandleCount,
    confirmationWindow: spec.confirmationWindow,
    requireCloseInDirection: spec.confirmationMode !== "none",
  };
}
