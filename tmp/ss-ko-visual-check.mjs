import { chromium } from "playwright";

const BASE = process.env.REXTORA_BASE || "http://127.0.0.1:3000";
const forbidden = [
  "AI Strategy Research",
  "AI Research",
  "Research Goal",
  "Research Name",
  "Research Depth",
  "Approval Goal",
  "Approved Strategies",
  "Min Trades",
  "Min Return",
  "Max Loss (%)",
  "Advanced Settings",
  "Research Budget",
  "Cost Validation",
  "Stability Validation",
  "Expert Conditions",
  "Min Win Rate",
  "Min Internal Score",
  "Start Research",
  "Approved strategies will appear",
  "Start New Research",
  "Open Strategy Management",
  "Technical Details",
];

const required = [
  "전략 탐색",
  "탐색 목표 설정",
  "탐색 이름",
  "탐색 수준",
  "합격 기준",
  "고급 설정",
  "탐색 시작",
  "합격 전략 대기 중",
  "탐색을 시작하면 기준을 통과한 전략이 이곳에 표시됩니다.",
  "탐색 기록",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  await page.goto(`${BASE}/strategy-search`, { waitUntil: "networkidle" });
  await page.getByTestId("strategy-search-page").waitFor();
  const body = await page.locator("body").innerText();

  const missing = required.filter((s) => !body.includes(s));
  const foundEn = forbidden.filter((s) => body.includes(s));

  // Advanced collapsed: seed not visible
  const seedVisible = await page.getByTestId("ss-seed").isVisible().catch(() => false);

  // Expand advanced and check group titles
  await page.getByTestId("ss-advanced-toggle").click();
  await page.getByTestId("ss-seed").waitFor({ state: "visible", timeout: 5000 });
  const adv = await page.locator("body").innerText();
  const groups = ["데이터", "실행 제한", "비용 검증", "안정성 검증", "전문가 조건"];
  const missingGroups = groups.filter((g) => !adv.includes(g));

  // Sidebar
  const nav = await page
    .getByTestId("main-nav")
    .getByText("전략 탐색", { exact: true })
    .isVisible();

  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  });

  const report = {
    ok:
      missing.length === 0 &&
      foundEn.length === 0 &&
      !seedVisible &&
      missingGroups.length === 0 &&
      nav &&
      !overflow &&
      errors.filter((e) => !e.includes("favicon")).length === 0,
    missing,
    foundEn,
    advancedCollapsedInitially: !seedVisible,
    missingGroups,
    sidebarKo: nav,
    horizontalOverflow: overflow,
    consoleErrors: errors.filter((e) => !e.includes("favicon")),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
} finally {
  await browser.close();
}
