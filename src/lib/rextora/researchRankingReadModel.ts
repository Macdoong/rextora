/**
 * Read-only ranking presentation helpers for Research API/UI consumers.
 * Does not compute scores, CHAMP-A, or evaluation identity.
 */

export const GROUP_SAFE = "safe_execution_price_v1" as const;
export const GROUP_PATTERN_CANONICAL =
  "event_sequence_execution_price_v1" as const;
export const GROUP_PATTERN = "event_sequence_ledger_v0" as const;
export const GROUP_UNKNOWN = "unknown_legacy" as const;

export type CompetitiveRankingGroupId =
  | typeof GROUP_SAFE
  | typeof GROUP_PATTERN_CANONICAL
  | typeof GROUP_PATTERN;

export type RankingCompatibilityGroupId =
  | CompetitiveRankingGroupId
  | typeof GROUP_UNKNOWN;

export type EvaluationProvenanceStatus =
  | "stamped"
  | "reconstructed"
  | "legacy_unclassified";

export interface RankingGroupCandidateRef {
  candidateId?: string;
  iteration: number;
  paramsHash: string;
  score: number | null;
  passed: boolean;
  researchEvaluationHash?: string | null;
  engineCostModel?: string | null;
  rankingCompatibilityGroup?: string | null;
  rankingEligible?: boolean;
  promotionEligible?: boolean;
  provenanceStatus?: EvaluationProvenanceStatus | null;
}

export interface ResearchRankingGroupView {
  rankingCompatibilityGroup: CompetitiveRankingGroupId;
  engineCostModel: CompetitiveRankingGroupId;
  rankingEligible: true;
  bestCandidate: RankingGroupCandidateRef | null;
  bestPassedCandidate: RankingGroupCandidateRef | null;
  topCandidates: RankingGroupCandidateRef[];
}

export interface ResearchUnknownLegacyView {
  rankingCompatibilityGroup: typeof GROUP_UNKNOWN;
  rankingEligible: false;
  promotionEligible: false;
  provenanceStatus: "legacy_unclassified";
  count: number;
}

export interface ResearchRankingAuthoritySource {
  rankingGroups?: Array<{
    rankingCompatibilityGroup?: string;
    engineCostModel?: string;
    rankingEligible?: boolean;
    bestCandidate?: RankingGroupCandidateRef | null;
    bestPassedCandidate?: RankingGroupCandidateRef | null;
    topCandidates?: RankingGroupCandidateRef[];
  } | null> | null;
  unknownLegacy?: ResearchUnknownLegacyView | null;
  bestScore?: number | null;
  bestCandidateHash?: string | null;
  bestPassedCandidateHash?: string | null;
}

export interface CostChannelProvenanceView {
  configuredEnabled: boolean;
  configuredRate: number;
  engineApplied: boolean;
  effectiveRate: number;
}

export interface ResearchCostProvenanceView {
  fee?: CostChannelProvenanceView | null;
  slippage?: CostChannelProvenanceView | null;
  funding?: CostChannelProvenanceView | null;
  spread?: CostChannelProvenanceView | null;
  costGuard?: {
    configuredK: number | null;
    engineApplied: boolean;
    effectiveK: number | null;
  } | null;
}

const COMPETITIVE = new Set<string>([
  GROUP_SAFE,
  GROUP_PATTERN_CANONICAL,
  GROUP_PATTERN,
]);

export const COMPETITIVE_GROUP_ORDER: CompetitiveRankingGroupId[] = [
  GROUP_SAFE,
  GROUP_PATTERN_CANONICAL,
  GROUP_PATTERN,
];

export function hasAuthoritativeRankingGroups(
  source: ResearchRankingAuthoritySource | null | undefined,
): boolean {
  const groups = source?.rankingGroups;
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.every(
    (group) =>
      group != null &&
      COMPETITIVE.has(String(group.rankingCompatibilityGroup)) &&
      group.rankingEligible === true,
  );
}

export function rankingGroupLabel(
  group: string | null | undefined,
): string {
  if (group === GROUP_SAFE) return "SAFE 전략";
  if (group === GROUP_PATTERN_CANONICAL) return "패턴 전략";
  if (group === GROUP_PATTERN) return "패턴 전략 · 기존 비용 모델";
  if (group === GROUP_UNKNOWN) return "기존 기록 · 평가 모델 미확인";
  return "기존 평가 형식";
}

export function rankingGroupTechnicalId(
  group: string | null | undefined,
): string {
  return group ?? "unknown";
}

export function truncateEvaluationHash(
  hash: string | null | undefined,
  visible = 12,
): string {
  if (!hash) return "없음";
  const trimmed = hash.trim();
  if (trimmed.length <= visible) return trimmed;
  return trimmed.slice(0, visible);
}

export function evaluationProvenanceLabel(
  status: EvaluationProvenanceStatus | null | undefined,
): string {
  if (status === "stamped") return "평가 증빙 완료";
  if (status === "reconstructed") return "기존 기록 · 증빙 복원";
  return "기존 기록 · 증빙 불충분";
}

export function resolveEvaluationProvenance(input: {
  rankingCompatibilityGroup?: string | null;
  researchEvaluationHash?: string | null;
  reconstructed?: boolean | null;
}): EvaluationProvenanceStatus {
  if (input.rankingCompatibilityGroup === GROUP_UNKNOWN) {
    return "legacy_unclassified";
  }
  if (input.reconstructed === true) return "reconstructed";
  if (
    typeof input.researchEvaluationHash === "string" &&
    input.researchEvaluationHash.length > 0
  ) {
    return "stamped";
  }
  if (
    input.rankingCompatibilityGroup === GROUP_SAFE ||
    input.rankingCompatibilityGroup === GROUP_PATTERN_CANONICAL ||
    input.rankingCompatibilityGroup === GROUP_PATTERN
  ) {
    return "reconstructed";
  }
  return "legacy_unclassified";
}

export function canonicalRecommendHash(
  group: Pick<ResearchRankingGroupView, "bestPassedCandidate"> | null | undefined,
): string | null {
  return group?.bestPassedCandidate?.paramsHash ?? null;
}

export function isCanonicalGroupRecommendation(
  group: Pick<ResearchRankingGroupView, "bestPassedCandidate"> | null | undefined,
  paramsHash: string | null | undefined,
): boolean {
  const champ = canonicalRecommendHash(group);
  return Boolean(champ && paramsHash && champ === paramsHash);
}

export function groupRecommendationLabel(
  group: Pick<ResearchRankingGroupView, "bestPassedCandidate"> | null | undefined,
): string {
  return group?.bestPassedCandidate ? "최종 추천" : "최종 추천 없음";
}

export function groupShortlistTitle(groupId: string | null | undefined): string {
  if (groupId === GROUP_SAFE) return "SAFE 숏리스트 · 표시용";
  if (groupId === GROUP_PATTERN_CANONICAL) return "패턴 숏리스트 · 표시용";
  if (groupId === GROUP_PATTERN) return "패턴 숏리스트 · 기존 비용 모델 · 표시용";
  return "숏리스트 · 표시용";
}

export function topCandidatesForGroup(
  groups: ResearchRankingAuthoritySource["rankingGroups"],
  groupId: CompetitiveRankingGroupId,
): RankingGroupCandidateRef[] {
  const group = (groups ?? []).find(
    (row) => row?.rankingCompatibilityGroup === groupId,
  );
  return [...(group?.topCandidates ?? [])].filter(
    (row) =>
      row.rankingCompatibilityGroup !== GROUP_UNKNOWN &&
      row.rankingCompatibilityGroup !== "unknown_legacy",
  );
}

export function groupLocalShortlistRanks(
  candidates: RankingGroupCandidateRef[],
): Array<{ rank: number; candidate: RankingGroupCandidateRef }> {
  return candidates.map((candidate, index) => ({
    rank: index + 1,
    candidate,
  }));
}

export function formatGroupAwareStatus(
  source: ResearchRankingAuthoritySource | null | undefined,
): string {
  if (!hasAuthoritativeRankingGroups(source)) return "기존 평가 형식";
  const labels: string[] = [];
  for (const group of source?.rankingGroups ?? []) {
    if (!group?.rankingCompatibilityGroup) continue;
    const title = rankingGroupLabel(group.rankingCompatibilityGroup);
    if (group.bestPassedCandidate) labels.push(`${title} 추천`);
  }
  if (labels.length > 0) return labels.join(" · ");
  return "2개 평가 그룹";
}

export function shouldTreatJobAsEmpty(
  source: ResearchRankingAuthoritySource | null | undefined,
): boolean {
  if (hasAuthoritativeRankingGroups(source)) return false;
  return false;
}

export function scalarBestIsAuthoritative(
  source: ResearchRankingAuthoritySource | null | undefined,
): boolean {
  return !hasAuthoritativeRankingGroups(source);
}

export function partitionByRankingGroup<T>(
  items: T[],
  groups:
    | Array<{
        rankingCompatibilityGroup: CompetitiveRankingGroupId;
        bestPassedCandidate?: { paramsHash: string } | null;
        bestCandidate?: { paramsHash: string } | null;
        topCandidates?: Array<{ paramsHash: string }>;
      }>
    | null
    | undefined,
  hashOf: (item: T) => string | null | undefined,
): {
  groupId: CompetitiveRankingGroupId;
  items: T[];
}[] {
  const buckets: Record<CompetitiveRankingGroupId, T[]> = {
    [GROUP_SAFE]: [],
    [GROUP_PATTERN_CANONICAL]: [],
    [GROUP_PATTERN]: [],
  };
  const hashes = (groupId: CompetitiveRankingGroupId) => {
    const group = (groups ?? []).find(
      (row) => row.rankingCompatibilityGroup === groupId,
    );
    return new Set(
      [
        group?.bestPassedCandidate?.paramsHash,
        group?.bestCandidate?.paramsHash,
        ...(group?.topCandidates ?? []).map((row) => row.paramsHash),
      ].filter((value): value is string => Boolean(value)),
    );
  };
  const hashSets: Record<CompetitiveRankingGroupId, Set<string>> = {
    [GROUP_SAFE]: hashes(GROUP_SAFE),
    [GROUP_PATTERN_CANONICAL]: hashes(GROUP_PATTERN_CANONICAL),
    [GROUP_PATTERN]: hashes(GROUP_PATTERN),
  };
  for (const item of items) {
    const hash = hashOf(item);
    if (!hash) continue;
    for (const groupId of COMPETITIVE_GROUP_ORDER) {
      if (hashSets[groupId].has(hash)) {
        buckets[groupId].push(item);
        break;
      }
    }
  }
  return COMPETITIVE_GROUP_ORDER.map((groupId) => ({
    groupId,
    items: buckets[groupId],
  }));
}

export function costChannelDisclosure(channel: CostChannelProvenanceView | null | undefined): {
  configured: boolean;
  applied: boolean;
  configuredRate: number | null;
  effectiveRate: number | null;
} {
  if (!channel) {
    return {
      configured: false,
      applied: false,
      configuredRate: null,
      effectiveRate: null,
    };
  }
  return {
    configured: channel.configuredEnabled === true,
    applied: channel.engineApplied === true && channel.effectiveRate !== 0,
    configuredRate: channel.configuredRate,
    effectiveRate: channel.engineApplied ? channel.effectiveRate : 0,
  };
}

export function promotionActionAvailable(input: {
  passed: boolean;
  rankingEligible?: boolean | null;
  promotionEligible?: boolean | null;
  rankingCompatibilityGroup?: string | null;
}): boolean {
  if (!input.passed) return false;
  if (input.rankingCompatibilityGroup === GROUP_UNKNOWN) return false;
  if (input.promotionEligible === false) return false;
  if (input.rankingEligible === false) return false;
  return true;
}

export function resolvePersistedRankingGroup(input: {
  rankingCompatibilityGroup?: string | null;
  engineCostModel?: string | null;
}): RankingCompatibilityGroupId {
  if (
    input.rankingCompatibilityGroup === GROUP_SAFE ||
    input.engineCostModel === GROUP_SAFE
  ) {
    return GROUP_SAFE;
  }
  if (
    input.rankingCompatibilityGroup === GROUP_PATTERN_CANONICAL ||
    input.engineCostModel === GROUP_PATTERN_CANONICAL
  ) {
    return GROUP_PATTERN_CANONICAL;
  }
  if (
    input.rankingCompatibilityGroup === GROUP_PATTERN ||
    input.engineCostModel === GROUP_PATTERN
  ) {
    return GROUP_PATTERN;
  }
  return GROUP_UNKNOWN;
}

export function groupHighlightTitle(
  groupId: CompetitiveRankingGroupId,
  kind: "highest_return" | "highest_stability",
): string {
  const scope =
    groupId === GROUP_SAFE
      ? "SAFE"
      : groupId === GROUP_PATTERN_CANONICAL
        ? "패턴"
        : "패턴 · 기존 비용 모델";
  return kind === "highest_return" ? `${scope} 최고 수익` : `${scope} 최고 안정`;
}

export interface GroupDecisionHighlightCandidate {
  paramsHash: string;
  netReturn?: number | null;
  maxDrawdown?: number | null;
  profitFactor?: number | null;
  recommendable?: boolean | null;
  rankingCompatibilityGroup?: string | null;
  engineCostModel?: string | null;
}

export interface GroupDecisionHighlight<T> {
  groupId: CompetitiveRankingGroupId;
  highestReturn: T | null;
  highestStability: T | null;
  highestReturnLabel: string;
  highestStabilityLabel: string;
}

function persistedGroupHashSet(
  groups: ResearchRankingAuthoritySource["rankingGroups"],
  groupId: CompetitiveRankingGroupId,
): Set<string> {
  const group = (groups ?? []).find(
    (row) => row?.rankingCompatibilityGroup === groupId,
  );
  return new Set(
    [
      group?.bestPassedCandidate?.paramsHash,
      group?.bestCandidate?.paramsHash,
      ...(group?.topCandidates ?? []).map((row) => row.paramsHash),
    ].filter((value): value is string => Boolean(value)),
  );
}

export function assignPersistedDisplayGroup<T extends GroupDecisionHighlightCandidate>(
  candidate: T,
  groups: ResearchRankingAuthoritySource["rankingGroups"],
): RankingCompatibilityGroupId {
  const fromFields = resolvePersistedRankingGroup(candidate);
  if (fromFields !== GROUP_UNKNOWN) return fromFields;
  if (persistedGroupHashSet(groups, GROUP_SAFE).has(candidate.paramsHash)) {
    return GROUP_SAFE;
  }
  if (persistedGroupHashSet(groups, GROUP_PATTERN_CANONICAL).has(candidate.paramsHash)) {
    return GROUP_PATTERN_CANONICAL;
  }
  if (persistedGroupHashSet(groups, GROUP_PATTERN).has(candidate.paramsHash)) {
    return GROUP_PATTERN;
  }
  return GROUP_UNKNOWN;
}

function pickHighestReturn<T extends GroupDecisionHighlightCandidate>(
  cards: T[],
): T | null {
  let best: T | null = null;
  for (const card of cards) {
    const ret = card.netReturn;
    if (ret == null || !Number.isFinite(ret)) continue;
    if (!best || ret > (best.netReturn ?? -Infinity)) best = card;
  }
  return best;
}

function pickHighestStability<T extends GroupDecisionHighlightCandidate>(
  cards: T[],
): T | null {
  const pool = cards.filter((card) => card.recommendable !== false);
  let best: T | null = null;
  for (const card of pool) {
    const mdd = Math.abs(card.maxDrawdown ?? 1);
    const pf = card.profitFactor ?? 0;
    if (!best) {
      best = card;
      continue;
    }
    const bestMdd = Math.abs(best.maxDrawdown ?? 1);
    if (mdd < bestMdd || (mdd === bestMdd && pf > (best.profitFactor ?? 0))) {
      best = card;
    }
  }
  return best;
}

export function groupDecisionHighlights<T extends GroupDecisionHighlightCandidate>(input: {
  source: ResearchRankingAuthoritySource | null | undefined;
  candidates: T[];
}): GroupDecisionHighlight<T>[] | null {
  if (!hasAuthoritativeRankingGroups(input.source)) return null;
  const groups = input.source?.rankingGroups;
  const byGroup: Record<CompetitiveRankingGroupId, T[]> = {
    [GROUP_SAFE]: [],
    [GROUP_PATTERN_CANONICAL]: [],
    [GROUP_PATTERN]: [],
  };
  const seen = new Set<string>();
  for (const card of input.candidates) {
    if (!card?.paramsHash || seen.has(card.paramsHash)) continue;
    seen.add(card.paramsHash);
    const groupId = assignPersistedDisplayGroup(card, groups);
    if (groupId !== GROUP_UNKNOWN) {
      byGroup[groupId].push(card);
    }
  }
  return COMPETITIVE_GROUP_ORDER.map((groupId) => ({
    groupId,
    highestReturn: pickHighestReturn(byGroup[groupId]),
    highestStability: pickHighestStability(byGroup[groupId]),
    highestReturnLabel: groupHighlightTitle(groupId, "highest_return"),
    highestStabilityLabel: groupHighlightTitle(groupId, "highest_stability"),
  }));
}

export interface RankSnapshotEntry {
  strategyHash: string;
  rank: number;
  rankingCompatibilityGroup?: string | null;
  engineCostModel?: string | null;
}

export interface GroupRankChangeRow {
  strategyHash: string;
  previousRank: number | null;
  currentRank: number | null;
  change: string;
}

export interface GroupRankHistory {
  available: boolean;
  reason: string;
  groups: Array<{
    groupId: CompetitiveRankingGroupId;
    changes: GroupRankChangeRow[];
  }>;
}

function rankChangeLabel(
  previousRank: number | null,
  currentRank: number | null,
): string {
  if (previousRank == null && currentRank != null) return "신규 진입";
  if (previousRank != null && currentRank == null) return "TOP 10 제외";
  if (previousRank != null && currentRank != null && currentRank < previousRank) {
    return "순위 상승";
  }
  if (previousRank != null && currentRank != null && currentRank > previousRank) {
    return "순위 하락";
  }
  return "순위 유지";
}

function groupLocalSnapshotRanks(
  entries: RankSnapshotEntry[],
  groupId: CompetitiveRankingGroupId,
): Map<string, number> | null {
  const assigned: RankSnapshotEntry[] = [];
  for (const entry of entries) {
    const persisted = resolvePersistedRankingGroup(entry);
    if (persisted === GROUP_UNKNOWN) continue;
    if (persisted === groupId) assigned.push(entry);
  }
  if (assigned.length === 0) return new Map();
  const ranks = [...new Set(assigned.map((row) => row.rank))].sort((a, b) => a - b);
  const groupLocal =
    ranks[0] === 1 && ranks.every((rank, index) => rank === index + 1);
  if (!groupLocal) return null;
  return new Map(assigned.map((row) => [row.strategyHash, row.rank]));
}

export const GROUP_RANK_HISTORY_UNAVAILABLE =
  "그룹 분리 이후 전체 순위 변화는 제공하지 않음";

function emptyGroupHistoryRows(): GroupRankHistory["groups"] {
  return COMPETITIVE_GROUP_ORDER.map((groupId) => ({
    groupId,
    changes: [],
  }));
}

function hasInsufficientGroupEvidence(entry: RankSnapshotEntry): boolean {
  return (
    entry.rankingCompatibilityGroup == null &&
    entry.engineCostModel == null
  );
}

export function groupScopedRankHistory(input: {
  snapshots?: RankSnapshotEntry[][] | null;
}): GroupRankHistory {
  const snapshots = input.snapshots ?? [];
  if (
    snapshots.some((snapshot) => snapshot.some(hasInsufficientGroupEvidence))
  ) {
    return {
      available: false,
      reason: GROUP_RANK_HISTORY_UNAVAILABLE,
      groups: emptyGroupHistoryRows(),
    };
  }
  if (snapshots.length < 2) {
    return {
      available: false,
      reason: GROUP_RANK_HISTORY_UNAVAILABLE,
      groups: emptyGroupHistoryRows(),
    };
  }
  const previous = snapshots[snapshots.length - 2] ?? [];
  const current = snapshots[snapshots.length - 1] ?? [];
  const groups: GroupRankHistory["groups"] = [];
  for (const groupId of COMPETITIVE_GROUP_ORDER) {
    const prevRanks = groupLocalSnapshotRanks(previous, groupId);
    const nextRanks = groupLocalSnapshotRanks(current, groupId);
    if (prevRanks == null || nextRanks == null) {
      return {
        available: false,
        reason: GROUP_RANK_HISTORY_UNAVAILABLE,
        groups: emptyGroupHistoryRows(),
      };
    }
    const hashes = new Set([...prevRanks.keys(), ...nextRanks.keys()]);
    const changes: GroupRankChangeRow[] = [];
    for (const strategyHash of hashes) {
      const previousRank = prevRanks.get(strategyHash) ?? null;
      const currentRank = nextRanks.get(strategyHash) ?? null;
      if (previousRank === currentRank) continue;
      changes.push({
        strategyHash,
        previousRank,
        currentRank,
        change: rankChangeLabel(previousRank, currentRank),
      });
    }
    groups.push({ groupId, changes });
  }
  return { available: true, reason: "group_local", groups };
}

export const RESEARCH_RANKING_UI_CONTRACT = {
  stackAt390: "grid gap-3 sm:grid-cols-2",
  hashWrap: "min-w-0 break-all",
  actionsWrap: "flex flex-wrap items-center gap-2",
  unknownBlock: "min-w-0 overflow-hidden",
  viewports: [390, 1024, 1440] as const,
} as const;
