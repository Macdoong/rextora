import { describe, expect, it, beforeEach } from "vitest";
import { aiCandidatesSeed } from "../src/lib/rextora/seedData";
import { convertAiCandidatesToExecutionCandidates } from "../src/lib/rextora/aiExecutionBridge";
import { buildExecutionQueue, processExecutionQueue, resetExecutionQueueStateForTests, computeCandidateQueueDisplays } from "../src/lib/rextora/executionQueue";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { updateRextoraSettings, getRextoraSettings } from "../src/lib/rextora/settings/settingsService";
import { upsertPosition, closeAllPositions } from "../src/lib/rextora/positionManager";

function eligible(symbol: string, score: number) {
  return {
    ...aiCandidatesSeed[0],
    symbol,
    aiScore: score,
    status: "진입 가능" as const,
    costPassed: true,
    riskPassed: true
  };
}

describe("executionQueue", () => {
  beforeEach(() => {
    resetExecutionQueueStateForTests();
    clearSettingsCache();
    resetSettings();
    closeAllPositions();
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: {
        ...settings.execution,
        maxEntriesPerScan: 2,
        maxConcurrentPositions: 2,
        preventDuplicateSymbolPosition: true
      }
    });
  });

  it("queues one eligible candidate", () => {
    const candidates = convertAiCandidatesToExecutionCandidates([eligible("SOLUSDT", 90)]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    expect(queue.queued).toBe(1);
    expect(queue.received).toBe(1);
  });

  it("respects maxEntriesPerScan", () => {
    const ranked = [
      eligible("SOLUSDT", 95),
      eligible("ETHUSDT", 90),
      eligible("BTCUSDT", 85)
    ];
    const candidates = convertAiCandidatesToExecutionCandidates(ranked);
    const queue = buildExecutionQueue(candidates, "PAPER");
    expect(queue.queued).toBe(2);
    expect(queue.skipped).toBe(1);
  });

  it("excludes cost-failed candidates", () => {
    const failed = {
      ...aiCandidatesSeed[0],
      symbol: "XRPUSDT",
      status: "진입 가능" as const,
      costPassed: false
    };
    const candidates = convertAiCandidatesToExecutionCandidates([failed]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    expect(queue.queued).toBe(0);
    expect(queue.skipped).toBe(1);
  });

  it("processes paper queue without live calls", async () => {
    const candidates = convertAiCandidatesToExecutionCandidates([eligible("SOLUSDT", 90)]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    const processed = await processExecutionQueue(queue, {
      mode: "PAPER",
      executePaper: async () => ({ ok: true, mode: "PAPER", serviceState: "paper", message: "모의 실행" })
    });
    expect(processed.executed).toBe(1);
  });

  it("skips duplicate symbol when position exists", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: { ...settings.execution, maxEntriesPerScan: 3, preventDuplicateSymbolPosition: true }
    });
    const candidates = convertAiCandidatesToExecutionCandidates([
      eligible("SOLUSDT", 95),
      eligible("SOLUSDT", 90)
    ]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    expect(queue.queued).toBe(1);
    expect(queue.skipped).toBe(1);
  });

  it("enforces maxConcurrentPositions", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: {
        ...settings.execution,
        maxEntriesPerScan: 5,
        maxConcurrentPositions: 1,
        preventDuplicateSymbolPosition: true
      }
    });

    upsertPosition({
      id: "open-1",
      symbol: "BTCUSDT",
      side: "Long",
      entryPrice: 100,
      currentPrice: 100,
      quantity: 1,
      leverage: 2,
      unrealizedPnl: 0,
      margin: 100,
      stopLoss: 99,
      takeProfit: 101,
      mode: "PAPER",
      serviceState: "paper"
    });

    const candidates = convertAiCandidatesToExecutionCandidates([
      eligible("ETHUSDT", 95),
      eligible("SOLUSDT", 90)
    ]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    expect(queue.queued).toBe(0);
    expect(queue.skipped).toBe(2);
  });

  it("sorts queue candidates by finalScore", () => {
    const candidates = convertAiCandidatesToExecutionCandidates([
      eligible("SOLUSDT", 70),
      eligible("ETHUSDT", 95)
    ]);
    const queue = buildExecutionQueue(candidates, "PAPER");
    const waiting = queue.items.filter((i) => i.status === "대기");
    if (waiting.length >= 2) {
      expect(waiting[0].finalScore).toBeGreaterThanOrEqual(waiting[1].finalScore);
    }
  });

  it("marks max concurrent blocked candidates as 보류 with Korean reason", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: {
        ...settings.execution,
        maxEntriesPerScan: 5,
        maxConcurrentPositions: 1,
        preventDuplicateSymbolPosition: true
      }
    });
    upsertPosition({
      id: "open-2",
      symbol: "BTCUSDT",
      side: "Long",
      entryPrice: 100,
      currentPrice: 100,
      quantity: 1,
      leverage: 2,
      unrealizedPnl: 0,
      margin: 100,
      stopLoss: 99,
      takeProfit: 101,
      mode: "PAPER",
      serviceState: "paper"
    });
    const candidates = convertAiCandidatesToExecutionCandidates([eligible("ETHUSDT", 95)]);
    const displays = computeCandidateQueueDisplays(candidates, "PAPER");
    const display = displays.get("ETHUSDT:LONG");
    expect(display?.runtimeStatusLabel).toBe("보류");
    expect(display?.queueReason).toContain("최대 동시 포지션");
  });

  it("marks duplicate symbol candidates as 보류", () => {
    const candidates = convertAiCandidatesToExecutionCandidates([
      eligible("SOLUSDT", 95),
      eligible("SOLUSDT", 90)
    ]);
    const displays = computeCandidateQueueDisplays(candidates, "PAPER");
    const blocked = displays.get("SOLUSDT:LONG");
    expect(blocked?.runtimeStatusLabel).toBe("보류");
    expect(blocked?.queueReason).toContain("중복 심볼");
  });

  it("marks cost-failed candidates as 제외", () => {
    const failed = {
      ...aiCandidatesSeed[0],
      symbol: "XRPUSDT",
      status: "진입 가능" as const,
      costPassed: false
    };
    const candidates = convertAiCandidatesToExecutionCandidates([failed]);
    const displays = computeCandidateQueueDisplays(candidates, "PAPER");
    const display = displays.get("XRPUSDT:LONG") ?? displays.values().next().value;
    expect(display?.runtimeStatusLabel).toBe("제외");
  });
});
