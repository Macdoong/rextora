import { describe, expect, it, beforeEach } from "vitest";
import {
  calculateLearningAdjustment,
  updateLearningProfileFromTrade,
  buildLearningSummary
} from "../src/lib/rextora/learningEngine";
import {
  resetLearningProfileForTests,
  loadLearningProfile,
  saveLearningProfile,
  createEmptyPatternStats
} from "../src/lib/rextora/learningStore";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { getRextoraSettings, updateRextoraSettings } from "../src/lib/rextora/settings/settingsService";

function seedLosses(symbol: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    updateLearningProfileFromTrade({
      mode: "PAPER",
      symbol,
      side: "롱",
      signalType: "breakout",
      aiScore: 70,
      finalScore: 68,
      leverage: 2,
      entryPrice: 100,
      exitPrice: 99,
      realizedPnlPct: -1,
      result: "loss",
      exitReason: "stop_loss",
      timestamp: new Date().toISOString()
    });
  }
}

describe("learningEngine", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
    clearSettingsCache();
    resetSettings();
  });

  it("returns neutral adjustment with insufficient data", () => {
    const adj = calculateLearningAdjustment({
      symbol: "BTCUSDT",
      side: "롱",
      signalType: "breakout",
      aiScore: 75,
      costPass: true
    });
    expect(adj.scoreDelta).toBe(0);
    expect(adj.reject).toBe(false);
    expect(adj.leverageMultiplier).toBe(1);
  });

  it("reduces score for bad pattern", () => {
    seedLosses("SOLUSDT", 12);
    const adj = calculateLearningAdjustment({
      symbol: "SOLUSDT",
      side: "롱",
      signalType: "breakout",
      aiScore: 75,
      costPass: true
    });
    expect(adj.scoreDelta).toBeLessThan(0);
  });

  it("can reject repeated bad pattern", () => {
    seedLosses("XRPUSDT", 12);
    const adj = calculateLearningAdjustment({
      symbol: "XRPUSDT",
      side: "롱",
      signalType: "breakout",
      aiScore: 75,
      costPass: true
    });
    expect(adj.reject).toBe(true);
  });

  it("slightly improves score for good pattern", () => {
    const profile = loadLearningProfile();
    profile.bySymbol.BTCUSDT = {
      ...createEmptyPatternStats(),
      trades: 12,
      wins: 9,
      losses: 3,
      totalPnlPct: 12,
      avgPnlPct: 1
    };
    profile.global.trades = 12;
    profile.global.wins = 9;
    profile.global.losses = 3;

    const settings = getRextoraSettings();
    updateRextoraSettings({ learning: { ...settings.learning, minSamplesForAdjustment: 10 } });
    saveLearningProfile(profile);

    const adj = calculateLearningAdjustment({
      symbol: "BTCUSDT",
      side: "롱",
      signalType: "breakout",
      aiScore: 75,
      costPass: true
    });
    expect(adj.scoreDelta).toBeGreaterThan(0);
  });

  it("builds learning summary", () => {
    seedLosses("ETHUSDT", 2);
    const summary = buildLearningSummary();
    expect(summary.totalTrades).toBeGreaterThan(0);
    expect(summary.learningStatus).toBeTruthy();
  });
});
