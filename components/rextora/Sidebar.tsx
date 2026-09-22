"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ModeBadge } from "@/components/rextora/ModeBadge";
import { LifecycleNavigation } from "@/components/rextora/shell/LifecycleNavigation";
import {
  SHELL_NAVIGATION_GROUPS,
  SIDEBAR_NAV_ITEMS,
  V3_MOBILE_PRIMARY_NAV_IDS,
  V3_OPERATIONS_NAV_IDS,
  V3_STRATEGY_NAV_IDS,
  type ShellNavigationItem,
} from "@/components/rextora/shell/navigationModel";
import { AuthIdentity } from "@/components/rextora/auth/AuthIdentity";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import { isAdminConsoleNavVisible } from "@/src/lib/rextora/auth/adminUserPolicy";
import type { RextoraRole } from "@/src/lib/rextora/auth/authTypes";
import { OPERATOR_LABEL } from "@/src/lib/rextora/ui/operatorTerminology";
import { NavIcon } from "@/components/rextora/shell/NavIcons";

const sidebarNavigationGroups = SHELL_NAVIGATION_GROUPS;

function visibleShellNavItems(role: RextoraRole | null): ShellNavigationItem[] {
  return SIDEBAR_NAV_ITEMS.filter(
    (item) => item.id !== "admin-users" || isAdminConsoleNavVisible(role),
  );
}

function sidebarNavTestId(href: string): string {
  return `nav-${href.slice(1).replace(/\//g, "-")}`;
}

function SidebarNavLink({
  item,
  pathname,
  variant,
  shortLabel,
  onNavigate,
}: {
  item: ShellNavigationItem;
  pathname: string;
  variant: "desktop" | "mobile" | "bottom";
  shortLabel?: string;
  onNavigate?: () => void;
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
        onClick={onNavigate}
      >
        <span className="v3-shell-nav-ico" aria-hidden="true">
          <NavIcon id={item.id} />
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
        <span className="v3-shell-bottom-ico" aria-hidden="true">
          <NavIcon id={item.id} size={16} />
        </span>
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.label}
      className="rextora-sidebar-supporting-link v3-shell-nav-link v3-hover"
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <span className="v3-shell-nav-ico" aria-hidden="true">
        <NavIcon id={item.id} />
      </span>
      <span className="v3-shell-nav-label">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarNavigationItems = visibleShellNavItems(role);
  const supportingNavItems = sidebarNavigationItems.filter((item) =>
    (V3_OPERATIONS_NAV_IDS as readonly string[]).includes(item.id),
  );
  const strategyNavItems = sidebarNavigationItems.filter((item) =>
    (V3_STRATEGY_NAV_IDS as readonly string[]).includes(item.id),
  );
  const mobilePrimaryItems = V3_MOBILE_PRIMARY_NAV_IDS.map((id) =>
    sidebarNavigationItems.find((item) => item.id === id),
  ).filter((item): item is ShellNavigationItem => item != null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
              src="/brand/rextora-mark-v3.png"
              alt="Rextora"
              width={119}
              height={105}
              className="rextora-mobile-brand-mark"
              priority
              unoptimized
            />
          </Link>
          <div className="v3-shell-compact-mode">
            <ModeBadge />
          </div>
        </div>
      </div>

      {menuOpen ? (
        <button
          type="button"
          className="v3-shell-menu-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        id="rextora-mobile-drawer"
        className="v3-shell-mobile-drawer"
        data-testid="mobile-nav"
        data-open={menuOpen ? "true" : "false"}
        data-navigation-group={sidebarNavigationGroups[0]?.id}
        hidden={!menuOpen}
      >
        <header className="v3-shell-mobile-drawer-brand">
          <Image
            src="/brand/rextora-logo-main-transparent.png"
            alt="Rextora"
            width={460}
            height={128}
            className="v3-shell-mobile-drawer-logo"
            unoptimized
          />
        </header>
        <section className="v3-shell-mode-card v3-shell-mobile-drawer-mode" aria-label="현재 거래 모드">
          <div className="rextora-sidebar-mode-row">
            <span className="rextora-sidebar-mode-label">{OPERATOR_LABEL.currentMode}</span>
            <ModeBadge />
          </div>
        </section>
        <div className="v3-shell-mobile-drawer-nav">
          <section aria-label="전략 검증">
            <p className="rextora-sidebar-section-label">전략 검증</p>
            <div className="rextora-sidebar-supporting-links">
              {strategyNavItems.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  variant="mobile"
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </div>
          </section>
          <section aria-label="운영">
            <p className="rextora-sidebar-section-label">운영</p>
            <div className="rextora-sidebar-supporting-links">
              {supportingNavItems.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  variant="mobile"
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </div>
          </section>
        </div>
        <footer className="v3-shell-mobile-drawer-footer">
          <AuthIdentity />
        </footer>
      </aside>

      <nav
        className="v3-shell-bottom-nav"
        aria-label="주요 이동"
        data-testid="shell-bottom-nav"
        data-drawer-open={menuOpen ? "true" : "false"}
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
          className={`v3-shell-bottom-link${menuOpen ? " is-active" : ""}`}
          data-testid="shell-full-menu-open"
          aria-label="전체 메뉴"
          aria-expanded={menuOpen}
          aria-controls="rextora-mobile-drawer"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="v3-shell-bottom-ico" aria-hidden="true">
            <NavIcon id="menu" size={16} />
          </span>
          전체 메뉴
        </button>
      </nav>
    </>
  );
}
