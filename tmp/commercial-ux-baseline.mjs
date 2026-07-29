import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:3000";
const auditPrefix = process.env.AUDIT_PREFIX ?? "baseline";
const routes = ["/dashboard", "/strategy-search", "/results", "/backtest"];
const widths = [1440, 1024, 768, 390];
const report = {
  server: `production:3000:${auditPrefix}`,
  pages: {},
  responsive: {},
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  navigation: [],
};

const browser = await chromium.launch({ headless: true });

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rextoraCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__rextoraCls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      report.consoleErrors.push({ width, url: page.url(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push({ width, url: page.url(), text: String(error) });
  });
  page.on("requestfailed", (request) => {
    report.requestFailures.push({
      width,
      url: request.url(),
      error: request.failure()?.errorText,
    });
  });
  report.responsive[width] = {};

  for (const route of routes) {
    const requests = [];
    const listener = (request) => requests.push(request.url());
    page.on("request", listener);
    const started = Date.now();
    const response = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.locator("main").waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(1_200);
    const elapsed = Date.now() - started;
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        responseStart: Math.round(navigation?.responseStart ?? 0),
        domContentLoaded: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
        load: Math.round(navigation?.loadEventEnd ?? 0),
        fcp: Math.round(
          performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0,
        ),
        cls: Number((window.__rextoraCls ?? 0).toFixed(4)),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyHeight: document.body.scrollHeight,
      };
    });
    page.off("request", listener);

    const apiRequests = requests.filter((url) => url.includes("/api/"));
    const apiCounts = {};
    for (const url of apiRequests) {
      const normalized = url.replace(/[?&](_rsc|t|ts)=[^&]+/g, "");
      apiCounts[normalized] = (apiCounts[normalized] ?? 0) + 1;
    }
    const duplicates = Object.entries(apiCounts).filter(([, count]) => count > 1);
    const result = {
      status: response?.status(),
      elapsed,
      ...metrics,
      requests: requests.length,
      apiRequests: apiRequests.length,
      duplicates,
    };
    report.responsive[width][route] = result;
    if (width === 1440) report.pages[route] = result;
    await page.screenshot({
      path: `tmp/${auditPrefix}-${width}-${route.slice(1)}.png`,
      fullPage: false,
    });
  }
  await context.close();
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ko-KR",
});
const page = await context.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
for (const href of [
  "/strategy-search",
  "/results",
  "/backtest",
  "/results",
  "/strategy-search",
  "/dashboard",
]) {
  const link = page.locator(`a[href="${href}"]`).first();
  if (!(await link.count())) continue;
  const started = Date.now();
  await link.click();
  await page.waitForURL((url) => url.pathname === href, { timeout: 15_000 });
  await page.locator("main").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  report.navigation.push({ href, ms: Date.now() - started });
}
await context.close();
await browser.close();

console.log(JSON.stringify(report, null, 2));
