import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://127.0.0.1:3000/dashboard");
await page.getByTestId("agent-provider-select").selectOption("openai");
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="agent-input-textarea"]');
    return el && !el.disabled;
  },
  { timeout: 30000 },
);
const rp = page.waitForResponse(
  (r) => r.url().includes("/api/rextora/agent") && r.request().method() === "POST",
  { timeout: 120000 },
);
await page.getByTestId("agent-input-textarea").fill("백태스트가 뭐야?");
await page.getByTestId("agent-input-send").click();
await rp;
for (const waitMs of [0, 50, 200, 500, 2000, 5000, 15000]) {
  await page.waitForTimeout(waitMs === 0 ? 0 : waitMs);
  const info = await page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
    const last = nodes[nodes.length - 1];
    const p = last?.querySelector("[data-streaming]");
    return {
      count: nodes.length,
      divText: last?.textContent?.trim().length ?? 0,
      pText: p?.textContent?.trim().length ?? 0,
      streaming: p?.getAttribute("data-streaming") ?? null,
    };
  });
  console.log(`after +${waitMs}ms`, info);
}
await browser.close();
