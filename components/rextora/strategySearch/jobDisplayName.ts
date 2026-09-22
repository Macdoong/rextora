export type JobDisplayNameSource = {
  id: string;
  searchName?: string | null;
  symbols: readonly string[];
  timeframe: string;
};

function looksLikeInternalSearchName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return true;
  const t = name.trim();
  if (/^template_search/i.test(t)) return true;
  if (t === "strategy_search_base") return true;
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(t)) return true;
  return false;
}

export function composedJobMarketTitle(job: JobDisplayNameSource): string {
  const market = job.symbols.map((s) => s.trim()).filter(Boolean).join(", ");
  const tf = job.timeframe.trim();
  return [market || null, tf || null].filter(Boolean).join(" · ");
}

/**
 * Human-facing recent-search title from persisted list fields only.
 * Does not invent automatic/direct mode — that is not on the job summary.
 */
export function displayJobSearchTitle(job: JobDisplayNameSource): string {
  const name = job.searchName?.trim() ?? "";
  if (name && !looksLikeInternalSearchName(name)) {
    return name;
  }
  return composedJobMarketTitle(job) || name || job.id;
}

export function jobSearchNameTooltip(job: JobDisplayNameSource): string {
  const name = job.searchName?.trim() ?? "";
  if (name && looksLikeInternalSearchName(name)) return name;
  if (name && name !== displayJobSearchTitle(job)) return name;
  return job.id;
}
