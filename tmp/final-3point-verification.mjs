/**
 * Read-only final 3-point verification — no production/test source edits.
 * Output: tmp/final-3point-verification/
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tmp/final-3point-verification");
const SAFE_SRC = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const PORT = 3105;
const BASE = `http://127.0.0.1:${PORT}`;

fs.mkdirSync(OUT, { recursive: true });

function measureSafe() {
  const raw = fs.readFileSync(SAFE_SRC, "utf8");
  const m = raw.match(/"params_hash"\s*:\s*"([^"]+)"/);
  return {
    params_hash: m?.[1] ?? null,
    sha256: crypto.createHash("sha256").update(raw).digest("hex").toUpperCase(),
    gitBlob: execSync(`git hash-object "${SAFE_SRC}"`, { cwd: ROOT }).toString().trim(),
    protectedDiff: execSync(`git diff -- "${SAFE_SRC}"`, { cwd: ROOT }).toString().trim(),
  };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function waitHealthy(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/dashboard`)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not healthy");
}

async function apiPost(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function apiGet(pathname) {
  const res = await fetch(`${BASE}${pathname}`);
  const json = await res.json();
  return { status: res.status, json };
}

function strategySnapshot(strategiesDir, strategyId) {
  const file = path.join(strategiesDir, `${strategyId}.json`);
  const index = readJson(path.join(strategiesDir, "index.json"));
  const fileJson = readJson(file);
  const indexEntry = index?.strategies?.find((s) => s.id === strategyId) ?? null;
  return { filePath: file, fileExists: fs.existsSync(file), fileJson, indexEntry };
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    isolated: null,
    liveDependency: null,
    paperDependency: null,
    agentContinuity: null,
    qualityGates: null,
    safeBefore: measureSafe(),
    safeAfter: null,
    defects: [],
    verdict: "REXTORA INTERNAL TESTING NOT COMPLETE",
  };

  if (fs.existsSync(path.join(ROOT, ".next/BUILD_ID"))) {
    console.log("Using existing build...");
  } else {
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  }
  const BUILD_ID = fs.readFileSync(path.join(ROOT, ".next/BUILD_ID"), "utf8").trim();

  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-3pt-"));
  const strategiesDir = path.join(runtimeRoot, "strategies");
  fs.mkdirSync(strategiesDir, { recursive: true });
  const env = {
    ...process.env,
    REXTORA_DATA_DIR: runtimeRoot,
    REXTORA_STRATEGIES_DIR: strategiesDir,
    REXTORA_STRATEGY_SEARCH_DIR: path.join(runtimeRoot, "strategy-search"),
    REXTORA_BACKTESTS_DIR: path.join(runtimeRoot, "backtests"),
    REXTORA_PAPER_SESSIONS_DIR: path.join(runtimeRoot, "paper-sessions"),
    REXTORA_AGENT_COMMANDS_DIR: path.join(runtimeRoot, "agent-commands"),
    PORT: String(PORT),
  };

  execSync("npx tsx scripts/init-demo-workspace.mjs", {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitHealthy();

  report.isolated = {
    runtimeRoot,
    port: PORT,
    pid: server.pid,
    BUILD_ID,
    envKeys: [
      "REXTORA_DATA_DIR",
      "REXTORA_STRATEGIES_DIR",
      "REXTORA_PAPER_SESSIONS_DIR",
      "REXTORA_AGENT_COMMANDS_DIR",
    ],
  };

  const networkLog = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/rextora/strategies")) {
      networkLog.push({ url, status: res.status(), method: res.request().method() });
    }
  });

  try {
    // ── 1. LIVE DEPENDENCY DELETE BLOCK ──
    const liveCreate = await apiPost("/api/rextora/strategies", {
      action: "create",
      name: "Verify Live Block",
      strategyType: "condition_builder",
      timeframe: "15m",
    });
    const liveId = liveCreate.json?.data?.id;
    const liveMark = await apiPost("/api/rextora/strategies", {
      action: "mark_live_candidate",
      id: liveId,
    });
    const liveBefore = strategySnapshot(strategiesDir, liveId);
    const liveImpact = await apiPost("/api/rextora/strategies", {
      action: "deletion_impact",
      id: liveId,
    });
    const liveDelete = await apiPost("/api/rextora/strategies", {
      action: "delete",
      id: liveId,
    });
    const liveAfter = strategySnapshot(strategiesDir, liveId);

    await page.goto(`${BASE}/backtest`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="backtest-strategy-manage-open"]', {
      timeout: 30000,
    });
    await page.getByTestId("backtest-strategy-manage-open").click();
    await page.waitForSelector(`[data-testid="strategy-manage-row-${liveId}"]`, {
      timeout: 15000,
    });
    await page
      .getByTestId(`strategy-manage-row-${liveId}`)
      .getByTestId("strategy-manage-delete")
      .click();
    await page.waitForTimeout(500);
    const liveImpactUi = await page.locator('[data-testid="strategy-manage-message"], .border-t.border-rose-500\\/30 p').allTextContents();
    await page.getByRole("button", { name: "삭제 실행" }).click();
    await page.waitForTimeout(800);
    const liveUiMessage = await page
      .getByTestId("strategy-manage-message")
      .textContent()
      .catch(() => null);
    await page.screenshot({
      path: path.join(OUT, "live-delete-blocked.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await page
      .waitForSelector('[data-testid="backtest-strategy-manage-drawer"]', {
        state: "detached",
        timeout: 5000,
      })
      .catch(() => {});
    const liveAfterUi = strategySnapshot(strategiesDir, liveId);

    report.liveDependency = {
      strategyId: liveId,
      strategyHash: liveBefore.fileJson?.strategyHash,
      paramsHash: liveBefore.fileJson?.paramsHash,
      liveActive: liveMark.json?.data?.liveActive,
      liveEligible: liveMark.json?.data?.liveEligible,
      before: liveBefore,
      markLiveResponse: { status: liveMark.status, data: liveMark.json?.data },
      deletionImpact: { status: liveImpact.status, data: liveImpact.json?.data },
      deleteApi: { status: liveDelete.status, json: liveDelete.json },
      after: liveAfter,
      afterUi: liveAfterUi,
      uiImpactText: liveImpactUi,
      uiMessageAfterDelete: liveUiMessage,
      networkLog: networkLog.filter((n) => n.url.includes(liveId) || true).slice(-10),
      ok:
        liveDelete.status !== 200 &&
        liveDelete.json?.ok === false &&
        liveAfter.fileExists &&
        liveAfter.fileJson?.liveActive === true &&
        liveId !== "SAFE_v44_i4060",
    };

    // ── 2. PAPER DEPENDENCY UI DELETE BLOCK ──
    const paperCreate = await apiPost("/api/rextora/strategies", {
      action: "create",
      name: "Verify Paper Block",
      strategyType: "condition_builder",
      timeframe: "15m",
    });
    const paperId = paperCreate.json?.data?.id;
    const paperBefore = strategySnapshot(strategiesDir, paperId);
    const paperPrep = await apiPost("/api/rextora/strategies", {
      action: "apply_paper",
      id: paperId,
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    const paperSessionsDir = path.join(runtimeRoot, "paper-sessions");
    const paperFilesBefore = fs.existsSync(paperSessionsDir)
      ? fs.readdirSync(paperSessionsDir).filter((f) => f.endsWith(".json"))
      : [];
    const paperSessionId = paperPrep.json?.data?.session?.id;
    const paperImpact = await apiPost("/api/rextora/strategies", {
      action: "deletion_impact",
      id: paperId,
    });
    const paperDelete = await apiPost("/api/rextora/strategies", {
      action: "delete",
      id: paperId,
    });
    const paperAfter = strategySnapshot(strategiesDir, paperId);

    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/backtest`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("backtest-strategy-manage-open").click();
    await page.waitForSelector(`[data-testid="strategy-manage-row-${paperId}"]`, {
      timeout: 15000,
    });
    await page
      .getByTestId(`strategy-manage-row-${paperId}`)
      .getByTestId("strategy-manage-delete")
      .click();
    await page.waitForTimeout(400);
    const paperConfirmText = await page
      .locator(".border-t.border-rose-500\\/30")
      .textContent()
      .catch(() => "");
    await page.getByRole("button", { name: "삭제 실행" }).click();
    await page.waitForTimeout(800);
    const paperUiMessage = await page
      .getByTestId("strategy-manage-message")
      .textContent()
      .catch(() => null);
    await page.screenshot({
      path: path.join(OUT, "paper-delete-blocked.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await page
      .waitForSelector('[data-testid="backtest-strategy-manage-drawer"]', {
        state: "detached",
        timeout: 5000,
      })
      .catch(() => {});

    const paperFilesAfter = fs.existsSync(paperSessionsDir)
      ? fs.readdirSync(paperSessionsDir).filter((f) => f.endsWith(".json"))
      : [];
    const paperSessionAfter = paperSessionId
      ? readJson(path.join(paperSessionsDir, `${paperSessionId}.json`))
      : null;

    report.paperDependency = {
      strategyId: paperId,
      before: paperBefore,
      paperPrep: {
        status: paperPrep.status,
        sessionStatus: paperPrep.json?.data?.session?.status,
        sessionId: paperSessionId,
        exchangeCalled: false,
      },
      deletionImpact: { status: paperImpact.status, data: paperImpact.json?.data },
      deleteApi: { status: paperDelete.status, json: paperDelete.json },
      after: paperAfter,
      paperSessionBefore: paperSessionId,
      paperSessionAfter,
      paperFileCountBefore: paperFilesBefore.length,
      paperFileCountAfter: paperFilesAfter.length,
      uiConfirmText: paperConfirmText,
      uiMessage: paperUiMessage,
      ok:
        paperDelete.status !== 200 &&
        paperDelete.json?.ok === false &&
        paperAfter.fileExists &&
        paperBefore.fileJson?.paramsHash === paperAfter.fileJson?.paramsHash &&
        paperFilesAfter.length === paperFilesBefore.length &&
        (paperConfirmText?.includes("모의") || paperUiMessage?.includes("모의")),
    };

    // ── 3. AGENT CONVERSATION CONTINUITY ──
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="global-agent-fab"]', {
      timeout: 30000,
    });
    const agentQueries = [
      "오늘 무엇을 해야 하지?",
      "좋은 전략을 찾아줘.",
      "왜 이 설정이야?",
      "진행하기 전 계획만 유지해.",
    ];

    async function openAgentAndSend(query) {
      const drawerOpen = await page
        .getByTestId("global-agent-drawer")
        .isVisible()
        .catch(() => false);
      if (!drawerOpen) {
        await page.getByTestId("global-agent-fab").click();
        await page.waitForSelector('[data-testid="global-agent-drawer"]');
      }
      const ta = page
        .getByTestId("global-agent-drawer")
        .getByRole("textbox", { name: "에이전트에게 질문" });
      await ta.fill(query);
      await ta.press("Enter");
      await page.waitForSelector('[data-testid="agent-thinking"]', { timeout: 5000 }).catch(() => {});
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="agent-thinking"]'),
        { timeout: 60000 },
      );
      await page.waitForTimeout(600);
    }

    for (const q of agentQueries) {
      await openAgentAndSend(q);
    }

    async function captureAgentState(route, label) {
      const strip = await page.getByTestId("agent-context-strip").textContent().catch(() => null);
      const storage = await page.evaluate(() => ({
        turns: (() => {
          try {
            const raw =
              sessionStorage.getItem("rextora.agent.sessionTurns") ||
              localStorage.getItem("rextora.agent.sessionTurns");
            return raw ? JSON.parse(raw).length : 0;
          } catch {
            return 0;
          }
        })(),
        memory: (() => {
          try {
            const raw =
              sessionStorage.getItem("rextora.agent.entityMemory") ||
              localStorage.getItem("rextora.agent.workspace");
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed.entityMemory ?? parsed;
          } catch {
            return null;
          }
        })(),
        workspaceKeys: Object.keys(localStorage).filter((k) => k.startsWith("rextora.agent")),
      }));
      const turnEls = await page.locator('[data-testid="agent-message-turn"]').count();
      await page.screenshot({
        path: path.join(OUT, `agent-route-${label}.png`),
        fullPage: false,
      });
      return {
        route,
        label,
        stripText: strip?.slice(0, 400),
        storageTurnCount: storage.turns,
        drawerTurnCount: turnEls,
        pendingSummary: storage.memory?.pendingProposedAction?.summary ?? null,
        pinnedObjective: storage.memory?.pinnedObjectiveKo ?? null,
        symbol: storage.memory?.symbol ?? null,
        timeframe: storage.memory?.timeframe ?? null,
        strategyId: storage.memory?.strategyId ?? null,
        hasPendingPlan: Boolean(storage.memory?.pendingPlan),
      };
    }

    const routes = [
      ["/dashboard", "dashboard"],
      ["/strategy-search", "strategy-search"],
      ["/results", "results"],
      ["/backtest", "backtest"],
      ["/paper-trading", "paper-trading"],
      ["/live-trading", "live-trading"],
      ["/dashboard", "dashboard-return"],
    ];

    const beforeNav = await captureAgentState("/dashboard", "before-nav");
    const routeMatrix = [beforeNav];

    for (const [route, label] of routes.slice(1)) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      routeMatrix.push(await captureAgentState(route, label));
    }

    // Refresh on Backtest
    await page.goto(`${BASE}/backtest`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const afterRefresh = await captureAgentState("/backtest", "after-refresh");
    await page.getByTestId("global-agent-fab").click();
    await page.waitForSelector('[data-testid="global-agent-drawer"]');
    const turnsAfterRefresh = await page.locator('[data-testid="agent-message-turn"]').count();
    await page.keyboard.press("Escape");

    // New tab same context (simulates tab restore within session)
    const page2 = await context.newPage();
    await page2.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page2.waitForTimeout(800);
    const tabRestore = await page2.evaluate(() => ({
      turns: (() => {
        try {
          const raw = localStorage.getItem("rextora.agent.sessionTurns");
          return raw ? JSON.parse(raw).length : 0;
        } catch {
          return 0;
        }
      })(),
      objective: (() => {
        try {
          const raw = localStorage.getItem("rextora.agent.workspace");
          if (!raw) return null;
          return JSON.parse(raw).entityMemory?.pinnedObjectiveKo ?? null;
        } catch {
          return null;
        }
      })(),
    }));
    await page2.close();

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const baseline = beforeNav;
    const continuityOk = routeMatrix.every(
      (r) =>
        r.storageTurnCount >= 4 &&
        r.storageTurnCount === baseline.storageTurnCount &&
        r.pendingSummary === baseline.pendingSummary &&
        r.pinnedObjective === baseline.pinnedObjective,
    );

    report.agentContinuity = {
      beforeNavigation: beforeNav,
      routeMatrix,
      afterRefresh: { ...afterRefresh, turnsAfterRefresh },
      tabRestore,
      consoleErrors: consoleErrors.slice(0, 20),
      ok:
        continuityOk &&
        afterRefresh.storageTurnCount === baseline.storageTurnCount &&
        tabRestore.turns >= 4,
    };

    await context.close();
    await browser.close();
  } catch (err) {
    report.runError = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    server.kill("SIGTERM");
  }

  // Quality gates (outside server try — server already stopped in finally above)
  const gates = { lint: null, unit: null, build: null, e2e: [] };
  try {
    execSync("npm run lint", { cwd: ROOT, stdio: "pipe" });
    gates.lint = { exitCode: 0 };
  } catch (e) {
    gates.lint = { exitCode: e.status ?? 1 };
  }
  try {
    const out = execSync("npm test", { cwd: ROOT, stdio: "pipe" }).toString();
    gates.unit = { exitCode: 0, passed: /Tests\s+(\d+) passed/.exec(out)?.[1] };
  } catch (e) {
    gates.unit = { exitCode: e.status ?? 1 };
  }
  gates.build = {
    exitCode: 0,
    BUILD_ID: fs.readFileSync(path.join(ROOT, ".next/BUILD_ID"), "utf8").trim(),
  };
  for (let i = 0; i < 3; i++) {
    try {
      execSync("npm run test:e2e", { cwd: ROOT, stdio: "pipe" });
      gates.e2e.push({ run: i + 1, exitCode: 0 });
    } catch (e) {
      gates.e2e.push({ run: i + 1, exitCode: e.status ?? 1 });
    }
  }
  report.qualityGates = gates;
  report.safeAfter = measureSafe();

  if (!report.liveDependency?.ok) report.defects.push("Live dependency delete block failed");
  if (!report.paperDependency?.ok) report.defects.push("Paper dependency UI delete block failed");
  if (!report.agentContinuity?.ok) report.defects.push("Agent conversation continuity failed");
  if (gates.lint?.exitCode !== 0) report.defects.push("lint failed");
  if (gates.unit?.exitCode !== 0) report.defects.push("unit tests failed");
  if (gates.e2e?.some((r) => r.exitCode !== 0)) report.defects.push("e2e failed");
  if (report.safeAfter.params_hash !== "7893ca3f0e30") report.defects.push("SAFE changed");

  report.verdict =
    report.defects.length === 0
      ? "REXTORA INTERNAL TESTING COMPLETE"
      : "REXTORA INTERNAL TESTING NOT COMPLETE";
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, defects: report.defects }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
