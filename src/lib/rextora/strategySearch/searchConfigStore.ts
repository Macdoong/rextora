/**
 * Named Search Configuration store (operator settings only).
 * No job runtime state. No API secrets.
 */

import fs from "node:fs";
import path from "node:path";
import type { StrategySearchOperatorFormState } from "@/components/rextora/strategySearch/formDefaults";
import { createDefaultOperatorFormState } from "@/components/rextora/strategySearch/formDefaults";
import { strategySearchRoot } from "../storage/runtimePaths";

const CONFIG_SCHEMA_VERSION = 1 as const;

function defaultConfigsDir(): string {
  return path.join(strategySearchRoot(), "configs");
}

export type StrategySearchSavedConfig = {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  name: string;
  createdAt: string;
  updatedAt: string;
  savedAt: string;
  lastUsedAt: string | null;
  sourcePreset: string | null;
  isDefault: boolean;
  advancedOverrideCount: number;
  form: StrategySearchOperatorFormState;
};

export type StrategySearchConfigSummary = {
  name: string;
  savedAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  sourcePreset: string | null;
  isDefault: boolean;
  advancedOverrideCount: number;
};

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export interface StrategySearchConfigStoreOptions {
  rootDir?: string;
}

function configsDir(options?: StrategySearchConfigStoreOptions): string {
  if (options?.rootDir) {
    return path.join(path.resolve(options.rootDir), "configs");
  }
  return defaultConfigsDir();
}

function ensureConfigsDir(options?: StrategySearchConfigStoreOptions): string {
  const dir = configsDir(options);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function validateConfigName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("config name is required");
  }
  if (!NAME_PATTERN.test(trimmed)) {
    throw new Error(
      "config name must be 1–64 chars (letters, numbers, underscore, hyphen)",
    );
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("invalid config name");
  }
  return trimmed;
}

function configPath(
  name: string,
  options?: StrategySearchConfigStoreOptions,
): string {
  return path.join(ensureConfigsDir(options), `${name}.json`);
}

function countAdvancedOverrides(form: StrategySearchOperatorFormState): number {
  const defaults = createDefaultOperatorFormState();
  const keys: Array<keyof StrategySearchOperatorFormState> = [
    "seed",
    "feeRate",
    "slippageRate",
    "candidateBudgetOverride",
    "maxRuntimeMinutesOverride",
    "errorWarningRate",
    "errorAutoPauseRate",
    "repeatedSignatureThreshold",
    "minWinRate",
    "minScore",
    "qualifiedTargetCustom",
  ];
  let n = 0;
  for (const k of keys) {
    if (String(form[k] ?? "") !== String(defaults[k] ?? "")) n += 1;
  }
  return n;
}

function normalizeRecord(
  name: string,
  parsed: Partial<StrategySearchSavedConfig> & { form?: StrategySearchOperatorFormState },
): StrategySearchSavedConfig | null {
  if (!parsed.form || typeof parsed.form !== "object") return null;
  const now = new Date(0).toISOString();
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    name: parsed.name ?? name,
    createdAt: parsed.createdAt ?? parsed.savedAt ?? now,
    updatedAt: parsed.updatedAt ?? parsed.savedAt ?? now,
    savedAt: parsed.savedAt ?? now,
    lastUsedAt: parsed.lastUsedAt ?? null,
    sourcePreset: parsed.sourcePreset ?? parsed.form.tradingStyle ?? null,
    isDefault: parsed.isDefault === true,
    advancedOverrideCount:
      parsed.advancedOverrideCount ?? countAdvancedOverrides(parsed.form),
    form: parsed.form,
  };
}

export function listStrategySearchConfigs(
  options?: StrategySearchConfigStoreOptions,
): StrategySearchConfigSummary[] {
  const dir = ensureConfigsDir(options);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const items: StrategySearchConfigSummary[] = [];
  for (const file of files) {
    const name = file.slice(0, -".json".length);
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = normalizeRecord(
        name,
        JSON.parse(raw) as StrategySearchSavedConfig,
      );
      if (!parsed) continue;
      items.push({
        name: parsed.name,
        savedAt: parsed.savedAt,
        updatedAt: parsed.updatedAt,
        lastUsedAt: parsed.lastUsedAt,
        sourcePreset: parsed.sourcePreset,
        isDefault: parsed.isDefault,
        advancedOverrideCount: parsed.advancedOverrideCount,
      });
    } catch {
      items.push({
        name,
        savedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        lastUsedAt: null,
        sourcePreset: null,
        isDefault: false,
        advancedOverrideCount: 0,
      });
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadStrategySearchConfig(
  name: string,
  options?: StrategySearchConfigStoreOptions,
): StrategySearchSavedConfig | null {
  const safeName = validateConfigName(name);
  const fp = configPath(safeName, options);
  if (!fs.existsSync(fp)) return null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(fp, "utf8"),
    ) as StrategySearchSavedConfig;
    return normalizeRecord(safeName, parsed);
  } catch {
    return null;
  }
}

export function saveStrategySearchConfig(
  name: string,
  form: StrategySearchOperatorFormState,
  options?: StrategySearchConfigStoreOptions & {
    overwrite?: boolean;
    sourcePreset?: string | null;
    setDefault?: boolean;
  },
): StrategySearchSavedConfig {
  const safeName = validateConfigName(name);
  const fp = configPath(safeName, options);
  const existing = fs.existsSync(fp) ? loadStrategySearchConfig(safeName, options) : null;
  // Default overwrite=true preserves prior API behavior; UI must pass
  // overwrite:false when creating a new named config that must not collide.
  if (existing && options?.overwrite === false) {
    throw new Error(
      `config "${safeName}" already exists; pass overwrite:true to replace`,
    );
  }
  const at = new Date().toISOString();
  const record: StrategySearchSavedConfig = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    name: safeName,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    savedAt: at,
    lastUsedAt: existing?.lastUsedAt ?? null,
    sourcePreset:
      options?.sourcePreset ??
      existing?.sourcePreset ??
      form.tradingStyle ??
      null,
    isDefault: options?.setDefault === true ? true : existing?.isDefault === true,
    advancedOverrideCount: countAdvancedOverrides(form),
    form,
  };
  if (record.isDefault) {
    clearDefaultFlags(safeName, options);
  }
  fs.writeFileSync(fp, JSON.stringify(record, null, 2), "utf8");
  return record;
}

function clearDefaultFlags(
  keepName: string,
  options?: StrategySearchConfigStoreOptions,
): void {
  for (const item of listStrategySearchConfigs(options)) {
    if (item.name === keepName || !item.isDefault) continue;
    const loaded = loadStrategySearchConfig(item.name, options);
    if (!loaded) continue;
    loaded.isDefault = false;
    fs.writeFileSync(
      configPath(item.name, options),
      JSON.stringify(loaded, null, 2),
      "utf8",
    );
  }
}

export function renameStrategySearchConfig(
  from: string,
  to: string,
  options?: StrategySearchConfigStoreOptions,
): StrategySearchSavedConfig {
  const src = loadStrategySearchConfig(from, options);
  if (!src) throw new Error(`config not found: ${from}`);
  const destName = validateConfigName(to);
  if (loadStrategySearchConfig(destName, options)) {
    throw new Error(`config already exists: ${destName}`);
  }
  const next = { ...src, name: destName, updatedAt: new Date().toISOString() };
  fs.writeFileSync(
    configPath(destName, options),
    JSON.stringify(next, null, 2),
    "utf8",
  );
  fs.unlinkSync(configPath(validateConfigName(from), options));
  return next;
}

export function duplicateStrategySearchConfig(
  name: string,
  newName: string,
  options?: StrategySearchConfigStoreOptions,
): StrategySearchSavedConfig {
  const src = loadStrategySearchConfig(name, options);
  if (!src) throw new Error(`config not found: ${name}`);
  return saveStrategySearchConfig(newName, src.form, {
    ...options,
    overwrite: false,
    sourcePreset: src.sourcePreset,
    setDefault: false,
  });
}

export function setDefaultStrategySearchConfig(
  name: string,
  options?: StrategySearchConfigStoreOptions,
): StrategySearchSavedConfig {
  const loaded = loadStrategySearchConfig(name, options);
  if (!loaded) throw new Error(`config not found: ${name}`);
  clearDefaultFlags(loaded.name, options);
  loaded.isDefault = true;
  loaded.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    configPath(loaded.name, options),
    JSON.stringify(loaded, null, 2),
    "utf8",
  );
  return loaded;
}

export function markStrategySearchConfigUsed(
  name: string,
  options?: StrategySearchConfigStoreOptions,
): void {
  const loaded = loadStrategySearchConfig(name, options);
  if (!loaded) return;
  loaded.lastUsedAt = new Date().toISOString();
  fs.writeFileSync(
    configPath(loaded.name, options),
    JSON.stringify(loaded, null, 2),
    "utf8",
  );
}

export function deleteStrategySearchConfig(
  name: string,
  options?: StrategySearchConfigStoreOptions,
): boolean {
  const safeName = validateConfigName(name);
  const fp = configPath(safeName, options);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

export function getStrategySearchConfigsDir(
  options?: StrategySearchConfigStoreOptions,
): string {
  return ensureConfigsDir(options);
}
