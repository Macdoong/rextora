import { chromium } from "@playwright/test";
import fs from "node:fs";

const prompts = [
  "BTC와 ETH 전략 비교해줘",
  "Paper 시작해줘",
  "실패한 탐색 원인을 설명해줘",
  "다음에 뭘 해야 하지?",
  "지금 BTC 매수해줘",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "ko-KR",
});
await page.goto("http://127.0.0.1:3000/dashboard", {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("dashboard-agent-workspace").waitFor();

const results = [];
for (const prompt of prompts) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/rextora/agent") &&
      response.request().method() === "POST",
    { timeout: 45_000 },
  );
  const input = page.getByLabel("에이전트에게 질문");
  await input.fill(prompt);
  await input.press("Enter");
  const response = await responsePromise;
  const json = await response.json();
  await page.waitForFunction(() => {
    const field = document.querySelector(
      'textarea[aria-label="에이전트에게 질문"]',
    );
    return field && !field.disabled;
  });
  const workspace = page.getByTestId("dashboard-agent-workspace");
  results.push({
    prompt,
    intentType: json.intentType,
    safetyBlocked: Boolean(json.safetyBlocked),
    actionCount: (json.actions ?? []).length,
    actionHref: json.actions?.[0]?.href ?? null,
    factsVisible: await workspace.getByText("검증된 사실", { exact: true }).count(),
    interpretationVisible: await workspace
      .getByText("AI 해석", { exact: true })
      .count(),
    recommendedVisible: await workspace
      .getByText("권장 다음 작업", { exact: true })
      .count(),
    actionCards: await workspace.getByTestId("agent-action-card").count(),
    scopeVisible: await workspace.getByText("분석 범위", { exact: true }).count(),
  });
  await page.getByLabel("새 대화").click();
  await page.waitForTimeout(400);
}

await page.screenshot({
  path: "tmp/agent-phase1-acceptance.png",
  fullPage: false,
});
fs.writeFileSync(
  "tmp/agent-phase1-matrix.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
