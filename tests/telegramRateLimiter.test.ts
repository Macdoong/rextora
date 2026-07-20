import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  buildQueueNotificationCountsKey,
  buildQueueNotificationDedupeKey,
  buildTradableCandidatesKey,
  markQueueCreatedNotificationSent,
  resetTelegramRateLimiterForTests,
  shouldSendQueueCreatedNotification,
  shouldSendTelegramEvent
} from "../src/lib/rextora/telegram/telegramRateLimiter";
import { resetTelegramNotifierForTests } from "../src/lib/rextora/telegramNotifier";

describe("telegramRateLimiter", () => {
  beforeEach(() => {
    resetTelegramRateLimiterForTests();
    resetTelegramNotifierForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends identical queue-created summary only once within 10 minutes", () => {
    const snapshot = {
      mode: "PAPER" as const,
      received: 10,
      queued: 0,
      executed: 0,
      skipped: 10,
      failed: 0,
      tradableSymbols: ["SOLUSDT", "ETHUSDT"],
      queueReadyCount: 0,
      topCandidateSummaries: ["SOLUSDT:제외", "ETHUSDT:제외"]
    };

    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(true);
    markQueueCreatedNotificationSent(snapshot);
    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(false);
    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(false);
  });

  it("allows same queue summary again after TTL", () => {
    const snapshot = {
      mode: "PAPER" as const,
      received: 10,
      queued: 0,
      executed: 0,
      skipped: 10,
      failed: 0,
      tradableSymbols: ["SOLUSDT"],
      queueReadyCount: 0,
      topCandidateSummaries: ["SOLUSDT:제외"]
    };

    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(true);
    markQueueCreatedNotificationSent(snapshot);
    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(false);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(true);
  });

  it("allows materially changed queue summary within TTL", () => {
    const blocked = {
      mode: "PAPER" as const,
      received: 10,
      queued: 0,
      executed: 0,
      skipped: 10,
      failed: 0,
      tradableSymbols: ["SOLUSDT"],
      queueReadyCount: 0,
      topCandidateSummaries: ["SOLUSDT:제외"]
    };
    expect(shouldSendQueueCreatedNotification(blocked)).toBe(true);
    markQueueCreatedNotificationSent(blocked);

    const queued = {
      ...blocked,
      queued: 1,
      skipped: 9,
      queueReadyCount: 1,
      topCandidateSummaries: ["SOLUSDT:진입 가능"]
    };
    expect(shouldSendQueueCreatedNotification(queued)).toBe(true);
  });

  it("does not block unrelated telegram events via queue dedupe", () => {
    const snapshot = {
      mode: "PAPER" as const,
      received: 10,
      queued: 0,
      executed: 0,
      skipped: 10,
      failed: 0,
      tradableSymbols: [],
      queueReadyCount: 0,
      topCandidateSummaries: []
    };
    expect(shouldSendQueueCreatedNotification(snapshot)).toBe(true);
    markQueueCreatedNotificationSent(snapshot);

    expect(shouldSendTelegramEvent("trade-entry", "SOLUSDT|롱|진입", 10 * 60 * 1000)).toBe(true);
    expect(shouldSendTelegramEvent("trade-exit", "SOLUSDT|롱|청산", 10 * 60 * 1000)).toBe(true);
    expect(shouldSendTelegramEvent("emergency", "긴급 중단", 10 * 60 * 1000)).toBe(true);
  });

  it("builds stable dedupe keys", () => {
    expect(
      buildQueueNotificationDedupeKey({
        mode: "PAPER",
        received: 10,
        queued: 0,
        skipped: 10,
        executed: 0,
        failed: 0,
        queueReadyCount: 0,
        topCandidateSummaries: ["ETHUSDT:제외", "SOLUSDT:제외"]
      })
    ).toBe("queue-created|PAPER|r10|q0|x10|ready0|e0|f0|tops:ETHUSDT:제외,SOLUSDT:제외");

    expect(
      buildQueueNotificationCountsKey({
        mode: "PAPER",
        received: 10,
        queued: 0,
        executed: 0,
        skipped: 10,
        failed: 0
      })
    ).toContain("PAPER|r10|q0|x10");
    expect(buildTradableCandidatesKey(["ETHUSDT", "SOLUSDT"])).toBe("ETHUSDT,SOLUSDT");
  });
});
