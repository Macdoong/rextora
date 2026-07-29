/**
 * Paper SSOT browser acceptance — isolated runtime, production server.
 * Viewports: 390, 768, 1024, 1440
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tmp", "paper-ssot-acceptance");
fs.mkdirSync(OUT, { recursive: true });

const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-ssot-rt-"));
process.env.REXTORA_DATA_DIR = runtime;
process.env.REXTORA_STRATEGIES_DIR = path.join(runtime, "strategies");
process.env.REXTORA_PAPER_SESSIONS_DIR = path.join(runtime, "paper-sessions");
process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(runtime, "strategy-search");
process.env.REXTORA_BACKTESTS_DIR = path.join(runtime, "backtests");
for (const d of [
  process.env.REXTORA_STRATEGIES_DIR,
  process.env.REXTORA_PAPER_SESSIONS_DIR,
  process.env.REXTORA_STRATEGY_SEARCH_DIR,
  process.env.REXTORA_BACKTESTS_DIR,
]) {
  fs.mkdirSync(d, { recursive: true });
}

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { w: 390, h: 844, tag: "390" },
  { w: 768, h: 1024, tag: "768" },
  { w: 1024, h: 900, tag: "1024" },
  { w: 1440, h: 1000, tag: "1440" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/dashboard`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error("server not ready");
}

async function agentPaperFacts() {
  const res = await fetch(`${BASE}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "paper status", sessionId: "acceptance" }),
  });
  return res.json().catch(() => null);
}

const report = {
  buildId: fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))
    ? fs.readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim()
    : null,
  runtime,
  steps: [],
  ok: false,
};

const server = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)],
  {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

try {
  await waitReady();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const strategiesRes = await fetch(`${BASE}/api/rextora/strategies`);
  const strategiesJson = await strategiesRes.json();
  const strategies = strategiesJson.data ?? [];
  let strategy =
    strategies.find((s) => !s.locked && s.id !== "SAFE_v44_i4060") ??
    strategies.find((s) => !s.locked) ??
    strategies[0];
  if (!strategy?.id) throw new Error("no strategy available for paper test");
  if (strategy.id === "SAFE_v44_i4060" || strategy.locked) {
    const primaryCopy = await fetch(`${BASE}/api/rextora/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "copy",
        id: strategy.id,
        name: "paper_ssot_primary_copy",
      }),
    }).then((r) => r.json());
    if (!primaryCopy.ok || !primaryCopy.data?.id) {
      throw new Error(`primary strategy copy failed: ${JSON.stringify(primaryCopy)}`);
    }
    strategy = primaryCopy.data;
  }

  // Ensure a distinct second strategy exists for conflict URL / restart tests.
  let other =
    strategies.find((s) => s.id !== strategy.id && !s.locked) ?? null;
  if (!other) {
    const copyRes = await fetch(`${BASE}/api/rextora/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "copy",
        id: strategy.id,
        name: "paper_ssot_conflict_copy",
      }),
    });
    const copyJson = await copyRes.json();
    if (!copyJson.ok || !copyJson.data?.id) {
      throw new Error(`strategy copy failed: ${JSON.stringify(copyJson)}`);
    }
    other = copyJson.data;
  }

  // 1) Results apply_paper — must create pending_approval session
  const applyRes = await fetch(`${BASE}/api/rextora/strategies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply_paper", id: strategy.id, symbol: "BTCUSDT" }),
  });
  const applyJson = await applyRes.json();
  report.steps.push({ step: "results_apply_paper", applyJson });
  if (!applyJson.ok) throw new Error(`apply_paper failed: ${JSON.stringify(applyJson)}`);
  const sessionId = applyJson.data?.session?.id;
  if (!sessionId) throw new Error("apply_paper missing session");
  if (applyJson.data.session.status !== "pending_approval") {
    throw new Error(`expected pending_approval, got ${applyJson.data.session.status}`);
  }
  if (!applyJson.data.paperApprovalDeepLink?.includes(strategy.id)) {
    throw new Error("missing paperApprovalDeepLink");
  }

  // Dashboard + Results after apply
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "01-dashboard-pending-1440.png") });
  await page.goto(`${BASE}/results`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "02-results-pending-1440.png") });

  const activeBefore = await fetch(`${BASE}/api/rextora/paper/session?active=1`).then((r) =>
    r.json(),
  );
  report.steps.push({ step: "active_before_approve", activeBefore });
  report.steps.push({ step: "agent_before_approve", agent: await agentPaperFacts() });

  // Navigate paper page — no auto start
  await page.goto(
    `${BASE}/paper-trading?strategyId=${encodeURIComponent(strategy.id)}&sessionId=${encodeURIComponent(sessionId)}`,
    { waitUntil: "networkidle" },
  );
  await page.screenshot({ path: path.join(OUT, "03-paper-pending-1440.png") });
  const metricsUnavailable = await page
    .locator('[data-testid="paper-session-metrics-unavailable"]')
    .count();
  if (metricsUnavailable < 1) {
    throw new Error("pending session should show metrics unavailable state");
  }

  // Legacy restart must reject pending
  const restartPending = await fetch(`${BASE}/api/bot/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then((r) => r.json());
  report.steps.push({ step: "legacy_restart_pending", restartPending });
  if (restartPending.ok) throw new Error("legacy restart must reject pending session");
  if (restartPending.errorCode !== "SESSION_PENDING_APPROVAL") {
    throw new Error(`expected SESSION_PENDING_APPROVAL, got ${restartPending.errorCode}`);
  }

  // Approve+start
  const approveRes = await fetch(
    `${BASE}/api/rextora/paper/session/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", strategyId: strategy.id }),
    },
  );
  const approveJson = await approveRes.json();
  report.steps.push({ step: "approve", approveJson });
  if (approveJson.data?.session?.status !== "active") {
    throw new Error(`approve failed: ${JSON.stringify(approveJson)}`);
  }
  if (approveJson.data.session.exchangeCalled !== false) {
    throw new Error("exchangeCalled must be false");
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "04-paper-active-1440.png") });

  // Legacy restart matching session
  const restartActive = await fetch(`${BASE}/api/bot/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategyId: strategy.id }),
  }).then((r) => r.json());
  report.steps.push({ step: "legacy_restart_active_match", restartActive });
  if (!restartActive.ok) throw new Error(`active restart failed: ${JSON.stringify(restartActive)}`);

  // Legacy restart conflicting strategy
  const restartConflict = await fetch(`${BASE}/api/bot/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategyId: other.id }),
  }).then((r) => r.json());
  report.steps.push({ step: "legacy_restart_conflict", restartConflict });
  if (restartConflict.ok) throw new Error("conflicting strategy restart must fail");
  if (restartConflict.errorCode !== "STRATEGY_MISMATCH") {
    throw new Error(`expected STRATEGY_MISMATCH, got ${restartConflict.errorCode}`);
  }

  // Pause
  const pauseRes = await fetch(
    `${BASE}/api/rextora/paper/session/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause", strategyId: strategy.id }),
    },
  );
  const pauseJson = await pauseRes.json();
  report.steps.push({ step: "pause", pauseJson });
  if (pauseJson.data?.session?.status !== "paused") throw new Error("pause failed");

  const restartPaused = await fetch(`${BASE}/api/bot/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategyId: strategy.id }),
  }).then((r) => r.json());
  report.steps.push({ step: "legacy_restart_paused", restartPaused });
  if (restartPaused.ok) throw new Error("paused restart must fail");
  if (restartPaused.errorCode !== "SESSION_PAUSED") {
    throw new Error(`expected SESSION_PAUSED, got ${restartPaused.errorCode}`);
  }

  // Persist check
  const diskFiles = fs.readdirSync(process.env.REXTORA_PAPER_SESSIONS_DIR);
  const sessionFile = diskFiles.find((f) => f.startsWith(sessionId) && f.endsWith(".json"));
  const persisted = sessionFile
    ? JSON.parse(
        fs.readFileSync(
          path.join(process.env.REXTORA_PAPER_SESSIONS_DIR, sessionFile),
          "utf8",
        ),
      )
    : null;
  report.steps.push({ step: "persisted_paused", persisted });
  if (persisted?.status !== "paused") throw new Error("disk status not paused");

  // Recovery
  const recoverRes = await fetch(`${BASE}/api/rextora/paper/session?recover=1`).then((r) =>
    r.json(),
  );
  report.steps.push({ step: "recover", recoverRes });
  if (recoverRes.data?.active?.status !== "paused") {
    throw new Error("paused must remain paused after recover");
  }

  // Resume
  const resumeRes = await fetch(
    `${BASE}/api/rextora/paper/session/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume", strategyId: strategy.id }),
    },
  );
  const resumeJson = await resumeRes.json();
  report.steps.push({ step: "resume", resumeJson });

  // Conflicting strategy URL
  await page.goto(
    `${BASE}/paper-trading?strategyId=${encodeURIComponent(other.id)}`,
    { waitUntil: "networkidle" },
  );
  await page.screenshot({ path: path.join(OUT, "05-paper-conflict-url-1440.png") });
  const idOnPage = await page.locator('[data-testid="paper-strategy-id"]').textContent();
  if (idOnPage?.trim() !== strategy.id) {
    report.steps.push({
      step: "conflict_url_blocked",
      shown: idOnPage,
      expected: strategy.id,
    });
  }

  // Stop
  const stopRes = await fetch(
    `${BASE}/api/rextora/paper/session/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", strategyId: strategy.id }),
    },
  );
  const stopJson = await stopRes.json();
  report.steps.push({ step: "stop", stopJson });
  if (stopJson.data?.session?.status !== "stopped") throw new Error("stop failed");

  const restartStopped = await fetch(`${BASE}/api/bot/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then((r) => r.json());
  report.steps.push({ step: "legacy_restart_stopped", restartStopped });
  if (restartStopped.ok) throw new Error("stopped/no-session restart must fail");

  // Final restart recovery
  const recoverFinal = await fetch(`${BASE}/api/rextora/paper/session?recover=1`).then((r) =>
    r.json(),
  );
  report.steps.push({ step: "recover_final", recoverFinal });
  const recoveredStopped = recoverFinal.data?.recovery?.recovered?.find(
    (s) => s.id === sessionId,
  );
  if (recoveredStopped?.status !== "stopped") {
    throw new Error("stopped must remain stopped after final recover");
  }
  if (recoverFinal.data?.active != null) {
    throw new Error("stopped session must not appear as active after recover");
  }

  report.steps.push({ step: "agent_final", agent: await agentPaperFacts() });

  // Viewport sweeps
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${BASE}/paper-trading`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 2;
    });
    if (overflow) throw new Error(`horizontal overflow at ${vp.tag}px`);
    await page.screenshot({
      path: path.join(OUT, `06-paper-stopped-${vp.tag}.png`),
    });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(OUT, `07-dashboard-stopped-${vp.tag}.png`),
    });
  }

  report.consoleErrors = errors;
  report.ok =
    errors.length === 0 &&
    stopJson.data.session.status === "stopped" &&
    approveJson.data.session.exchangeCalled === false &&
    applyJson.data.session.status === "pending_approval";

  await browser.close();
} catch (err) {
  report.ok = false;
  report.error = err instanceof Error ? err.message : String(err);
} finally {
  server.kill("SIGTERM");
  await sleep(1000);
  try {
    server.kill("SIGKILL");
  } catch {
    // ignore
  }
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, out: OUT, error: report.error ?? null }, null, 2));
process.exit(report.ok ? 0 : 1);
