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

const ROOT = () => path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rextora", "strategies");
const INDEX = () => path.join(ROOT(), "index.json");

function ensureDir(): void {
  fs.mkdirSync(ROOT(), { recursive: true });
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

function buildLockedSafeStrategy(): StoredStrategy {
  const meta = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const params = meta.params;
  const now = new Date().toISOString();
  const summary = summariesFromParams(params);
  return {
    id: SAFE_STRATEGY_ID,
    name: SAFE_STRATEGY_NAME,
    description: "검증된 SAFE 기준 전략. 원본은 잠금 상태이며 직접 수정할 수 없습니다.",
    type: "안정형",
    timeframe: "unknown",
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
    ...summary
  };
}

function writeStrategyFile(strategy: StoredStrategy): void {
  ensureDir();
  const file = path.join(ROOT(), `${strategy.id}.json`);
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
  const safePath = path.join(ROOT(), `${SAFE_STRATEGY_ID}.json`);
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

function readAllStrategyFiles(): StoredStrategy[] {
  ensureDir();
  if (!fs.existsSync(INDEX())) return [];
  try {
    const index = JSON.parse(fs.readFileSync(INDEX(), "utf8")) as StrategyIndexFile;
    const out: StoredStrategy[] = [];
    for (const row of index.strategies) {
      const full = path.join(ROOT(), row.file);
      if (!fs.existsSync(full)) continue;
      out.push(JSON.parse(fs.readFileSync(full, "utf8")) as StoredStrategy);
    }
    return out;
  } catch {
    return [];
  }
}

export function listStrategies(): StoredStrategy[] {
  ensureDir();
  if (!fs.existsSync(INDEX()) || !fs.existsSync(path.join(ROOT(), `${SAFE_STRATEGY_ID}.json`))) {
    return ensureStrategyStore();
  }
  const loaded = readAllStrategyFiles();
  return loaded.length ? loaded : ensureStrategyStore();
}

export function getStrategyById(id: string): StoredStrategy | undefined {
  return listStrategies().find((s) => s.id === id);
}

export function getPaperActiveStrategy(): StoredStrategy {
  const list = listStrategies();
  return list.find((s) => s.paperActive) ?? list.find((s) => s.id === SAFE_STRATEGY_ID) ?? ensureStrategyStore()[0];
}

export function getLiveActiveStrategy(): StoredStrategy | undefined {
  return listStrategies().find((s) => s.liveActive);
}

export function copyStrategy(id: string, newName?: string): StoredStrategy {
  const source = getStrategyById(id);
  if (!source) throw new Error("복사할 전략이 없습니다.");
  const now = new Date().toISOString();
  const params = { ...source.params };
  const paramsHash = computeParamsHash(params);
  const copyId = `copy_${Date.now().toString(36)}`;
  const summary = summariesFromParams(params);
  const copy: StoredStrategy = {
    ...source,
    id: copyId,
    name: newName ?? `${source.name}_copy`,
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
}): StoredStrategy {
  const now = new Date().toISOString();
  const params = mergeSafeParams(input.params ?? {});
  const paramsHash = computeParamsHash(params);
  const id = `custom_${Date.now().toString(36)}`;
  const summary = summariesFromParams(params);
  const strategy: StoredStrategy = {
    id,
    name: input.name,
    description: input.description ?? "사용자 생성 전략",
    type: "사용자",
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
    ...summary
  };
  const all = listStrategies();
  all.push(strategy);
  writeStrategyFile(strategy);
  writeIndex(all);
  return strategy;
}

export function saveStrategy(id: string, patch: Partial<StoredStrategy> & { params?: SafeV44Params }): StoredStrategy {
  const current = getStrategyById(id);
  if (!current) throw new Error("전략을 찾을 수 없습니다.");
  if (current.locked || current.id === SAFE_STRATEGY_ID) {
    throw new Error("잠긴 SAFE_v44_i4060은 직접 저장할 수 없습니다. 먼저 복사하세요.");
  }
  const params = patch.params ? mergeSafeParams(patch.params) : current.params;
  const paramsHash = computeParamsHash(params);
  const summary = summariesFromParams(params);
  const next: StoredStrategy = {
    ...current,
    ...patch,
    id: current.id,
    locked: false,
    params,
    paramsHash,
    updatedAt: new Date().toISOString(),
    ...summary
  };
  const all = listStrategies().map((s) => (s.id === id ? next : s));
  writeStrategyFile(next);
  writeIndex(all);
  return next;
}

export function deleteStrategy(id: string): void {
  const current = getStrategyById(id);
  if (!current) throw new Error("전략을 찾을 수 없습니다.");
  if (current.locked || current.id === SAFE_STRATEGY_ID) {
    throw new Error("잠긴 SAFE 전략은 삭제할 수 없습니다.");
  }
  const file = path.join(ROOT(), `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const all = listStrategies().filter((s) => s.id !== id);
  writeIndex(all);
}

export function setPaperActiveStrategy(id: string): StoredStrategy {
  const all = listStrategies().map((s) => ({ ...s, paperActive: s.id === id }));
  for (const s of all) writeStrategyFile(s);
  writeIndex(all);
  const active = all.find((s) => s.id === id);
  if (!active) throw new Error("전략을 찾을 수 없습니다.");
  return active;
}

export function setLiveActiveStrategy(id: string): StoredStrategy {
  const target = getStrategyById(id);
  if (!target) throw new Error("전략을 찾을 수 없습니다.");
  const all = listStrategies().map((s) => ({ ...s, liveActive: s.id === id }));
  for (const s of all) writeStrategyFile(s);
  writeIndex(all);
  return all.find((s) => s.id === id)!;
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
