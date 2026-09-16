/**
 * Event-Sequence Paper decision-candle selection.
 * Reuses shared candleTime finalization. Does not change Pattern arithmetic.
 */

import {
  latestFinalizedCandle,
  type CandleTimeIdentity,
} from "../data/candleTime";

export type EventSequencePaperDecisionObserveCode =
  | "WAITING_FOR_FINALIZED_CANDLE"
  | "SAME_FINALIZED_CANDLE";

export interface EventSequencePaperDecisionEvalScope {
  sessionId?: string | null;
  strategyId: string;
  symbol: string;
  intervalMs: number;
}

export interface EventSequencePaperDecisionWindow<
  T extends CandleTimeIdentity,
> {
  candle: T;
  index: number;
  candles: T[];
  openTime: number;
}

const lastEvaluatedFinalizedOpenTime = new Map<string, number>();

export function resetEventSequencePaperDecisionRuntimeForTests(): void {
  lastEvaluatedFinalizedOpenTime.clear();
}

export function eventSequencePaperDecisionEvalKey(
  input: EventSequencePaperDecisionEvalScope,
): string {
  const symbol = String(input.symbol ?? "")
    .trim()
    .toUpperCase();
  return `${input.sessionId ?? "none"}:${input.strategyId}:${symbol}:${input.intervalMs}`;
}

export function eventSequencePaperDecisionIdentity(
  input: EventSequencePaperDecisionEvalScope & { openTime: number },
): string {
  return `${eventSequencePaperDecisionEvalKey(input)}:${input.openTime}`;
}

/**
 * Select the Event-Sequence Paper decision window.
 * Forming last candle is ignored. Latest finalized candle is the authority.
 */
export function selectEventSequencePaperDecisionCandle<
  T extends CandleTimeIdentity,
>(input: {
  candles: T[];
  nowMs: number;
  intervalMs: number;
}): EventSequencePaperDecisionWindow<T> | null {
  const finalized = latestFinalizedCandle(
    input.candles,
    input.nowMs,
    input.intervalMs,
  );
  if (!finalized) return null;
  return {
    candle: finalized.candle,
    index: finalized.index,
    candles: input.candles.slice(0, finalized.index + 1),
    openTime: finalized.candle.openTime,
  };
}

export function readEventSequencePaperDecisionDedupe(
  scope: EventSequencePaperDecisionEvalScope,
): number | undefined {
  return lastEvaluatedFinalizedOpenTime.get(
    eventSequencePaperDecisionEvalKey(scope),
  );
}

export function isSameEventSequencePaperDecisionCandle(
  scope: EventSequencePaperDecisionEvalScope,
  openTime: number,
): boolean {
  return readEventSequencePaperDecisionDedupe(scope) === openTime;
}

export function markEventSequencePaperDecisionEvaluated(
  scope: EventSequencePaperDecisionEvalScope,
  openTime: number,
): void {
  lastEvaluatedFinalizedOpenTime.set(
    eventSequencePaperDecisionEvalKey(scope),
    openTime,
  );
}
