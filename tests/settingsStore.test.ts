import { describe, expect, it, beforeEach } from "vitest";
import { getRextoraSettings, updateRextoraSettings, resetRextoraSettings } from "../src/lib/rextora/settings/settingsService";
import { clearSettingsCache } from "../src/lib/rextora/settings/settingsStore";
import { validateSettings } from "../src/lib/rextora/settings/settingsValidation";

describe("settingsStore", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetRextoraSettings();
  });

  it("loads defaults with PAPER mode", () => {
    const settings = getRextoraSettings();
    expect(settings.trading.defaultMode).toBe("PAPER");
    expect(settings.trading.liveTradingEnabled).toBe(false);
  });

  it("rejects invalid leverage", () => {
    const settings = getRextoraSettings();
    const result = updateRextoraSettings({
      trading: { ...settings.trading, defaultLeverage: 10, maxLeverage: 2.5 }
    });
    expect(result.ok).toBe(false);
  });

  it("rejects non-positive fixed order size", () => {
    const settings = getRextoraSettings();
    const invalid = validateSettings({
      ...settings,
      execution: { ...settings.execution, fixedOrderUsdt: 0 }
    });
    expect(invalid.ok).toBe(false);
  });
});
