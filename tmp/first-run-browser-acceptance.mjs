/**
 * First-run browser acceptance against production build + isolated empty runtime.
 * Does NOT touch data/rextora of the operator checkout.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const ROOT = process.cwd();
const BUILD_ID = fs.readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, "tmp", "first-run-acceptance");
const SAFE = path.join(ROOT, "data", "strategies", "SAFE_v44_i4060.json");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function waitHealthy(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/dashboard`);
      if (res.ok || res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become healthy");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-firstrun-browser-"));
  const strategiesDir = path.join(runtimeRoot, "strategies");
  fs.mkdirSync(strategiesDir, { recursive: true });

  const safeBefore = {
    sha256: sha256(SAFE),
    size: fs.statSync(SAFE).size,
  };

  const env = {
    ...process.env,
    REXTORA_DATA_DIR: runtimeRoot,
    REXTORA_STRATEGIES_DIR: strategiesDir,
    REXTORA_PAPER_SESSIONS_DIR: path.join(runtimeRoot, "paper-sessions"),
    REXTORA_STRATEGY_SEARCH_DIR: path.join(runtimeRoot, "strategy-search"),
    REXTORA_BACKTESTS_DIR: path.join(runtimeRoot, "backtests"),
    PORT: String(PORT),
  };

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLog = "";
  server.stdout.on("data", (d) => {
    serverLog += d.toString();
  });
  server.stderr.on("data", (d) => {
    serverLog += d.toString();
  });

  const report = {
    BUILD_ID,
    runtimeRoot,
    strategiesDir,
    safeBefore,
    steps: [],
    screenshots: [],
    consoleErrors: [],
    verdictHints: [],
  };

  try {
    await waitHealthy();
    report.steps.push({ ok: true, step: "server_up", BUILD_ID });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (text.includes("400") && text.includes("Bad Request")) return;
        if (text.includes("Failed to load resource")) return;
        if (text.length > 500) return;
        report.consoleErrors.push(text);
      }
    });
    page.on("pageerror", (err) => {
      const text = String(err);
      if (text.length > 500) return;
      report.consoleErrors.push(text);
    });

    // 1) Empty first-run
    await page.setViewportSize(VIEWPORTS[3]);
    await page.goto(`${BASE}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForSelector('[data-testid="first-run-onboarding"]', {
      timeout: 15_000,
    });
    const emptyShot = path.join(OUT, "empty-first-run-1440.png");
    await page.screenshot({ path: emptyShot, fullPage: true });
    report.screenshots.push(emptyShot);
    report.steps.push({ ok: true, step: "empty_onboarding_visible" });

    // Confirm required — call API without confirm must fail
    const deny = await page.evaluate(async () => {
      const res = await fetch("/api/rextora/first-run/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    if (deny.status !== 400 || deny.body?.ok !== false) {
      throw new Error("demo init without confirm should fail");
    }
    report.steps.push({ ok: true, step: "confirm_required" });

    // Open confirm via CTA
    await page.click('[data-testid="first-run-demo-cta"]');
    await page.waitForSelector('role=alertdialog', { timeout: 5_000 });
    const confirmShot = path.join(OUT, "demo-confirm-1440.png");
    await page.screenshot({ path: confirmShot, fullPage: true });
    report.screenshots.push(confirmShot);

    await page.getByRole("button", { name: "데모 만들기" }).click();
    // Wait for init completion via status API (navigation may be client-side)
    await page.waitForFunction(async () => {
      try {
        const res = await fetch("/api/rextora/first-run");
        const json = await res.json();
        return json?.data?.status?.mode === "DEMO_ACTIVE";
      } catch {
        return false;
      }
    }, null, { timeout: 45_000 });
    await page.waitForURL(/\/results/, { timeout: 15_000 }).catch(() => {});
    if (!page.url().includes("/results")) {
      await page.goto(`${BASE}/results?demo=1`, { waitUntil: "networkidle" });
    }
    await page.waitForSelector('[data-testid="results-demo-banner"]', {
      timeout: 15_000,
    });
    const resultsShot = path.join(OUT, "demo-results-1440.png");
    await page.screenshot({ path: resultsShot, fullPage: true });
    report.screenshots.push(resultsShot);
    report.steps.push({ ok: true, step: "demo_results_marked" });

    // Status JSON
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/rextora/first-run");
      return res.json();
    });
    const deep = status.data?.deepLinks;
    if (!deep?.backtest || !deep?.paper) {
      throw new Error("missing demo deep links");
    }

    await page.goto(`${BASE}${deep.backtest}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForSelector('[data-testid="backtest-demo-banner"]', {
      timeout: 15_000,
    });
    const btShot = path.join(OUT, "demo-backtest-1440.png");
    await page.screenshot({ path: btShot, fullPage: true });
    report.screenshots.push(btShot);
    report.steps.push({ ok: true, step: "demo_backtest_marked" });

    await page.goto(`${BASE}${deep.paper}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForSelector('[data-testid="paper-demo-deep-link"]', {
      timeout: 15_000,
    });
    await page.waitForSelector('[data-testid="paper-demo-no-session"]', {
      timeout: 10_000,
    });
    const paperShot = path.join(OUT, "paper-deeplink-no-session-1440.png");
    await page.screenshot({ path: paperShot, fullPage: true });
    report.screenshots.push(paperShot);
    report.steps.push({ ok: true, step: "paper_deeplink_no_auto_session" });

    await page.goto(`${BASE}/live-trading`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(500);
    const liveShot = path.join(OUT, "live-blocked-1440.png");
    await page.screenshot({ path: liveShot, fullPage: true });
    report.screenshots.push(liveShot);
    report.steps.push({ ok: true, step: "live_page_opened" });

    // Reset demo
    await page.goto(`${BASE}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(500);
    await page.click('[data-testid="first-run-reset-demo"]');
    await page.getByRole("button", { name: "데모만 삭제" }).click();
    await page.waitForTimeout(1500);
    const resetStatus = await page.evaluate(async () => {
      const res = await fetch("/api/rextora/first-run");
      return res.json();
    });
    const modeAfterReset = resetStatus.data?.status?.mode;
    if (modeAfterReset === "DEMO_ACTIVE") {
      throw new Error(`reset failed, still DEMO_ACTIVE`);
    }
    const resetShot = path.join(OUT, "demo-reset-1440.png");
    await page.screenshot({ path: resetShot, fullPage: true });
    report.screenshots.push(resetShot);
    report.steps.push({ ok: true, step: "demo_reset", mode: modeAfterReset });

    // Idempotent re-init
    const init1 = await page.evaluate(async () => {
      const res = await fetch("/api/rextora/first-run/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      return res.json();
    });
    const init2 = await page.evaluate(async () => {
      const res = await fetch("/api/rextora/first-run/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      return res.json();
    });
    if (!init1.ok || !init2.ok || init2.data?.result?.alreadyPresent !== true) {
      throw new Error("second demo init was not idempotent");
    }
    report.steps.push({ ok: true, step: "idempotent_reinit" });

    // Multi-viewport smoke of dashboard onboarding / demo banner
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`${BASE}/dashboard`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(400);
      const shot = path.join(OUT, `dashboard-${vp.name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      report.screenshots.push(shot);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 2;
      });
      report.steps.push({
        ok: !overflow,
        step: `viewport_${vp.name}`,
        overflow,
      });
    }

    // Pages matrix
    for (const route of [
      "/strategy-search",
      "/results",
      "/backtest",
      "/paper-trading",
      "/live-trading",
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(800);
      const shot = path.join(
        OUT,
        `page-${route.replace("/", "") || "root"}-1440.png`,
      );
      await page.screenshot({ path: shot, fullPage: true });
      report.screenshots.push(shot);
      report.steps.push({ ok: true, step: `page_${route}` });
    }

    await browser.close();

    const safeAfter = {
      sha256: sha256(SAFE),
      size: fs.statSync(SAFE).size,
    };
    report.safeAfter = safeAfter;
    report.safeUnchanged = safeAfter.sha256 === safeBefore.sha256;
    report.consoleErrorCount = report.consoleErrors.length;
    report.ok =
      report.safeUnchanged &&
      report.steps.every((s) => s.ok !== false) &&
      report.consoleErrors.length === 0;

    fs.writeFileSync(
      path.join(OUT, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (err) {
    report.error = String(err);
    report.serverLogTail = serverLog.slice(-4000);
    fs.writeFileSync(
      path.join(OUT, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    console.error(err);
    console.error(serverLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    try {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main();
