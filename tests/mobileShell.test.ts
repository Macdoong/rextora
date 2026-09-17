import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SIDEBAR_NAV_ITEMS,
  V3_OPERATIONS_NAV_IDS,
  V3_STRATEGY_NAV_IDS,
} from "../components/rextora/shell/navigationModel";

const root = process.cwd();

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("mobile shell branding and navigation", () => {
  it("keeps the desktop sidebar structure and canonical navigation model", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(sidebar).toContain("SHELL_NAVIGATION_GROUPS");
    expect(sidebar).toContain("SIDEBAR_NAV_ITEMS");
    expect(sidebar).toContain("LifecycleNavigation");
    expect(sidebar).toContain('variant="compact-sidebar"');
    expect(sidebar).toContain('data-testid="sidebar-lifecycle-nav"');
    expect(sidebar).toContain('data-testid="sidebar-supporting-nav"');
    expect(sidebar).toContain('data-testid="main-nav"');
    expect(sidebar).toContain("rextora-desktop-sidebar");
    expect(sidebar).toContain("/brand/rextora-logo-main-transparent.png");
    expect(sidebar).not.toContain('results: "결"');
    expect(V3_STRATEGY_NAV_IDS).toEqual([
      "strategy-search",
      "results",
      "backtest",
      "paper-trading",
      "live-trading",
    ]);
    expect(V3_OPERATIONS_NAV_IDS).toEqual([
      "dashboard",
      "risk",
      "settings",
      "admin-users",
    ]);
    expect(SIDEBAR_NAV_ITEMS.map((item) => item.id)).toContain("dashboard");
  });

  it("mobile drawer reuses the canonical nav model with grouped strategy and operations", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(sidebar).toContain('data-testid="mobile-nav"');
    expect(sidebar).toContain("v3-shell-mobile-drawer");
    expect(sidebar).toContain("V3_STRATEGY_NAV_IDS");
    expect(sidebar).toContain("V3_OPERATIONS_NAV_IDS");
    expect(sidebar).toContain("전략 검증");
    expect(sidebar).toContain("운영");
    expect(sidebar).toContain("AuthIdentity");
    expect(sidebar).toContain("isAdminConsoleNavVisible");
    expect(sidebar).toContain('data-active={active ? "true" : "false"}');
    expect(sidebar).toContain("메뉴");
    expect(sidebar).not.toContain("bg-sky-600 text-white");
  });

  it("mobile header uses the clean mark and does not use launcher icons", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(sidebar).toContain("/brand/rextora-mark-v3.png");
    expect(sidebar).toContain("rextora-mobile-brand-mark");
    expect(sidebar).not.toContain("/icons/icon-192");
    expect(sidebar).not.toContain("/icons/icon-512");
    expect(sidebar).not.toContain('src="/icon.png"');
  });

  it("preserves bottom nav fast access and blocks it while the drawer is open", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    const css = read("components/rextora/v3/shell.css");
    expect(sidebar).toContain('data-testid="shell-bottom-nav"');
    expect(sidebar).toContain("data-drawer-open");
    expect(css).toContain('.v3-shell-bottom-nav[data-drawer-open="true"]');
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("min(86vw, 360px)");
  });
});
