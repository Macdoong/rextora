import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const log = (msg) => console.log(`[+${Date.now() - t0}ms] ${msg}`);
const t0 = Date.now();

await page.goto("http://127.0.0.1:3000/dashboard");
log("dashboard loaded");
await page.getByTestId("agent-provider-select").waitFor({ timeout: 60000 });
await page.getByTestId("agent-provider-select").selectOption("openai");
log("provider selected");

const ta = page.getByTestId("agent-input-textarea");
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="agent-input-textarea"]');
    return el && !el.disabled;
  },
  { timeout: 30000 },
);
log("input ready");

const responsePromise = page.waitForResponse(
  (r) => r.url().includes("/api/rextora/agent") && r.request().method() === "POST",
  { timeout: 120000 },
);
await ta.fill("백태스트가 뭐야?");
await page.getByTestId("agent-input-send").click();
log("sent click");
const res = await responsePromise;
const body = await res.json();
log(`response ${res.status()} mode=${body.conversationRoute?.mode} len=${String(body.conclusionKo ?? "").length}`);

const count = await page.getByTestId("agent-conversational-answer").count();
log(`answer nodes=${count}`);
if (count > 0) {
  const text = await page.getByTestId("agent-conversational-answer").last().innerText();
  log(`dom answer len=${text.trim().length} preview=${text.trim().slice(0, 60)}`);
}

await browser.close();
