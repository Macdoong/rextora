import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recommendStrategyAction } from "../src/lib/rextora/results/recommendation";
import {
  buildOrderBlockLongSequence,
  validateEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";

import {
  LIFECYCLE_NAVIGATION_ITEMS,
  shellPageLocationLabel,
} from "../components/rextora/shell/navigationModel";
import { getLifecycleStageForRoute } from "../components/rextora/shell/routeLifecycle";
import { RETIRED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("lifecycle navigation", () => {
  it("shell navigation uses shared model with lifecycle-first desktop sidebar", () => {
    const navigationModel = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/shell/navigationModel.ts"),
      "utf8",
    );
    const sidebar = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/Sidebar.tsx"),
      "utf8",
    );
    const lifecycleNav = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/shell/LifecycleNavigation.tsx"),
      "utf8",
    );

    expect(navigationModel).toContain("SHELL_NAVIGATION_GROUPS");
    expect(navigationModel).toContain("SIDEBAR_NAV_ITEMS");
    expect(navigationModel).toContain("LIFECYCLE_NAVIGATION_ITEMS");

    const primaryLabels = [
      "운영센터",
      "전략 탐색",
      "탐색 결과",
      "백테스트",
      "모의매매",
      "실전 진입",
      "시스템 설정",
    ];
    for (const label of primaryLabels) {
      expect(navigationModel).toContain(`label: "${label}"`);
    }

    for (const href of [
      "/dashboard",
      "/strategy-search",
      "/results",
      "/backtest",
      "/paper-trading",
      "/live-trading",
      "/settings",
    ]) {
      expect(navigationModel).toContain(`href: "${href}"`);
    }

    for (const lifecycleNavId of [
      "research",
      "strategy",
      "backtest",
      "paper",
      "live-gate",
    ]) {
      expect(navigationModel).toContain(`lifecycleNavId: "${lifecycleNavId}"`);
    }

    expect(sidebar).toContain("navigationModel");
    expect(sidebar).toContain("SIDEBAR_NAV_ITEMS");
    expect(sidebar).toContain("LifecycleNavigation");
    expect(sidebar).toContain('variant="compact-sidebar"');
    expect(sidebar).toContain('data-testid="sidebar-lifecycle-nav"');
    expect(sidebar).toContain('data-testid="sidebar-supporting-nav"');
    expect(sidebar).toContain('data-testid="main-nav"');
    expect(sidebar).toContain('data-testid="mobile-nav"');
    expect(sidebar).not.toContain("v3-shell-results-entry");
    expect(sidebar).not.toContain('results: "결"');

    expect(lifecycleNav).toContain("LIFECYCLE_NAVIGATION_ITEMS");
    expect(lifecycleNav).toContain("SIDEBAR_NAV_ITEMS");
    expect(lifecycleNav).toContain("getLifecycleStageForRoute");
    expect(lifecycleNav).toContain('data-testid="shell-lifecycle-navigation"');
    expect(lifecycleNav).toContain("data-destination");
    expect(lifecycleNav).toContain("destinationOwnedSeparately");
    expect(lifecycleNav).toContain("visibleLabel");
    expect(lifecycleNav).toContain("isDestination");
    expect(lifecycleNav).not.toContain('pathname === "/results"');
    expect(lifecycleNav).not.toContain(
      "active && !item.destinationOwnedSeparately",
    );
    expect(navigationModel).toContain("lifecycleDestinationOwnedSeparately");
    expect(navigationModel).toContain("lifecycleItemIsDestination");
    expect(navigationModel).toContain("destinationOwnedSeparately");

    const byId = Object.fromEntries(
      LIFECYCLE_NAVIGATION_ITEMS.map((item) => [item.id, item]),
    );
    expect(byId.strategy?.destinationOwnedSeparately).toBe(true);
    expect(byId.strategy?.isDestination("/results")).toBe(false);
    expect(getLifecycleStageForRoute("/results")).toBe("STRATEGY");
    expect(byId.research?.isDestination("/strategy-search")).toBe(true);
    expect(byId.backtest?.isDestination("/backtest")).toBe(true);
    expect(byId.paper?.isDestination("/paper-trading")).toBe(true);
    expect(byId["live-gate"]?.isDestination("/live-trading")).toBe(true);
    expect(byId["live-gate"]?.isDestination("/risk")).toBe(false);
    expect(getLifecycleStageForRoute("/risk")).toBe("LIVE_GATE");
    expect(shellPageLocationLabel("/risk")).toBe("위험 관리");
    expect(shellPageLocationLabel("/live-trading")).toBe("실전 진입");
    expect(shellPageLocationLabel("/results")).toBe("탐색 결과");

    for (const removed of [
      "고급 전략 편집",
      "전략 성과",
      "멀티코인 감시",
      "거래 기록",
      "AI 분석 보고",
      "리스크 관리",
      "시스템 상태",
    ]) {
      expect(navigationModel).not.toContain(`label: "${removed}"`);
    }
  });

  it("default backtest page supports strategy+date Run without expert params", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "app/backtest/page.tsx"),
      "utf8",
    );
    expect(page).toContain("BacktestReviewWorkbench");
    expect(page).toContain('expert === "1"');
    const review = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(review).toContain("backtest-review-workbench");
    expect(review).toContain('data-testid="backtest-run"');
    expect(review).toContain('data-testid="backtest-from"');
    expect(review).toContain("모의매매 등록");
    expect(review).toContain("실전 후보 등록");
    expect(review).toContain("결과 다운로드");
    expect(review).not.toContain("초기 자본");
    expect(review).not.toContain("비용 스트레스");
    expect(review).not.toContain("안전 계수");
    expect(review).not.toContain("기본 진입 비중");
  });

  it("context bar uses page-supplied Paper context and does not fetch sessions", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/shell/ContextBar.tsx"),
      "utf8",
    );
    expect(src).toContain("OPERATOR_LABEL.selectedWork");
    expect(src).toContain("OPERATOR_LABEL.agentPaperSession");
    expect(src).toContain("paperOperatorShellContext");
    expect(src).toContain("useOperatorPageContext");
    expect(src).toContain("session.sessionHydrated && session.canResume");
    expect(src).toContain("no fetching, storage reads, or lifecycle inference");
    expect(src).toContain("shellPageLocationLabel");
    expect(src).toContain("pageLocationLabel");
    expect(src).toContain("shellStageLabel");
    expect(src).toContain('data-testid="shell-context-breadcrumb"');
    expect(src).not.toContain("getCurrentPaperSession");
    expect(src).not.toContain("getExecutablePaperSession");
    expect(src).toContain("OPERATOR_STATUS.noStrategy");
    expect(src).toContain("strategyChipLabel");
    expect(src).toContain("primarySymbolTimeframe?.trim()");
    expect(src).not.toMatch(/displayValue\(primaryStrategy\)/);
    expect(src).not.toMatch(/displayValue\(primarySymbolTimeframe\)/);
  });

  it("settings hash tabs exist and are applied from location.hash", () => {
    const shell = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/settings/LifecycleSettingsShell.tsx",
      ),
      "utf8",
    );
    expect(shell).toContain('id="risk"');
    expect(shell).toContain('id="system"');
    expect(shell).toContain("window.location.hash");
    expect(shell).toContain("hashchange");
    expect(shell).toContain("settings-live-gate-facts");
  });

  it("risk page is an operator surface, not a silent redirect", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/risk/page.tsx"),
      "utf8",
    );
    expect(src).toContain("risk-operator-page");
    expect(src).not.toContain('redirect("/settings#risk")');
  });

  it("legacy routes redirect to lifecycle pages", () => {
    const checks: Array<[string, string]> = [
      ["app/strategy-performance/page.tsx", "/results"],
      ["app/ai-reports/page.tsx", "/results"],
      ["app/market-watch/page.tsx", "/strategy-search"],
      ["app/trades/page.tsx", "/paper-trading"],
      ["app/system-status/page.tsx", "/settings#system"],
    ];
    for (const [file, target] of checks) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).toContain("redirect");
      expect(src).toContain(target);
    }
  });

  it("manual wizard is expert-gated", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/strategies/page.tsx"),
      "utf8",
    );
    expect(src).toContain('expert === "1"');
    expect(src).toContain('redirect("/strategy-search")');
  });
});

describe("results recommendation", () => {
  it("ranks paper/live correctly without a protected baseline", () => {
    expect(
      recommendStrategyAction({
        totalReturn: 1,
        mdd: -0.1,
        tradeCount: 50,
        passed: true,
        paperActive: false,
        liveActive: false,
        isSafe: true,
      }).code,
    ).toBe("paper_candidate");
    expect(
      recommendStrategyAction({
        totalReturn: 0.2,
        mdd: -0.1,
        tradeCount: 20,
        passed: true,
        paperActive: false,
        liveActive: false,
        isSafe: false,
      }).labelKo,
    ).toContain("모의매매");
  });
});

describe("event sequence schema", () => {
  it("validates ordered OB sequence and rejects invalid order", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 20,
    });
    expect(validateEventSequence(seq).ok).toBe(true);
    const bad = {
      ...seq,
      steps: [...seq.steps].reverse(),
    };
    expect(validateEventSequence(bad).ok).toBe(false);
  });
});

describe("SAFE hash fingerprint", () => {
  it("retired SAFE file is no longer a runtime dependency", () => {
    const file = path.join(
      process.cwd(),
      "data",
      "strategies",
      "SAFE_v44_i4060.json",
    );
    expect(fs.existsSync(file)).toBe(false);
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
  });
});
