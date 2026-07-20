import {
  buildQueueNotificationDedupeKey,
  markTelegramEventSent,
  resetTelegramNotifierForTests,
  shouldSendTelegramEvent,
  type QueueNotificationDedupeInput
} from "../telegramNotifier";
import type { TradingMode } from "../types";

export const QUEUE_CREATED_DEDUPE_MS = 10 * 60 * 1000;

export interface QueueNotificationSnapshot {
  mode: TradingMode;
  received: number;
  queued: number;
  executed: number;
  skipped: number;
  failed: number;
  tradableSymbols: string[];
  queueReadyCount?: number;
  topCandidateSummaries?: string[];
}

export function buildQueueNotificationCountsKey(input: Omit<QueueNotificationSnapshot, "tradableSymbols" | "topCandidateSummaries">): string {
  return buildQueueNotificationDedupeKey({
    mode: input.mode,
    received: input.received,
    queued: input.queued,
    skipped: input.skipped,
    executed: input.executed,
    failed: input.failed,
    queueReadyCount: input.queueReadyCount ?? input.queued
  });
}

export function buildTradableCandidatesKey(symbols: string[]): string {
  return [...symbols].sort().join(",");
}

function toDedupeInput(input: QueueNotificationSnapshot): QueueNotificationDedupeInput {
  const topCandidateSummaries =
    input.topCandidateSummaries ??
    input.tradableSymbols.map((symbol) => `${symbol}:진입가능`);

  return {
    mode: input.mode,
    received: input.received,
    queued: input.queued,
    skipped: input.skipped,
    executed: input.executed,
    failed: input.failed,
    queueReadyCount: input.queueReadyCount ?? input.queued,
    topCandidateSummaries
  };
}

export function shouldSendQueueCreatedNotification(input: QueueNotificationSnapshot): boolean {
  const payload = buildQueueNotificationDedupeKey(toDedupeInput(input));
  return shouldSendTelegramEvent("queue-created", payload, QUEUE_CREATED_DEDUPE_MS);
}

export function markQueueCreatedNotificationSent(input: QueueNotificationSnapshot): void {
  const payload = buildQueueNotificationDedupeKey(toDedupeInput(input));
  markTelegramEventSent("queue-created", payload);
}

export function resetTelegramRateLimiterForTests(): void {
  resetTelegramNotifierForTests();
}

export { buildQueueNotificationDedupeKey, shouldSendTelegramEvent };
