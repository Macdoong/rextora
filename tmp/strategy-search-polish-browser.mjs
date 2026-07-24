/**
 * Real-browser product polish validation for Strategy Search.
 * Run against a live Next server (default http://127.0.0.1:3011).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.REXTORA_BASE || "http://127.0.0.1:3011";
const SAFE = path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json");
const before = fs.readFileSync(SAFE);
const beforeHash = crypto.createHash("sha256").update(before).digest("hex");

const report = {
  base: BASE,
  ok: false,
  steps: [],
  consoleErrors: [],
  pageErrors: [],
  networkFailures: [],
  safeBefore: beforeHash,
  safeAfter: null,
  safeUnchanged: false,
};

function step(name, detail) {
  report.steps.push({ name, detail, at: new Date().toISOString() });
  console.log("STEP", name, detail ?? "");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => report.pageErrors.push(String(err)));
page.on("response", (res) => {
  if (res.url().includes("strategy-search") && res.status() >= 400) {
    report.networkFailures.push(`${res.status()} ${res.url()}`);
  }
});

try {
  await page.goto(`${BASE}/strategy-search`, { waitUntil: "networkidle" });
  step("load", await page.title());

  await page.getByTestId("strategy-search-page").waitFor();
  await page.getByTestId("strategy-search-create").waitFor();
  step("create-form", "visible");

  // Default screen should NOT show engineering advanced fields until expanded
  const seedVisible = await page.getByTestId("ss-seed").isVisible().catch(() => false);
  step("advanced-collapsed", seedVisible === false);

  const bodyText = await page.locator("body").innerText();
  const banned = [
    "paramsHash",
    "checkpoint",
    "Unique Evaluation",
    "Duplicate Exhausted",
    "계산되지 않음",
    "검색 공간 소진",
  ];
  const foundBanned = banned.filter((b) => bodyText.includes(b));
  step("no-engineering-copy", foundBanned.length === 0 ? "clean" : foundBanned.join(","));

  // Expected operator labels
  for (const label of ["연구 목표 설정", "탐색 목표", "마켓", "타임프레임", "분석 기간", "탐색 깊이", "합격 목표", "고급 설정", "탐색 시작"]) {
    if (!bodyText.includes(label)) throw new Error(`missing label: ${label}`);
  }
  step("operator-labels", "ok");

  // History columns
  for (const col of ["탐색 이름", "마켓", "타임프레임", "합격", "최고 수익", "상태"]) {
    if (!bodyText.includes(col)) throw new Error(`missing history col: ${col}`);
  }
  step("history-columns", "ok");

  // Expand advanced — engine fields appear
  await page.getByTestId("ss-advanced-toggle").click();
  await page.getByTestId("ss-seed").waitFor({ state: "visible" });
  await page.getByTestId("ss-min-winrate").waitFor({ state: "visible" });
  await page.getByTestId("ss-min-score").waitFor({ state: "visible" });
  step("advanced-fields", "seed + research score visible");

  // Screenshot
  const shot = path.join(process.cwd(), "tmp", "strategy-search-polish.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot, fullPage: true });
  step("screenshot", shot);

  const after = fs.readFileSync(SAFE);
  report.safeAfter = crypto.createHash("sha256").update(after).digest("hex");
  report.safeUnchanged = Buffer.compare(before, after) === 0;
  step("safe", report.safeUnchanged ? "unchanged" : "CHANGED");

  report.ok =
    report.safeUnchanged &&
    foundBanned.length === 0 &&
    report.pageErrors.length === 0 &&
    report.consoleErrors.filter((e) => !e.includes("favicon")).length === 0;

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
} finally {
  await browser.close();
}
