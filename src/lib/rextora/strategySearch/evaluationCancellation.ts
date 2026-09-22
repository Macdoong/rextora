/**
 * Dedicated Strategy Search evaluation-cancellation control flow.
 * Distinct from evaluation failure. No persistence, scoring, or trial writes.
 */

export type StrategySearchShouldCancel = () => boolean | Promise<boolean>;

export class StrategySearchEvaluationPausedError extends Error {
  readonly code = "EVALUATION_PAUSED" as const;

  constructor(message = "strategy-search evaluation paused") {
    super(message);
    this.name = "StrategySearchEvaluationPausedError";
  }
}

export class StrategySearchEvaluationCancelledError extends Error {
  readonly code = "EVALUATION_CANCELLED" as const;

  constructor(message = "strategy-search evaluation cancelled") {
    super(message);
    this.name = "StrategySearchEvaluationCancelledError";
  }
}

export function isEvaluationPausedError(
  err: unknown,
): err is StrategySearchEvaluationPausedError {
  if (err instanceof StrategySearchEvaluationPausedError) return true;
  if (!err || typeof err !== "object") return false;
  const coded = err as { code?: unknown; name?: unknown };
  return (
    coded.code === "EVALUATION_PAUSED" &&
    coded.name === "StrategySearchEvaluationPausedError"
  );
}

export function isEvaluationCancelledError(
  err: unknown,
): err is StrategySearchEvaluationCancelledError {
  if (err instanceof StrategySearchEvaluationCancelledError) return true;
  if (!err || typeof err !== "object") return false;
  const coded = err as { code?: unknown; name?: unknown };
  return (
    coded.code === "EVALUATION_CANCELLED" &&
    coded.name === "StrategySearchEvaluationCancelledError"
  );
}

export function isEvaluationCancellationStatus(
  status: string | null | undefined,
): boolean {
  return status === "cancel_requested" || status === "cancelling";
}

export async function throwIfEvaluationCancelled(
  shouldCancel?: StrategySearchShouldCancel,
): Promise<void> {
  if (!shouldCancel) return;
  if (await shouldCancel()) {
    throw new StrategySearchEvaluationCancelledError();
  }
}

/** Pause or cancel — used at sub-evaluation and cooperative bar boundaries. */
export async function throwIfEvaluationInterrupted(
  shouldCancel?: StrategySearchShouldCancel,
  shouldPause?: StrategySearchShouldCancel,
): Promise<void> {
  if (shouldPause && (await shouldPause())) {
    throw new StrategySearchEvaluationPausedError();
  }
  await throwIfEvaluationCancelled(shouldCancel);
}
