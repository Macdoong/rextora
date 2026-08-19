#!/usr/bin/env node
/**
 * Development timeout diagnostic — scenarios 01/02 A/B/C reproduction.
 * Usage: node scripts/devTimeoutDiagnostic.mjs <A|B|C> [--restart-dev]
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const ROOT = process.cwd();
Object.assign(process.env, loadProjectEnv(ROOT));
const BASE = process.env.REXTORA_DEV_BASE_URL ?? "http://127.0.0.1:3101";
const OUT = path.join(ROOT, "tmp/rextora-dev-timeout-diagnostic");
const DIAG_TIMEOUT_MS = 60_000;

const experiment = process.argv[2]?.toUpperCase();
if (!["A", "B", "C"].includes(experiment)) {
  console.error("Usage: node scripts/devTimeoutDiagnostic.mjs <A|B|C>");
  process.exit(2);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function now() {
  return Date.now();
}

function psMetrics(pid) {
  try {
    const line = execSync(`ps -p ${pid} -o pid=,etime=,pcpu=,pmem=,rss=,state=`, {
      encoding: "utf8",
    }).trim();
    const [p, etime, cpu, mem, rss, state] = line.split(/\s+/);
    let openFiles = null;
    try {
      openFiles = execSync(`lsof -p ${pid} 2>/dev/null | wc -l`, { encoding: "utf8" }).trim();
    } catch {
      /* ignore */
    }
    return { pid: Number(p), etime, cpu_pct: cpu, mem_pct: mem, rss_kb: rss, state, open_files: openFiles };
  } catch {
    return { pid, error: "process_gone" };
  }
}

async function httpProbe(url) {
  const t0 = now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms: now() - t0, bytes: text.length };
  } catch (e) {
    return { ok: false, ms: now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function apiSettings() {
  const t0 = now();
  try {
    const res = await fetch(`${BASE}/api/rextora/settings/ai-providers`, {
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json();
    return {
      ms: now() - t0,
      status: res.status,
      openai: {
        stored: body.openai?.stored,
        configured: body.openai?.configured,
        envFallback: body.openai?.envFallback,
        enabled: body.openai?.enabled,
        selectedModel: body.openai?.selectedModel,
      },
      gemini: {
        stored: body.gemini?.stored,
        configured: body.gemini?.configured,
        envFallback: body.gemini?.envFallback,
        enabled: body.gemini?.enabled,
        selectedModel: body.gemini?.selectedModel,
      },
      reasoningActive: body.reasoningActive,
    };
  } catch (e) {
    return { ms: now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

function fileMeta(rel) {
  try {
    const abs = path.join(ROOT, rel);
    const st = fs.statSync(abs);
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return { exists: false };
  }
}

let devProc = null;
let devLogPath = null;

async function stopDev() {
  if (!devProc) return;
  devProc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1500));
  try {
    devProc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  devProc = null;
}

async function startDev(outDir) {
  await stopDev();
  devLogPath = path.join(outDir, "dev-server.log");
  const logFd = fs.openSync(devLogPath, "a");
  const t0 = now();
  devProc = spawn(
    "npm",
    ["run", "dev", "--", "--port", "3101", "--hostname", "127.0.0.1", "--webpack"],
    {
      cwd: ROOT,
      env: { ...process.env, REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "0" },
      stdio: ["ignore", logFd, logFd],
    },
  );
  for (let i = 0; i < 360; i++) {
    const api = await apiSettings();
    if (!api.error && api.status === 200) {
      return {
        pid: devProc.pid,
        startupMs: now() - t0,
        metrics: psMetrics(devProc.pid),
        readiness: "ai-providers-api",
        dashboardProbe: await httpProbe(`${BASE}/dashboard`),
        settingsProbe: await httpProbe(`${BASE}/settings`),
        aiApiProbe: api,
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("dev_server_readiness_timeout");
}

async function runScenario01(page, request) {
  const sRes = await request.get("/api/rextora/settings/ai-providers");
  const s = { status: sRes.status(), body: await sRes.json() };
  const hasKeys = Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.GEMINI_API_KEY?.trim());
  if (hasKeys && s.body.openai?.stored !== true) {
    await page.goto("/settings");
    await page.getByTestId("settings-tab-btn-ai").click();
    await page.getByTestId("ai-provider-settings").waitFor({ timeout: 30_000 });
    await page.getByTestId("ai-provider-key-openai").fill(process.env.OPENAI_API_KEY);
    const modelSelect = page.getByTestId("ai-provider-model-openai");
    const gpt5Value = await modelSelect.evaluate((sel) => {
      const el = sel;
      for (const opt of Array.from(el.options)) {
        if (opt.value.includes("gpt-5-mini")) return opt.value;
      }
      return "";
    });
    if (gpt5Value) await modelSelect.selectOption(gpt5Value);
    await page.getByTestId("ai-provider-save-openai").click();
    await page.getByText(/저장되었습니다/).waitFor({ timeout: 30_000 });
  }
  await page.goto("/settings");
  await page.getByTestId("settings-tab-btn-ai").click();
  await page.getByTestId("ai-provider-settings").waitFor({ timeout: 30_000 });
  await page.getByTestId("ai-provider-card-openai").waitFor({ timeout: 15_000 });
}

async function runScenario02Diagnostic(page, request, outDir) {
  const checkpoints = [];
  const consoleErrors = [];
  const failedNetwork = [];
  const apiEvents = [];
  const tStart = now();

  const mark = (id, extra = {}) => {
    checkpoints.push({ id, elapsedMs: now() - tStart, ...extra });
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedNetwork.push({ url: req.url(), failure: req.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (res) => {
    if (res.url().includes("/api/rextora/settings/ai-providers")) {
      apiEvents.push({ phase: "response", status: res.status(), url: res.url(), elapsedMs: now() - tStart });
    }
  });
  page.on("request", (req) => {
    if (req.url().includes("/api/rextora/settings/ai-providers") && req.method() === "GET") {
      apiEvents.push({ phase: "request", url: req.url(), elapsedMs: now() - tStart });
    }
  });

  mark("T0", { event: "browser_page_ready", url: page.url() });

  let result = { passed: false, failure: null, lastCheckpoint: "T0" };

  try {
    mark("T1", { event: "settings_navigation_started" });
    const nav = page.goto("/settings", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await Promise.race([
      nav,
      new Promise((_, rej) => setTimeout(() => rej(new Error("T2_timeout_settings_goto")), 25_000)),
    ]);
    mark("T2", {
      event: "settings_page_loaded",
      url: page.url(),
      lifecycleShell: await page.getByTestId("lifecycle-settings-shell").isVisible().catch(() => false),
      pageCouldntLoad: await page.getByText("This page couldn't load").isVisible().catch(() => false),
    });

    mark("T3", {
      event: "ai_tab_located",
      tabVisible: await page.getByTestId("settings-tab-btn-ai").isVisible().catch(() => false),
    });

    await page.getByTestId("settings-tab-btn-ai").click({ timeout: 5_000 });
    mark("T4", { event: "ai_tab_click_dispatched" });

    // T5/T6 from network listeners; wait for panel with diagnostic cap
    const panelWait = page.getByTestId("ai-provider-settings").waitFor({ state: "visible", timeout: 20_000 });
    await Promise.race([
      panelWait,
      new Promise((_, rej) => setTimeout(() => rej(new Error("T8_timeout_ai_provider_settings")), 22_000)),
    ]);

    mark("T8", {
      event: "ai_provider_settings_dom",
      exists: true,
      text: await page.getByTestId("ai-provider-settings").innerText().catch(() => ""),
    });

    const sRes = await request.get("/api/rextora/settings/ai-providers");
    const sBody = await sRes.json();
    mark("T7", {
      event: "settings_api_via_request_context",
      status: sRes.status(),
      geminiStored: sBody.gemini?.stored,
      geminiConfigured: sBody.gemini?.configured,
      openaiStored: sBody.openai?.stored,
    });

    await page.getByTestId("ai-provider-card-gemini").waitFor({ timeout: 10_000 });
    mark("T9", {
      event: "gemini_card_visible",
      keyEmpty: (await page.getByTestId("ai-provider-key-gemini").inputValue()) === "",
    });

    if (sBody.gemini?.configured !== true || sBody.gemini?.stored !== true || sBody.gemini?.envFallback !== false) {
      throw new Error("gemini_api_assertion_failed");
    }

    mark("T10", { event: "assertions_complete" });
    result = { passed: true, failure: null, lastCheckpoint: "T10" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result = {
      passed: false,
      failure: msg,
      lastCheckpoint: checkpoints[checkpoints.length - 1]?.id ?? "T0",
      domSnapshot: await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        lifecycleShell: !!document.querySelector('[data-testid="lifecycle-settings-shell"]'),
        aiTab: !!document.querySelector('[data-testid="settings-tab-btn-ai"]'),
        aiPanel: !!document.querySelector('[data-testid="ai-provider-settings"]'),
        pageError: document.body?.innerText?.includes("This page couldn't load") ?? false,
        loadingText: document.querySelector('[data-testid="ai-provider-settings"]')?.textContent?.slice(0, 120) ?? null,
      })).catch(() => null),
    };
    await page.screenshot({ path: path.join(outDir, "failure.png"), fullPage: true }).catch(() => {});
  }

  if (now() - tStart > DIAG_TIMEOUT_MS) {
    result.diagnosticCapExceeded = true;
  }

  fs.writeFileSync(
    path.join(outDir, "checkpoints.json"),
    JSON.stringify({ checkpoints, apiEvents, consoleErrors, failedNetwork, result, durationMs: now() - tStart }, null, 2),
  );
  return result;
}

async function experimentA(outDir) {
  ensureDir(outDir);
  const startup = await startDev(outDir);
  fs.writeFileSync(path.join(outDir, "dev-startup.json"), JSON.stringify(startup, null, 2));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: BASE,
  });
  const page = await context.newPage();
  const request = context.request;

  const apiBefore = await apiSettings();
  const s02 = await runScenario02Diagnostic(page, request, outDir);
  const apiAfter = await apiSettings();

  await browser.close();
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify({ experiment: "A", startup, apiBefore, apiAfter, scenario02: s02, serverAfter: psMetrics(devProc.pid) }, null, 2),
  );
  return s02;
}

async function experimentB(outDir) {
  ensureDir(outDir);
  const startup = await startDev(outDir);
  fs.writeFileSync(path.join(outDir, "dev-startup.json"), JSON.stringify(startup, null, 2));

  const browser1 = await chromium.launch({ headless: true });
  const ctx1 = await browser1.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const page1 = await ctx1.newPage();
  const t0 = now();
  await runScenario01(page1, ctx1.request);
  const s01Duration = now() - t0;
  await browser1.close();

  const postS01 = {
    api: await apiSettings(),
    files: {
      aiProviderSettings: fileMeta("data/ai-provider-settings.json"),
      credentialEnc: fileMeta("data/secrets/ai-provider-credentials.enc.json"),
    },
    server: psMetrics(devProc.pid),
  };
  fs.writeFileSync(path.join(outDir, "after-scenario-01.json"), JSON.stringify({ s01Duration, ...postS01 }, null, 2));

  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const page2 = await ctx2.newPage();
  const s02 = await runScenario02Diagnostic(page2, ctx2.request, outDir);
  await browser2.close();

  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify({ experiment: "B", startup, postS01, scenario02: s02, serverAfter: psMetrics(devProc.pid) }, null, 2),
  );
  return s02;
}

async function experimentC(outDir) {
  ensureDir(outDir);
  await startDev(outDir);
  // Use Playwright CLI with diagnostic config for exact matrix semantics
  const logPath = path.join(outDir, "playwright.stdout.txt");
  const configPath = path.join(ROOT, "playwright.dev-timeout-diagnostic.config.mjs");
  try {
    execSync(
      `npx playwright test --config=${configPath} tests/e2e/release/dev-timeout-diagnostic.spec.ts --project=dev-390 2>&1 | tee ${logPath}`,
      { cwd: ROOT, stdio: "inherit", timeout: 180_000, env: { ...process.env, REXTORA_DEV_BASE_URL: BASE } },
    );
  } catch (e) {
    fs.writeFileSync(path.join(outDir, "playwright-error.json"), JSON.stringify({ error: String(e) }, null, 2));
  }
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify({ experiment: "C", serverAfter: psMetrics(devProc?.pid), logPath }, null, 2),
  );
}

ensureDir(OUT);
const outDir = path.join(OUT, `experiment-${experiment.toLowerCase()}`);

try {
  let result;
  if (experiment === "A") result = await experimentA(outDir);
  else if (experiment === "B") result = await experimentB(outDir);
  else await experimentC(outDir);

  if (devProc && devLogPath) {
    const tail = execSync(`tail -n 80 ${devLogPath}`, { encoding: "utf8" });
    fs.writeFileSync(path.join(outDir, "dev-server-tail.txt"), tail);
  }

  if (experiment !== "C") {
    console.log(JSON.stringify({ experiment, result }, null, 2));
    process.exit(result?.passed ? 0 : 1);
  }
} finally {
  // keep dev running for next experiment unless user restarts
}
