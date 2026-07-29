import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
for (const route of ["/strategy-search", "/results"]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__shifts.push({
          value: entry.value,
          sources: entry.sources?.map((source) => ({
            node:
              source.node?.getAttribute?.("data-testid") ||
              source.node?.id ||
              source.node?.className ||
              source.node?.tagName,
            previousRect: source.previousRect,
            currentRect: source.currentRect,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  console.log(route, JSON.stringify(await page.evaluate(() => window.__shifts), null, 2));
  await context.close();
}
await browser.close();
