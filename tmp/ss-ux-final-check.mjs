/**
 * Manual UX smoke for Strategy Search completion polish.
 * Usage: node tmp/ss-ux-final-check.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SS_BASE || "http://127.0.0.1:3020";
const JOB_ID =
  process.env.SS_JOB || "search_248bec12-7fa7-410e-84ae-ac905fc47a7e";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(`${BASE}/strategy-search`, { waitUntil: "networkidle" });

const row = page.getByTestId(`ss-job-row-${JOB_ID}`);
const card = page.getByTestId(`ss-job-card-${JOB_ID}`);
if (await row.count()) {
  await row.click({ force: true });
} else if (await card.count()) {
  await card.click({ force: true });
} else {
  // fallback: first history row
  const first = page.locator('[data-testid^="ss-job-row-"]').first();
  if (await first.count()) await first.click({ force: true });
}

await page.waitForTimeout(1500);

const stats = page.getByTestId("ss-statistics");
await stats.waitFor({ timeout: 10000 });
const statsText = await stats.innerText();
const completion = page.getByTestId("ss-research-completion");
const completionText = (await completion.count())
  ? await completion.innerText()
  : "";

const checks = {
  hasApprovalGoal: /합격 목표/.test(statsText),
  hasBudgetUsed: /연구 예산 사용/.test(statsText),
  hasResearchStatus: /연구 상태/.test(statsText),
  hasStopReason: /종료 사유/.test(statsText),
  noBareProgressPctLabel: !/진행\s*\d+%/.test(statsText),
  noProgressBarPercentOnly: !/^Progress\s*\d+%/m.test(statsText),
  earlyOrComplete:
    /조기 완료|완료|합격 목표 달성|연구 예산 소진|연구 범위 소진/.test(
      statsText + completionText,
    ),
  completionTitle: !completionText || /AI 연구 완료/.test(completionText),
  pipelineSkippedHint:
    !/조기/.test(statsText + completionText) ||
    /건너뜀|완료|진행 중|대기/.test(statsText),
};

const failed = Object.entries(checks).filter(([, ok]) => !ok);
console.log(JSON.stringify({ base: BASE, job: JOB_ID, checks, errors, failed: failed.map(([k]) => k), statsPreview: statsText.slice(0, 500) }, null, 2));

await browser.close();
if (failed.length || errors.length) process.exit(1);
