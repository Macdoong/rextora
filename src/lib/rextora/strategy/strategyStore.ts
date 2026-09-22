import crypto from "node:crypto";
import strategyRuntimeIo from "@rextora/strategy-runtime-io";
import { GENERIC_SEARCH_BASELINE_PARAMS, mergeSafeParams } from "./safeV44Params";
import { computeParamsHash, computeStrategyHash } from "./strategyHash";
import {
  type SafeV44Params,
  type StoredStrategy,
  type StrategyIndexFile,
  type StrategyTimeframe
} from "./strategyTypes";
import {
  isRetiredSafeFileName,
  isRetiredSafeId,
  isRetiredSafeHash,
  NO_SELECTED_STRATEGY,
} from "./retiredSafeBaseline";
import { STRATEGY_SCHEMA_VERSION, type StrategyKind } from "./definition/types";
import { assertSafeStrategyId, StrategyValidationError, validateCanonicalDefinition } from "./definition/validator";
import { definitionToStoredPatch, storedToDefinition, type StoredStrategyV1 } from "./definition/bridge";
import type { CanonicalStrategyDefinition } from "./definition/types";
import { parseStrategyExecutionProvenance } from "./strategyExecutionProvenance";
import type { StrategyExecutionProvenance } from "./strategyExecutionProvenance";
import { isTestStrategyRecord } from "./strategyTestFilter";
import { isDemoLiveBlocked } from "../firstRun/demoIdentity";

export const UNSAFE_TEST_STRATEGY_STORE =
  "UNSAFE_TEST_STRATEGY_STORE: Test strategy storage must use an isolated REXTORA_STRATEGIES_DIR.";

export const PROTECTED_STRATEGY_INTEGRITY = "PROTECTED_STRATEGY_INTEGRITY";

/** Detect Vitest / NODE_ENV=test without relying on a single flag. */
export function isStrategyStoreTestRuntime(): boolean {
  if (process.env.VITEST === "true" || process.env.VITEST === "1") return true;
  if (typeof process.env.VITEST_WORKER_ID !== "undefined") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

export function productionStrategiesRoot(): string {
  return strategyRuntimeIo.productionStrategiesRoot(process.cwd());
}

export function canonicalSafeSourceDir(): string {
  return strategyRuntimeIo.canonicalSafeSourceDir(process.cwd());
}

function isPathInside(child: string, parent: string): boolean {
  return strategyRuntimeIo.isPathInside(child, parent);
}

function assertIsolatedRootNotProduction(resolvedRoot: string): void {
  if (!resolvedRoot || resolvedRoot.trim() === "") {
    throw new StrategyValidationError(UNSAFE_TEST_STRATEGY_STORE);
  }
  const root = strategyRuntimeIo.absolutePath(resolvedRoot);
  const prod = productionStrategiesRoot();
  const canonical = canonicalSafeSourceDir();
  const cwd = strategyRuntimeIo.absolutePath(process.cwd());
  const fsRoot = strategyRuntimeIo.fileSystemRoot(root);
  if (root === fsRoot || root === cwd || root === prod || root === canonical) {
    throw new StrategyValidationError(
      `${UNSAFE_TEST_STRATEGY_STORE} Isolated root collides with a protected path.`
    );
  }
  if (isPathInside(prod, root) || isPathInside(canonical, root) || isPathInside(cwd, root)) {
    throw new StrategyValidationError(
      `${UNSAFE_TEST_STRATEGY_STORE} Isolated root must not contain production paths.`
    );
  }
  if (isPathInside(root, prod) || isPathInside(root, canonical)) {
    throw new StrategyValidationError(
      `${UNSAFE_TEST_STRATEGY_STORE} Isolated root must not sit inside production paths.`
    );
  }
}

/**
 * Optional test/isolation override via REXTORA_STRATEGIES_DIR.
 * Under Vitest / NODE_ENV=test the override is mandatory (fail-closed).
 */
const ROOT = () => {
  const override = process.env.REXTORA_STRATEGIES_DIR?.trim();
  if (isStrategyStoreTestRuntime()) {
    if (!override) {
      throw new StrategyValidationError(UNSAFE_TEST_STRATEGY_STORE);
    }
    const resolved = strategyRuntimeIo.absolutePath(override);
    assertIsolatedRootNotProduction(resolved);
    return resolved;
  }
  if (override) return strategyRuntimeIo.absolutePath(override);
  return productionStrategiesRoot();
};

const INDEX = () => strategyRuntimeIo.resolveIndexPath(ROOT());

export function getStrategiesRoot(): string {
  return ROOT();
}

function ensureDir(): void {
  strategyRuntimeIo.ensureDirectory(ROOT());
}

function assertDestructiveTargetAllowed(targetFile: string): void {
  const resolved = strategyRuntimeIo.absolutePath(targetFile);
  const root = ROOT();
  if (!isPathInside(resolved, root)) {
    if (isStrategyStoreTestRuntime()) {
      throw new StrategyValidationError(
        `${UNSAFE_TEST_STRATEGY_STORE} Destructive path is outside the isolated test root.`,
      );
    }
    throw new StrategyValidationError("잘못된 전략 경로입니다.");
  }
}

function strategyFilePath(id: string): string {
  assertSafeStrategyId(id);
  const root = strategyRuntimeIo.absolutePath(ROOT());
  const file = strategyRuntimeIo.resolveStrategyPath(root, id);
  if (!isPathInside(file, root) || file === root) {
    throw new StrategyValidationError("잘못된 전략 경로입니다.");
  }
  return file;
}

function summariesFromParams(params: SafeV44Params) {
  return {
    longConditionSummary: `EMA정배열·기울기≥${params.slope_min.toFixed(6)}·되돌림≤${params.pullback_max_dist.toFixed(4)}·RSI≤${params.rsi_max_long.toFixed(1)}·돌파/레인지 옵션`,
    shortConditionSummary: params.confirm_bear
      ? `EMA역배열·확인숏·RSI≥${params.rsi_min_short.toFixed(1)}·돌파숏`
      : "숏 비활성(confirm_bear=false)",
    stopLossSummary: `ATR × ${params.sl_atr_mult.toFixed(3)}`,
    takeProfitSummary: `ATR × ${params.tp_atr_mult.toFixed(3)}${params.use_trailing ? ` · 트레일 ATR×${params.trail_atr_mult.toFixed(3)}` : ""}`
  };
}

function retireStoreSafeArtifact(filePath: string): void {
  const resolved = strategyRuntimeIo.absolutePath(filePath);
  const root = ROOT();
  if (!isPathInside(resolved, root)) return;
  if (strategyRuntimeIo.hasPath(resolved)) {
    strategyRuntimeIo.removeFile(resolved);
  }
}

function indexStrategiesEqual(
  a: StrategyIndexFile["strategies"],
  b: StrategyIndexFile["strategies"]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.paramsHash !== y.paramsHash ||
      x.sourceParamsHash !== y.sourceParamsHash ||
      x.strategyHash !== y.strategyHash ||
      x.locked !== y.locked ||
      x.paperActive !== y.paperActive ||
      x.liveActive !== y.liveActive ||
      x.file !== y.file
    ) {
      return false;
    }
  }
  return true;
}

function buildIndexPayload(strategies: StoredStrategy[]): StrategyIndexFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      paramsHash: s.paramsHash,
      sourceParamsHash: s.sourceParamsHash,
      strategyHash: s.strategyHash,
      locked: s.locked,
      paperActive: s.paperActive,
      liveActive: s.liveActive,
      file: `${s.id}.json`
    }))
  };
}

function writeStrategyFile(strategy: StoredStrategy): void {
  ensureDir();
  if (isRetiredSafeId(strategy.id)) {
    throw new StrategyValidationError(NO_SELECTED_STRATEGY);
  }
  const file = strategyFilePath(strategy.id);
  assertDestructiveTargetAllowed(file);
  strategyRuntimeIo.writeText(file, JSON.stringify(strategy, null, 2));
}

function writeIndex(strategies: StoredStrategy[]): void {
  ensureDir();
  const index = buildIndexPayload(strategies);
  strategyRuntimeIo.writeText(INDEX(), JSON.stringify(index, null, 2));
}

/** Write index only when strategy rows actually changed. */
function writeIndexIfChanged(strategies: StoredStrategy[]): void {
  const next = buildIndexPayload(strategies);
  if (strategyRuntimeIo.hasPath(INDEX())) {
    try {
      const cur = JSON.parse(strategyRuntimeIo.readText(INDEX())) as StrategyIndexFile;
      if (indexStrategiesEqual(cur.strategies ?? [], next.strategies)) {
        return;
      }
    } catch {
      /* rewrite corrupt index */
    }
  }
  writeIndex(strategies);
}

function hydrateStrategyIdentity(strategy: StoredStrategyV1): StoredStrategyV1 {
  if (strategy.strategyHash) return strategy;
  try {
    // Compute even when definition is absent (legacy safe_params rows).
    // Paper / Backtest / Library must share this same canonical hash.
    return {
      ...strategy,
      strategyHash: computeStrategyHash(storedToDefinition(strategy)),
    };
  } catch {
    return strategy;
  }
}

function readAllStrategyFiles(): StoredStrategyV1[] {
  ensureDir();
  if (!strategyRuntimeIo.hasPath(INDEX())) return [];
  try {
    const index = JSON.parse(strategyRuntimeIo.readText(INDEX())) as StrategyIndexFile;
    const out: StoredStrategyV1[] = [];
    for (const row of index.strategies) {
      try {
        assertSafeStrategyId(row.id);
      } catch {
        continue;
      }
      if (isRetiredSafeId(row.id)) {
        retireStoreSafeArtifact(strategyFilePath(row.id));
        continue;
      }
      const full = strategyFilePath(row.id);
      if (!strategyRuntimeIo.hasPath(full)) continue;
      out.push(
        hydrateStrategyIdentity(
          JSON.parse(strategyRuntimeIo.readText(full)) as StoredStrategyV1,
        ),
      );
    }
    return out;
  } catch (error) {
    if (error instanceof StrategyValidationError) throw error;
    return [];
  }
}

function discoverStrategyFilesOnDisk(): StoredStrategyV1[] {
  ensureDir();
  if (!strategyRuntimeIo.hasPath(ROOT())) return [];
  const names = strategyRuntimeIo.listNames(ROOT()).filter((n) => n.endsWith(".json") && n !== "index.json");
  const out: StoredStrategyV1[] = [];
  for (const name of names) {
    const id = name.replace(/\.json$/, "");
    try {
      assertSafeStrategyId(id);
    } catch {
      continue;
    }
    if (isRetiredSafeId(id) || isRetiredSafeFileName(name)) {
      retireStoreSafeArtifact(strategyFilePath(id));
      continue;
    }
    const full = strategyFilePath(id);
    out.push(
      hydrateStrategyIdentity(
        JSON.parse(strategyRuntimeIo.readText(full)) as StoredStrategyV1,
      ),
    );
  }
  return out;
}

/**
 * Ensure the management store exists. An empty store is valid.
 * Retired SAFE rows are dropped and never re-injected.
 */
export function ensureStrategyStore(): StoredStrategy[] {
  ensureDir();
  migrateRetiredSafeStore();
  let loaded = readAllStrategyFiles();
  let indexNeedsRepair = !strategyRuntimeIo.hasPath(INDEX());

  if (!loaded.length && strategyRuntimeIo.hasPath(INDEX())) {
    loaded = discoverStrategyFilesOnDisk();
    indexNeedsRepair = true;
  }

  if (!strategyRuntimeIo.hasPath(INDEX())) {
    loaded = discoverStrategyFilesOnDisk();
    indexNeedsRepair = true;
  }

  loaded = loaded.filter((s) => !isRetiredSafeId(s.id));

  if (indexNeedsRepair) {
    writeIndexIfChanged(loaded);
  }

  return loaded;
}

function migrateRetiredSafeStore(): void {
  ensureDir();
  const names = strategyRuntimeIo.hasPath(ROOT())
    ? strategyRuntimeIo.listNames(ROOT())
    : [];
  for (const name of names) {
    if (isRetiredSafeFileName(name)) {
      retireStoreSafeArtifact(
        strategyRuntimeIo.resolveStrategyPath(ROOT(), name.replace(/\.json$/, "")),
      );
    }
  }
  if (!strategyRuntimeIo.hasPath(INDEX())) return;
  try {
    const index = JSON.parse(strategyRuntimeIo.readText(INDEX())) as StrategyIndexFile;
    const next = (index.strategies ?? []).filter((row) => !isRetiredSafeId(row.id));
    if (next.length !== (index.strategies ?? []).length) {
      strategyRuntimeIo.writeText(
        INDEX(),
        JSON.stringify({ ...index, strategies: next }, null, 2),
      );
    }
  } catch {
    /* rewrite on next ensure */
  }
}

export function listStrategies(): StoredStrategy[] {
  ensureDir();
  if (!strategyRuntimeIo.hasPath(INDEX())) {
    return ensureStrategyStore();
  }
  migrateRetiredSafeStore();
  return readAllStrategyFiles().filter((s) => !isRetiredSafeId(s.id));
}

export function getStrategyById(id: string): StoredStrategyV1 | undefined {
  assertSafeStrategyId(id);
  return listStrategies().find((s) => s.id === id) as StoredStrategyV1 | undefined;
}

export function getPaperActiveStrategy(): StoredStrategy | null {
  const list = listStrategies();
  return list.find((s) => s.paperActive && !isRetiredSafeId(s.id)) ?? null;
}

export function getLiveActiveStrategy(): StoredStrategy | undefined {
  return listStrategies().find((s) => s.liveActive);
}

export function copyStrategy(
  id: string,
  newName?: string,
  ownerUserId?: string | null,
): StoredStrategyV1 {
  assertSafeStrategyId(id);
  const source = getStrategyById(id);
  if (!source) throw new StrategyValidationError("복사할 전략이 없습니다.");
  const now = new Date().toISOString();
  const params = { ...source.params };
  let paramsHash = computeParamsHash(params);
  const copyId = `copy_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  assertSafeStrategyId(copyId);
  const summary = summariesFromParams(params);
  const sourceStrategyId = isRetiredSafeId(source.id)
    ? null
    : source.sourceStrategyId ?? source.id;
  if (isRetiredSafeHash(paramsHash)) {
    paramsHash = computeParamsHash({ ...params, clone_id: copyId } as unknown as Record<string, unknown>);
  }

  const existingNames = new Set(listStrategies().map((s) => s.name));
  let cloneName = newName ?? `${source.name} 복사본 1`;
  if (!newName) {
    let n = 1;
    while (existingNames.has(`${source.name} 복사본 ${n}`)) n += 1;
    cloneName = `${source.name} 복사본 ${n}`;
  } else if (existingNames.has(newName)) {
    let n = 2;
    while (existingNames.has(`${newName} (${n})`)) n += 1;
    cloneName = `${newName} (${n})`;
  }

  const copy: StoredStrategyV1 = {
    ...source,
    id: copyId,
    name: cloneName,
    description: `${source.name} 복사본. 편집 가능합니다.`,
    locked: false,
    sourceStatus: "user_copy",
    sourceFile: null,
    paramsHash,
    params,
    paperActive: false,
    liveActive: false,
    liveEligible: false,
    createdAt: now,
    updatedAt: now,
    ownerUserId: ownerUserId?.trim() || null,
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategyType: (source.strategyType as StrategyKind) ?? "safe_params",
    sourceStrategyId,
    version: "1.0.0",
    definition: source.definition
      ? {
          ...source.definition,
          strategyId: copyId,
          strategyName: cloneName,
          locked: false,
          sourceStrategyId,
          paramsHash,
          createdAt: now,
          updatedAt: now
        }
      : undefined,
    ...summary
  };
  const all = listStrategies();
  all.push(copy);
  writeStrategyFile(copy);
  writeIndex(all);
  return copy;
}

export function createStrategy(input: {
  ownerUserId?: string | null;
  name: string;
  /** Editable alias — never hashed into identity. */
  displayAlias?: string | null;
  displayName?: string | null;
  description?: string;
  timeframe?: StrategyTimeframe;
  params?: Partial<SafeV44Params>;
  strategyType?: StrategyKind;
  definition?: CanonicalStrategyDefinition;
  sourceParamsHash?: string;
  strategyHash?: string;
  executionProvenance?: StrategyExecutionProvenance;
  /**
   * Optional fixed id. Only reserved demo_strategy_* ids are accepted —
   * never SAFE, never path traversal.
   */
  id?: string;
}): StoredStrategyV1 {
  const now = new Date().toISOString();
  const params = mergeSafeParams(input.params ?? {});
  const paramsHash = computeParamsHash(params);
  const requestedId = input.id?.trim();
  if (requestedId) {
    assertSafeStrategyId(requestedId);
    if (isRetiredSafeId(requestedId)) {
      throw new StrategyValidationError("폐기된 기준 전략 ID는 생성할 수 없습니다.");
    }
    if (!requestedId.startsWith("demo_strategy_")) {
      throw new StrategyValidationError(
        "사용자 지정 전략 ID는 demo_strategy_ 예약 네임스페이스만 허용됩니다.",
      );
    }
    if (getStrategyById(requestedId)) {
      throw new StrategyValidationError("이미 존재하는 전략 ID입니다.");
    }
  }
  const id = requestedId ?? `custom_${Date.now().toString(36)}`;
  assertSafeStrategyId(id);
  const summary = summariesFromParams(params);
  const strategyType = input.strategyType ?? "condition_builder";
  let definition = input.definition;
  if (definition) {
    definition = { ...definition, strategyId: id, strategyName: input.name, paramsHash, locked: false };
    const v = validateCanonicalDefinition(definition);
    if (!v.ok) throw new StrategyValidationError(v.errors.join(" · "));
  }
  const strategy: StoredStrategyV1 = {
    id,
    name: input.name,
    displayAlias: input.displayAlias ?? null,
    displayName: input.displayName ?? null,
    description: input.description ?? "사용자 생성 전략",
    type: strategyType === "condition_builder" ? "조건빌더" : "사용자",
    timeframe: input.timeframe ?? "15m",
    paramsHash,
    sourceParamsHash: input.sourceParamsHash,
    params,
    locked: false,
    sourceFile: null,
    sourceStatus: "user_created",
    paperActive: false,
    liveActive: false,
    liveEligible: false,
    createdAt: now,
    updatedAt: now,
    ownerUserId: input.ownerUserId?.trim() || null,
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategyType,
    sourceStrategyId: null,
    version: "1.0.0",
    symbols: ["BTCUSDT"],
    longEnabled: true,
    shortEnabled: true,
    definition,
    ...summary
  };
  const parsedProvenance = parseStrategyExecutionProvenance(
    input.executionProvenance,
  );
  if (parsedProvenance.kind === "ok") {
    strategy.executionProvenance = parsedProvenance.value;
    if (input.executionProvenance && typeof input.executionProvenance === "object") {
      strategy.executionProvenance = {
        ...input.executionProvenance,
        ...parsedProvenance.value,
      };
    }
  }
  strategy.strategyHash =
    input.strategyHash ?? computeStrategyHash(storedToDefinition(strategy));
  const all = listStrategies();
  all.push(strategy);
  writeStrategyFile(strategy);
  writeIndex(all);
  return strategy;
}

/**
 * Update editable display fields only. Never changes paramsHash / identity.
 */
export function updateStrategyDisplayMeta(
  id: string,
  patch: {
    displayAlias?: string | null;
    displayName?: string | null;
    description?: string | null;
    /** Optional UI label; does not affect paramsHash. */
    name?: string | null;
  },
): StoredStrategyV1 {
  assertSafeStrategyId(id);
  if (isRetiredSafeId(id)) {
    throw new StrategyValidationError(NO_SELECTED_STRATEGY);
  }
  const current = getStrategyById(id);
  if (!current) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (current.locked) {
    throw new StrategyValidationError("잠긴 전략의 표시 이름은 변경할 수 없습니다.");
  }
  const nextAlias =
    patch.displayAlias !== undefined
      ? patch.displayAlias
      : (current.displayAlias ?? null);
  const nextDisplayName =
    patch.displayName !== undefined
      ? patch.displayName
      : (current.displayName ?? null);
  const nextName =
    typeof patch.name === "string" && patch.name.trim()
      ? patch.name.trim().slice(0, 120)
      : current.name;
  const at = new Date().toISOString();
  const audit = [...(current.renameAudit ?? [])];
  if ((current.displayAlias ?? null) !== nextAlias) {
    audit.push({
      at,
      from: current.displayAlias ?? null,
      to: nextAlias,
      field: "displayAlias",
    });
  }
  if ((current.displayName ?? null) !== nextDisplayName) {
    audit.push({
      at,
      from: current.displayName ?? null,
      to: nextDisplayName,
      field: "displayName",
    });
  }
  if (current.name !== nextName) {
    audit.push({ at, from: current.name, to: nextName, field: "name" });
  }
  const next: StoredStrategyV1 = {
    ...current,
    displayAlias: nextAlias,
    displayName: nextDisplayName,
    description:
      patch.description != null && patch.description !== undefined
        ? patch.description
        : current.description,
    name: nextName,
    renameAudit: audit.slice(-50),
    // Identity fields frozen
    id: current.id,
    paramsHash: current.paramsHash,
    params: current.params,
    locked: false,
    updatedAt: at,
  };
  const all = listStrategies().map((s) => (s.id === id ? next : s));
  writeStrategyFile(next);
  writeIndex(all);
  return next;
}

export function saveStrategy(
  id: string,
  patch: Partial<StoredStrategyV1> & { params?: SafeV44Params; definition?: CanonicalStrategyDefinition }
): StoredStrategyV1 {
  assertSafeStrategyId(id);
  if (isRetiredSafeId(id)) {
    throw new StrategyValidationError(NO_SELECTED_STRATEGY);
  }
  const current = getStrategyById(id);
  if (!current) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (current.locked) {
    throw new StrategyValidationError("잠긴 전략은 직접 저장할 수 없습니다.");
  }
  let nextDef = patch.definition;
  if (nextDef) {
    nextDef = { ...nextDef, strategyId: current.id, locked: false, sourceStrategyId: current.sourceStrategyId ?? null };
    const v = validateCanonicalDefinition(nextDef);
    if (!v.ok) throw new StrategyValidationError(v.errors.join(" · "));
    const mapped = definitionToStoredPatch(nextDef, current);
    const next: StoredStrategyV1 = {
      ...current,
      ...mapped,
      id: current.id,
      locked: false,
      updatedAt: new Date().toISOString()
    };
    const all = listStrategies().map((s) => (s.id === id ? next : s));
    writeStrategyFile(next);
    writeIndex(all);
    return next;
  }

  const params = patch.params ? mergeSafeParams(patch.params) : current.params;
  const paramsHash = computeParamsHash(params);
  const summary = summariesFromParams(params);
  const next: StoredStrategyV1 = {
    ...current,
    ...patch,
    id: current.id,
    locked: false,
    params,
    paramsHash,
    updatedAt: new Date().toISOString(),
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    ...summary
  };
  next.strategyHash = computeStrategyHash(storedToDefinition(next));
  const all = listStrategies().map((s) => (s.id === id ? next : s));
  writeStrategyFile(next);
  writeIndex(all);
  return next;
}

export function deleteStrategy(id: string): void {
  assertSafeStrategyId(id);
  if (isRetiredSafeId(id)) {
    retireStoreSafeArtifact(strategyFilePath(id));
    writeIndex(listStrategies().filter((s) => !isRetiredSafeId(s.id)));
    return;
  }
  const current = getStrategyById(id);
  if (!current) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (current.locked) {
    throw new StrategyValidationError("잠긴 전략은 삭제할 수 없습니다.");
  }
  const file = strategyFilePath(id);
  assertDestructiveTargetAllowed(file);
  if (strategyRuntimeIo.hasPath(file)) strategyRuntimeIo.removeFile(file);
  const all = listStrategies().filter((s) => s.id !== id);
  writeIndex(all);
}

function writeNonSafeStrategyFiles(all: StoredStrategy[]): void {
  for (const s of all) {
    if (isRetiredSafeId(s.id)) continue;
    writeStrategyFile(s);
  }
}

export function setPaperActiveStrategy(id: string): StoredStrategy {
  assertSafeStrategyId(id);
  const target = getStrategyById(id);
  if (!target) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (isTestStrategyRecord(target as StoredStrategyV1 & { testData?: boolean })) {
    throw new StrategyValidationError("테스트 전략은 모의 매매에 적용할 수 없습니다.");
  }
  if (target.timeframe === "unknown") {
    throw new StrategyValidationError("적용 시간봉이 확인되지 않아 모의 매매에 적용할 수 없습니다.");
  }
  if (target.definition) {
    const v = validateCanonicalDefinition(storedToDefinition(target));
    if (!v.ok) throw new StrategyValidationError(`설정 오류: ${v.errors.join(" · ")}`);
  }
  if (isRetiredSafeId(id)) {
    throw new StrategyValidationError(NO_SELECTED_STRATEGY);
  }
  const all = listStrategies().map((s) => ({
    ...s,
    paperActive: s.id === id && !isRetiredSafeId(s.id),
  }));
  writeNonSafeStrategyFiles(all);
  writeIndex(all);
  const active = all.find((s) => s.id === id);
  if (!active) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  return active;
}

export function setLiveActiveStrategy(id: string): StoredStrategy {
  assertSafeStrategyId(id);
  const target = getStrategyById(id);
  if (!target) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (isDemoLiveBlocked(target)) {
    throw new StrategyValidationError(
      "데모 전략은 실전 거래 후보로 지정할 수 없습니다.",
    );
  }
  if (isTestStrategyRecord(target as StoredStrategyV1 & { testData?: boolean })) {
    throw new StrategyValidationError("테스트 전략은 실전 후보로 지정할 수 없습니다.");
  }
  if (target.timeframe === "unknown") {
    throw new StrategyValidationError("적용 시간봉이 확인되지 않아 실전 후보로 지정할 수 없습니다.");
  }
  if (target.definition) {
    const v = validateCanonicalDefinition(storedToDefinition(target));
    if (!v.ok) throw new StrategyValidationError(`설정 오류: ${v.errors.join(" · ")}`);
  }
  if (isRetiredSafeId(id)) {
    throw new StrategyValidationError(NO_SELECTED_STRATEGY);
  }
  const all = listStrategies().map((s) => ({
    ...s,
    liveActive: s.id === id && !isRetiredSafeId(s.id),
    liveEligible: s.id === id ? true : s.liveEligible
  }));
  writeNonSafeStrategyFiles(all);
  writeIndex(all);
  return all.find((s) => s.id === id)!;
}

/** Remove confirmed test/pollution strategy files. Empty store is valid. */
export function purgeTestStrategies(): { removed: string[]; kept: string[] } {
  ensureDir();
  migrateRetiredSafeStore();
  const all = readAllStrategyFiles();
  const removed: string[] = [];
  const kept: StoredStrategyV1[] = [];
  for (const s of all) {
    if (isRetiredSafeId(s.id)) {
      retireStoreSafeArtifact(strategyFilePath(s.id));
      removed.push(s.id);
      continue;
    }
    if (isTestStrategyRecord(s as StoredStrategyV1 & { testData?: boolean })) {
      const file = strategyFilePath(s.id);
      assertDestructiveTargetAllowed(file);
      if (strategyRuntimeIo.hasPath(file)) strategyRuntimeIo.removeFile(file);
      removed.push(s.id);
    } else {
      kept.push(s);
    }
  }
  writeIndex(kept);
  return { removed, kept: kept.map((s) => s.id) };
}

export function updateStrategyLastBacktest(
  id: string,
  stats: { totalReturn: number; mdd: number; trades: number; winRate: number }
): void {
  if (isRetiredSafeId(id)) return;
  const current = getStrategyById(id);
  if (!current) return;
  const next: StoredStrategy = {
    ...current,
    lastBacktest: { ...stats, at: new Date().toISOString() },
    updatedAt: new Date().toISOString()
  };
  writeStrategyFile(next);
  writeIndex(listStrategies().map((s) => (s.id === id ? next : s)));
}

export function getDefaultParams(): SafeV44Params {
  return { ...GENERIC_SEARCH_BASELINE_PARAMS };
}

export function validateStrategyById(
  id: string
): { ok: true; definition: CanonicalStrategyDefinition } | { ok: false; errors: string[] } {
  const s = getStrategyById(id);
  if (!s) return { ok: false, errors: ["전략을 찾을 수 없습니다."] };
  const def = storedToDefinition(s);
  const v = validateCanonicalDefinition(def);
  if (!v.ok) return v;
  return { ok: true, definition: def };
}

export function restoreCloneFromSource(id: string): StoredStrategyV1 {
  const clone = getStrategyById(id);
  if (!clone) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (clone.locked || isRetiredSafeId(clone.id)) {
    throw new StrategyValidationError("잠긴 전략은 복원할 수 없습니다.");
  }
  const sourceId = clone.sourceStrategyId;
  if (!sourceId || isRetiredSafeId(sourceId)) {
    throw new StrategyValidationError("원본 전략을 찾을 수 없습니다.");
  }
  const source = getStrategyById(sourceId);
  if (!source) throw new StrategyValidationError("원본 전략을 찾을 수 없습니다.");
  return saveStrategy(id, {
    params: { ...source.params },
    name: clone.name,
    description: `${source.name}에서 복원한 복사본`
  });
}
