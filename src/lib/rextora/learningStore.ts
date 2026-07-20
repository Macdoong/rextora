import { invalidateJsonStoreCache, readJsonStore, writeJsonStore } from "./storage/jsonStore";
import type { LearningProfile, PatternStats } from "./learningTypes";

export const LEARNING_PROFILE_FILENAME = "learning-profile.json";
export const LEARNING_PROFILE_VERSION = 1;

let memoryCache: LearningProfile | null = null;

export function createEmptyPatternStats(): PatternStats {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    flats: 0,
    tpHits: 0,
    slHits: 0,
    totalPnlPct: 0,
    avgPnlPct: 0
  };
}

export function createDefaultLearningProfile(): LearningProfile {
  const empty = createEmptyPatternStats();
  return {
    version: LEARNING_PROFILE_VERSION,
    updatedAt: new Date().toISOString(),
    global: { ...empty, consecutiveLosses: 0 },
    bySymbol: {},
    bySide: {},
    byHour: {},
    bySignal: {},
    byAiScoreBucket: {},
    byLeverage: {},
    byCostBucket: {},
    paper: { ...empty },
    live: { ...empty },
    recentAdjustments: []
  };
}

function mergePatternStats(base: PatternStats, patch?: Partial<PatternStats>): PatternStats {
  return { ...createEmptyPatternStats(), ...base, ...patch };
}

export function loadLearningProfile(): LearningProfile {
  if (memoryCache) return memoryCache;
  const defaults = createDefaultLearningProfile();
  const stored = readJsonStore(LEARNING_PROFILE_FILENAME, defaults, { ttlMs: 2_000 });
  memoryCache = {
    ...defaults,
    ...stored,
    global: { ...defaults.global, ...stored.global },
    bySymbol: { ...defaults.bySymbol, ...stored.bySymbol },
    bySide: { ...defaults.bySide, ...stored.bySide },
    byHour: { ...defaults.byHour, ...stored.byHour },
    bySignal: { ...defaults.bySignal, ...stored.bySignal },
    byAiScoreBucket: { ...defaults.byAiScoreBucket, ...stored.byAiScoreBucket },
    byLeverage: { ...defaults.byLeverage, ...stored.byLeverage },
    byCostBucket: { ...defaults.byCostBucket, ...stored.byCostBucket },
    paper: mergePatternStats(defaults.paper, stored.paper),
    live: mergePatternStats(defaults.live, stored.live),
    recentAdjustments: stored.recentAdjustments ?? []
  };
  return memoryCache;
}

export function saveLearningProfile(profile: LearningProfile): LearningProfile {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  memoryCache = writeJsonStore(LEARNING_PROFILE_FILENAME, next);
  invalidateJsonStoreCache(LEARNING_PROFILE_FILENAME);
  return memoryCache;
}

export function clearLearningProfileCacheForTests(): void {
  memoryCache = null;
  invalidateJsonStoreCache(LEARNING_PROFILE_FILENAME);
}

export function resetLearningProfileForTests(): LearningProfile {
  clearLearningProfileCacheForTests();
  return saveLearningProfile(createDefaultLearningProfile());
}
