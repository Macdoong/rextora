/**
 * Prove why /live-trading never reaches Playwright networkidle.
 * No credentials logged.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tmp/rextora-final-e2e/live-trading-networkidle-root-cause.json");
const BASE = "http://127.0.0.1:3100";
const ROUTE = "/live-trading";

function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search ? u.search.replace(/([?&][^=]+=)[^&]+/g, "$1[REDACTED]") : ""}`;
  } catch {
    return url.split("?")[0];
  }
}

async function waitForHealth(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/dashboard`);
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server_health_timeout");
}

async function main() {
  const server = spawn("npx", ["next", "start", "-p", "3100"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const requestLog = [];
  const pageErrors = [];
  const consoleErrors = [];
  let http5xx = 0;
  let chunkLoadErrors = 0;
  let hydrationErrors = 0;

  try {
    await waitForHealth();

    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("pageerror", (err) => {
      const msg = String(err);
      pageErrors.push(msg);
      if (/hydration/i.test(msg)) hydrationErrors += 1;
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const t = msg.text();
        consoleErrors.push(t);
        if (/ChunkLoadError/i.test(t)) chunkLoadErrors += 1;
        if (/hydration/i.test(t)) hydrationErrors += 1;
      }
    });

    const onRequest = (req) => {
      requestLog.push({
        url: sanitizeUrl(req.url()),
        method: req.method(),
        resourceType: req.resourceType(),
        startedAtMs: Date.now(),
        endedAtMs: null,
        status: null,
        failed: false,
      });
    };
    const onResponse = (res) => {
      const url = sanitizeUrl(res.url());
      const entry = [...requestLog].reverse().find((x) => x.url === url && x.endedAtMs === null);
      if (entry) {
        entry.endedAtMs = Date.now();
        entry.status = res.status();
        if (res.status() >= 500) http5xx += 1;
      }
    };
    const onRequestFailed = (req) => {
      const url = sanitizeUrl(req.url());
      const entry = [...requestLog].reverse().find((x) => x.url === url && x.endedAtMs === null);
      if (entry) {
        entry.endedAtMs = Date.now();
        entry.failed = true;
      }
    };

    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);

    const shellVisibleAtMs = { value: null };
    const pollStart = Date.now();

    const shellWatch = (async () => {
      while (Date.now() - pollStart < 35_000) {
        const visible = await page
          .locator(".dashboard-shell")
          .isVisible()
          .catch(() => false);
        if (visible && shellVisibleAtMs.value === null) {
          shellVisibleAtMs.value = Date.now() - pollStart;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();

    let networkIdleReached = false;
    let networkIdleError = null;
    const navStart = Date.now();
    try {
      await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle", timeout: 30_000 });
      networkIdleReached = true;
    } catch (err) {
      networkIdleError = String(err?.message ?? err);
    }
    const navElapsedMs = Date.now() - navStart;

    await shellWatch;

    // Observe repeating API calls after shell render
    const apiCalls = requestLog.filter((r) => r.url.startsWith("/api/rextora/"));
    const byPath = new Map();
    for (const call of apiCalls) {
      const list = byPath.get(call.url) ?? [];
      list.push(call.startedAtMs - pollStart);
      byPath.set(call.url, list);
    }

    const persistentRequests = [];
    for (const [url, times] of byPath.entries()) {
      if (times.length >= 2) {
        const intervals = times.slice(1).map((t, i) => t - times[i]);
        persistentRequests.push({
          url,
          method: "GET",
          resourceType: "fetch",
          repeatCount: times.length,
          approximateIntervalMs:
            intervals.length > 0
              ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
              : null,
          statuses: apiCalls.filter((c) => c.url === url).map((c) => c.status).filter(Boolean),
          originatesFromLiveTradingPolling:
            url === "/api/rextora/trading/dashboard" || url === "/api/rextora/bot/status",
        });
      }
    }

    const shellRenderedBeforeTimeout = shellVisibleAtMs.value !== null && shellVisibleAtMs.value < 30_000;
    const pollingConfirmed = persistentRequests.some(
      (r) => r.originatesFromLiveTradingPolling && (r.approximateIntervalMs ?? 0) >= 5000,
    );

    const classification =
      shellRenderedBeforeTimeout &&
      http5xx === 0 &&
      chunkLoadErrors === 0 &&
      hydrationErrors === 0 &&
      !networkIdleReached &&
      pollingConfirmed
        ? "HARNESS_DEFECT"
        : "UNPROVEN";

    const result = {
      route: ROUTE,
      shellRenderedBeforeTimeout,
      shellVisibleAtMs: shellVisibleAtMs.value,
      networkIdleReached,
      networkIdleError,
      navigationElapsedMs: navElapsedMs,
      persistentRequests,
      pollingConfirmed,
      applicationErrorObserved: pageErrors.length > 0 || consoleErrors.some((e) => /Application error|Unhandled Runtime Error/i.test(e)),
      http5xxCount: http5xx,
      chunkLoadErrorCount: chunkLoadErrors,
      hydrationErrorCount: hydrationErrors,
      pageErrorCount: pageErrors.length,
      consoleErrorCount: consoleErrors.length,
      classification,
      reasonNetworkIdleInvalid: pollingConfirmed
        ? "Live-trading page schedules refresh() on mount and setInterval(refresh, 8000), repeatedly fetching /api/rextora/trading/dashboard and /api/rextora/bot/status. Playwright networkidle requires zero in-flight network connections for 500ms; 8s polling prevents that indefinitely while the styled shell is already rendered."
        : null,
      evidenceSource: "app/live-trading/page.tsx useEffect setInterval 8000ms + prove-networkidle.mjs request trace",
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));

    await browser.close();
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!server.killed) server.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
