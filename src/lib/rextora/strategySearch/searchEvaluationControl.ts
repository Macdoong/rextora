/**
 * Strategy Search evaluation control — authoritative job lifecycle observation
 * with cooperative event-loop yielding during long backtest bar walks.
 */

import type { StrategySearchStoreOptions } from "./jobStore";
import { getSearchJob } from "./jobStore";
import {
  StrategySearchEvaluationCancelledError,
  StrategySearchEvaluationPausedError,
  isEvaluationCancellationStatus,
} from "./evaluationCancellation";
import type { BacktestCooperativeCheckpoint } from "../backtest/cooperativeCheckpoint";

export type SearchEvaluationControlState = "continue" | "pause" | "cancel";

/** Reads persisted job lifecycle — not component/UI state. */
export type StrategySearchEvaluationControl = () =>
  | SearchEvaluationControlState
  | Promise<SearchEvaluationControlState>;

/** Bars processed between yield + control checks during a backtest walk. */
export const STRATEGY_SEARCH_CONTROL_CHECK_BAR_INTERVAL = 64;

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export function createJobEvaluationControl(
  jobId: string,
  store?: StrategySearchStoreOptions,
): StrategySearchEvaluationControl {
  return () => {
    const latest = getSearchJob(jobId, store);
    if (!latest) return "continue";
    if (isEvaluationCancellationStatus(latest.status)) return "cancel";
    if (latest.status === "pause_requested") return "pause";
    return "continue";
  };
}

export function resolveSearchEvaluationControlState(
  state: SearchEvaluationControlState,
): void {
  if (state === "pause") {
    throw new StrategySearchEvaluationPausedError();
  }
  if (state === "cancel") {
    throw new StrategySearchEvaluationCancelledError();
  }
}

export async function throwIfSearchEvaluationControlRequested(
  control?: StrategySearchEvaluationControl,
): Promise<void> {
  if (!control) return;
  await yieldToEventLoop();
  const state = await control();
  resolveSearchEvaluationControlState(state);
}

export function buildBacktestCooperativeCheckpoint(
  control?: StrategySearchEvaluationControl,
): BacktestCooperativeCheckpoint | undefined {
  if (!control) return undefined;
  return {
    barInterval: STRATEGY_SEARCH_CONTROL_CHECK_BAR_INTERVAL,
    onBarCheckpoint: async () => {
      await throwIfSearchEvaluationControlRequested(control);
    },
  };
}
