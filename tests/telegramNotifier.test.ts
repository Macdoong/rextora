import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  ALLOWED_TELEGRAM_EVENT_LABELS,
  buildQueueNotificationDedupeKey,
  getBlockedTelegramEventTypes,
  getLastTelegramSkipReason,
  isAllowedTelegramEvent,
  normalizeTelegramEventType,
  recordBlockedTelegramEvent,
  resetBlockedTelegramEventsForTests,
  resetTelegramNotifierForTests,
  shouldSendTelegramEvent
} from "../src/lib/rextora/telegramNotifier";
import {
  notifyBotStarted,
  notifyBotStopped,
  notifyCandidate,
  notifyExecutionQueueCreated,
  notifyQueueCandidateExcluded,
  notifyTradeEntry,
  notifyTradeClosed,
  notifyEmergency,
  notifySystemError,
  notifyRiskBlock
} from "../src/lib/rextora/telegramOperation";

describe("telegramNotifier", () => {
  beforeEach(() => {
    resetTelegramNotifierForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses identical event payload within TTL and records skip reason", () => {
    expect(shouldSendTelegramEvent("queue-created", "same-payload", 10 * 60 * 1000)).toBe(true);
    expect(shouldSendTelegramEvent("queue-created", "same-payload", 10 * 60 * 1000)).toBe(false);
    expect(getLastTelegramSkipReason()).toContain("telegram_dedupe_suppressed");
  });

  it("allows send again after TTL", () => {
    expect(shouldSendTelegramEvent("queue-created", "same-payload", 10 * 60 * 1000)).toBe(true);
    expect(shouldSendTelegramEvent("queue-created", "same-payload", 10 * 60 * 1000)).toBe(false);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(shouldSendTelegramEvent("queue-created", "same-payload", 10 * 60 * 1000)).toBe(true);
  });

  it("allows materially different payload within TTL", () => {
    expect(shouldSendTelegramEvent("queue-created", "payload-a", 10 * 60 * 1000)).toBe(true);
    expect(shouldSendTelegramEvent("queue-created", "payload-b", 10 * 60 * 1000)).toBe(true);
  });

  it("builds queue notification dedupe key with required fields", () => {
    const key = buildQueueNotificationDedupeKey({
      mode: "PAPER",
      received: 10,
      queued: 0,
      skipped: 10,
      executed: 0,
      failed: 0,
      queueReadyCount: 0,
      topCandidateSummaries: ["SOLUSDT:제외"]
    });
    expect(key).toContain("queue-created");
    expect(key).toContain("PAPER");
    expect(key).toContain("r10");
    expect(key).toContain("q0");
    expect(key).toContain("x10");
    expect(key).toContain("ready0");
    expect(key).toContain("SOLUSDT:제외");
  });
});

describe("telegram event allowlist", () => {
  beforeEach(() => {
    resetBlockedTelegramEventsForTests();
  });

  it("allows exactly the operator quant-trading events", () => {
    for (const eventType of Object.keys(ALLOWED_TELEGRAM_EVENT_LABELS)) {
      expect(isAllowedTelegramEvent(eventType)).toBe(true);
    }
    expect(isAllowedTelegramEvent("모의 거래 시작")).toBe(true);
    expect(isAllowedTelegramEvent("진입 체결")).toBe(true);
    expect(isAllowedTelegramEvent("익절 발생")).toBe(true);
    expect(isAllowedTelegramEvent("손절 발생")).toBe(true);
    expect(isAllowedTelegramEvent("청산 완료")).toBe(true);
    expect(isAllowedTelegramEvent("긴급 중지")).toBe(true);
    expect(isAllowedTelegramEvent("오류 발생")).toBe(true);
    expect(isAllowedTelegramEvent("실전 거래 차단")).toBe(true);
  });

  it("blocks queue and candidate noise events", () => {
    expect(isAllowedTelegramEvent("queue_created")).toBe(false);
    expect(isAllowedTelegramEvent("execution_queue_created")).toBe(false);
    expect(isAllowedTelegramEvent("candidate_detected")).toBe(false);
    expect(isAllowedTelegramEvent("candidate_summary")).toBe(false);
    expect(isAllowedTelegramEvent("waiting_summary")).toBe(false);
    expect(isAllowedTelegramEvent("excluded_summary")).toBe(false);
    expect(isAllowedTelegramEvent("strategy_scan_summary")).toBe(false);
    expect(isAllowedTelegramEvent("cost_rejected")).toBe(false);
    expect(isAllowedTelegramEvent("learning_adjustment")).toBe(false);
  });

  it("normalizes legacy event aliases", () => {
    expect(normalizeTelegramEventType("모의 거래 시작")).toBe("paper_start");
    expect(normalizeTelegramEventType("execution_queue_created")).toBe("queue_created");
    expect(normalizeTelegramEventType("entry_success")).toBe("entry_filled");
  });

  it("records blocked events", () => {
    recordBlockedTelegramEvent("queue_created");
    recordBlockedTelegramEvent("candidate_detected");
    expect(getBlockedTelegramEventTypes()).toEqual(["queue_created", "candidate_detected"]);
  });
});

describe("telegramOperation allowlist boundary", () => {
  beforeEach(() => {
    resetBlockedTelegramEventsForTests();
  });

  it("blocks queue created notification at the boundary", async () => {
    await notifyExecutionQueueCreated({ received: 10, queued: 0, skipped: 10, mode: "PAPER" });
    expect(getBlockedTelegramEventTypes()).toContain("queue_created");
  });

  it("blocks candidate and queue-excluded notifications", async () => {
    await notifyCandidate("SOLUSDT", "롱", 90);
    await notifyQueueCandidateExcluded("ETHUSDT", "롱", "비용 초과");
    expect(getBlockedTelegramEventTypes()).toContain("candidate_detected");
    expect(getBlockedTelegramEventTypes()).toContain("queue_excluded");
  });

  it("sends allowed lifecycle and trade events without blocking", async () => {
    await notifyBotStarted("PAPER");
    await notifyBotStopped("PAPER");
    await notifyTradeEntry({ symbol: "SOLUSDT", direction: "롱", entryPrice: 100, leverage: 2, mode: "PAPER" });
    await notifyTradeClosed({ symbol: "SOLUSDT", direction: "롱", pnlPct: 1.2, exitReason: "익절", mode: "PAPER" });
    await notifyTradeClosed({ symbol: "SOLUSDT", direction: "롱", pnlPct: -0.5, exitReason: "손절", mode: "PAPER" });
    await notifyEmergency("PAPER");
    await notifySystemError("테스트 오류");
    await notifyRiskBlock("실전 거래 조건 미통과");

    const blocked = getBlockedTelegramEventTypes();
    expect(blocked).not.toContain("paper_start");
    expect(blocked).not.toContain("paper_stop");
    expect(blocked).not.toContain("entry_filled");
    expect(blocked).not.toContain("take_profit");
    expect(blocked).not.toContain("stop_loss");
    expect(blocked).not.toContain("trade_closed");
    expect(blocked).not.toContain("emergency_stop");
    expect(blocked).not.toContain("error");
    expect(blocked).not.toContain("live_blocked");
  });
});
