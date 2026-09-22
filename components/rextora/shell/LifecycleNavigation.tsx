"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLifecycleStageForRoute, type ShellLifecycleStage } from "./routeLifecycle";
import {
  LIFECYCLE_NAVIGATION_ITEMS,
  SIDEBAR_NAV_ITEMS,
  type LifecycleNavigationItem,
} from "./navigationModel";
import { NavIcon } from "./NavIcons";

export type { LifecycleNavigationItem };

export type LifecycleNavigationVariant = "default" | "compact-sidebar";

export interface LifecycleNavigationProps {
  /** Optional container className merged onto the variant base nav classes. */
  className?: string;
  /** Presentation variant; defaults to current GlobalShell inline layout. */
  variant?: LifecycleNavigationVariant;
}

const DEFAULT_NAV_CLASSNAME =
  "hidden min-[1101px]:flex min-[1101px]:flex-wrap min-[1101px]:items-center min-[1101px]:gap-2";

const DEFAULT_GROUP_CLASSNAME =
  "flex min-[1101px]:items-center min-[1101px]:gap-2";

const DEFAULT_SEPARATOR_CLASSNAME =
  "hidden text-slate-600 min-[1101px]:inline";

const DEFAULT_LINK_CLASSNAME =
  "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold transition";

const COMPACT_SIDEBAR_NAV_CLASSNAME = "flex flex-col gap-1";

const COMPACT_SIDEBAR_GROUP_CLASSNAME = "flex flex-col";

const COMPACT_SIDEBAR_LINK_CLASSNAME =
  "v3-hover flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-sm font-semibold transition";

function isActiveStage(
  currentStage: ShellLifecycleStage | null,
  itemStage: ShellLifecycleStage,
): boolean {
  return currentStage !== null && currentStage === itemStage;
}

function mergeClassName(base: string, override?: string): string {
  if (!override?.trim()) return base;
  return `${base} ${override.trim()}`;
}

function getPresentationClasses(variant: LifecycleNavigationVariant): {
  nav: string;
  group: string;
  separator: string | null;
  link: string;
} {
  if (variant === "compact-sidebar") {
    return {
      nav: COMPACT_SIDEBAR_NAV_CLASSNAME,
      group: COMPACT_SIDEBAR_GROUP_CLASSNAME,
      separator: null,
      link: COMPACT_SIDEBAR_LINK_CLASSNAME,
    };
  }

  return {
    nav: DEFAULT_NAV_CLASSNAME,
    group: DEFAULT_GROUP_CLASSNAME,
    separator: DEFAULT_SEPARATOR_CLASSNAME,
    link: DEFAULT_LINK_CLASSNAME,
  };
}

function linkStateClassName(active: boolean): string {
  return active
    ? "bg-sky-600/90 text-white"
    : "text-slate-300 hover:bg-slate-800/90 hover:text-white";
}

/**
 * Desktop lifecycle pipeline navigation.
 * Highlights the active stage from static route mapping only — no progress inference.
 */
export function LifecycleNavigation({
  className,
  variant = "default",
}: LifecycleNavigationProps = {}) {
  const pathname = usePathname() ?? "";
  const currentStage = getLifecycleStageForRoute(pathname);
  const presentation = getPresentationClasses(variant);

  return (
    <nav
      className={mergeClassName(presentation.nav, className)}
      aria-label="거래 파이프라인"
      data-testid="shell-lifecycle-navigation"
      {...(variant === "compact-sidebar"
        ? { "data-navigation-variant": variant }
        : {})}
    >
      {LIFECYCLE_NAVIGATION_ITEMS.map((item, index) => {
        const active = isActiveStage(currentStage, item.stage);
        const compact = variant === "compact-sidebar";
        const destinationOwner = compact
          ? SIDEBAR_NAV_ITEMS.find((nav) => nav.href === item.href)
          : undefined;
        const visibleLabel =
          compact && item.destinationOwnedSeparately
            ? destinationOwner?.label ?? item.label
            : item.label;
        const destinationSelected =
          compact && item.destinationOwnedSeparately
            ? Boolean(destinationOwner?.isActive(pathname))
            : item.isDestination(pathname);

        return (
          <div
            key={item.id}
            className={presentation.group}
            data-testid={`shell-lifecycle-nav-group-${item.id}`}
          >
            {index > 0 && presentation.separator ? (
              <span
                aria-hidden="true"
                className={presentation.separator}
                data-testid={`shell-lifecycle-nav-separator-${item.id}`}
              >
                /
              </span>
            ) : null}
            <Link
              href={item.href}
              title={visibleLabel}
              data-testid={`shell-lifecycle-nav-${item.id}`}
              data-active={active ? "true" : "false"}
              data-destination={destinationSelected ? "true" : "false"}
              aria-current={destinationSelected ? "page" : undefined}
              aria-label={visibleLabel}
              className={
                compact
                  ? presentation.link
                  : `${presentation.link} ${linkStateClassName(destinationSelected)}`
              }
            >
              {compact ? (
                <span className="v3-shell-nav-ico" aria-hidden="true">
                  <NavIcon id={item.id} />
                </span>
              ) : null}
              <span className="v3-shell-nav-label">{visibleLabel}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
