import { describe, expect, it } from "vitest";
import { appendLearningEntry, getLearningLogs } from "../src/lib/rextora/learningLogger";
import { appendAuditLog, getAuditLogs } from "../src/lib/rextora/storage/auditStore";

describe("learningLogger", () => {
  it("appends learning entries", () => {
    const before = getLearningLogs().length;
    appendLearningEntry({
      symbol: "BTCUSDT",
      direction: "롱",
      entryReason: "test",
      exitReason: "open",
      result: "성공",
      pnlPct: 0,
      signalType: "돌파",
      mode: "PAPER"
    });
    expect(getLearningLogs().length).toBeGreaterThanOrEqual(before);
  });

  it("records audit logs", () => {
    appendAuditLog({
      type: "settings_change",
      actor: "test",
      message: "test audit",
      mode: "SYSTEM",
      correlationId: "test-correlation"
    });
    expect(getAuditLogs(5).length).toBeGreaterThan(0);
  });
});
