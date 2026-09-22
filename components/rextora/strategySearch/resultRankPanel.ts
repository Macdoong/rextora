/**
 * Presentation-only default for the completed Strategy Search result tabs.
 * Does not rank, score, or persist.
 */

export type StrategySearchResultRankPanel = "top10" | "groups" | "completion";

export function resolveDefaultResultRankPanel(input: {
  status: string | null | undefined;
  groupAware: boolean;
  hasVisibleLiveTop10: boolean;
}): StrategySearchResultRankPanel {
  if (input.groupAware) return "groups";
  if (input.hasVisibleLiveTop10) return "top10";
  return "top10";
}

/** Invalid Live TOP10 selection on a group-aware job → 순위 그룹. */
export function normalizeResultRankPanel(input: {
  current: StrategySearchResultRankPanel;
  groupAware: boolean;
}): StrategySearchResultRankPanel {
  if (input.groupAware && input.current === "top10") return "groups";
  return input.current;
}
