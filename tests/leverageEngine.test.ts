import { describe, expect, it, beforeEach } from "vitest";
import { decideLeverage } from "../src/lib/rextora/leverageEngine";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { updateRextoraSettings, getRextoraSettings } from "../src/lib/rextora/settings/settingsService";

describe("leverageEngine", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetSettings();
  });

  it("uses default leverage when auto leverage disabled", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: { ...settings.execution, autoLeverageEnabled: false, defaultLeverage: 2 }
    });
    const decision = decideLeverage({ aiScore: 80, finalScore: 85, symbol: "BTCUSDT", costPass: true });
    expect(decision.leverage).toBe(2);
    expect(decision.cappedBy).toContain("auto_disabled");
  });

  it("respects maxLeverage cap", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: {
        ...settings.execution,
        autoLeverageEnabled: true,
        minLeverage: 1,
        maxLeverage: 3,
        defaultLeverage: 2
      }
    });
    const decision = decideLeverage({ aiScore: 95, finalScore: 95, symbol: "BTCUSDT", costPass: true });
    expect(decision.leverage).toBeLessThanOrEqual(3);
  });

  it("respects minLeverage floor", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: {
        ...settings.execution,
        autoLeverageEnabled: true,
        minLeverage: 1,
        maxLeverage: 3,
        defaultLeverage: 2
      }
    });
    const decision = decideLeverage({
      aiScore: 50,
      finalScore: 50,
      symbol: "BTCUSDT",
      volatility: 5,
      spread: 0.15,
      consecutiveLosses: 5,
      costPass: true
    });
    expect(decision.leverage).toBeGreaterThanOrEqual(1);
  });

  it("reduces leverage on high volatility", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: { ...settings.execution, autoLeverageEnabled: true, maxLeverage: 3, minLeverage: 1 }
    });
    const calm = decideLeverage({ aiScore: 80, finalScore: 80, symbol: "SOLUSDT", volatility: 1, costPass: true });
    const volatile = decideLeverage({ aiScore: 80, finalScore: 80, symbol: "SOLUSDT", volatility: 4.5, costPass: true });
    expect(volatile.leverage).toBeLessThanOrEqual(calm.leverage);
    expect(volatile.cappedBy).toContain("high_volatility");
  });

  it("reduces leverage on losing streak", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: { ...settings.execution, autoLeverageEnabled: true, maxLeverage: 3, minLeverage: 1 }
    });
    const decision = decideLeverage({
      aiScore: 80,
      finalScore: 80,
      symbol: "SOLUSDT",
      consecutiveLosses: 3,
      costPass: true
    });
    expect(decision.leverage).toBe(1);
    expect(decision.cappedBy).toContain("losing_streak");
  });

  it("allows higher leverage for good score within cap", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      execution: { ...settings.execution, autoLeverageEnabled: true, maxLeverage: 3, minLeverage: 1 }
    });
    const low = decideLeverage({ aiScore: 60, finalScore: 60, symbol: "ETHUSDT", costPass: true });
    const high = decideLeverage({ aiScore: 90, finalScore: 90, symbol: "ETHUSDT", costPass: true });
    expect(high.leverage).toBeGreaterThanOrEqual(low.leverage);
    expect(high.leverage).toBeLessThanOrEqual(3);
  });
});
