/**
 * In-flight reasoning request deduplication by turnId.
 */

import type { ReasoningEngineResult, ReasoningInput } from "./reasoningTypes";

export interface ReasoningRequestRecord {
  turnId: string;
  reasoningRequestId: string;
  providerAttempt: number;
  startedAt: string;
  completedAt: string | null;
  timeoutAt: string | null;
  fallbackReason: string | null;
}

const inflight = new Map<string, Promise<ReasoningEngineResult>>();
const completed = new Map<string, ReasoningEngineResult>();

export function createReasoningRequestId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function dedupeReasoningRun(input: {
  turnId: string | null;
  run: () => Promise<ReasoningEngineResult>;
}): Promise<ReasoningEngineResult> {
  if (!input.turnId?.trim()) {
    return input.run();
  }
  const key = input.turnId.trim();
  const done = completed.get(key);
  if (done) return done;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = input.run()
    .then((result) => {
      completed.set(key, result);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function clearReasoningRequestCache(): void {
  inflight.clear();
  completed.clear();
}

export function extractToolPlanFromPending(
  pending: ReasoningInput["pendingProposedAction"],
): unknown[] | null {
  const raw = pending?.parameters?.toolPlan;
  return Array.isArray(raw) ? raw : null;
}
