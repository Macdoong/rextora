import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const log = (m) => console.log(`[+${Date.now() - t0}ms] ${m}`);
const t0 = Date.now();

await page.goto("http://127.0.0.1:3000/dashboard");
await page.getByTestId("dashboard-agent-workspace").waitFor();
await page.getByTestId("agent-provider-select").waitFor({ timeout: 60000 });
log("dashboard ready");

const newBtn = page.getByTestId("agent-new-conversation");
if (await newBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
  await newBtn.click();
}
log("fresh conversation");

await page.getByTestId("agent-provider-select").selectOption("openai");
await page.waitForFunction(
  (reSource) => {
    const re = new RegExp(reSource, "i");
    const sel = document.querySelector('[data-testid="agent-model-select"]');
    return sel && !sel.disabled && Array.from(sel.options).some((o) => re.test(o.value));
  },
  "gpt-5-mini",
  { timeout: 90000 },
);
const gpt5 = await page.getByTestId("agent-model-select").evaluate(() => {
  const el = document.querySelector('[data-testid="agent-model-select"]');
  for (const opt of Array.from(el.options)) {
    if (/gpt-5-mini/i.test(opt.value)) return opt.value;
  }
  return el.value;
});
await page.getByTestId("agent-model-select").selectOption(gpt5);
log(`model selected ${gpt5}`);

await page.waitForFunction(
  () => {
    const ta = document.querySelector('[data-testid="agent-input-textarea"]');
    return ta && !ta.disabled;
  },
  { timeout: 30000 },
);
log("input ready");

const rp = page.waitForResponse(
  (r) => r.url().includes("/api/rextora/agent") && r.request().method() === "POST",
  { timeout: 120000 },
);
const query = "백태스트가 뭐야?";
const textarea = page.getByTestId("agent-input-textarea");
await textarea.fill(query);
await textarea.evaluate((el, q) => {
  const ta = el;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(ta, q);
  else ta.value = q;
  ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: q }));
}, query);
await page.waitForFunction(
  () => {
    const btn = document.querySelector('[data-testid="agent-input-send"]');
    return btn && !btn.disabled;
  },
  { timeout: 15000 },
);
log("send enabled");
await page.getByTestId("agent-input-send").click();
const res = await rp;
const body = await res.json();
log(`response ${res.status()} conclusion len=${String(body.conclusionKo ?? "").length}`);

await browser.close();
