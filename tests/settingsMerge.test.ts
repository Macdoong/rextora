import { describe, expect, it, beforeEach } from "vitest";
import { loadSettings, clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { createDefaultSettings, SETTINGS_FILENAME } from "../src/lib/rextora/settings/defaultSettings";
import { writeJsonStore, invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";

describe("settings deep merge", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetSettings();
  });

  it("merges missing execution and learning defaults", () => {
    const defaults = createDefaultSettings();
    writeJsonStore(SETTINGS_FILENAME, {
      version: defaults.version,
      updatedAt: defaults.updatedAt,
      trading: defaults.trading,
      execution: { orderType: "MARKET", defaultLeverage: 2 }
    });
    invalidateJsonStoreCache(SETTINGS_FILENAME);
    clearSettingsCache();

    const loaded = loadSettings();
    expect(loaded.execution.autoLeverageEnabled).toBe(true);
    expect(loaded.execution.maxLeverage).toBe(3);
    expect(loaded.execution.maxEntriesPerScan).toBe(3);
    expect(loaded.learning.enabled).toBe(true);
    expect(loaded.learning.minSamplesForAdjustment).toBe(10);
  });
});
