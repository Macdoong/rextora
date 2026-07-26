/**
 * Client-side filter / sort / pagination for Current Research explorer.
 * Operates on summary representatives already loaded from the API.
 */

import type { ResearchResultCardView } from "@/components/rextora/strategySearch/types";

export type ExplorerSortKey =
  | "score"
  | "return"
  | "mdd"
  | "trades"
  | "pf"
  | "stability"
  | "overfit"
  | "iteration";

export type ExplorerFilterId =
  | "all"
  | "top"
  | "backtest_rec"
  | "recommendable"
  | "final_recommendable"
  | "registered"
  | "unregistered"
  | "stability_pass"
  | "stability_fail"
  | "cost_ready"
  | "cost_pending"
  | "sample_ok"
  | "sample_low";

export const EXPLORER_PAGE_SIZES = [10, 20, 50] as const;
export type ExplorerPageSize = (typeof EXPLORER_PAGE_SIZES)[number];

export function cardScore(c: ResearchResultCardView): number {
  const r = c.netReturn ?? -1;
  const mdd = Math.abs(c.maxDrawdown ?? 1);
  const pf = c.profitFactor ?? 0;
  return (c.score ?? r * 2 - mdd + pf * 0.1) + (c.recommendable ? 0.1 : 0);
}

export function strategyRowKey(c: ResearchResultCardView): string {
  if (c.registeredStrategyId) return `id:${c.registeredStrategyId}`;
  return `trial:${c.sourceResearchJobId}:${c.paramsHash}:${c.iteration}`;
}

export function matchesExplorerSearch(
  card: ResearchResultCardView,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const alias = (card.displayAlias || card.readableName).toLowerCase();
  const family = String(card.strategyFamily ?? "").toLowerCase();
  const hash = card.paramsHash.toLowerCase();
  const shortHash = hash.slice(0, 12);
  const id = (card.registeredStrategyId ?? "").toLowerCase();
  return (
    alias.includes(q) ||
    card.readableName.toLowerCase().includes(q) ||
    family.includes(q) ||
    hash.includes(q) ||
    shortHash.includes(q) ||
    (id.length > 0 && id.includes(q))
  );
}

export function matchesExplorerFilter(
  card: ResearchResultCardView,
  filter: ExplorerFilterId,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "top":
      return card.roles.some(
        (r) => r === "TOP 수익" || r === "TOP 안정" || r === "최종 추천",
      );
    case "backtest_rec":
      return card.roles.includes("백테스트 추천");
    case "recommendable":
      return card.recommendable;
    case "final_recommendable":
      return card.finalRecommendable === true;
    case "registered":
      return (
        card.registrationState === "등록됨" || Boolean(card.registeredStrategyId)
      );
    case "unregistered":
      return (
        card.registrationState === "미등록" && !card.registeredStrategyId
      );
    case "stability_pass":
      return card.robustnessStatus === "거래 안정성 통과";
    case "stability_fail":
      return card.robustnessStatus === "거래 안정성 미통과";
    case "cost_ready":
      return (
        card.costStatus === "비용 계산 완료" ||
        card.costStatus === "비용 스트레스 통과"
      );
    case "cost_pending":
      return (
        card.costStatus === "비용 검증 대기" ||
        card.costStatus === "비용 데이터 없음" ||
        card.costStatus === "비용 계산 불가"
      );
    case "sample_ok":
      return card.sampleConfidence === "표본 충분";
    case "sample_low":
      return (
        card.sampleConfidence === "표본 부족" ||
        card.sampleConfidence === "표본 보통"
      );
    default:
      return true;
  }
}

export function sortExplorerCards(
  rows: ResearchResultCardView[],
  sortKey: ExplorerSortKey,
): ResearchResultCardView[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "return":
        return (b.netReturn ?? -Infinity) - (a.netReturn ?? -Infinity);
      case "mdd":
        return Math.abs(a.maxDrawdown ?? 1) - Math.abs(b.maxDrawdown ?? 1);
      case "trades":
        return (b.tradeCount ?? 0) - (a.tradeCount ?? 0);
      case "pf":
        return (b.profitFactor ?? 0) - (a.profitFactor ?? 0);
      case "stability":
        return Number(b.stressPassed === true) - Number(a.stressPassed === true);
      case "overfit":
        return Number(b.jitterPassed === true) - Number(a.jitterPassed === true);
      case "iteration":
        return b.iteration - a.iteration;
      default:
        return cardScore(b) - cardScore(a);
    }
  });
  return sorted;
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: ExplorerPageSize,
): {
  page: number;
  totalPages: number;
  total: number;
  startIndex: number;
  endIndex: number;
  pageRows: T[];
} {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = total === 0 ? 0 : Math.min(total, startIndex + pageSize);
  return {
    page: safePage,
    totalPages,
    total,
    startIndex,
    endIndex,
    pageRows: rows.slice(startIndex, endIndex),
  };
}

export function filterSortPaginate(
  representatives: ResearchResultCardView[],
  input: {
    search: string;
    filters: ExplorerFilterId[];
    sortKey: ExplorerSortKey;
    page: number;
    pageSize: ExplorerPageSize;
  },
) {
  let rows = representatives.filter((c) =>
    matchesExplorerSearch(c, input.search),
  );
  const active = input.filters.filter((f) => f !== "all");
  if (active.length > 0) {
    rows = rows.filter((c) => active.every((f) => matchesExplorerFilter(c, f)));
  }
  rows = sortExplorerCards(rows, input.sortKey);
  return paginateRows(rows, input.page, input.pageSize);
}
