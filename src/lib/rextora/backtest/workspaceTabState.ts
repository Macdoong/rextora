/**
 * Backtest workspace tab ownership — click selects, scroll never mutates.
 * Separates user-selected tab from any optional scroll highlight.
 */

export const BACKTEST_WORKSPACE_TABS = [
  "price",
  "trades",
  "monthly",
  "cost",
  "equity",
  "timeline",
  "advanced",
  "validation",
] as const;

export type BacktestWorkspaceTab = (typeof BACKTEST_WORKSPACE_TABS)[number];

export function isBacktestWorkspaceTab(value: string): value is BacktestWorkspaceTab {
  return (BACKTEST_WORKSPACE_TABS as readonly string[]).includes(value);
}

export interface WorkspaceTabState {
  /** User-selected exclusive workspace tab. Only click / explicit navigation may change this. */
  selectedTab: BacktestWorkspaceTab;
  /** Optional non-authoritative highlight — never used to swap content. */
  scrollHighlight: BacktestWorkspaceTab | null;
}

export function initialWorkspaceTabState(
  selected: string | null | undefined = "price",
): WorkspaceTabState {
  return {
    selectedTab: isBacktestWorkspaceTab(selected ?? "")
      ? (selected as BacktestWorkspaceTab)
      : "price",
    scrollHighlight: null,
  };
}

/** Click / programmatic select — authoritative. */
export function selectWorkspaceTab(
  state: WorkspaceTabState,
  tab: string,
): WorkspaceTabState {
  if (!isBacktestWorkspaceTab(tab)) return state;
  return { selectedTab: tab, scrollHighlight: null };
}

/**
 * Scroll observation may update highlight only.
 * It must NEVER change selectedTab (fixes 상세 분석 ↔ 검증 oscillation).
 */
export function highlightFromScroll(
  state: WorkspaceTabState,
  candidate: string | null,
): WorkspaceTabState {
  if (!candidate || !isBacktestWorkspaceTab(candidate)) {
    return { ...state, scrollHighlight: null };
  }
  if (state.scrollHighlight === candidate) return state;
  return { ...state, scrollHighlight: candidate };
}

/** Content visibility follows selectedTab only. */
export function isWorkspaceTabVisible(
  state: WorkspaceTabState,
  tab: string,
): boolean {
  return state.selectedTab === tab;
}
