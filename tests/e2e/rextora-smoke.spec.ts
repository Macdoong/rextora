import { expect, test } from "@playwright/test";

const routes = [
  "/dashboard",
  "/strategy-search",
  "/results",
  "/backtest",
  "/paper-trading",
  "/live-trading",
  "/settings",
];

const navLabels = [
  "대시보드",
  "전략 탐색",
  "탐색 결과",
  "백테스트",
  "모의 매매",
  "실전 매매",
  "시스템 설정",
];

const removedNavLabels = [
  "고급 전략 편집",
  "전략 성과",
  "멀티코인 감시",
  "거래 기록",
  "AI 분석 보고",
  "리스크 관리",
  "시스템 상태",
  "전략 관리",
];

test.describe("Rextora lifecycle smoke", () => {
  for (const route of routes) {
    test(`renders ${route} with pre-live safety state`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText("Rextora").first()).toBeVisible();
      await expect(page.getByText("모의 거래").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    });
  }

  test("sidebar has exactly seven primary nav items", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByTestId("main-nav");
    for (const label of navLabels) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of removedNavLabels) {
      await expect(nav.getByText(label, { exact: true })).toHaveCount(0);
    }
  });

  test("dashboard shows lifecycle sections and primary actions", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("lifecycle-dashboard")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("dash-start-research")).toBeVisible();
    await expect(page.getByTestId("dash-open-results")).toBeVisible();
    await expect(page.getByTestId("dash-current-research")).toBeVisible();
    await expect(page.getByTestId("dash-live-summary")).toBeVisible();
  });

  test("research form keeps expert section collapsed by default", async ({ page }) => {
    await page.goto("/strategy-search");
    await expect(page.getByTestId("strategy-search-create")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("ss-market-mode")).toBeVisible();
    await expect(page.getByTestId("ss-duration")).toBeVisible();
    await expect(page.getByTestId("ss-max-search")).toBeAttached();
    await expect(page.getByTestId("ss-max-search")).not.toBeVisible();
    const advancedLink = page.getByTestId("ss-advanced-settings-link");
    await expect(advancedLink).toBeVisible();
    await expect(advancedLink).toHaveAttribute("href", "#ss-section-engine");
    const expert = page.locator('[data-testid="ss-section-expert"]');
    await expect(expert).toBeAttached();
    await expect(page.getByTestId("ss-min-winrate")).not.toBeVisible();
    await expect(page.getByTestId("ss-section-engine")).toBeAttached();
    await expect(page.getByTestId("ss-pattern-order_block")).toBeVisible();
    await expect(page.getByTestId("ss-pattern-toggle-order_block")).toBeEnabled();
    await expect(page.getByTestId("ss-pattern-toggle-fvg")).toBeEnabled();
    await expect(page.getByTestId("ss-pattern-toggle-trendline")).toBeEnabled();
    await expect(
      page.getByTestId("ss-pattern-toggle-support_resistance"),
    ).toBeEnabled();
  });

  test("results page shows SAFE baseline and highlights", async ({ page }) => {
    await page.goto("/results");
    await expect(page.getByTestId("results-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("results-safe-baseline")).toBeVisible();
    await expect(page.getByTestId("results-full-ranking")).toBeVisible();
    await expect(page.getByTestId("library-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("results research history management controls are visible", async ({
    page,
  }) => {
    await page.goto("/results");
    await expect(page.getByTestId("results-research-history")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("history-toggle").click();
    await expect(page.getByTestId("history-bulk-actions")).toBeVisible();
    await expect(page.getByTestId("history-view-default")).toBeVisible();
    await expect(page.getByTestId("history-view-archived")).toBeVisible();
    await expect(page.getByTestId("bulk-archive")).toBeVisible();
    await expect(page.getByTestId("bulk-delete")).toBeVisible();
    await expect(page.getByTestId("select-failed-jobs")).toBeVisible();
    await expect(page.getByTestId("select-cancelled-jobs")).toBeVisible();
    await expect(page.getByTestId("select-old-jobs")).toBeVisible();
  });

  test("live activation gates never auto-start live", async ({ page }) => {
    await page.goto("/live-trading");
    await expect(page.getByTestId("live-activation-gates")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("live-gate-blocked-notice")).toBeVisible();
  });

  test("settings includes system and expert sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("시스템 설정").first()).toBeVisible();
    await expect(page.getByTestId("lifecycle-settings-shell")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("settings-tab-btn-expert").click();
    await expect(page.getByTestId("settings-tab-expert")).toBeVisible();
    await page.getByTestId("settings-tab-btn-system").click();
    await expect(page.getByTestId("settings-tab-system")).toBeVisible();
    await page.getByTestId("settings-tab-btn-risk").click();
    await expect(page.getByTestId("settings-tab-risk")).toBeVisible();
  });

  test("expert wizard remains available via query gate", async ({ page }) => {
    await page.goto("/strategies?expert=1");
    await expect(page.getByTestId("expert-strategies-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("expert-strategy-builder-toggle")).toBeVisible();
  });

  test("legacy strategy-performance redirects to results", async ({ page }) => {
    await page.goto("/strategy-performance");
    await expect(page).toHaveURL(/\/results/);
  });

  test("backtest page still runs", async ({ page }) => {
    await page.goto("/backtest");
    await expect(page.getByTestId("backtest-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("backtest-review-workbench")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("paper feedback actions visible", async ({ page }) => {
    await page.goto("/paper-trading");
    await expect(page.getByTestId("paper-feedback-actions")).toBeVisible({
      timeout: 15_000,
    });
  });
});
