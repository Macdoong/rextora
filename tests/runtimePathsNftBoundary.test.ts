import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentSessionsRoot } from "../src/lib/rextora/agent/v2/session/sessionPersistence";
import { hasStoredCredential } from "../src/lib/rextora/agent/v2/providers/providerCredentialStore";
import { loadAiProviderSettings, saveAiProviderSettings } from "../src/lib/rextora/agent/v2/providers/providerSettingsStore";
import { loadRiskState, saveRiskState } from "../src/lib/rextora/riskStateStore";
import { invalidateJsonStoreCache, readJsonStore, writeJsonStore } from "../src/lib/rextora/storage/jsonStore";
import {
  backtestsRoot,
  firstRunStatePath,
  paperSessionsRootDefault,
  productionRextoraDataRootCanonical,
  productionStrategiesRootCanonical,
  rextoraDataRoot,
  strategiesRootDefault,
  strategySearchRoot,
} from "../src/lib/rextora/storage/runtimePaths";

const ENV_KEYS = [
  "REXTORA_DATA_DIR",
  "REXTORA_AGENT_SESSIONS_DIR",
  "REXTORA_BACKTESTS_DIR",
  "REXTORA_PAPER_SESSIONS_DIR",
  "REXTORA_STRATEGY_SEARCH_DIR",
] as const;

describe("runtimePaths NFT boundary", () => {
  let root = "";
  let previous: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    previous = {};
    for (const key of ENV_KEYS) {
      if (process.env[key] !== undefined) previous[key] = process.env[key];
      delete process.env[key];
    }
    root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-runtime-paths-"));
    invalidateJsonStoreCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    invalidateJsonStoreCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("preserves the default and canonical repository roots without filesystem writes", () => {
    const expected = path.join(process.cwd(), "data", "rextora");
    expect(rextoraDataRoot()).toBe(expected);
    expect(productionRextoraDataRootCanonical()).toBe(expected);
    expect(productionStrategiesRootCanonical()).toBe(path.join(expected, "strategies"));
  });

  it("preserves REXTORA_DATA_DIR and all nested runtime paths", () => {
    process.env.REXTORA_DATA_DIR = `  ${root}  `;
    const resolved = path.resolve(root);
    expect(rextoraDataRoot()).toBe(resolved);
    expect(strategySearchRoot()).toBe(path.join(resolved, "strategy-search"));
    expect(backtestsRoot()).toBe(path.join(resolved, "backtests"));
    expect(strategiesRootDefault()).toBe(path.join(resolved, "strategies"));
    expect(paperSessionsRootDefault()).toBe(path.join(resolved, "paper-sessions"));
    expect(firstRunStatePath()).toBe(path.join(resolved, "first-run.json"));
    expect(agentSessionsRoot()).toBe(path.join(resolved, "agent-sessions"));
  });

  it("preserves specific override precedence", () => {
    process.env.REXTORA_DATA_DIR = root;
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(root, "custom-search");
    process.env.REXTORA_BACKTESTS_DIR = path.join(root, "custom-backtests");
    expect(strategySearchRoot()).toBe(path.resolve(root, "custom-search"));
    expect(backtestsRoot()).toBe(path.resolve(root, "custom-backtests"));
  });

  it("keeps missing-directory and JSON read/write behavior inside the isolated root", () => {
    const isolated = path.join(root, "missing-at-start");
    process.env.REXTORA_DATA_DIR = isolated;
    expect(fs.existsSync(isolated)).toBe(false);
    expect(readJsonStore("runtime-boundary.json", { missing: true }, { ttlMs: 0 })).toEqual({ missing: true });
    expect(fs.existsSync(isolated)).toBe(true);
    writeJsonStore("runtime-boundary.json", { value: 7 });
    invalidateJsonStoreCache("runtime-boundary.json");
    expect(readJsonStore("runtime-boundary.json", null, { ttlMs: 0 })).toEqual({ value: 7 });
  });

  it("keeps Paper risk, provider settings, and provider secret storage under the isolated root", () => {
    const productionRisk = path.join(process.cwd(), "data", "rextora", "risk-state.json");
    const productionRiskBefore = fs.existsSync(productionRisk)
      ? fs.readFileSync(productionRisk)
      : null;
    process.env.REXTORA_DATA_DIR = root;
    saveRiskState(loadRiskState());
    expect(fs.existsSync(path.join(root, "risk-state.json"))).toBe(true);
    saveAiProviderSettings({ fallbackEnabled: false });
    invalidateJsonStoreCache();
    expect(loadAiProviderSettings().fallbackEnabled).toBe(false);
    expect(fs.existsSync(path.join(root, "ai-provider-settings.json"))).toBe(true);

    expect(hasStoredCredential("openai")).toBe(false);
    expect(fs.existsSync(path.join(root, "secrets"))).toBe(true);
    if (productionRiskBefore) {
      expect(fs.readFileSync(productionRisk)).toEqual(productionRiskBefore);
    } else {
      expect(fs.existsSync(productionRisk)).toBe(false);
    }
  });
});
