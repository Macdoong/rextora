import { describe, expect, it, beforeEach } from "vitest";
import { aiCandidatesSeed } from "../src/lib/rextora/seedData";
import { convertAiCandidatesToExecutionCandidates } from "../src/lib/rextora/aiExecutionBridge";
import { resetLearningProfileForTests, saveLearningProfile, loadLearningProfile } from "../src/lib/rextora/learningStore";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { getRextoraSettings, updateRextoraSettings } from "../src/lib/rextora/settings/settingsService";
import { updateLearningProfileFromTrade } from "../src/lib/rextora/learningEngine";

describe("aiExecutionBridge", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
    clearSettingsCache();
    resetSettings();
  });

  it("converts ranked candidates to execution candidates with leverage fields", () => {
    const sample = {
      ...aiCandidatesSeed[0],
      status: "진입 가능" as const,
      costPassed: true,
      riskPassed: true
    };
    const result = convertAiCandidatesToExecutionCandidates([sample]);
    expect(result).toHaveLength(1);
    expect(result[0].leverage).toBeGreaterThan(0);
    expect(result[0].riskLevel).toMatch(/낮음|보통|높음/);
  });

  it("excludes cost-failed candidates", () => {
    const sample = {
      ...aiCandidatesSeed[0],
      status: "진입 가능" as const,
      costPassed: false,
      blockReason: "비용 조건 미통과"
    };
    const result = convertAiCandidatesToExecutionCandidates([sample]);
    expect(result[0].status).toBe("제외");
  });

  it("excludes learning-rejected candidates", () => {
    for (let i = 0; i < 12; i += 1) {
      updateLearningProfileFromTrade({
        mode: "PAPER",
        symbol: aiCandidatesSeed[0].symbol,
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
    const settings = getRextoraSettings();
    updateRextoraSettings({ learning: { ...settings.learning, minSamplesForAdjustment: 10 } });
    const sample = {
      ...aiCandidatesSeed[0],
      status: "진입 가능" as const,
      costPassed: true,
      riskPassed: true
    };
    const result = convertAiCandidatesToExecutionCandidates([sample]);
    expect(result[0].status).toBe("제외");
  });

  it("sorts by learning-adjusted finalScore", () => {
    const profile = loadLearningProfile();
    profile.global.trades = 20;
    saveLearningProfile(profile);
    const low = {
      ...aiCandidatesSeed[0],
      symbol: "LOWUSDT",
      aiScore: 60,
      status: "진입 가능" as const,
      costPassed: true,
      riskPassed: true
    };
    const high = {
      ...aiCandidatesSeed[1],
      symbol: "HIGHUSDT",
      aiScore: 90,
      status: "진입 가능" as const,
      costPassed: true,
      riskPassed: true
    };
    const result = convertAiCandidatesToExecutionCandidates([low, high]);
    expect(result[0].finalScore).toBeGreaterThanOrEqual(result[1].finalScore);
  });
});
