"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ModeBadge } from "@/components/rextora/ModeBadge";
import { LifecycleNavigation } from "@/components/rextora/shell/LifecycleNavigation";
import {
  SHELL_NAVIGATION_GROUPS,
  SIDEBAR_NAV_ITEMS,
  V3_MORE_SHEET_NAV_IDS,
  V3_MOBILE_PRIMARY_NAV_IDS,
  V3_OPERATIONS_NAV_IDS,
  type ShellNavigationItem,
} from "@/components/rextora/shell/navigationModel";
import { AuthIdentity } from "@/components/rextora/auth/AuthIdentity";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import { isAdminConsoleNavVisible } from "@/src/lib/rextora/auth/adminUserPolicy";
import type { RextoraRole } from "@/src/lib/rextora/auth/authTypes";
import { OPERATOR_LABEL } from "@/src/lib/rextora/ui/operatorTerminology";

const sidebarNavigationGroups = SHELL_NAVIGATION_GROUPS;

function visibleShellNavItems(role: RextoraRole | null): ShellNavigationItem[] {
  return SIDEBAR_NAV_ITEMS.filter(
    (item) => item.id !== "admin-users" || isAdminConsoleNavVisible(role),
  );
}

const NAV_ICO: Record<string, string> = {
  dashboard: "운",
  "strategy-search": "탐",
  backtest: "백",
  "paper-trading": "모",
  "live-trading": "실",
  risk: "위",
  settings: "설",
  "admin-users": "회",
};

function sidebarNavTestId(href: string): string {
  return `nav-${href.slice(1).replace(/\//g, "-")}`;
}

function SidebarNavLink({
  item,
  pathname,
  variant,
  shortLabel,
}: {
  item: ShellNavigationItem;
  pathname: string;
  variant: "desktop" | "mobile" | "bottom";
  shortLabel?: string;
}) {
  const active = item.isActive(pathname);
  const label = shortLabel ?? item.label;

  if (variant === "desktop") {
    return (
      <Link
        href={item.href}
        title={item.label}
        data-testid={sidebarNavTestId(item.href)}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        className="rextora-sidebar-supporting-link v3-shell-nav-link v3-hover"
      >
        <span className="v3-shell-nav-ico" aria-hidden="true">
          {NAV_ICO[item.id] ?? item.label.slice(0, 1)}
        </span>
        <span className="v3-shell-nav-label">{item.label}</span>
      </Link>
    );
  }

  if (variant === "bottom") {
    return (
      <Link
        href={item.href}
        title={item.label}
        data-testid={`shell-bottom-nav-${item.id}`}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        className={`v3-shell-bottom-link${active ? " is-active" : ""}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.label}
      className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm ${
        active ? "bg-sky-600 text-white" : "text-slate-300"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const sidebarNavigationItems = visibleShellNavItems(role);
  const supportingNavItems = sidebarNavigationItems.filter((item) =>
    (V3_OPERATIONS_NAV_IDS as readonly string[]).includes(item.id),
  );
  const mobilePrimaryItems = V3_MOBILE_PRIMARY_NAV_IDS.map((id) =>
    sidebarNavigationItems.find((item) => item.id === id),
  ).filter((item): item is ShellNavigationItem => item != null);
  const moreSheetItems = V3_MORE_SHEET_NAV_IDS.map((id) =>
    sidebarNavigationItems.find((item) => item.id === id),
  ).filter((item): item is ShellNavigationItem => item != null);

  return (
    <>
      <aside className="rextora-desktop-sidebar v3-shell-sidebar sticky top-0 hidden h-screen min-[1180px]:flex">
        <header className="rextora-sidebar-identity rextora-sidebar-region v3-shell-brand">
          <Image
            className="rextora-brand-full-logo"
            src="/brand/rextora-logo-main-transparent.png"
            alt="Rextora"
            width={460}
            height={128}
            priority
            unoptimized
          />
          <Image
            className="rextora-brand-compact-icon"
            src="/brand/rextora-icon-main.png"
            alt="Rextora"
            width={114}
            height={114}
            priority
            unoptimized
          />
        </header>

        <section
          className="rextora-sidebar-mode rextora-sidebar-region v3-shell-mode-card"
          aria-label="현재 거래 모드"
        >
          <div className="rextora-sidebar-mode-row">
            <span className="rextora-sidebar-mode-label">
              {OPERATOR_LABEL.currentMode}
            </span>
            <ModeBadge />
          </div>
          <p className="rextora-sidebar-mode-note">
            실전 매매는 게이트·승인·위험 제한을 모두 통과한 뒤에만 실행됩니다.
          </p>
        </section>

        <div
          className="rextora-sidebar-nav"
          data-testid="main-nav"
          data-navigation-group={sidebarNavigationGroups[0]?.id}
        >
          <section
            className="rextora-sidebar-lifecycle"
            data-testid="sidebar-lifecycle-nav"
            aria-label="전략 검증"
          >
            <p className="rextora-sidebar-section-label rextora-sidebar-section-label--pipeline">
              전략 검증
            </p>
            <LifecycleNavigation variant="compact-sidebar" />
          </section>

          <section
            className="rextora-sidebar-supporting"
            data-testid="sidebar-supporting-nav"
            aria-label="운영"
          >
            <p className="rextora-sidebar-section-label">운영</p>
            <div className="rextora-sidebar-supporting-links">
              {supportingNavItems.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  variant="desktop"
                />
              ))}
            </div>
          </section>
        </div>

        <footer className="rextora-sidebar-footer v3-shell-account-wrap">
          <AuthIdentity />
        </footer>
      </aside>

      <div className="rextora-mobile-header v3-shell-compact-top sticky top-0 z-40 min-[1180px]:hidden">
        <div className="v3-shell-compact-top-row">
          <Link
            href="/dashboard"
            className="v3-shell-compact-brand flex min-h-11 items-center"
          >
            <Image
              src="/brand/rextora-icon-main.png"
              alt="Rextora"
              width={114}
              height={114}
              className="rextora-mobile-brand-icon"
              priority
              unoptimized
            />
          </Link>
          <ModeBadge />
          <details className="relative v3-shell-menu">
            <summary className="v3-shell-menu-summary flex min-h-11 cursor-pointer list-none items-center">
              메뉴
            </summary>
            <nav
              className="v3-shell-menu-panel absolute right-0 z-50 mt-2 grid w-56 gap-1 rounded-xl p-2 shadow-2xl"
              style={{ position: "absolute", right: 0 }}
              data-testid="mobile-nav"
              data-navigation-group={sidebarNavigationGroups[0]?.id}
            >
              {sidebarNavigationItems.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  variant="mobile"
                />
              ))}
              <div className="v3-shell-menu-identity">
                <AuthIdentity />
              </div>
            </nav>
          </details>
        </div>
      </div>

      <nav
        className="v3-shell-bottom-nav"
        aria-label="주요 이동"
        data-testid="shell-bottom-nav"
      >
        {mobilePrimaryItems.map((item) => (
          <SidebarNavLink
            key={item.href}
            item={item}
            pathname={pathname}
            variant="bottom"
            shortLabel={item.id === "strategy-search" ? "탐색" : item.label}
          />
        ))}
        <button
          type="button"
          className={`v3-shell-bottom-link${moreOpen ? " is-active" : ""}`}
          data-testid="shell-more-open"
          aria-expanded={moreOpen}
          aria-controls="shell-more-sheet"
          onClick={() => setMoreOpen((open) => !open)}
        >
          더보기
        </button>
      </nav>

      {moreOpen ? (
        <button
          type="button"
          className="v3-shell-more-backdrop"
          aria-label="더보기 닫기"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      <div
        id="shell-more-sheet"
        className="v3-shell-more-sheet"
        data-testid="shell-more-sheet"
        data-open={moreOpen ? "true" : "false"}
        hidden={!moreOpen}
      >
        <strong>운영</strong>
        {moreSheetItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            data-testid={`shell-more-${item.id}`}
            data-active={item.isActive(pathname) ? "true" : "false"}
            className="v3-shell-more-item"
            onClick={() => setMoreOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <div className="v3-shell-more-identity">
          <AuthIdentity />
        </div>
      </div>
    </>
  );
}
