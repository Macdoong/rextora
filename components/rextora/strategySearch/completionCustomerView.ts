/**
 * Presentation helpers for the completed-result customer surface.
 * Does not change ranking, scoring, qualification, or promotion rules.
 */

/**
 * Isolated diagnostics stay in source but never render on the normal
 * Strategy Search customer workbench — including localhost development QA.
 */
export function isStrategySearchDeveloperDiagnosticsVisible(): boolean {
  return false;
}

/** Customer hero copy for completed jobs (presentation only). */
export function completionReasonHeroMessageKo(
  reason: string | null | undefined,
): string | null {
  switch (reason) {
    case "QUALIFIED_TARGET_REACHED":
      return "목표 조건을 만족하는 후보를 찾았습니다.";
    case "DEADLINE_REACHED":
    case "MAX_RUNTIME":
      return "최대 탐색 시간에 도달해 현재까지의 결과를 정리했습니다.";
    case "SEARCH_SPACE_EXHAUSTED":
      return "탐색 범위를 모두 확인했습니다.";
    case "MAX_CANDIDATE_BUDGET":
    case "MAX_ITERATIONS":
    case "HARD_SAFETY_LIMIT":
    case "RESOURCE_SAFETY_LIMIT":
      return "안전 한도에 도달해 탐색을 마쳤습니다.";
    case "USER_CANCELLED":
    case "USER_STOPPED":
      return "탐색이 중지되었습니다. 지금까지의 결과를 확인할 수 있습니다.";
    default:
      return null;
  }
}

export function advancedDisclosureControl(open: boolean): {
  copy: "펼치기" | "접기";
  chevron: "down" | "up";
  chevronGlyph: "▼" | "▲";
} {
  return open
    ? { copy: "접기", chevron: "up", chevronGlyph: "▲" }
    : { copy: "펼치기", chevron: "down", chevronGlyph: "▼" };
}

export function resolveAuthoritativeQualifiedCount(input: {
  summaryQualified?: number | null;
  jobQualifiedCount?: number | null;
  trialPageCount?: number | null;
}): number {
  if (
    input.summaryQualified != null &&
    Number.isFinite(input.summaryQualified)
  ) {
    return input.summaryQualified;
  }
  if (
    input.jobQualifiedCount != null &&
    Number.isFinite(input.jobQualifiedCount)
  ) {
    return input.jobQualifiedCount;
  }
  return input.trialPageCount ?? 0;
}

export function resultsReviewAvailable(input: {
  usable: boolean;
  usableForHandoff: boolean;
}): boolean {
  return input.usable || input.usableForHandoff;
}

export const RESULTS_REVIEW_LABEL = "이 탐색 결과";
export const RESULTS_REVIEW_GUIDANCE = "검토 후 다음 단계를 직접 선택합니다.";
export const NEXT_STEPS_HEADING = "다음 단계";
export const RECOMMENDED_REGISTER_LABEL = "추천 후보 등록";
export const QUALIFIED_REGISTER_LABEL = "통과 후보 등록";

export function canShowRecommendedRegister(input: {
  recommendable?: number | null;
  finalEligible?: number | null;
  hasPromoteHandler: boolean;
}): boolean {
  if (!input.hasPromoteHandler) return false;
  return (input.recommendable ?? 0) > 0 || (input.finalEligible ?? 0) > 0;
}

export function canShowQualifiedRegister(input: {
  qualifiedCount: number;
  hasRegisterHandler: boolean;
}): boolean {
  return input.hasRegisterHandler && input.qualifiedCount > 0;
}

export type CompletedPrimaryAction =
  | "register_recommended"
  | "register_qualified"
  | "backtest"
  | "review_results"
  | "new_search";

export function resolveCompletedPrimaryAction(input: {
  showRecommendedRegister: boolean;
  showQualifiedRegister: boolean;
  backtestAvailable: boolean;
  reviewAvailable: boolean;
}): CompletedPrimaryAction {
  if (input.showRecommendedRegister) return "register_recommended";
  if (input.showQualifiedRegister) return "register_qualified";
  if (input.backtestAvailable) return "backtest";
  if (input.reviewAvailable) return "review_results";
  return "new_search";
}

export function completedActionClass(
  action: CompletedPrimaryAction,
  primary: CompletedPrimaryAction,
): "ss-btn-primary" | "ss-btn-secondary" | "ss-btn-tertiary" {
  if (action === primary) return "ss-btn-primary";
  if (action === "new_search") return "ss-btn-tertiary";
  return "ss-btn-secondary";
}

type HandoffBestRef = {
  iteration: number;
  paramsHash: string;
  passed: boolean;
};

type HandoffResultCard = {
  iteration: number;
  paramsHash: string;
  recommendable?: boolean;
  finalRecommendable?: boolean;
  registeredStrategyId: string | null;
  registrationState?: string;
  symbol?: string;
  timeframe?: string;
  clusterId?: string | null;
};

export type CompletedBacktestHandoffCandidate = {
  iteration: number;
  paramsHash: string;
  registeredStrategyId: string | null;
  alreadyRegistered: boolean;
  symbol: string;
  timeframe: string;
  clusterId: string | null;
  source: "bestPassedCandidate" | "topRecommend" | "backtestRecommendation";
};

function isPassedRecommendation(
  ref: HandoffBestRef | null | undefined,
): ref is HandoffBestRef {
  return Boolean(ref && ref.passed === true && Number.isInteger(ref.iteration));
}

function findHandoffCard(
  cards: Array<HandoffResultCard | null | undefined>,
  iteration: number,
  paramsHash: string,
): HandoffResultCard | null {
  return (
    cards.find(
      (card) =>
        card != null &&
        (card.iteration === iteration || card.paramsHash === paramsHash),
    ) ?? null
  );
}

function cardAlreadyRegistered(card: HandoffResultCard | null): boolean {
  if (!card) return false;
  if (card.registeredStrategyId && card.registeredStrategyId.trim()) return true;
  return card.registrationState === "등록됨" || card.registrationState === "중복";
}

/**
 * Legal completed-result Backtest handoff candidate.
 * Uses existing recommendation contracts only — never raw failed bestCandidate.
 */
export function resolveCompletedBacktestHandoffCandidate(input: {
  rankingGroups?: Array<{
    bestPassedCandidate?: HandoffBestRef | null;
    bestCandidate?: HandoffBestRef | null;
  }> | null;
  topRecommend?: HandoffResultCard | null;
  backtestRecommendations?: HandoffResultCard[] | null;
  representatives?: HandoffResultCard[] | null;
  symbol?: string | null;
  timeframe?: string | null;
} | null): CompletedBacktestHandoffCandidate | null {
  if (!input) return null;
  const cards: Array<HandoffResultCard | null | undefined> = [
    input.topRecommend,
    ...(input.backtestRecommendations ?? []),
    ...(input.representatives ?? []),
  ];
  const fallbackSymbol = input.symbol?.trim() || "";
  const fallbackTimeframe = input.timeframe?.trim() || "";

  const toCandidate = (
    ref: HandoffBestRef,
    card: HandoffResultCard | null,
    source: CompletedBacktestHandoffCandidate["source"],
  ): CompletedBacktestHandoffCandidate => {
    const registeredStrategyId =
      card?.registeredStrategyId && card.registeredStrategyId.trim()
        ? card.registeredStrategyId.trim()
        : null;
    return {
      iteration: ref.iteration,
      paramsHash: ref.paramsHash,
      registeredStrategyId,
      alreadyRegistered: Boolean(registeredStrategyId) || cardAlreadyRegistered(card),
      symbol: card?.symbol?.trim() || fallbackSymbol,
      timeframe: card?.timeframe?.trim() || fallbackTimeframe,
      clusterId: card?.clusterId?.trim() ? card.clusterId.trim() : null,
      source,
    };
  };

  for (const group of input.rankingGroups ?? []) {
    const passed = group.bestPassedCandidate;
    if (!isPassedRecommendation(passed)) continue;
    const card = findHandoffCard(cards, passed.iteration, passed.paramsHash);
    return toCandidate(passed, card, "bestPassedCandidate");
  }

  const top = input.topRecommend;
  if (
    top &&
    Number.isInteger(top.iteration) &&
    (top.recommendable === true || top.finalRecommendable === true)
  ) {
    return toCandidate(
      {
        iteration: top.iteration,
        paramsHash: top.paramsHash,
        passed: true,
      },
      top,
      "topRecommend",
    );
  }

  const rec = (input.backtestRecommendations ?? []).find(
    (card) =>
      card != null &&
      Number.isInteger(card.iteration) &&
      (card.recommendable !== false || card.finalRecommendable === true),
  );
  if (rec) {
    return toCandidate(
      {
        iteration: rec.iteration,
        paramsHash: rec.paramsHash,
        passed: true,
      },
      rec,
      "backtestRecommendation",
    );
  }

  return null;
}

export function buildCompletedBacktestHref(input: {
  strategyId: string;
  strategyHash?: string | null;
  sourceParamsHash?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  sourceResearchJobId: string;
  sourceTrialIteration: number | string;
  sourceClusterId?: string | null;
}): string | null {
  const strategyId = input.strategyId.trim();
  if (!strategyId) return null;
  const qs = new URLSearchParams({ strategyId });
  if (input.strategyHash?.trim()) qs.set("strategyHash", input.strategyHash.trim());
  if (input.sourceParamsHash?.trim()) {
    qs.set("sourceParamsHash", input.sourceParamsHash.trim());
  }
  if (input.symbol?.trim()) qs.set("symbol", input.symbol.trim());
  if (input.timeframe?.trim()) qs.set("timeframe", input.timeframe.trim());
  if (input.sourceResearchJobId.trim()) {
    qs.set("sourceResearchJobId", input.sourceResearchJobId.trim());
  }
  qs.set("sourceTrialIteration", String(input.sourceTrialIteration));
  if (input.sourceClusterId?.trim()) {
    qs.set("sourceClusterId", input.sourceClusterId.trim());
  }
  return `/backtest?${qs.toString()}`;
}

export function isValidCompletedBacktestHref(href: string | null | undefined): boolean {
  if (!href || typeof href !== "string") return false;
  try {
    const url = new URL(href, "https://rextora.local");
    if (url.pathname !== "/backtest") return false;
    const strategyId = url.searchParams.get("strategyId");
    return Boolean(strategyId && strategyId.trim());
  } catch {
    return false;
  }
}
