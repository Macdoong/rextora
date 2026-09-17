/**
 * Shared shell navigation model — pure definitions for Sidebar and lifecycle nav.
 * No React, hooks, browser APIs, or services.
 */

import type { ShellLifecycleStage } from "./routeLifecycle";

export type ShellNavigationGroupId =
  | "dashboard"
  | "research"
  | "strategy"
  | "backtest"
  | "paper"
  | "live"
  | "risk"
  | "settings"
  | "admin";

export interface ShellNavigationItem {
  id: string;
  label: string;
  href: string;
  group: ShellNavigationGroupId;
  lifecycleStage?: ShellLifecycleStage;
  /** Korean pipeline label when surfaced in LifecycleNavigation. */
  lifecycleLabel?: string;
  /** Stable LifecycleNavigation test-id segment, e.g. "research". */
  lifecycleNavId?: string;
  isActive: (pathname: string) => boolean;
}

export interface ShellNavigationGroup {
  id: string;
  description: string;
  items: readonly ShellNavigationItem[];
}

export interface LifecycleNavigationItem {
  id: string;
  label: string;
  href: string;
  stage: ShellLifecycleStage;
  /**
   * Pipeline label is an alias. A dedicated sidebar destination owns the
   * selected visual chrome for this href.
   */
  destinationOwnedSeparately: boolean;
  /** Route-owned destination. Independent of lifecycle stage matching. */
  isDestination: (pathname: string) => boolean;
}

export function lifecycleDestinationOwnedSeparately(
  item: Pick<ShellNavigationItem, "label" | "lifecycleLabel">,
): boolean {
  return Boolean(item.lifecycleLabel && item.lifecycleLabel !== item.label);
}

export function lifecycleItemIsDestination(
  item: Pick<ShellNavigationItem, "isActive" | "label" | "lifecycleLabel">,
  pathname: string,
): boolean {
  if (lifecycleDestinationOwnedSeparately(item)) return false;
  return item.isActive(pathname);
}

/** Primary lifecycle navigation — seven items only. */
export const SHELL_NAVIGATION_GROUPS: readonly ShellNavigationGroup[] = [
  {
    id: "primary-lifecycle",
    description: "Primary lifecycle navigation — seven items only.",
    items: [
      {
        id: "dashboard",
        label: "운영센터",
        href: "/dashboard",
        group: "dashboard",
        lifecycleStage: "HOME",
        isActive: (pathname) =>
          pathname === "/dashboard" || pathname === "/",
      },
      {
        id: "strategy-search",
        label: "전략 탐색",
        href: "/strategy-search",
        group: "research",
        lifecycleStage: "RESEARCH",
        lifecycleLabel: "전략 탐색",
        lifecycleNavId: "research",
        isActive: (pathname) =>
          pathname.startsWith("/strategy-search") ||
          pathname.startsWith("/market-watch"),
      },
      {
        id: "results",
        label: "탐색 결과",
        href: "/results",
        group: "strategy",
        lifecycleStage: "STRATEGY",
        lifecycleLabel: "전략",
        lifecycleNavId: "strategy",
        isActive: (pathname) =>
          pathname === "/results" ||
          pathname.startsWith("/strategy-performance") ||
          pathname.startsWith("/ai-reports"),
      },
      {
        id: "backtest",
        label: "백테스트",
        href: "/backtest",
        group: "backtest",
        lifecycleStage: "BACKTEST",
        lifecycleLabel: "백테스트",
        lifecycleNavId: "backtest",
        isActive: (pathname) =>
          pathname === "/backtest" || pathname.startsWith("/backtest"),
      },
      {
        id: "paper-trading",
        label: "모의매매",
        href: "/paper-trading",
        group: "paper",
        lifecycleStage: "PAPER",
        lifecycleLabel: "모의매매",
        lifecycleNavId: "paper",
        isActive: (pathname) =>
          pathname.startsWith("/paper-trading") ||
          pathname.startsWith("/trades"),
      },
      {
        id: "live-trading",
        label: "실전 진입",
        href: "/live-trading",
        group: "live",
        lifecycleStage: "LIVE_GATE",
        lifecycleLabel: "실전 진입",
        lifecycleNavId: "live-gate",
        isActive: (pathname) =>
          pathname === "/live-trading" ||
          pathname.startsWith("/live-trading"),
      },
      {
        id: "risk",
        label: "위험 관리",
        href: "/risk",
        group: "risk",
        isActive: (pathname) =>
          pathname === "/risk" || pathname.startsWith("/risk"),
      },
      {
        id: "settings",
        label: "시스템 설정",
        href: "/settings",
        group: "settings",
        lifecycleStage: "SETTINGS",
        isActive: (pathname) =>
          pathname === "/settings" ||
          pathname.startsWith("/system-status") ||
          pathname.startsWith("/strategies"),
      },
      {
        id: "admin-users",
        label: "회원 관리",
        href: "/admin",
        group: "admin",
        isActive: (pathname) =>
          pathname === "/admin" || pathname.startsWith("/admin/"),
      },
    ],
  },
] as const;

export const SIDEBAR_NAV_ITEMS: readonly ShellNavigationItem[] =
  SHELL_NAVIGATION_GROUPS[0]?.items ?? [];

export const LIFECYCLE_NAVIGATION_ITEMS: readonly LifecycleNavigationItem[] =
  SIDEBAR_NAV_ITEMS.flatMap((item) => {
    if (
      !item.lifecycleNavId ||
      !item.lifecycleLabel ||
      !item.lifecycleStage
    ) {
      return [];
    }

    return [
      {
        id: item.lifecycleNavId,
        label: item.lifecycleLabel,
        href: item.href,
        stage: item.lifecycleStage,
        destinationOwnedSeparately: lifecycleDestinationOwnedSeparately(item),
        isDestination: (pathname) => lifecycleItemIsDestination(item, pathname),
      },
    ];
  });

export const V3_STRATEGY_NAV_IDS = [
  "strategy-search",
  "results",
  "backtest",
  "paper-trading",
  "live-trading",
] as const;

export const V3_OPERATIONS_NAV_IDS = [
  "dashboard",
  "risk",
  "settings",
  "admin-users",
] as const;

export const V3_MOBILE_PRIMARY_NAV_IDS = [
  "dashboard",
  "strategy-search",
  "backtest",
  "paper-trading",
] as const;

export const V3_MORE_SHEET_NAV_IDS = [
  "results",
  "risk",
  "live-trading",
  "settings",
  "admin-users",
] as const;

/** Visible destination label for the current route. Independent of lifecycle stage. */
export function shellPageLocationLabel(pathname: string): string | null {
  return SIDEBAR_NAV_ITEMS.find((item) => item.isActive(pathname))?.label ?? null;
}
