import fs from "node:fs";
import path from "node:path";
import { CONTEXT_FALLBACK_PARAMS, mergeSafeParams } from "./safeV44Params";
import { computeParamsHash } from "./strategyHash";
import { loadSafeV44Strategy } from "./safeV44Strategy";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
  SAFE_STRATEGY_NAME,
  type SafeV44Params,
  type StoredStrategy,
  type StrategyIndexFile,
  type StrategyTimeframe
} from "./strategyTypes";
import { STRATEGY_SCHEMA_VERSION, type StrategyKind } from "./definition/types";
import { assertSafeStrategyId, StrategyValidationError, validateCanonicalDefinition } from "./definition/validator";
import { definitionToStoredPatch, storedToDefinition, type StoredStrategyV1 } from "./definition/bridge";
import type { CanonicalStrategyDefinition } from "./definition/types";
import { isTestStrategyRecord } from "./strategyTestFilter";

const ROOT = () => path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rextora", "strategies");
const INDEX = () => path.join(ROOT(), "index.json");

function ensureDir(): void {
  fs.mkdirSync(ROOT(), { recursive: true });
}

function strategyFilePath(id: string): string {
  assertSafeStrategyId(id);
  const root = path.resolve(ROOT());
  const file = path.resolve(root, `${id}.json`);
  if (!file.startsWith(root + path.sep)) {
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

function buildLockedSafeStrategy(): StoredStrategyV1 {
  const meta = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const params = meta.params;
  const now = new Date().toISOString();
  const summary = summariesFromParams(params);
  return {
    id: SAFE_STRATEGY_ID,
    name: SAFE_STRATEGY_NAME,
    description: "검증된 SAFE 기준 전략. 원본은 잠금 상태이며 직접 수정할 수 없습니다.",
    type: "안정형",
    timeframe: "15m",
    paramsHash: EXPECTED_SAFE_PARAMS_HASH,
    params,
    locked: true,
    sourceFile: meta.sourceFile,
    sourceStatus: meta.sourceStatus,
    paperActive: true,
    liveActive: false,
    liveEligible: true,
    createdAt: now,
    updatedAt: now,
    lastBacktest: {
      totalReturn: 0.2228,
      mdd: -0.17,
      trades: 201,
      winRate: 0.6189,
      at: now
    },
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategyType: "safe_params",
    sourceStrategyId: null,
    version: "44.i4060",
    symbols: ["BTCUSDT"],
    longEnabled: true,
    shortEnabled: params.confirm_bear,
    ...summary
  };
}

function writeStrategyFile(strategy: StoredStrategy): void {
  ensureDir();
  const file = strategyFilePath(strategy.id);
  // Direct write avoids cross-process tmp rename races during parallel tests
  fs.writeFileSync(file, JSON.stringify(strategy, null, 2), "utf8");
}

function writeIndex(strategies: StoredStrategy[]): void {
  ensureDir();
  const index: StrategyIndexFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      paramsHash: s.paramsHash,
      locked: s.locked,
      paperActive: s.paperActive,
      liveActive: s.liveActive,
      file: `${s.id}.json`
    }))
  };
  fs.writeFileSync(INDEX(), JSON.stringify(index, null, 2), "utf8");
}

export function ensureStrategyStore(): StoredStrategy[] {
  ensureDir();
  const locked = buildLockedSafeStrategy();
  const safePath = strategyFilePath(SAFE_STRATEGY_ID);
  if (!fs.existsSync(safePath)) {
    writeStrategyFile(locked);
  }

  const loaded = readAllStrategyFiles();
  const refreshed = loaded.length
    ? loaded.map((s) => {
        if (s.id !== SAFE_STRATEGY_ID) return s;
        const next = {
          ...locked,
          paperActive: s.paperActive,
          liveActive: s.liveActive,
          lastBacktest: s.lastBacktest ?? locked.lastBacktest
        };
        writeStrategyFile(next);
        return next;
      })
    : [locked];

  if (!refreshed.some((s) => s.id === SAFE_STRATEGY_ID)) {
    refreshed.unshift(locked);
    writeStrategyFile(locked);
  }
  writeIndex(refreshed);
  return refreshed;
}

function readAllStrategyFiles(): StoredStrategyV1[] {
  ensureDir();
  if (!fs.existsSync(INDEX())) return [];
  try {
    const index = JSON.parse(fs.readFileSync(INDEX(), "utf8")) as StrategyIndexFile;
    const out: StoredStrategyV1[] = [];
    for (const row of index.strategies) {
      try {
        assertSafeStrategyId(row.id);
      } catch {
        continue;
      }
      const full = strategyFilePath(row.id);
      if (!fs.existsSync(full)) continue;
      out.push(JSON.parse(fs.readFileSync(full, "utf8")) as StoredStrategyV1);
    }
    return out;
  } catch {
    return [];
  }
}

export function listStrategies(): StoredStrategy[] {
  ensureDir();
  if (!fs.existsSync(INDEX()) || !fs.existsSync(strategyFilePath(SAFE_STRATEGY_ID))) {
    return ensureStrategyStore();
  }
  const loaded = readAllStrategyFiles();
  return loaded.length ? loaded : ensureStrategyStore();
}

export function getStrategyById(id: string): StoredStrategyV1 | undefined {
  assertSafeStrategyId(id);
  return listStrategies().find((s) => s.id === id) as StoredStrategyV1 | undefined;
}

export function getPaperActiveStrategy(): StoredStrategy {
  const list = listStrategies();
  return list.find((s) => s.paperActive) ?? list.find((s) => s.id === SAFE_STRATEGY_ID) ?? ensureStrategyStore()[0];
}

export function getLiveActiveStrategy(): StoredStrategy | undefined {
  return listStrategies().find((s) => s.liveActive);
}

export function copyStrategy(id: string, newName?: string): StoredStrategyV1 {
  assertSafeStrategyId(id);
  const source = getStrategyById(id);
  if (!source) throw new StrategyValidationError("복사할 전략이 없습니다.");
  const now = new Date().toISOString();
  const params = { ...source.params };
  let paramsHash = computeParamsHash(params);
  const copyId = `copy_${Date.now().toString(36)}`;
  assertSafeStrategyId(copyId);
  const summary = summariesFromParams(params);
  const sourceStrategyId = source.id === SAFE_STRATEGY_ID ? SAFE_STRATEGY_ID : source.sourceStrategyId ?? source.id;
  if (paramsHash === EXPECTED_SAFE_PARAMS_HASH) {
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
  name: string;
  description?: string;
  timeframe?: StrategyTimeframe;
  params?: Partial<SafeV44Params>;
  strategyType?: StrategyKind;
  definition?: CanonicalStrategyDefinition;
}): StoredStrategyV1 {
  const now = new Date().toISOString();
  const params = mergeSafeParams(input.params ?? {});
  const paramsHash = computeParamsHash(params);
  const id = `custom_${Date.now().toString(36)}`;
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
    description: input.description ?? "사용자 생성 전략",
    type: strategyType === "condition_builder" ? "조건빌더" : "사용자",
    timeframe: input.timeframe ?? "15m",
    paramsHash,
    params,
    locked: false,
    sourceFile: null,
    sourceStatus: "user_created",
    paperActive: false,
    liveActive: false,
    liveEligible: false,
    createdAt: now,
    updatedAt: now,
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
  const all = listStrategies();
  all.push(strategy);
  writeStrategyFile(strategy);
  writeIndex(all);
  return strategy;
}

export function saveStrategy(
  id: string,
  patch: Partial<StoredStrategyV1> & { params?: SafeV44Params; definition?: CanonicalStrategyDefinition }
): StoredStrategyV1 {
  assertSafeStrategyId(id);
  const current = getStrategyById(id);
  if (!current) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (current.locked || current.id === SAFE_STRATEGY_ID) {
    throw new StrategyValidationError("잠긴 원본 보호 전략은 직접 저장할 수 없습니다. 먼저 복사본을 만드세요.");
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
  const all = listStrategies().map((s) => (s.id === id ? next : s));
  writeStrategyFile(next);
  writeIndex(all);
  return next;
}

export function deleteStrategy(id: string): void {
  assertSafeStrategyId(id);
  const current = getStrategyById(id);
  if (!current) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  if (current.locked || current.id === SAFE_STRATEGY_ID) {
    throw new StrategyValidationError("잠긴 원본 보호 전략은 삭제할 수 없습니다.");
  }
  const file = strategyFilePath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const all = listStrategies().filter((s) => s.id !== id);
  writeIndex(all);
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
  const all = listStrategies().map((s) => ({ ...s, paperActive: s.id === id }));
  for (const s of all) writeStrategyFile(s);
  writeIndex(all);
  const active = all.find((s) => s.id === id);
  if (!active) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
  return active;
}

export function setLiveActiveStrategy(id: string): StoredStrategy {
  assertSafeStrategyId(id);
  const target = getStrategyById(id);
  if (!target) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
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
  const all = listStrategies().map((s) => ({
    ...s,
    liveActive: s.id === id,
    liveEligible: s.id === id ? true : s.liveEligible
  }));
  for (const s of all) writeStrategyFile(s);
  writeIndex(all);
  return all.find((s) => s.id === id)!;
}

/** Remove confirmed test/pollution strategy files. Never deletes SAFE original. */
export function purgeTestStrategies(): { removed: string[]; kept: string[] } {
  ensureDir();
  const all = readAllStrategyFiles();
  const removed: string[] = [];
  const kept: StoredStrategyV1[] = [];
  for (const s of all) {
    if (s.id === SAFE_STRATEGY_ID) {
      kept.push(s);
      continue;
    }
    if (isTestStrategyRecord(s as StoredStrategyV1 & { testData?: boolean })) {
      const file = strategyFilePath(s.id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      removed.push(s.id);
    } else {
      kept.push(s);
    }
  }
  if (!kept.some((s) => s.id === SAFE_STRATEGY_ID)) {
    const locked = buildLockedSafeStrategy();
    writeStrategyFile(locked);
    kept.unshift(locked);
  }
  writeIndex(kept);
  return { removed, kept: kept.map((s) => s.id) };
}

export function updateStrategyLastBacktest(
  id: string,
  stats: { totalReturn: number; mdd: number; trades: number; winRate: number }
): void {
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
  return { ...CONTEXT_FALLBACK_PARAMS };
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
  if (clone.locked || clone.id === SAFE_STRATEGY_ID) {
    throw new StrategyValidationError("원본 보호 전략은 복원할 수 없습니다.");
  }
  const sourceId = clone.sourceStrategyId ?? SAFE_STRATEGY_ID;
  const source = getStrategyById(sourceId);
  if (!source) throw new StrategyValidationError("원본 전략을 찾을 수 없습니다.");
  return saveStrategy(id, {
    params: { ...source.params },
    name: clone.name,
    description: `${source.name}에서 복원한 복사본`
  });
}
