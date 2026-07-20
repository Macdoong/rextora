import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildTradingDashboardStatus } from "../src/lib/rextora/tradingDashboardStatus";
import { isTestOnlySymbol } from "../src/lib/rextora/dataFilters";
import { displayPositionProtectionStatus } from "../src/lib/rextora/displayLabels";
import { resetLearningProfileForTests } from "../src/lib/rextora/learningStore";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { upsertPosition, closeAllPositions } from "../src/lib/rextora/positionManager";
import { positionsSeed } from "../src/lib/rextora/seedData";

describe("tradingDashboardStatus", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
    clearSettingsCache();
    resetSettings();
    closeAllPositions();
  });

  afterEach(() => {
    closeAllPositions();
  });

  it("includes active SAFE strategy metadata", () => {
    const status = buildTradingDashboardStatus(null);
    expect(status.activeStrategy.name).toBe("SAFE_v44_i4060");
    expect(status.activeStrategy.paramsHash).toBe("7893ca3f0e30");
    expect(status.aiReports).toBeDefined();
  });

  it("uses Korean mode labels only", () => {
    const status = buildTradingDashboardStatus(null);
    expect(["모의 거래", "실전 거래"]).toContain(status.modeLabel);
  });

  it("includes queue runtime status fields on candidates", () => {
    const status = buildTradingDashboardStatus(null);
    if (status.topCandidates.length > 0) {
      const row = status.topCandidates[0];
      expect(row.queueStatus).toBeDefined();
      expect(row.runtimeStatusLabel).toBeDefined();
      expect(["큐 가능", "보류", "제외"]).toContain(row.queueStatus);
      expect(["진입 가능", "보류", "대기", "제외"]).toContain(row.runtimeStatusLabel);
    }
  });

  it("counts only queue-ready candidates as eligible", () => {
    const status = buildTradingDashboardStatus(null);
    const queueReady = status.topCandidates.filter((row) => row.queueStatus === "큐 가능").length;
    expect(status.operations.eligibleCandidateCount).toBe(queueReady);
  });

  it("filters test-only symbols from top candidates", () => {
    const status = buildTradingDashboardStatus(null);
    for (const row of status.topCandidates) {
      expect(isTestOnlySymbol(row.symbol)).toBe(false);
    }
  });

  it("shows paper protection label when stop/take prices exist", () => {
    upsertPosition(positionsSeed[0]);
    const status = buildTradingDashboardStatus(null);
    const paperPosition = status.positions.find((row) => row.stopLoss > 0 && row.takeProfit > 0);
    expect(paperPosition?.protectionLabel).toBe("모의 손절/익절 적용");
  });

  it("shows missing paper protection label when stop/take prices are absent", () => {
    upsertPosition({ ...positionsSeed[0], stopLoss: 0, takeProfit: 0 });
    const status = buildTradingDashboardStatus(null);
    const paperPosition = status.positions[0];
    expect(paperPosition?.protectionLabel).toBe("모의 보호값 없음");
  });

  it("keeps live unprotected label as 미연결", () => {
    expect(
      displayPositionProtectionStatus({
        mode: "LIVE",
        serverProtected: false,
        serverError: false
      })
    ).toBe("미연결");
  });

  it("disables live start when live trading is not allowed", () => {
    const status = buildTradingDashboardStatus(null);
    expect(status.liveAllowed).toBe(false);
    expect(status.canStartLive).toBe(false);
  });

  it("provides operator view model fields", () => {
    const status = buildTradingDashboardStatus(null);
    expect(["정상", "차단", "오류"]).toContain(status.safetyLabel);
    expect(status.todayStats).toBeDefined();
    expect(status.todayStats.trades).toBeGreaterThanOrEqual(0);
    expect(status.todayStats.winRate).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(status.opportunities)).toBe(true);
    expect(Array.isArray(status.recentTrades)).toBe(true);
    expect(status.learningView).toBeDefined();
    expect(status.learningView.bestStrategy).toBeDefined();
    expect(status.learningView.worstStrategy).toBeDefined();
  });

  it("maps opportunity judgments to 진입 가능/관찰/제외 only", () => {
    const status = buildTradingDashboardStatus(null);
    for (const row of status.opportunities) {
      expect(["진입 가능", "관찰", "제외"]).toContain(row.judgment);
    }
  });

  it("recent trades expose completed results only", () => {
    const status = buildTradingDashboardStatus(null);
    for (const trade of status.recentTrades) {
      expect(["익절", "손절", "수동청산", "보합", "실패"]).toContain(trade.resultLabel);
      expect(["모의 거래", "실전 거래"]).toContain(trade.modeLabel);
    }
  });
});
