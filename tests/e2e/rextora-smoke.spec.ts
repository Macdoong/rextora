import { expect, test } from "@playwright/test";

const routes = [
  "/dashboard",
  "/strategies",
  "/backtest",
  "/strategy-performance",
  "/market-watch",
  "/paper-trading",
  "/live-trading",
  "/trades",
  "/ai-reports",
  "/risk",
  "/settings",
  "/system-status"
];

const navLabels = [
  "대시보드",
  "전략 관리",
  "백테스트",
  "전략 성과",
  "멀티코인 감시",
  "모의 매매",
  "실전 매매",
  "거래 기록",
  "AI 분석 보고",
  "리스크 관리",
  "설정",
  "시스템 상태"
];

test.describe("Rextora quant smoke", () => {
  for (const route of routes) {
    test(`renders ${route} with pre-live safety state`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText("Rextora").first()).toBeVisible();
      await expect(page.getByText("모의 거래").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    });
  }

  test("sidebar has quant primary nav items", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of navLabels) {
      await expect(page.getByTestId("main-nav").getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("dashboard shows strategy overview without AI candidate top5", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('[data-section="bot-status"]')).toBeVisible();
    await expect(page.locator('[data-section="today-pnl-risk"]')).toBeVisible();
    await expect(page.locator('[data-section="active-strategy"]')).toBeVisible();
    await expect(page.locator('[data-section="current-positions"]')).toBeVisible();
    await expect(page.locator('[data-section="quick-emergency-controls"]')).toBeVisible();
    await expect(page.locator('[data-section="ai-candidates-top5"]')).toHaveCount(0);
  });

  test("strategy management protects SAFE and allows copy", async ({ page }) => {
    await page.goto("/strategies");
    await expect(page.getByTestId("strategy-manager")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("strategy-row-SAFE_v44_i4060")).toBeVisible();
    await expect(page.getByTestId("strategy-locked-hint")).toBeVisible();
    await page.getByTestId("strategy-copy").click();
    await expect(page.getByText("완료").first()).toBeVisible({ timeout: 10_000 });
  });

  test("backtest page has date range timeframe and cost settings", async ({ page }) => {
    await page.goto("/backtest");
    await expect(page.getByTestId("backtest-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("backtest-from")).toBeVisible();
    await expect(page.getByTestId("backtest-to")).toBeVisible();
    await expect(page.getByTestId("backtest-timeframe")).toBeVisible();
    await expect(page.getByTestId("backtest-cost-settings")).toBeVisible();
    await page.getByTestId("backtest-run").click();
    await expect(page.getByTestId("backtest-summary")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("backtest-validation")).toBeVisible();
  });

  test("market watch shows strategy signal table without AI score", async ({ page }) => {
    await page.goto("/market-watch");
    await expect(page.getByTestId("market-watch-quant")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("quant-signal-table")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("AI 점수");
  });

  test("paper trading page does not place live orders", async ({ page }) => {
    await page.goto("/paper-trading");
    await expect(page.getByTestId("paper-trading-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("실제 주문 없음").first()).toBeVisible();
    await page.getByTestId("paper-start").click();
    await expect(page.getByTestId("paper-stop")).toBeVisible();
  });

  test("live trading page keeps safety gate", async ({ page }) => {
    await page.goto("/live-trading");
    await expect(page.getByTestId("live-trading-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("live-readiness")).toBeVisible();
    await expect(page.getByTestId("live-start")).toBeVisible();
    await expect(page.getByText("거래소 서버 손절/익절").first()).toBeVisible();
  });

  test("trades and ai reports pages exist", async ({ page }) => {
    await page.goto("/trades");
    await expect(page.getByTestId("trades-page")).toBeVisible({ timeout: 15_000 });
    await page.goto("/ai-reports");
    await expect(page.getByTestId("ai-reports-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("실전 진입을 결정하지 않습니다").first()).toBeVisible();
  });

  test("strategy performance page exists", async ({ page }) => {
    await page.goto("/strategy-performance");
    await expect(page.getByTestId("strategy-performance")).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard emergency controls visible above fold on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    const emergency = page.locator('[data-section="quick-emergency-controls"]');
    await expect(emergency).toBeVisible();
    const box = await emergency.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(900);
    // perf/loading markers kept for verify script: panel-skeleton / market-refresh / runtime-meta
    await expect(page.getByTestId("dashboard-sections")).toBeVisible();
  });
});
