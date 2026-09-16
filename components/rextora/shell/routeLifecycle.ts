/**
 * Static shell lifecycle routing map.
 * Maps pathname → lifecycle stage only — never infers completion or status.
 */

export type ShellLifecycleStage =
  | "HOME"
  | "RESEARCH"
  | "STRATEGY"
  | "BACKTEST"
  | "PAPER"
  | "LIVE_GATE"
  | "SETTINGS";

export interface RouteLifecycleDefinition {
  /** Canonical href for the mapped route or pattern. */
  href: string;
  /** Documentation pattern; dynamic segments use [param] notation. */
  pattern: string;
  stage: ShellLifecycleStage;
  match: (pathname: string) => boolean;
}

export interface RouteLifecycleResolution {
  pathname: string;
  href: string;
  pattern: string;
  stage: ShellLifecycleStage;
}

/** Ordered most-specific-first for deterministic pathname resolution. */
export const ROUTE_LIFECYCLE_DEFINITIONS: readonly RouteLifecycleDefinition[] = [
  {
    href: "/strategy-search/advanced",
    pattern: "/strategy-search/advanced",
    stage: "RESEARCH",
    match: (pathname) => pathname === "/strategy-search/advanced",
  },
  {
    href: "/strategy-search",
    pattern: "/strategy-search",
    stage: "RESEARCH",
    match: (pathname) => pathname === "/strategy-search",
  },
  {
    href: "/dashboard",
    pattern: "/dashboard",
    stage: "HOME",
    match: (pathname) => pathname === "/dashboard" || pathname === "/",
  },
  {
    href: "/results",
    pattern: "/results",
    stage: "STRATEGY",
    match: (pathname) => pathname === "/results",
  },
  {
    href: "/strategies/[id]",
    pattern: "/strategies/[id]",
    stage: "STRATEGY",
    match: (pathname) => /^\/strategies\/[^/]+$/.test(pathname),
  },
  {
    href: "/strategies",
    pattern: "/strategies",
    stage: "STRATEGY",
    match: (pathname) => pathname === "/strategies",
  },
  {
    href: "/backtest",
    pattern: "/backtest",
    stage: "BACKTEST",
    match: (pathname) => pathname === "/backtest",
  },
  {
    href: "/paper-trading",
    pattern: "/paper-trading",
    stage: "PAPER",
    match: (pathname) => pathname === "/paper-trading",
  },
  {
    href: "/live-trading",
    pattern: "/live-trading",
    stage: "LIVE_GATE",
    match: (pathname) => pathname === "/live-trading",
  },
  {
    href: "/risk",
    pattern: "/risk",
    stage: "LIVE_GATE",
    match: (pathname) => pathname === "/risk",
  },
  {
    href: "/settings",
    pattern: "/settings",
    stage: "SETTINGS",
    match: (pathname) => pathname === "/settings",
  },
] as const;

function normalizePathname(pathname: string): string {
  const raw = pathname.trim();
  if (!raw || raw === "/") return "/";
  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? raw;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function findRouteDefinition(
  pathname: string,
): RouteLifecycleDefinition | null {
  for (const definition of ROUTE_LIFECYCLE_DEFINITIONS) {
    if (definition.match(pathname)) {
      return definition;
    }
  }
  return null;
}

/** Resolve static lifecycle metadata for a pathname, or null when unmapped. */
export function resolveRouteLifecycle(
  pathname: string,
): RouteLifecycleResolution | null {
  const normalized = normalizePathname(pathname);
  const definition = findRouteDefinition(normalized);
  if (!definition) return null;

  return {
    pathname: normalized,
    href: definition.href,
    pattern: definition.pattern,
    stage: definition.stage,
  };
}

/** Return the shell lifecycle stage for a pathname, or null when unmapped. */
export function getLifecycleStageForRoute(
  pathname: string,
): ShellLifecycleStage | null {
  return resolveRouteLifecycle(pathname)?.stage ?? null;
}
