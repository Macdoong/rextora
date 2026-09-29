import { formatRecommendationCustomerName } from "./completed/completedDisplayFormat";
import { formatTimeframeCustomerKo } from "./customerTimeframeKo";
import {
  generateDefaultSearchName,
  isSystemGeneratedSearchName,
} from "./formDefaults";

export type JobDisplayNameSource = {
  id: string;
  searchName?: string | null;
  symbols: readonly string[];
  timeframe: string;
};

function primarySymbol(job: JobDisplayNameSource): string {
  return job.symbols.map((s) => s.trim()).filter(Boolean)[0] ?? "BTCUSDT";
}

function looksLikeInternalSearchName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return true;
  const t = name.trim();
  if (/^template_search/i.test(t)) return true;
  if (t === "strategy_search_base") return true;
  if (/^VERIFY_/i.test(t)) return true;
  if (/^agent_draft/i.test(t)) return true;
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(t)) return true;
  return false;
}

export function composedJobMarketTitle(job: JobDisplayNameSource): string {
  const market = job.symbols.map((s) => s.trim()).filter(Boolean).join(", ");
  const tfKo = formatTimeframeCustomerKo(job.timeframe.trim());
  const parts = [market || null, tfKo !== "—" ? tfKo : null].filter(Boolean);
  if (parts.length === 0) return "";
  return parts.join(" · ");
}

function normalizeStoredSearchNameForDisplay(
  job: JobDisplayNameSource,
  name: string,
): string {
  const sym = primarySymbol(job);
  const tf = job.timeframe.trim() || "15m";
  const n = name.trim();
  if (n === `${sym} ${tf} 탐색` || n === generateDefaultSearchName(sym, tf)) {
    return generateDefaultSearchName(sym, tf);
  }
  return formatRecommendationCustomerName({
    readableName: n,
    symbol: sym,
    timeframe: tf,
  });
}

/**
 * Human-facing recent-search title from persisted list fields only.
 * Does not invent automatic/direct mode — that is not on the job summary.
 */
export function displayJobSearchTitle(job: JobDisplayNameSource): string {
  const name = job.searchName?.trim() ?? "";
  if (name && !looksLikeInternalSearchName(name)) {
    if (
      isSystemGeneratedSearchName(name, primarySymbol(job), job.timeframe)
    ) {
      return normalizeStoredSearchNameForDisplay(job, name);
    }
    return name;
  }
  const composed = composedJobMarketTitle(job);
  if (composed) return composed;
  if (name && looksLikeInternalSearchName(name)) {
    return "전략 탐색 작업";
  }
  return "전략 탐색 작업";
}

/** Compact “최근 작업” line: preserve user titles; add structured market metadata when needed. */
export function displayJobRecentWorkPresentation(job: JobDisplayNameSource): {
  primary: string;
  metadata: string | null;
} {
  const primary = displayJobSearchTitle(job);
  const stored = job.searchName?.trim() ?? "";
  const composed = composedJobMarketTitle(job);
  if (!composed) {
    return { primary, metadata: null };
  }
  const userAuthored =
    stored &&
    !looksLikeInternalSearchName(stored) &&
    !isSystemGeneratedSearchName(stored, primarySymbol(job), job.timeframe);
  if (userAuthored && stored === primary && primary !== composed) {
    return { primary, metadata: composed };
  }
  return { primary, metadata: null };
}

export function jobSearchNameTooltip(job: JobDisplayNameSource): string {
  const name = job.searchName?.trim() ?? "";
  if (name && looksLikeInternalSearchName(name)) return name;
  if (name && name !== displayJobSearchTitle(job)) return name;
  return job.id;
}
