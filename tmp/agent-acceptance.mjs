import { chromium } from "@playwright/test";

const prompts = [
  "현재 탐색 상태 알려줘",
  "최근 백테스트 결과 요약해줘",
  "SAFE 전략 설명해줘",
  "이 전략의 MDD가 높은 이유는?",
  "비용이 수익에 얼마나 영향을 줬어?",
  "모의매매 가능한 전략 보여줘",
  "지금 BTC 매수해줘",
  "SAFE 전략 수정해줘",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR" });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
await page.goto("http://127.0.0.1:3000/dashboard", { waitUntil: "domcontentloaded" });
await page.getByTestId("dashboard-agent-workspace").waitFor();

const results = [];
for (const prompt of prompts) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rextora/agent") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  const input = page.getByLabel("에이전트에게 질문");
  await input.fill(prompt);
  await input.press("Enter");
  const response = await responsePromise;
  const json = await response.json();
  await page.getByLabel("에이전트에게 질문").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const field = document.querySelector('textarea[aria-label="에이전트에게 질문"]');
    return field && !field.disabled;
  });
  const workspace = page.getByTestId("dashboard-agent-workspace");
  results.push({
    prompt,
    status: response.status(),
    intentType: json.intentType,
    facts: json.facts,
    safetyBlocked: Boolean(json.safetyBlocked),
    safetyReasonKo: json.safetyReasonKo ?? null,
    actions: json.actions,
    renderedFacts: await workspace.getByText("검증된 사실", { exact: true }).count(),
    renderedInterpretation: await workspace.getByText("AI 해석", { exact: true }).count(),
  });
  await page.getByLabel("새 대화").click();
}
await page.screenshot({ path: "tmp/final-agent-acceptance.png", fullPage: false });
console.log(JSON.stringify({ results, consoleErrors }, null, 2));
await browser.close();
