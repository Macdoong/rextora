import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { loginAsE2eCeo } from "./e2eAuth";

async function auditBacktestTextContrast(page: Page) {
  return page.evaluate(() => {
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
    const colorCache = new Map<string, { r: number; g: number; b: number; a: number } | null>();
    const parse = (color: string) => {
      if (colorCache.has(color)) return colorCache.get(color) ?? null;
      if (!colorContext) return null;
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = color;
      colorContext.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
      const parsed = { r, g, b, a: alpha / 255 };
      colorCache.set(color, parsed);
      return parsed;
    };
    const composite = (front: ReturnType<typeof parse>, back: { r: number; g: number; b: number; a: number }) => {
      if (!front) return back;
      const a = front.a + back.a * (1 - front.a);
      if (!a) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
        a,
      };
    };
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
    const root = document.querySelector<HTMLElement>(".v3-backtest");
    if (!root) return { checked: 0, failures: [{ text: "Backtest root missing", ratio: -1 }] };
    const checked: Array<{ text: string; ratio: number; foreground: string; background: string; classes: string }> = [];
    const elements = [...root.querySelectorAll<HTMLElement>("p,span,button,label,th,td,dt,dd,summary,h1,h2,h3,h4,li")];
    for (const element of elements) {
      const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
      const rect = element.getBoundingClientRect();
      if (!text || rect.width === 0 || rect.height === 0 || getComputedStyle(element).visibility === "hidden") continue;
      if (element.closest("[hidden],[aria-hidden='true']") || element.classList.contains("sr-only")) continue;
      const foreground = parse(getComputedStyle(element).color);
      if (!foreground) continue;
      const ancestors: HTMLElement[] = [];
      let node: HTMLElement | null = element;
      while (node) { ancestors.unshift(node); node = node.parentElement; }
      let background = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 243, g: 245, b: 248, a: 1 };
      for (const ancestor of ancestors) {
        const ancestorStyle = getComputedStyle(ancestor);
        const gradientColor = ancestorStyle.backgroundImage.match(/rgba?\([^)]*\)/)?.[0];
        background = composite(parse(gradientColor ?? ancestorStyle.backgroundColor), background);
      }
      const opacity = ancestors.reduce((value, ancestor) => {
        const parsed = Number(getComputedStyle(ancestor).opacity);
        return value * (Number.isFinite(parsed) ? parsed : 1);
      }, 1);
      const renderedForeground = composite({ ...foreground, a: opacity }, background);
      const ratio = (Math.max(luminance(renderedForeground), luminance(background)) + 0.05) /
        (Math.min(luminance(renderedForeground), luminance(background)) + 0.05);
      const style = getComputedStyle(element);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      const threshold = large ? 3 : 4.5;
      checked.push({
        text: `${text.slice(0, 72)} [${style.fontSize}]`,
        ratio: Number((ratio < threshold ? -ratio : ratio).toFixed(2)),
        foreground: style.color,
        background: `rendered ${Math.round(background.r)},${Math.round(background.g)},${Math.round(background.b)}; ${getComputedStyle(element).backgroundImage}`,
        classes: element.className.toString(),
      });
    }
    const failures = checked.filter((item) => item.ratio < 0);
    const uniqueFailures = [...new Map(failures.map((item) => [`${item.text}|${item.classes}`, item])).values()];
    return { checked: checked.length, failures: uniqueFailures.slice(0, 40) };
  });
}

test("Backtest missing-identity state is responsive and reduced-motion safe", async ({ page }) => {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-backtest-qa-"));
  const backtestRunRequests: string[] = [];
  await loginAsE2eCeo(page);
  page.on("request", (request) => {
    if (request.url().includes("/api/rextora/backtest/run")) {
      backtestRunRequests.push(request.method());
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/backtest?strategyId=backtest_responsive_audit_missing");
  await expect(page.getByTestId("backtest-result-state")).toHaveAttribute(
    "data-state",
    "missing_strategy",
  );
  await expect(page).toHaveURL(/strategyId=backtest_responsive_audit_missing/);
  await expect(page.getByRole("heading", { name: "저장된 전략을 찾을 수 없습니다" })).toBeVisible();
  await expect(page.getByTestId("shell-context-breadcrumb")).toContainText("백테스트");
  await expect(page.getByTestId("shell-context-stage")).toContainText("백테스트");
  expect(backtestRunRequests).toEqual([]);

  const viewports = [
    { width: 1536, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(overflow.content, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(
      overflow.viewport,
    );
    if (viewport.width === 390) {
      await expect(page.getByTestId("shell-context-strategy-primary")).toBeHidden();
      await expect(page.getByTestId("shell-context-bar").locator(".rextora-context-market-chip", {})).toBeHidden();
      await expect(page.getByTestId("shell-context-agent-status-label")).toBeVisible();
    }
    await page.screenshot({
      path: path.join(screenshotDir, `backtest-${viewport.width}x${viewport.height}.png`),
    });
  }

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Contrast is audited after the one-shot entrance transitions have settled.
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active !== document.body && active.matches(":focus-visible"));
    }),
  ).toBe(true);
  console.log(`Backtest shell QA screenshots: ${screenshotDir}`);
});

test("saved Backtest result keeps primary evidence visible across target viewports", async ({ page }) => {
  test.setTimeout(120_000);
  const runId = "bt_mv4u7ta9_9f18b1";
  const strategyId = "custom_mv4r6wbj";
  const sourceRoot = process.cwd();
  const run = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, "data/rextora/backtests", `${runId}.json`), "utf8"),
  ) as { id: string; strategyId: string; report: { totalReturn?: number; mdd?: number }; [key: string]: unknown };
  const strategy = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, "data/rextora/strategies", `${strategyId}.json`), "utf8"),
  ) as { id: string; [key: string]: unknown };
  const chart = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, "data/rextora/backtests", `${runId}.chart.json`), "utf8"),
  ) as {
    candles: unknown[];
    equityCurve: number[];
    drawdownCurve: number[];
    chartSamplingApplied: boolean;
    processedCandleCount: number;
  };
  await loginAsE2eCeo(page);

  // Serve the actual persisted run, strategy, and chart sidecar as read-only
  // API fixtures; this keeps the test independent of and isolated from runtime stores.
  await page.route("**/api/rextora/strategies**", async (route) => {
    const url = new URL(route.request().url());
    const data = url.searchParams.has("id") ? strategy : [strategy];
    await route.fulfill({ json: { ok: true, data } });
  });
  await page.route("**/api/rextora/backtest/run**", async (route) => {
    const url = new URL(route.request().url());
    const data = url.searchParams.has("hydrateChart")
      ? {
          run,
          chartCandles: chart.candles,
          equityCurve: chart.equityCurve,
          drawdownCurve: chart.drawdownCurve,
          chartSamplingApplied: chart.chartSamplingApplied,
          processedCandleCount: chart.processedCandleCount,
          chartSource: "persisted",
          reproducibilityGuaranteed: true,
        }
      : url.searchParams.has("runId")
        ? run
        : [run];
    await route.fulfill({ json: { ok: true, data } });
  });

  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-backtest-result-qa-"));
  const backtestRunRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/rextora/backtest/run") && request.method() !== "GET") {
      backtestRunRequests.push(request.method());
    }
  });

  await page.goto(`/backtest?strategyId=${strategyId}&symbol=BTCUSDT&timeframe=15m&runId=${runId}&tradeId=T0001`);
  await expect(page.getByTestId("backtest-kpi-grid")).toBeVisible();
  await expect(page.getByTestId("backtest-analysis")).toBeVisible();
  await expect(page.getByTestId("backtest-technical-panel")).toBeHidden();
  await expect(page.getByTestId("backtest-kpi-grid")).toContainText("56.26%");
  await expect(page.getByTestId("backtest-kpi-grid")).toContainText("-15.28%");
  await expect(page.getByTestId("backtest-kpi-grid")).toContainText("수익계수");
  await page.getByTestId("backtest-kpi-grid").getByLabel("수익계수 도움말").hover();
  await expect(page.getByText("이익 거래 수익률 합계 ÷ 손실 거래 수익률 절댓값 합계")).toBeVisible();
  await expect(page.locator('[data-testid="backtest-run-status"] > div')).toHaveCount(0);
  await expect(page.getByTestId("backtest-evidence-metrics")).toBeAttached();
  await expect(page.getByTestId("backtest-history-disclosure")).not.toHaveAttribute("open", "");
  const resultHeader = page.getByTestId("backtest-operator-header");
  await expect(resultHeader.locator(".bt-op-strategy-name", {})).not.toContainText("BTCUSDT 15m");
  await expect(resultHeader.locator(".bt-op-meta", {})).toContainText("BTCUSDT");
  await expect(resultHeader.locator(".bt-op-meta", {})).toContainText("15분봉");
  await expect(page.getByTestId("agent-context-strip")).not.toContainText("적격");
  await expect(page.getByTestId("agent-context-strip")).not.toContainText("BTCUSDT");
  await expect(page.getByTestId("agent-context-strip")).not.toContainText("15m");
  await expect(page.getByTestId("backtest-run-status")).not.toContainText("저장된 백테스트를 불러왔습니다");

  const animation = await page.getByTestId("backtest-kpi-grid").evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, iterations: style.animationIterationCount };
  });
  expect(animation.name).toBe("v3-bt-result-enter");
  expect(animation.iterations).toBe("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionName = await page.getByTestId("backtest-kpi-grid").evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(reducedMotionName).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const viewports = [
    { width: 1920, height: 1200 },
    { width: 1920, height: 1080 },
    { width: 1536, height: 1024 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const measurement = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      const firstThreeKpis = [...document.querySelectorAll<HTMLElement>(
        '[data-testid="backtest-kpi-grid"] .bt-op-kpi-grid > div:nth-child(-n + 3)',
      )].map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        height: window.innerHeight,
        header: box('.bt-op-header[data-result-context="saved_historical"]'),
        kpis: box('[data-testid="backtest-kpi-grid"]'),
        primaryKpis: firstThreeKpis,
        primaryKpiBounds: firstThreeKpis.length
          ? {
              top: Math.min(...firstThreeKpis.map((item) => item.top)),
              bottom: Math.max(...firstThreeKpis.map((item) => item.bottom)),
            }
          : null,
        fabDisplay: document.querySelector<HTMLElement>(
          '.rextora-agent-root[data-agent-backtest="true"] .rextora-agent-fab',
        ) ? getComputedStyle(document.querySelector<HTMLElement>(
          '.rextora-agent-root[data-agent-backtest="true"] .rextora-agent-fab',
        )!).display : "missing",
        agentStripButton: box('[data-testid="agent-context-strip"][data-context-source="backtest"] button'),
      };
    });
    expect(measurement.documentWidth, `${viewport.width}px page overflow`).toBeLessThanOrEqual(
      measurement.viewportWidth,
    );
    expect(measurement.kpis, `${viewport.width}px KPI grid exists`).not.toBeNull();
    if (viewport.width <= 1366) {
      expect(measurement.primaryKpis.every((item) => item.top >= 0 && item.bottom <= measurement.height),
        `${viewport.width}px primary return/risk cards are in the first viewport`).toBe(true);
    }
    if (viewport.width === 1366 || viewport.width === 390) {
      console.log(`Saved result KPI viewport ${viewport.width}x${viewport.height}: ${JSON.stringify({
        viewportHeight: measurement.height,
        primaryKpiBounds: measurement.primaryKpiBounds,
        totalReturnAndMddVisible: measurement.primaryKpis.length >= 2 &&
          measurement.primaryKpis.slice(0, 2).every((item) => item.top >= 0 && item.bottom <= measurement.height),
        documentWidth: measurement.documentWidth,
        viewportWidth: measurement.viewportWidth,
      })}`);
    }
    if (viewport.width === 390) {
      expect(measurement.fabDisplay).toBe("none");
      expect(measurement.agentStripButton?.bottom).toBeLessThanOrEqual(measurement.height);
    }
    await page.screenshot({ path: path.join(screenshotDir, `saved-result-${viewport.width}x${viewport.height}.png`) });
  }

  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.getByTestId("backtest-workspace-tab-price").click();
  const selectedTradeStatus = page.getByTestId("chart-trade-link-status");
  await expect(selectedTradeStatus).toBeVisible();
  await expect(selectedTradeStatus).toContainText("선택 거래 T0001 · 진입·청산 위치 표시 중");
  const indicatorBeforeFocus = await page.evaluate(() => {
    const ratio = (foreground: string, background: string) => {
      const rgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (value: string) => {
        const channels = rgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
      };
      const a = luminance(foreground);
      const b = luminance(background);
      return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
    };
    const status = document.querySelector<HTMLElement>('[data-testid="chart-trade-link-status"]')!;
    const message = status.querySelector<HTMLElement>('[data-testid="chart-trade-link-status"] span')!;
    const identity = status.querySelector<HTMLElement>('[data-testid="chart-trade-link-id"]')!;
    const clear = status.querySelector<HTMLButtonElement>("button")!;
    const style = (element: Element) => {
      const computed = getComputedStyle(element);
      return { color: computed.color, background: computed.backgroundColor, border: computed.borderColor };
    };
    const messageStyle = style(message);
    const identityStyle = style(identity);
    const clearStyle = style(clear);
    return {
      message: messageStyle,
      messageContrast: ratio(messageStyle.color, getComputedStyle(status).backgroundColor),
      identity: identityStyle,
      identityContrast: ratio(identityStyle.color, getComputedStyle(status).backgroundColor),
      clear: clearStyle,
      clearContrast: ratio(clearStyle.color, clearStyle.background),
    };
  });
  expect(indicatorBeforeFocus.messageContrast).toBeGreaterThanOrEqual(4.5);
  expect(indicatorBeforeFocus.identityContrast).toBeGreaterThanOrEqual(4.5);
  expect(indicatorBeforeFocus.clearContrast).toBeGreaterThanOrEqual(4.5);
  const clearTradeButton = page.getByRole("button", { name: "선택 거래 해제" });
  await clearTradeButton.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focusOutline = await clearTradeButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(focusOutline.style).toBe("solid");
  expect(focusOutline.width).toBeGreaterThanOrEqual(2);
  await clearTradeButton.blur();
  await page.screenshot({ path: path.join(screenshotDir, "selected-trade-indicator-T0001-1920x1200.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await page.screenshot({ path: path.join(screenshotDir, "selected-trade-indicator-T0001-1920x1200-reduced-motion.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log(`Selected-trade indicator contrast: ${JSON.stringify({ ...indicatorBeforeFocus, focusOutline })}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("backtest-workspace-tab-price").click();
  const chartShell = page.locator('[data-testid="backtest-analysis"] [data-chart-shell]').first();
  await expect(chartShell).toBeVisible();
  await chartShell.scrollIntoViewIfNeeded();
  const chartControls = await page.locator('[data-testid="backtest-analysis"] [data-chart-shell] button').evaluateAll(
    (buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }).filter((control) => control.width > 0 && control.height > 0),
  );
  expect(chartControls.length).toBeGreaterThan(0);
  expect(chartControls.every((control) => control.width >= 40 && control.height >= 40),
    `mobile chart controls should have 40px targets: ${JSON.stringify(chartControls)}`).toBe(true);
  const mobileBottomNav = page.getByTestId("shell-bottom-nav");
  await expect(mobileBottomNav).toBeVisible();
  expect(await mobileBottomNav.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  const mobileChartShell = page.locator('[data-testid="backtest-analysis"] [data-chart-shell]').first();
  await mobileChartShell.getByTestId("chart-explore").click();
  await expect(mobileChartShell.getByTestId("chart-explore-active")).toBeVisible();
  await mobileChartShell.getByTestId("chart-explore").click();
  await expect(mobileChartShell.getByTestId("chart-explore-active")).toHaveCount(0);
  await mobileChartShell.getByTestId("chart-zoom-in").click();
  await mobileChartShell.getByTestId("chart-fit-all").click();
  const mobileFabDisplay = await page.locator(
    '.rextora-agent-root[data-agent-backtest="true"] .rextora-agent-fab',
  ).evaluate((element) => getComputedStyle(element).display);
  expect(mobileFabDisplay).toBe("none");
  await page.screenshot({ path: path.join(screenshotDir, "saved-result-390x844-chart.png") });
  await page.getByTestId("backtest-workspace-tab-trades").click();
  await expect(page.getByTestId("trade-mobile-list")).toBeVisible();
  await expect(page.getByTestId("selected-trade-inspector")).toBeVisible();
  await expect(page.getByTestId("trade-mobile-result").first()).toContainText("%");
  const mobileTradeLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    mobileCardWidth: document.querySelector<HTMLElement>('[data-testid="trade-mobile-list"] > button')?.getBoundingClientRect().width ?? 0,
    selectedTrade: document.querySelector('[data-testid="selected-trade-inspector"]')?.textContent?.includes("T0001") ?? false,
  }));
  expect(mobileTradeLayout.documentWidth).toBeLessThanOrEqual(mobileTradeLayout.viewportWidth);
  expect(mobileTradeLayout.selectedTrade).toBe(true);
  expect(mobileTradeLayout.mobileCardWidth).toBeGreaterThanOrEqual(300);
  await page.screenshot({ path: path.join(screenshotDir, "saved-result-390x844-trade-detail.png") });
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.getByTestId("backtest-workspace-tab-trades").click();
  await expect(page.getByTestId("backtest-trade-workspace")).toBeVisible();
  await expect(page.getByTestId("selected-trade-inspector")).toBeVisible();
  await expect(page.getByTestId("selected-trade-inspector")).toContainText("T0001");
  const desktopTradeTable = page.locator(".v3-bt-trade-table-wrap");
  await expect(desktopTradeTable).toBeVisible();
  const tradeLayoutAfter = [];
  for (const viewport of [
    { width: 1920, height: 1200 },
    { width: 1536, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    const measurement = await page.evaluate(() => {
      const rect = (element: Element | null) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      const workspace = document.querySelector('[data-testid="backtest-trade-workspace"]');
      const list = document.querySelector('.v3-bt-trade-list-col');
      const inspector = document.querySelector('.v3-bt-trade-inspector-col');
      const wrap = document.querySelector('.v3-bt-trade-table-wrap');
      const row = document.querySelector<HTMLElement>('[data-testid="trade-row"][data-trade-id="T0001"]');
      const pnlCell = row?.querySelector<HTMLElement>('td:nth-child(4)') ?? null;
      const returnCell = row?.querySelector<HTMLElement>('td:nth-child(5)') ?? null;
      const timeCell = row?.querySelector<HTMLElement>('td:nth-child(3)') ?? null;
      const wrapRect = wrap?.getBoundingClientRect() ?? null;
      const indicator = document.querySelector<HTMLElement>('[data-testid="chart-trade-link-status"]');
      const indicatorText = indicator?.querySelector('.v3-bt-trade-link-status__message') ?? null;
      const clearButton = indicator?.querySelector('button') ?? null;
      const style = (element: Element | null) => element ? {
        color: getComputedStyle(element).color,
        backgroundColor: getComputedStyle(element).backgroundColor,
        borderColor: getComputedStyle(element).borderColor,
      } : null;
      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        workbench: rect(workspace),
        list: rect(list),
        inspector: rect(inspector),
        table: wrap ? { clientWidth: wrap.clientWidth, scrollWidth: wrap.scrollWidth, overflow: wrap.scrollWidth - wrap.clientWidth } : null,
        pnlCell: rect(pnlCell),
        returnCell: rect(returnCell),
        timeValues: [...(timeCell?.querySelectorAll<HTMLElement>("span") ?? [])].map((element) => ({
          text: element.innerText.trim(),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          rect: rect(element),
        })),
        tableVisibleBounds: wrapRect ? { left: wrapRect.left, right: wrapRect.right } : null,
        layout: document.querySelector<HTMLElement>('[data-testid="trade-table"]')?.dataset.layout ?? null,
        headers: [...document.querySelectorAll('[data-testid="trade-table"] thead th')].map((header) => header.textContent?.trim()),
        inspectorFields: document.querySelector('[data-testid="selected-trade-inspector"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        indicator: style(indicator),
        indicatorText: style(indicatorText),
        clearButton: style(clearButton),
      };
    });
    tradeLayoutAfter.push(measurement);
    expect(measurement.table?.overflow, `${viewport.width}px selected summary horizontal overflow`).toBe(0);
    expect(measurement.layout).toBe("compact-summary");
    expect(measurement.headers).toEqual(["번호", "방향", "진입 · 청산 시각", "순손익", "수익률(레버리지 반영)"]);
    expect(measurement.pnlCell?.left).toBeGreaterThanOrEqual(measurement.tableVisibleBounds!.left - 1);
    expect(measurement.pnlCell?.right).toBeLessThanOrEqual(measurement.tableVisibleBounds!.right + 1);
    expect(measurement.returnCell?.left).toBeGreaterThanOrEqual(measurement.tableVisibleBounds!.left - 1);
    expect(measurement.returnCell?.right).toBeLessThanOrEqual(measurement.tableVisibleBounds!.right + 1);
    expect(measurement.returnCell?.width).toBeGreaterThan(0);
    expect(measurement.pnlCell?.width).toBeGreaterThan(0);
    expect(measurement.timeValues).toHaveLength(2);
    expect(measurement.timeValues.every((value) => value.text.length > 0 && value.scrollWidth <= value.clientWidth)).toBe(true);
    expect(measurement.inspectorFields).toContain("진입 가격");
    expect(measurement.inspectorFields).toContain("청산 가격");
    expect(measurement.inspectorFields).toContain("레버리지");
    expect(measurement.inspectorFields).toContain("수수료");
    expect(measurement.inspectorFields).toContain("슬리피지");
    await page.screenshot({ path: path.join(screenshotDir, `trade-list-inspector-open-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  console.log(`Saved trade-list layout after correction: ${JSON.stringify(tradeLayoutAfter)}`);

  const unselectedTradeLayouts = [];
  await page.getByTestId("backtest-workspace-tab-price").click();
  await page.getByRole("button", { name: "선택 거래 해제" }).click();
  await expect(page.getByTestId("selected-trade-inspector")).toHaveCount(0);
  await page.getByTestId("backtest-workspace-tab-trades").click();
  await expect(page.getByTestId("trade-table")).toHaveAttribute("data-layout", "full-detail");
  await expect(page.getByTestId("backtest-trade-workspace")).not.toHaveClass(/lg:grid/);
  await expect(page.getByTestId("trade-table").locator("thead th", {})).toHaveCount(10);
  for (const viewport of [
    { width: 1920, height: 1200 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    const measurement = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>(".v3-bt-trade-table-wrap")!;
      const row = document.querySelector<HTMLElement>('[data-testid="trade-row"]')!;
      const returnCell = row.querySelector<HTMLElement>("td:nth-child(9)")!;
      const wrapRect = wrap.getBoundingClientRect();
      const cellRect = returnCell.getBoundingClientRect();
      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth,
        listWidth: document.querySelector<HTMLElement>(".v3-bt-trade-list-col")!.getBoundingClientRect().width,
        returnCell: { left: cellRect.left, right: cellRect.right },
        tableBounds: { left: wrapRect.left, right: wrapRect.right },
      };
    });
    unselectedTradeLayouts.push(measurement);
    expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth);
    expect(measurement.returnCell.left).toBeGreaterThanOrEqual(measurement.tableBounds.left - 1);
    expect(measurement.returnCell.right).toBeLessThanOrEqual(measurement.tableBounds.right + 1);
    await page.screenshot({ path: path.join(screenshotDir, `trade-list-inspector-closed-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  console.log(`Saved trade-list layout with inspector closed: ${JSON.stringify(unselectedTradeLayouts)}`);
  await page.screenshot({
    path: path.join(screenshotDir, "desktop-result-kpi-navigation-workspace.png"),
    fullPage: true,
  });

  // A filter may not leave a detail panel or chart range pointing at a hidden trade.
  await page.locator('[data-testid="trade-row"][data-trade-id="T0029"]').click();
  await expect(selectedTradeStatus).toContainText("T0029");
  await expect(selectedTradeStatus).toHaveAttribute("role", "status");
  await expect(selectedTradeStatus).toHaveAttribute("aria-live", "polite");
  const selectionNoticeHeight = await selectedTradeStatus.evaluate((element) => element.getBoundingClientRect().height);
  expect(selectionNoticeHeight).toBeLessThanOrEqual(48);
  await expect(selectedTradeStatus).not.toContainText("구간을 차트에 표시했습니다");

  await page.getByTestId("backtest-workspace-tab-trades").click();
  await page.getByRole("button", { name: "숏", exact: true }).press("Enter");
  await expect(page.getByTestId("trade-empty-state")).toContainText("선택한 조건에 맞는 거래가 없습니다.");
  await expect(page.getByTestId("selected-trade-inspector")).toHaveCount(0);
  let filteredUrl = new URL(page.url());
  expect(filteredUrl.searchParams.get("runId")).toBe(runId);
  expect(filteredUrl.searchParams.has("tradeId")).toBe(false);
  await page.getByTestId("backtest-workspace-tab-price").click();
  await expect(page.getByTestId("trade-marker")).toHaveCount(0);

  await page.getByTestId("backtest-workspace-tab-trades").click();
  await page.getByRole("button", { name: "전체 거래 보기", exact: true }).click();
  await expect(page.getByTestId("trade-empty-state")).toHaveCount(0);
  await expect(page.getByText("31건 · 1/1 페이지", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "이전", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
  await page.getByTestId("trade-sort").selectOption("return_desc");
  const highestReturnTradeId = await page.locator('[data-testid="trade-row"]').first().getAttribute("data-trade-id");
  await page.getByTestId("trade-sort").selectOption("return_asc");
  const lowestReturnTradeId = await page.locator('[data-testid="trade-row"]').first().getAttribute("data-trade-id");
  expect(highestReturnTradeId).not.toBe(lowestReturnTradeId);
  await page.getByTestId("trade-sort").selectOption("entry_desc");
  const anotherTradeRow = page.locator('[data-testid="trade-row"]:not([data-trade-id="T0029"])').first();
  const anotherTradeId = await anotherTradeRow.getAttribute("data-trade-id");
  expect(anotherTradeId).toBeTruthy();
  await anotherTradeRow.click();
  filteredUrl = new URL(page.url());
  expect(filteredUrl.searchParams.get("tradeId")).toBe(anotherTradeId);
  expect(filteredUrl.searchParams.get("runId")).toBe(runId);
  await page.reload();
  await expect(page.getByTestId("selected-trade-inspector")).toContainText(anotherTradeId!);
  await page.getByTestId("backtest-workspace-tab-price").click();
  await page.getByRole("button", { name: "선택 거래 해제" }).click();
  filteredUrl = new URL(page.url());
  expect(filteredUrl.searchParams.get("runId")).toBe(runId);
  expect(filteredUrl.searchParams.has("tradeId")).toBe(false);

  await page.getByTestId("backtest-workspace-tab-price").click();
  const keyboardZoomControl = page.getByTestId("backtest-analysis").getByTestId("chart-zoom-in").first();
  await expect(keyboardZoomControl).toHaveAttribute("aria-label", "차트 확대");
  await keyboardZoomControl.press("Enter");

  await page.getByTestId("backtest-more-section-select").selectOption("monthly");
  await expect(page.getByTestId("monthly-sample-context")).toContainText("3개 달력 월 · 완료 거래 31건");
  await page.getByTestId("backtest-more-section-select").selectOption("cost");
  await expect(page.getByTestId("cost-bar-explanation")).toContainText("슬리피지는 체결가에 반영된 참고값");
  await expect(page.getByTestId("backtest-cost-analysis")).toContainText("손익 계산 확인");

  const mainSections = ["overview", "price", "trades", "equity", "validation"] as const;
  const additionalSections = ["monthly", "cost", "timeline", "advanced"] as const;
  const sectionNames = [
    ...mainSections.map((id) => ({ id, source: "tab" as const })),
    ...additionalSections.map((id) => ({ id, source: "select" as const })),
  ];
  const contrastFailures: Array<{ section: string; viewport: string; text: string; ratio: number; foreground: string; background: string; classes: string }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const section of sectionNames) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      if (section.source === "tab") {
        await page.getByTestId(`backtest-workspace-tab-${section.id}`).evaluate((element) => {
          (element as HTMLButtonElement).click();
        });
      } else {
        await page.getByTestId("backtest-more-section-select").selectOption(section.id);
      }
      await page.waitForTimeout(350);
      const sectionTestId: Record<string, string> = {
        overview: "backtest-overview",
        price: "backtest-price-chart",
        trades: "backtest-trade-list",
        equity: "backtest-equity-section",
        validation: "backtest-validation",
        monthly: "backtest-monthly",
        cost: "backtest-cost-analysis",
        timeline: "backtest-timeline",
        advanced: "backtest-advanced",
      };
      const sectionRoot = page.getByTestId(sectionTestId[section.id]).first();
      await expect(sectionRoot, `${section.id} is available at ${viewport.width}px`).toBeAttached();
      await expect(sectionRoot).toBeVisible();
      if (section.id === "advanced") {
        await expect(page.getByTestId("rolling-profit-factor-chart")).toContainText("수익계수");
        await expect(page.getByTestId("rolling-profit-factor-chart")).not.toContainText("손익비");
        const winRateAxis = await page.getByTestId("rolling-win-rate-chart").locator("svg text").allTextContents();
        const profitFactorAxis = await page.getByTestId("rolling-profit-factor-chart").locator("svg text").allTextContents();
        expect(winRateAxis.some((label) => label.trim().startsWith("-"))).toBe(false);
        expect(profitFactorAxis.some((label) => label.trim().startsWith("-"))).toBe(false);
      }
      if (section.id === "timeline") {
        const timelineAxisLabels = await page.getByTestId("timeline-lanes").locator("svg text").allTextContents();
        expect(timelineAxisLabels).not.toContain("숏");
        await expect(page.getByTestId("timeline-legend")).toBeVisible();
        const segment = page.getByTestId("timeline-segment").first();
        await expect(segment).toHaveAttribute("role", "button");
      }
      const disabledButtonOpacities = await page.locator(".v3-backtest button.rextora-btn-text:disabled").evaluateAll((buttons) =>
        buttons.map((button) => ({ opacity: getComputedStyle(button).opacity, text: (button as HTMLElement).innerText, classes: button.className })),
      );
      expect(disabledButtonOpacities.every((button) => button.opacity === "1"), JSON.stringify(disabledButtonOpacities)).toBe(true);
      const pageWidth = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.document, `${section.id} ${viewport.width}px overflow`).toBeLessThanOrEqual(pageWidth.viewport);
      await page.screenshot({
        path: path.join(screenshotDir, `section-${section.id}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      const audit = await auditBacktestTextContrast(page);
      contrastFailures.push(...audit.failures.map((failure) => ({
        section: section.id,
        viewport: `${viewport.width}x${viewport.height}`,
        ...failure,
      })));
    }
  }

  await page.getByTestId("backtest-more-section-select").selectOption("timeline");
  const keyboardTimelineTrade = page.getByTestId("timeline-segment").first();
  const keyboardTimelineTradeId = await keyboardTimelineTrade.getAttribute("data-trade-id");
  await expect(keyboardTimelineTrade).toHaveAttribute("role", "button");
  await keyboardTimelineTrade.press("Enter");
  await expect(page.getByTestId("chart-trade-link-status")).toContainText(keyboardTimelineTradeId!);
  expect(new URL(page.url()).searchParams.get("tradeId")).toBe(keyboardTimelineTradeId);

  await page.goto(`/backtest?strategyId=${strategyId}&symbol=BTCUSDT&timeframe=15m&runId=${runId}&expert=1`);
  await expect(page.getByTestId("expert-guard-blocked")).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: path.join(screenshotDir, "section-technical-expert-gate-1920x1080.png"), fullPage: true });
  console.log(`Backtest rendered text contrast failure count: ${contrastFailures.length}`);
  expect(contrastFailures.slice(0, 80), `all visible Backtest text meets WCAG AA; total failures=${contrastFailures.length}`).toEqual([]);
  expect(backtestRunRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
  console.log(`Saved Backtest result QA screenshots: ${screenshotDir}`);
});
