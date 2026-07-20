import { invalidateJsonStoreCache, readJsonStore, writeJsonStore } from "../storage/jsonStore";
import { createDefaultSettings, SETTINGS_FILENAME } from "./defaultSettings";
import type { RextoraSettings } from "./settingsTypes";

let memoryCache: RextoraSettings | null = null;

export function getSettingsFileName(): string {
  return SETTINGS_FILENAME;
}

export function loadSettings(): RextoraSettings {
  if (memoryCache) return memoryCache;
  const defaults = createDefaultSettings();
  const stored = readJsonStore(SETTINGS_FILENAME, defaults, { ttlMs: 2_000 });
  memoryCache = {
    ...defaults,
    ...stored,
    trading: { ...defaults.trading, ...stored.trading },
    market: { ...defaults.market, ...stored.market },
    signal: { ...defaults.signal, ...stored.signal },
    cost: { ...defaults.cost, ...stored.cost },
    risk: { ...defaults.risk, ...stored.risk },
    execution: { ...defaults.execution, ...stored.execution },
    learning: { ...defaults.learning, ...stored.learning },
    tpSl: { ...defaults.tpSl, ...stored.tpSl },
    telegram: { ...defaults.telegram, ...stored.telegram },
    ui: { ...defaults.ui, ...stored.ui }
  };
  if (!memoryCache.trading.allowLiveTrading && memoryCache.trading.liveTradingEnabled) {
    memoryCache.trading.allowLiveTrading = memoryCache.trading.liveTradingEnabled;
  }
  if (!memoryCache.tpSl.closePositionIfTpSlFails) {
    memoryCache.tpSl.closePositionIfTpSlFails = memoryCache.tpSl.fallbackCloseIfTpSlFails;
  }
  return memoryCache;
}

export function saveSettings(settings: RextoraSettings): RextoraSettings {
  const next = { ...settings, updatedAt: new Date().toISOString() };
  memoryCache = writeJsonStore(SETTINGS_FILENAME, next);
  invalidateJsonStoreCache(SETTINGS_FILENAME);
  return memoryCache;
}

export function resetSettings(): RextoraSettings {
  memoryCache = null;
  invalidateJsonStoreCache(SETTINGS_FILENAME);
  const defaults = createDefaultSettings();
  return saveSettings(defaults);
}

export function clearSettingsCache(): void {
  memoryCache = null;
  invalidateJsonStoreCache(SETTINGS_FILENAME);
}
