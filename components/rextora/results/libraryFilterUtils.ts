import { descriptionHasLibraryArchive } from "@/src/lib/rextora/strategy/libraryArchive";
import { isDemoStrategyRecord } from "@/src/lib/rextora/firstRun/demoIdentity";

export type LibraryCategory =
  | "all"
  | "newest"
  | "current"
  | "recommended"
  | "review"
  | "backtested"
  | "paper"
  | "live"
  | "archive";

export type LibraryStrategyRow = {
  id: string;
  name?: string;
  paperActive?: boolean;
  liveActive?: boolean;
  liveEligible?: boolean;
  lastBacktest?: unknown | null;
  description?: string | null;
  archived?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  paramsHash?: string | null;
};

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  all: "전체",
  newest: "최신",
  current: "이번 탐색",
  recommended: "추천",
  review: "검토 대기",
  backtested: "백테스트 완료",
  paper: "모의매매",
  live: "실전 후보",
  archive: "보관",
};

export const LIBRARY_FILTER_BUTTONS: Array<{
  id: LibraryCategory;
  label: string;
}> = [
  { id: "newest", label: LIBRARY_CATEGORY_LABELS.newest },
  { id: "current", label: LIBRARY_CATEGORY_LABELS.current },
  { id: "recommended", label: LIBRARY_CATEGORY_LABELS.recommended },
  { id: "review", label: LIBRARY_CATEGORY_LABELS.review },
  { id: "backtested", label: LIBRARY_CATEGORY_LABELS.backtested },
  { id: "paper", label: LIBRARY_CATEGORY_LABELS.paper },
  { id: "live", label: LIBRARY_CATEGORY_LABELS.live },
  { id: "archive", label: LIBRARY_CATEGORY_LABELS.archive },
  { id: "all", label: LIBRARY_CATEGORY_LABELS.all },
];

export {
  applyLibraryArchiveTag,
  descriptionHasLibraryArchive,
} from "@/src/lib/rextora/strategy/libraryArchive";

function isExplicitlyArchived(
  s: Pick<LibraryStrategyRow, "archived" | "description">,
): boolean {
  if (s.archived === true) return true;
  return descriptionHasLibraryArchive(s.description);
}

export function isLibraryArchived(
  s: Pick<LibraryStrategyRow, "archived" | "description">,
): boolean {
  return isExplicitlyArchived(s);
}

export function parseLibraryProvenance(description: string | null | undefined): {
  sourceResearchJobId: string | null;
  searchFamily: string | null;
  pattern: string | null;
  leverage: string | null;
} {
  const desc = description ?? "";
  const pick = (key: string): string | null => {
    const m = desc.match(new RegExp(`${key}=([^\\s·]+)`));
    return m?.[1] ?? null;
  };
  return {
    sourceResearchJobId: pick("sourceResearchJobId"),
    searchFamily: pick("searchFamily"),
    pattern: pick("pattern"),
    leverage: pick("leverage"),
  };
}

export function libraryCategoryOf(s: LibraryStrategyRow): Exclude<
  LibraryCategory,
  "all" | "current" | "newest" | "recommended"
> {
  if (s.liveActive) return "live";
  if (s.paperActive) return "paper";
  if (isExplicitlyArchived(s)) return "archive";
  if (s.lastBacktest) return "backtested";
  return "review";
}

function isRecommendedRow(s: LibraryStrategyRow): boolean {
  if (isDemoStrategyRecord(s)) return false;
  if (isExplicitlyArchived(s)) return false;
  if (!s.lastBacktest || typeof s.lastBacktest !== "object") return false;
  const bt = s.lastBacktest as {
    totalReturn?: number;
    mdd?: number;
    tradeCount?: number;
    trades?: number;
    passed?: boolean;
  };
  const trades = bt.tradeCount ?? bt.trades ?? 0;
  const ret = bt.totalReturn;
  const mdd = bt.mdd;
  if (bt.passed === false) return false;
  if (typeof ret !== "number" || !Number.isFinite(ret) || ret <= 0) return false;
  if (typeof trades !== "number" || trades < 5) return false;
  if (typeof mdd === "number" && Number.isFinite(mdd) && Math.abs(mdd) > 0.4) {
    return false;
  }
  return true;
}

function createdAtMs(s: LibraryStrategyRow): number {
  const raw = s.createdAt ?? s.updatedAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function countLibraryCategories(
  strategies: LibraryStrategyRow[],
  opts?: {
    selectedJobId?: string | null;
    parseSourceResearchJobId?: (description: string | null | undefined) => string | null;
  },
): Record<LibraryCategory, number> {
  const counts: Record<LibraryCategory, number> = {
    all: strategies.length,
    newest: strategies.length,
    current: 0,
    recommended: strategies.filter(isRecommendedRow).length,
    review: 0,
    backtested: 0,
    paper: 0,
    live: 0,
    archive: 0,
  };

  for (const s of strategies) {
    const cat = libraryCategoryOf(s);
    counts[cat] += 1;
  }

  if (opts?.selectedJobId && opts.parseSourceResearchJobId) {
    counts.current = strategies.filter(
      (s) => opts.parseSourceResearchJobId!(s.description) === opts.selectedJobId,
    ).length;
  }

  return counts;
}

export function filterLibraryStrategies<T extends LibraryStrategyRow>(
  strategies: T[],
  category: LibraryCategory,
  opts?: {
    selectedJobId?: string | null;
    parseSourceResearchJobId?: (description: string | null | undefined) => string | null;
  },
): T[] {
  const library = strategies;

  if (category === "current") {
    if (!opts?.selectedJobId || !opts.parseSourceResearchJobId) return [];
    return library.filter(
      (s) =>
        opts.parseSourceResearchJobId!(s.description) === opts.selectedJobId,
    );
  }

  if (category === "recommended") {
    return library.filter(isRecommendedRow);
  }

  if (category === "live") {
    return library.filter(
      (s) => libraryCategoryOf(s) === "live" && !isDemoStrategyRecord(s),
    );
  }

  if (category === "newest" || category === "all") {
    return [...library].sort((a, b) => createdAtMs(b) - createdAtMs(a));
  }

  return library.filter((s) => libraryCategoryOf(s) === category);
}
