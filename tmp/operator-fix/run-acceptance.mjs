import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("tmp/operator-fix/acceptance");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3000";
const report = {
  buildId: fs.readFileSync(".next/BUILD_ID", "utf8").trim(),
  startedAt: new Date().toISOString(),
  cases: [],
};

function log(name, data) {
  report.cases.push({ name, ...data, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, ok: data.ok }));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const runsRes = await page.request.get(`${BASE}/api/rextora/backtest/run?limit=5`);
const runsJson = await runsRes.json();
const run = (runsJson.data || [])[0];
const strategyId = run?.strategyId;
const runId = run?.id;
const symbol = run?.report?.symbol || "BTCUSDT";
const btUrl = `${BASE}/backtest?strategyId=${encodeURIComponent(strategyId)}&runId=${encodeURIComponent(runId)}&symbol=${encodeURIComponent(symbol)}`;

await page.goto(btUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('[data-testid="analysis-section-nav"]', {
  timeout: 30000,
});
await page.waitForTimeout(1200);
await page.screenshot({
  path: path.join(OUT, "01-backtest-1440.png"),
  fullPage: false,
});

const tabs = [
  "차트",
  "거래",
  "월별",
  "비용",
  "자산·낙폭",
  "타임라인",
  "상세 분석",
  "검증",
];
const tabOscillation = [];
for (const label of tabs) {
  const btn = page
    .locator('[data-testid="analysis-section-nav"] button', { hasText: label })
    .first();
  await btn.click();
  await page.waitForTimeout(350);
  const before = await page.evaluate(() => ({
    active: document
      .querySelector("[data-active-section]")
      ?.getAttribute("data-active-section"),
    aria: document
      .querySelector(
        '[data-testid="analysis-section-nav"] [aria-current="true"]',
      )
      ?.textContent?.trim(),
  }));
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    active: document
      .querySelector("[data-active-section]")
      ?.getAttribute("data-active-section"),
    aria: document
      .querySelector(
        '[data-testid="analysis-section-nav"] [aria-current="true"]',
      )
      ?.textContent?.trim(),
    visibleExclusive: [
      ...document.querySelectorAll(
        '[data-workspace-tab="true"][data-tab-active="true"]',
      ),
    ].map((el) => el.getAttribute("data-section")),
  }));
  const flipped =
    (before.active && after.active && before.active !== after.active) ||
    (before.aria && after.aria && before.aria !== after.aria);
  tabOscillation.push({ label, before, after, flipped });
}
await page.screenshot({
  path: path.join(OUT, "02-backtest-after-scroll-1440.png"),
  fullPage: false,
});
log("backtest_tab_stability", {
  ok: tabOscillation.every((t) => !t.flipped),
  oscCount: tabOscillation.filter((t) => t.flipped).length,
  strategyId,
  runId,
  url: btUrl,
  tabOscillation,
});

const manageOpen = page.getByTestId("backtest-strategy-manage-open");
await manageOpen.click();
await page.waitForSelector('[data-testid="backtest-strategy-manage-drawer"]', {
  timeout: 10000,
});
await page.screenshot({
  path: path.join(OUT, "03-strategy-manage-1440.png"),
  fullPage: false,
});
const rowCount = await page.locator('[data-testid^="strategy-manage-row-"]').count();
const safeRow = page.getByTestId("strategy-manage-row-SAFE_v44_i4060");
const safeHasDelete = await safeRow
  .locator('[data-testid="strategy-manage-delete"]')
  .count();
await page.keyboard.press("Escape");
log("strategy_management", {
  ok: rowCount > 0 && safeHasDelete === 0,
  rowCount,
  safeDeleteBlocked: safeHasDelete === 0,
});

for (const vp of [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
]) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(`${BASE}/strategy-search`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document
      .querySelector(".rextora-sticky-actions")
      ?.scrollIntoView({ block: "end" });
  });
  await page.waitForTimeout(400);
  const metrics = await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="global-agent-fab"]');
    const sticky = document.querySelector(".rextora-sticky-actions");
    const cta =
      sticky?.querySelector("button") ||
      [...document.querySelectorAll("button")].find((b) =>
        /연구 시작/.test(b.textContent || ""),
      );
    const fabBox = fab?.getBoundingClientRect();
    const ctaBox = cta?.getBoundingClientRect();
    let overlap = false;
    if (fabBox && ctaBox) {
      overlap = !(
        fabBox.right < ctaBox.left ||
        fabBox.left > ctaBox.right ||
        fabBox.bottom < ctaBox.top ||
        fabBox.top > ctaBox.bottom
      );
    }
    return {
      fabMode: fab?.getAttribute("data-fab-mode"),
      fab: fabBox
        ? {
            top: +fabBox.top.toFixed(1),
            bottom: +fabBox.bottom.toFixed(1),
            right: +fabBox.right.toFixed(1),
          }
        : null,
      cta: ctaBox
        ? {
            top: +ctaBox.top.toFixed(1),
            bottom: +ctaBox.bottom.toFixed(1),
            right: +ctaBox.right.toFixed(1),
            text: (cta?.textContent || "").trim(),
          }
        : null,
      overlap,
    };
  });
  await page.screenshot({
    path: path.join(OUT, `04-fab-${vp.w}.png`),
    fullPage: false,
  });
  log(`fab_collision_${vp.w}`, {
    ok: !metrics.overlap && !!metrics.cta,
    ...metrics,
    viewport: vp,
  });
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/dashboard`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(800);
await page.getByTestId("global-agent-fab").click();
await page.waitForSelector('[data-testid="global-agent-drawer"]');
await page.waitForTimeout(400);
const drawerBox = await page
  .getByTestId("global-agent-drawer")
  .boundingBox();
const detailsOpen = await page.getByTestId("agent-details-panel").count();
await page.screenshot({
  path: path.join(OUT, "05-agent-drawer-1440.png"),
  fullPage: false,
});
log("agent_drawer", {
  ok: !!drawerBox && drawerBox.width <= 560 && detailsOpen === 0,
  drawerWidth: drawerBox?.width,
  detailsCollapsed: detailsOpen === 0,
});

const agentPlan = await page.request.post(`${BASE}/api/rextora/agent`, {
  data: {
    query: "이 설정으로 탐색 시작해",
    history: [],
    context: { page: "strategy-search", symbol: "BTCUSDT", timeframe: "15m" },
  },
});
const planBody = await agentPlan.json();
const typed =
  planBody?.plan?.typedCommand ||
  planBody?.entityMemory?.pendingPlan?.typedCommand;
log("ai_search_plan", {
  ok: !!typed && typed.commandType === "create_strategy_search_job",
  intent: planBody?.intentType,
  commandType: typed?.commandType,
});

let jobId = null;
if (typed) {
  const approve1 = await page.request.post(`${BASE}/api/rextora/agent`, {
    data: {
      query: "진행해",
      history: [],
      context: { page: "strategy-search" },
      entityMemory: {
        ...(planBody.entityMemory || {}),
        pendingPlan: planBody.plan || planBody.entityMemory?.pendingPlan,
      },
    },
  });
  const a1 = await approve1.json();
  jobId = a1?.executionResult?.jobId;
  log("ai_search_execute", {
    ok:
      !!jobId &&
      ["succeeded", "skipped_idempotent"].includes(
        a1?.executionResult?.executionStatus,
      ),
    jobId,
    executionStatus: a1?.executionResult?.executionStatus,
    summaryKo: a1?.executionResult?.summaryKo,
  });
  const approve2 = await page.request.post(`${BASE}/api/rextora/agent`, {
    data: {
      query: "진행해",
      history: [],
      context: { page: "strategy-search" },
      entityMemory: {
        pendingPlan: { ...(planBody.plan || {}), typedCommand: typed },
      },
    },
  });
  const a2 = await approve2.json();
  log("ai_search_idempotent", {
    ok:
      a2?.executionResult?.alreadyExecuted === true ||
      a2?.executionResult?.executionStatus === "skipped_idempotent" ||
      a2?.executionResult?.jobId === jobId,
    status2: a2?.executionResult?.executionStatus,
    jobId2: a2?.executionResult?.jobId,
    alreadyExecuted: a2?.executionResult?.alreadyExecuted,
  });
}

const btPlanRes = await page.request.post(`${BASE}/api/rextora/agent`, {
  data: {
    query: "백테스트 실행해",
    history: [],
    context: { page: "backtest", strategyId, symbol, timeframe: "15m" },
    entityMemory: { strategyId, symbol },
  },
});
const btPlan = await btPlanRes.json();
const btTyped =
  btPlan?.plan?.typedCommand || btPlan?.entityMemory?.pendingPlan?.typedCommand;
log("ai_backtest_plan", {
  ok: !!btTyped && btTyped.commandType === "run_backtest",
  intent: btPlan?.intentType,
  commandType: btTyped?.commandType,
  strategyId: btTyped?.strategyId,
});
if (btTyped) {
  const btExecRes = await page.request.post(`${BASE}/api/rextora/agent`, {
    data: {
      query: "진행해",
      history: [],
      context: { page: "backtest", strategyId },
      entityMemory: {
        ...(btPlan.entityMemory || {}),
        pendingPlan: btPlan.plan || btPlan.entityMemory?.pendingPlan,
      },
    },
  });
  const btExec = await btExecRes.json();
  log("ai_backtest_execute", {
    ok:
      !!btExec?.executionResult?.runId &&
      ["succeeded", "skipped_idempotent"].includes(
        btExec?.executionResult?.executionStatus,
      ),
    runId: btExec?.executionResult?.runId,
    executionStatus: btExec?.executionResult?.executionStatus,
    summaryKo: btExec?.executionResult?.summaryKo,
  });
}

const paperPlanRes = await page.request.post(`${BASE}/api/rextora/agent`, {
  data: {
    query: "이 전략 Paper로 준비해",
    history: [],
    context: { page: "results", strategyId, backtestRunId: runId },
    entityMemory: { strategyId, backtestRunId: runId },
  },
});
const paperPlan = await paperPlanRes.json();
const paperTyped =
  paperPlan?.plan?.typedCommand ||
  paperPlan?.entityMemory?.pendingPlan?.typedCommand;
log("ai_paper_plan", {
  ok: !!paperTyped && paperTyped.commandType === "prepare_paper_session",
  intent: paperPlan?.intentType,
  commandType: paperTyped?.commandType,
});
if (paperTyped) {
  const paperExecRes = await page.request.post(`${BASE}/api/rextora/agent`, {
    data: {
      query: "진행해",
      history: [],
      context: { page: "paper-trading", strategyId },
      entityMemory: {
        ...(paperPlan.entityMemory || {}),
        pendingPlan: paperPlan.plan || paperPlan.entityMemory?.pendingPlan,
      },
    },
  });
  const paperExec = await paperExecRes.json();
  let exchangeCalled = null;
  let paperStatus = null;
  const cmdId = paperExec?.executionResult?.commandId;
  if (cmdId) {
    try {
      const cmd = JSON.parse(
        fs.readFileSync(`data/rextora/agent-commands/${cmdId}.json`, "utf8"),
      );
      exchangeCalled = cmd?.parameters?.exchangeCalled;
      paperStatus = cmd?.parameters?.paperStatus;
    } catch {
      // ignore
    }
  }
  const paperRef = paperExec?.executionResult?.resultReference || "";
  log("ai_paper_execute", {
    ok:
      ["succeeded", "skipped_idempotent"].includes(
        paperExec?.executionResult?.executionStatus,
      ) &&
      paperRef.startsWith("paper:") &&
      (exchangeCalled === false ||
        exchangeCalled == null ||
        paperExec?.executionResult?.alreadyExecuted === true) &&
      (paperStatus === "pending_approval" ||
        paperStatus === "ready" ||
        paperStatus == null ||
        /pending_approval|승인|이미 실행/.test(
          paperExec?.executionResult?.summaryKo || "",
        )),
    executionStatus: paperExec?.executionResult?.executionStatus,
    resultReference: paperRef,
    exchangeCalled,
    paperStatus,
    summaryKo: paperExec?.executionResult?.summaryKo,
  });
}

const liveAsk = await page.request.post(`${BASE}/api/rextora/agent`, {
  data: {
    query: "지금 Live 시작해",
    history: [],
    context: { page: "live-trading" },
  },
});
const liveBody = await liveAsk.json();
const buyAsk = await page.request.post(`${BASE}/api/rextora/agent`, {
  data: {
    query: "BTC 시장가 매수해",
    history: [],
    context: { page: "live-trading" },
  },
});
const buyBody = await buyAsk.json();
log("safety_live_blocked", {
  ok: !liveBody?.executionResult,
  intent: liveBody?.intentType,
  safetyBlocked: liveBody?.safetyBlocked,
});
log("safety_order_blocked", {
  ok: !buyBody?.executionResult,
  intent: buyBody?.intentType,
  safetyBlocked: buyBody?.safetyBlocked,
});

report.consoleErrors = consoleErrors.slice(0, 40);
report.finishedAt = new Date().toISOString();
report.ok = report.cases.every((c) => c.ok);
fs.writeFileSync(
  path.join(OUT, "acceptance-report.json"),
  JSON.stringify(report, null, 2),
);
console.log("ACCEPTANCE_OK", report.ok);
console.log(
  "FAILED",
  report.cases.filter((c) => !c.ok).map((c) => c.name),
);
await browser.close();
process.exit(report.ok ? 0 : 2);
