/**
 * Persistent Research Top-10 shortlist per Research Job.
 * Does not register strategies. Never overwrites the strategy library.
 * Raw trials remain separate evidence.
 */

import fs from "node:fs";
import path from "node:path";
import type { StrategySearchStoreOptions } from "./jobStore";
import type { StrategyRoleBadge } from "../results/researchDisplay";
import type { ResearchResultCard } from "./researchResultsSummary";

export const RESEARCH_TOP10_VERSION = 1 as const;
export const RESEARCH_TOP10_LIMIT = 10;

export type Top10RankChange =
  | "신규 진입"
  | "순위 상승"
  | "순위 하락"
  | "순위 유지"
  | "TOP 10 제외";

export interface ResearchTop10Entry {
  rank: number;
  roleBadges: StrategyRoleBadge[];
  strategyHash: string;
  sourceResearchJobId: string;
  sourceTrialIteration: number;
  sourceClusterId: string;
  symbol: string;
  timeframe: string;
  candidateId: string;
  readableName: string;
  displayAlias: string;
  /** Pattern/family id when known from research card. */
  strategyFamily?: string;
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  profitFactor: number | null;
  winRate?: number | null;
  sharpe?: number | null;
  patternStack?: string;
  confidence?: string;
  risk?: string;
  miniSeries?: number[] | null;
  score: number | null;
  costStatus: string;
  sampleConfidence: string;
  sampleConfidenceDetail: string;
  robustnessStatus: string;
  overfittingRisk: string;
  eligibilityStatus: string;
  recommendable: boolean;
  finalRecommendable: boolean;
  registrationState: ResearchResultCard["registrationState"];
  registeredStrategyId: string | null;
  rankReason: string;
  /** Operator-facing leverage summary from candidate params. */
  leverageLabel: string;
  /** Short why this row moved (NEW/UP/DOWN/KEEP). */
  movementReasonKo: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTop10FinalDiff {
  strategyHash: string;
  liveRank: number | null;
  finalRank: number | null;
  exclusionReasonKo: string | null;
}

export interface ResearchTop10Snapshot {
  version: typeof RESEARCH_TOP10_VERSION;
  jobId: string;
  scopeKey: string;
  createdAt: string;
  updatedAt: string;
  /** Live shortlist during Research (and retained after). */
  entries: ResearchTop10Entry[];
  previousEntries: ResearchTop10Entry[] | null;
  rankChanges: Array<{
    strategyHash: string;
    change: Top10RankChange;
    previousRank: number | null;
    currentRank: number | null;
    movementReasonKo: string;
  }>;
  /** Finalized Top-10 after terminal job (completion/cancel). */
  finalEntries?: ResearchTop10Entry[] | null;
  finalizedAt?: string | null;
  finalVsLive?: ResearchTop10FinalDiff[] | null;
  phase?: "live" | "final";
}

/** Short Korean labels for live UI rank movement. */
export function rankChangeLabelShort(change: Top10RankChange): string {
  switch (change) {
    case "신규 진입":
      return "신규";
    case "순위 상승":
      return "상승";
    case "순위 하락":
      return "하락";
    case "순위 유지":
      return "유지";
    case "TOP 10 제외":
      return "제외";
    default:
      return change;
  }
}

/**
 * Evidence-derived movement reason (Phase 10 labels).
 * Only returns a reason when metric/eligibility evidence supports it.
 */
export function movementReasonForChange(input: {
  change: Top10RankChange;
  previousRank: number | null;
  currentRank: number | null;
  previousEntry?: ResearchTop10Entry | null;
  currentEntry?: ResearchTop10Entry | null;
}): string {
  const { change, previousRank, currentRank, previousEntry, currentEntry } =
    input;
  const prev = previousEntry ?? null;
  const cur = currentEntry ?? null;

  if (change === "신규 진입") {
    return "더 강한 후보 진입";
  }
  if (change === "TOP 10 제외") {
    if (prev && prev.recommendable === false) return "적격성 상실";
    return "유사 전략 정리";
  }
  if (prev && cur) {
    const prevRet = prev.netReturn;
    const curRet = cur.netReturn;
    if (
      prevRet != null &&
      curRet != null &&
      Number.isFinite(prevRet) &&
      Number.isFinite(curRet) &&
      curRet > prevRet
    ) {
      return "수익 개선";
    }
    const prevMdd = prev.maxDrawdown;
    const curMdd = cur.maxDrawdown;
    if (
      prevMdd != null &&
      curMdd != null &&
      Number.isFinite(prevMdd) &&
      Number.isFinite(curMdd) &&
      Math.abs(curMdd) < Math.abs(prevMdd)
    ) {
      return "낙폭 개선";
    }
    const prevTrades = prev.tradeCount ?? 0;
    const curTrades = cur.tradeCount ?? 0;
    if (curTrades > prevTrades) return "표본 증가";
    if (
      cur.costStatus &&
      prev.costStatus &&
      cur.costStatus !== prev.costStatus &&
      (cur.costStatus.includes("통과") || cur.costStatus.includes("OK"))
    ) {
      return "비용 검증 통과";
    }
    if (
      cur.robustnessStatus &&
      prev.robustnessStatus &&
      cur.robustnessStatus !== prev.robustnessStatus &&
      (cur.robustnessStatus.includes("통과") ||
        cur.robustnessStatus.includes("안정"))
    ) {
      return "안정성 통과";
    }
  }

  switch (change) {
    case "순위 상승":
      return previousRank != null && currentRank != null
        ? `${previousRank}위 → ${currentRank}위 상승`
        : "순위 상승";
    case "순위 하락":
      return previousRank != null && currentRank != null
        ? `${previousRank}위 → ${currentRank}위 하락`
        : "순위 하락";
    case "순위 유지":
      return currentRank != null ? `${currentRank}위 유지` : "순위 유지";
    default:
      return change;
  }
}

export interface ResearchScopeKeyInput {
  symbol: string;
  timeframe: string;
  qualificationProfile?: string | null;
  depthProfile?: string | null;
  researchBasis?: string | null;
  stressEnabled?: boolean | null;
  jitterEnabled?: boolean | null;
  /** Pattern combination fingerprint — separates SafeV44 vs pattern stacks. */
  patternStackKey?: string | null;
}

export function buildResearchScopeKey(input: ResearchScopeKeyInput): string {
  return [
    input.symbol.trim().toUpperCase() || "BTCUSDT",
    input.timeframe.trim() || "15m",
    input.qualificationProfile ?? "balanced",
    input.depthProfile ?? "standard",
    input.researchBasis ?? "fresh",
    input.stressEnabled === false ? "nostress" : "stress",
    input.jitterEnabled === false ? "nojitter" : "jitter",
    input.patternStackKey?.trim() || "default",
  ].join("|");
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "strategy-search",
  );
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function top10Path(root: string, jobId: string): string {
  return path.join(root, "jobs", `${jobId}.top10.json`);
}

function historyPath(root: string, jobId: string): string {
  return path.join(root, "jobs", `${jobId}.top10.history.jsonl`);
}

function compositeScore(card: ResearchResultCard): number {
  const ret = card.netReturn ?? 0;
  const mdd = Math.abs(card.maxDrawdown ?? 1);
  const pf = card.profitFactor ?? 0;
  const trades = card.tradeCount ?? 0;
  return ret * 100 - mdd * 40 + pf * 5 + Math.min(trades, 50) * 0.1;
}

function identityKey(card: ResearchResultCard): string {
  return card.paramsHash;
}

function cardToEntry(
  card: ResearchResultCard,
  rank: number,
  roles: StrategyRoleBadge[],
  now: string,
): ResearchTop10Entry {
  return {
    rank,
    roleBadges: roles,
    strategyHash: card.paramsHash,
    sourceResearchJobId: card.sourceResearchJobId,
    sourceTrialIteration: card.iteration,
    sourceClusterId: card.clusterId,
    symbol: card.symbol,
    timeframe: card.timeframe,
    candidateId: card.candidateId,
    readableName: card.readableName,
    displayAlias: card.displayAlias,
    strategyFamily: card.strategyFamily,
    netReturn: card.netReturn,
    maxDrawdown: card.maxDrawdown,
    tradeCount: card.tradeCount,
    profitFactor: card.profitFactor,
    winRate: card.winRate,
    sharpe: card.sharpe,
    patternStack: card.patternStack,
    confidence: card.confidence,
    risk: card.risk,
    miniSeries: card.miniSeries ? card.miniSeries.slice(0, 30) : null,
    score: card.score,
    costStatus: card.costStatus,
    sampleConfidence: card.sampleConfidence,
    sampleConfidenceDetail: card.sampleConfidenceDetail,
    robustnessStatus: card.robustnessStatus,
    overfittingRisk: card.overfittingRisk,
    eligibilityStatus: card.eligibilityStatus,
    recommendable: card.recommendable,
    finalRecommendable: card.finalRecommendable,
    registrationState: card.registrationState,
    registeredStrategyId: card.registeredStrategyId,
    rankReason: card.recommendationReason,
    leverageLabel: card.leverageLabel ?? "—",
    movementReasonKo: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Select at most 10 unique identities:
 * - highest return (1)
 * - highest stability among recommendable (1)
 * - final recommendation (1)
 * - fill with composite score among recommendable, then remaining reps
 * Incomplete/non-recommendable can fill only if marked 추가 검증 필요 and slots remain.
 */
export function selectResearchTop10(
  representatives: ResearchResultCard[],
): ResearchResultCard[] {
  const recommendable = representatives.filter((c) => c.recommendable);
  const byReturn = [...representatives].sort(
    (a, b) => (b.netReturn ?? -Infinity) - (a.netReturn ?? -Infinity),
  );
  const byStability = [...recommendable].sort((a, b) => {
    const ma = Math.abs(a.maxDrawdown ?? 1);
    const mb = Math.abs(b.maxDrawdown ?? 1);
    if (ma !== mb) return ma - mb;
    return (b.profitFactor ?? 0) - (a.profitFactor ?? 0);
  });
  const byRecommend = [...recommendable].sort(
    (a, b) => compositeScore(b) - compositeScore(a),
  );

  const selected: ResearchResultCard[] = [];
  const seen = new Set<string>();
  const roleMap = new Map<string, StrategyRoleBadge[]>();

  const take = (card: ResearchResultCard | undefined, role?: StrategyRoleBadge) => {
    if (!card) return;
    const key = identityKey(card);
    if (role) {
      const roles = roleMap.get(key) ?? [];
      if (!roles.includes(role)) roles.push(role);
      roleMap.set(key, roles);
    }
    if (seen.has(key)) return;
    if (selected.length >= RESEARCH_TOP10_LIMIT) return;
    seen.add(key);
    selected.push({
      ...card,
      roles: roleMap.get(key) ?? card.roles,
    });
  };

  take(byReturn[0], "TOP 수익");
  take(byStability[0], "TOP 안정");
  take(byRecommend[0], "최종 추천");

  for (const c of byRecommend) {
    if (selected.length >= RESEARCH_TOP10_LIMIT) break;
    take(c, "백테스트 추천");
  }

  // Fill remaining with best available (may be 추가 검증 필요)
  const remainder = [...representatives].sort(
    (a, b) => compositeScore(b) - compositeScore(a),
  );
  for (const c of remainder) {
    if (selected.length >= RESEARCH_TOP10_LIMIT) break;
    take(c);
  }

  return selected.map((c, i) => ({
    ...c,
    roles: roleMap.get(identityKey(c)) ?? c.roles,
    recommendationReason:
      i === 0
        ? c.recommendationReason
        : `TOP ${i + 1} · ${c.recommendationReason}`,
  }));
}

function computeRankChanges(
  previous: ResearchTop10Entry[] | null,
  next: ResearchTop10Entry[],
): ResearchTop10Snapshot["rankChanges"] {
  const prevByHash = new Map<string, ResearchTop10Entry>();
  for (const e of previous ?? []) prevByHash.set(e.strategyHash, e);
  const nextByHash = new Map(next.map((e) => [e.strategyHash, e] as const));
  const nextHashes = new Set(next.map((e) => e.strategyHash));
  const changes: ResearchTop10Snapshot["rankChanges"] = [];

  const push = (
    strategyHash: string,
    change: Top10RankChange,
    previousRank: number | null,
    currentRank: number | null,
  ) => {
    changes.push({
      strategyHash,
      change,
      previousRank,
      currentRank,
      movementReasonKo: movementReasonForChange({
        change,
        previousRank,
        currentRank,
        previousEntry: prevByHash.get(strategyHash) ?? null,
        currentEntry: nextByHash.get(strategyHash) ?? null,
      }),
    });
  };

  for (const e of next) {
    const prev = prevByHash.get(e.strategyHash);
    if (prev == null) {
      push(e.strategyHash, "신규 진입", null, e.rank);
    } else if (prev.rank === e.rank) {
      push(e.strategyHash, "순위 유지", prev.rank, e.rank);
    } else if (prev.rank > e.rank) {
      push(e.strategyHash, "순위 상승", prev.rank, e.rank);
    } else {
      push(e.strategyHash, "순위 하락", prev.rank, e.rank);
    }
  }

  for (const e of previous ?? []) {
    if (!nextHashes.has(e.strategyHash)) {
      push(e.strategyHash, "TOP 10 제외", e.rank, null);
    }
  }
  return changes;
}

/**
 * Merge same-scope previous Top-10 with new representatives and keep best 10.
 * Registered strategies removed from Top-10 remain in the strategy library.
 */
export function mergeTop10AcrossScope(input: {
  previous: ResearchTop10Entry[] | null;
  incoming: ResearchResultCard[];
}): ResearchResultCard[] {
  const byHash = new Map<string, ResearchResultCard>();
  for (const card of input.incoming) {
    byHash.set(card.paramsHash, card);
  }
  // Rehydrate previous entries that are still competitive as synthetic cards
  for (const prev of input.previous ?? []) {
    if (byHash.has(prev.strategyHash)) continue;
    byHash.set(prev.strategyHash, {
      iteration: prev.sourceTrialIteration,
      candidateId: prev.candidateId,
      paramsHash: prev.strategyHash,
      readableName: prev.readableName,
      displayAlias: prev.displayAlias,
      strategyFamily: "ema_trend" as ResearchResultCard["strategyFamily"],
      symbol: prev.symbol,
      timeframe: prev.timeframe,
      sourceResearchJobId: prev.sourceResearchJobId,
      netReturn: prev.netReturn,
      maxDrawdown: prev.maxDrawdown,
      tradeCount: prev.tradeCount,
      profitFactor: prev.profitFactor,
      winRate: prev.winRate ?? null,
      sharpe: prev.sharpe ?? null,
      patternStack: prev.patternStack ?? prev.strategyFamily ?? "—",
      confidence: prev.confidence ?? prev.sampleConfidence,
      risk: prev.risk ?? prev.overfittingRisk,
      miniSeries: Array.isArray(prev.miniSeries)
        ? prev.miniSeries.slice(0, 30)
        : null,
      totalCost: null,
      costStatus: prev.costStatus as ResearchResultCard["costStatus"],
      sampleConfidence: prev.sampleConfidence as ResearchResultCard["sampleConfidence"],
      sampleConfidenceDetail: prev.sampleConfidenceDetail,
      score: prev.score,
      stressPassed: null,
      jitterPassed: null,
      robustnessStatus: prev.robustnessStatus,
      overfittingRisk: prev.overfittingRisk,
      eligibilityStatus: prev.eligibilityStatus,
      recommendable: prev.recommendable,
      finalRecommendable: prev.finalRecommendable,
      roles: [...prev.roleBadges],
      registrationState: prev.registrationState,
      registeredStrategyId: prev.registeredStrategyId,
      clusterId: prev.sourceClusterId,
      isRepresentative: true,
      memberCount: 1,
      strongestPoint: "이전 TOP 10 유지 후보",
      primaryWeakness: "현재 잡 재평가 대기",
      recommendationReason: prev.rankReason,
      leverageLabel: prev.leverageLabel ?? "—",
      whyNotRank1: "",
      vsPreviousRankNote:
        prev.rank != null ? `이전 TOP 10 ${prev.rank}위` : "",
    });
  }
  return selectResearchTop10([...byHash.values()]);
}

export function getResearchTop10(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ResearchTop10Snapshot | null {
  const root = resolveRoot(options);
  const fp = top10Path(root, jobId);
  if (!fs.existsSync(fp)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as ResearchTop10Snapshot;
    if (parsed?.version !== RESEARCH_TOP10_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveResearchTop10(
  snapshot: ResearchTop10Snapshot,
  options?: StrategySearchStoreOptions,
): ResearchTop10Snapshot {
  const root = resolveRoot(options);
  const jobsDir = path.join(root, "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const fp = top10Path(root, snapshot.jobId);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  fs.renameSync(tmp, fp);
  // Append history line (best-effort)
  try {
    fs.appendFileSync(
      historyPath(root, snapshot.jobId),
      `${JSON.stringify({
        at: snapshot.updatedAt,
        entries: snapshot.entries.map((e) => ({
          rank: e.rank,
          strategyHash: e.strategyHash,
        })),
        rankChanges: snapshot.rankChanges,
      })}\n`,
      "utf8",
    );
  } catch {
    /* non-fatal */
  }
  return snapshot;
}

/**
 * Find the newest Top-10 snapshot from another Research Job with the same
 * canonical scope. Used to refresh Top-10 across repeated Research runs.
 */
export function findLatestSameScopeTop10(
  scopeKey: string,
  excludeJobId: string,
  options?: StrategySearchStoreOptions,
): ResearchTop10Snapshot | null {
  const root = resolveRoot(options);
  const jobsDir = path.join(root, "jobs");
  if (!fs.existsSync(jobsDir)) return null;
  let best: ResearchTop10Snapshot | null = null;
  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".top10.json")) continue;
    const jobId = name.slice(0, -".top10.json".length);
    if (jobId === excludeJobId) continue;
    const snap = getResearchTop10(jobId, options);
    if (!snap || snap.scopeKey !== scopeKey) continue;
    if (!best || Date.parse(snap.updatedAt) > Date.parse(best.updatedAt)) {
      best = snap;
    }
  }
  return best;
}

export function buildAndPersistResearchTop10(input: {
  jobId: string;
  scopeKey: string;
  representatives: ResearchResultCard[];
  previousSameScope?: ResearchTop10Snapshot | null;
  options?: StrategySearchStoreOptions;
}): ResearchTop10Snapshot {
  const now = new Date().toISOString();
  const existing = getResearchTop10(input.jobId, input.options);
  // Job-local shortlist only. Never import another Research Job's Top-10 entries
  // into this jobId (same-scope peers may share market settings but different stacks).
  const selected = selectResearchTop10(input.representatives);
  const previousEntries =
    existing?.jobId === input.jobId && existing.scopeKey === input.scopeKey
      ? existing.entries
      : null;
  const peerForCompare =
    !previousEntries &&
    input.previousSameScope &&
    input.previousSameScope.scopeKey === input.scopeKey
      ? input.previousSameScope.entries
      : previousEntries;

  const entries = selected.map((card, idx) =>
    cardToEntry(card, idx + 1, card.roles, now),
  );
  const rankChanges = computeRankChanges(peerForCompare, entries);
  const changeByHash = new Map(
    rankChanges.map((c) => [c.strategyHash, c] as const),
  );
  const stamped = entries.map((e) => {
    const ch = changeByHash.get(e.strategyHash);
    return {
      ...e,
      movementReasonKo: ch?.movementReasonKo ?? "",
    };
  });
  const snapshot: ResearchTop10Snapshot = {
    version: RESEARCH_TOP10_VERSION,
    jobId: input.jobId,
    scopeKey: input.scopeKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    entries: stamped,
    previousEntries,
    rankChanges,
  };
  return saveResearchTop10(snapshot, input.options);
}

/**
 * Mark the current live Top-10 as the finalized shortlist for a terminal job.
 * Preserves live entries; writes finalEntries + finalVsLive diffs.
 */
export function finalizeResearchTop10(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ResearchTop10Snapshot | null {
  const existing = getResearchTop10(jobId, options);
  if (!existing) return null;
  const now = new Date().toISOString();
  const liveByHash = new Map(
    existing.entries.map((e) => [e.strategyHash, e.rank] as const),
  );
  const finalByHash = new Map(
    existing.entries.map((e) => [e.strategyHash, e.rank] as const),
  );
  const diffs: ResearchTop10FinalDiff[] = [];
  for (const e of existing.entries) {
    diffs.push({
      strategyHash: e.strategyHash,
      liveRank: liveByHash.get(e.strategyHash) ?? null,
      finalRank: finalByHash.get(e.strategyHash) ?? null,
      exclusionReasonKo: null,
    });
  }
  for (const prev of existing.previousEntries ?? []) {
    if (!finalByHash.has(prev.strategyHash)) {
      diffs.push({
        strategyHash: prev.strategyHash,
        liveRank: prev.rank,
        finalRank: null,
        exclusionReasonKo: "최종 자격·클러스터 대표에서 제외됨",
      });
    }
  }
  const next: ResearchTop10Snapshot = {
    ...existing,
    updatedAt: now,
    finalEntries: existing.entries.map((e) => ({ ...e, updatedAt: now })),
    finalizedAt: now,
    finalVsLive: diffs,
    phase: "final",
  };
  return saveResearchTop10(next, options);
}

export function listTop10History(
  jobId: string,
  options?: StrategySearchStoreOptions & { limit?: number },
): Array<Record<string, unknown>> {
  const root = resolveRoot(options);
  const fp = historyPath(root, jobId);
  if (!fs.existsSync(fp)) return [];
  const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
  const out: Array<Record<string, unknown>> = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    try {
      out.push(JSON.parse(lines[i]!) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }
  return out;
}
