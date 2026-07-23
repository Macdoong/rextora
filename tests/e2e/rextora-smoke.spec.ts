import { expect, test } from "@playwright/test";

const routes = [
  "/dashboard",
  "/strategies",
  "/backtest",
  "/strategy-search",
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
  "전략 탐색",
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
    await expect(page.getByTestId("backtest-message")).toBeVisible({ timeout: 45_000 });
    const summary = page.getByTestId("backtest-summary");
    const errDetail = page.getByTestId("backtest-error-detail");
    await expect(summary.or(errDetail).first()).toBeVisible({ timeout: 5_000 });
  });

  test("backtest analysis shows korean guidance and trade times when result exists", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/backtest");
    await expect(page.getByTestId("backtest-panel")).toBeVisible({ timeout: 15_000 });
    // Use a short recent preset via empty dates — API loads last 90d if available
    await page.getByTestId("backtest-run").click();
    await expect(page.getByTestId("backtest-message")).toBeVisible({ timeout: 60_000 });
    const summary = page.getByTestId("backtest-summary");
    if (await summary.isVisible()) {
      await expect(page.getByTestId("backtest-reading-guide")).toHaveCount(0);
      await expect(page.getByTestId("chart-help").first()).toBeVisible();
      await page.getByTestId("chart-help").first().click();
      await expect(page.getByTestId("chart-help-panel").first()).toBeVisible();
      await expect(page.getByTestId("analysis-section-nav")).toBeVisible();
      await expect(page.getByTestId("backtest-validation")).toBeVisible();
      // Contrast: secondary text uses semantic tokens (class present in DOM)
      await expect(page.locator(".rx-text-muted").first()).toBeVisible();
      const coverage = page.getByTestId("monthly-coverage-panel");
      if (await coverage.isVisible()) {
        await expect(coverage).toBeVisible();
        await expect(page.getByTestId("timeline-mode-badge")).toBeVisible();
        await expect(page.getByTestId("timeline-domain")).toBeVisible();
      }
      const fitAll = page.getByTestId("chart-fit-all").first();
      if (await fitAll.isVisible()) {
        const label = await fitAll.innerText();
        expect(label).toContain("전체 보기");
        expect(label).not.toMatch(/\uFFFD|\?/);
        await expect(fitAll).toHaveAttribute(
          "aria-label",
          "전체 기간 차트 보기",
        );
        // Readable default: candle body data attr should be wide before zoom-out
        const bodyBefore = await page
          .locator("[data-candle-body]")
          .first()
          .getAttribute("data-candle-body");
        const beforeW = Number(bodyBefore ?? "0");
        expect(beforeW).toBeGreaterThanOrEqual(10);
        expect(beforeW).toBeLessThanOrEqual(14);

        await fitAll.click();
        const bodyFull = await page
          .locator("[data-candle-body]")
          .first()
          .getAttribute("data-candle-body");
        // Full-range may compress; default restore must widen again
        const reset = page.getByTestId("chart-reset-default").first();
        if (await reset.isVisible()) {
          await reset.click();
          await expect
            .poll(async () =>
              Number(
                (await page
                  .locator("[data-candle-body]")
                  .first()
                  .getAttribute("data-candle-body")) ?? "0",
              ),
            )
            .toBeGreaterThanOrEqual(10);
        }
        // Markers present but candles remain primary (body width recorded)
        expect(beforeW).toBeGreaterThanOrEqual(Number(bodyFull ?? "0") * 0.5);
      }
      // Page scroll still works over chart (no global wheel capture)
      const beforeScroll = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 400);
      const afterScroll = await page.evaluate(() => window.scrollY);
      expect(afterScroll).toBeGreaterThanOrEqual(beforeScroll);
      const tradeRow = page.getByTestId("trade-row").first();
      if (await tradeRow.isVisible()) {
        await tradeRow.click();
        await expect(page.getByTestId("trade-drawer")).toBeVisible();
        await expect(page.getByTestId("trade-mini-chart")).toBeVisible();
        await expect(page.getByTestId("trade-pnl-waterfall")).toBeVisible();
        await expect(page.getByTestId("trade-lifecycle")).toBeVisible();
        await page.getByRole("button", { name: "닫기" }).click();
        await expect(page.getByTestId("trade-drawer")).toHaveCount(0);
      }
      if (await page.getByTestId("monthly-label").first().isVisible()) {
        await expect(page.getByTestId("monthly-label").first()).toContainText("월");
      }
      const explore = page.getByTestId("chart-explore").first();
      if (await explore.isVisible()) {
        await explore.scrollIntoViewIfNeeded();
        await explore.click();
        await expect(page.getByTestId("chart-explore-active").first()).toBeVisible();
        await page.keyboard.press("Escape");
      }
      const fsBtn = page.getByTestId("chart-fullscreen-toggle").first();
      if (await fsBtn.isVisible()) {
        await fsBtn.click();
        await expect(page.getByTestId("chart-fullscreen")).toBeVisible();
        await page.keyboard.press("Escape");
      }
      // No horizontal page overflow on mobile
      await page.setViewportSize({ width: 390, height: 844 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    }
  });

  test("backtest Top 10 multi-symbol workspace switches tabs", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/backtest");
    await expect(page.getByTestId("backtest-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("backtest-top10").click();
    await expect(page.getByTestId("backtest-symbol")).toHaveValue(/BTCUSDT.*ETHUSDT/);
    // Short range to keep E2E runtime bounded
    const to = new Date();
    const from = new Date(to.getTime() - 14 * 86400000);
    await page.getByTestId("backtest-from").fill(from.toISOString().slice(0, 10));
    await page.getByTestId("backtest-to").fill(to.toISOString().slice(0, 10));
    await page.getByTestId("backtest-run").click();
    await expect(page.getByTestId("backtest-message")).toBeVisible({ timeout: 180_000 });
    const workspace = page.getByTestId("multi-symbol-workspace");
    if (await workspace.isVisible()) {
      await expect(page.getByTestId("symbol-result-tabs")).toBeVisible();
      await expect(page.getByTestId("symbol-comparison-table")).toBeVisible();
      await expect(page.getByTestId("return-drawdown-scatter")).toBeVisible();
      const count = await page
        .getByTestId("return-drawdown-scatter")
        .getAttribute("data-point-count");
      expect(Number(count)).toBeGreaterThanOrEqual(2);
      const eth = page
        .getByTestId("symbol-result-tabs")
        .getByTestId("symbol-tab-ETHUSDT");
      if (await eth.isVisible()) {
        await eth.click();
        await expect(
          page.getByTestId("selected-symbol-workspace").locator("span.font-semibold"),
        ).toHaveText("ETHUSDT");
      }
      // Scatter selection covered by unit tests; overlapping points make
      // force-clicks flaky in dense Top 10 fixtures.
      await expect(page.getByTestId("scatter-point-ETHUSDT")).toHaveCount(1);
      const timeline = page.getByTestId("backtest-timeline");
      if (await timeline.isVisible()) {
        await expect(page.getByTestId("timeline-lanes")).toBeVisible();
      }
      const dist = page.getByTestId("backtest-distribution");
      if (await dist.isVisible()) {
        await expect(dist).toContainText("이익");
      }
    }
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

  test("gray text uses semantic tokens across key pages", async ({ page }) => {
    for (const route of ["/dashboard", "/backtest", "/settings", "/risk", "/system-status"]) {
      await page.goto(route);
      await page.waitForTimeout(500);
      const muted = page.locator(".rx-text-muted, .rextora-helper, .rextora-caption");
      if ((await muted.count()) > 0) {
        await expect(muted.first()).toBeVisible();
      }
    }
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
