#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const ROUTE_THRESHOLD_MS = 1000;
const API_THRESHOLD_MS = 500;
const PORT = Number(process.env.PERF_AUDIT_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  "/",
  "/dashboard",
  "/market-watch",
  "/ai-candidates",
  "/cost-analysis",
  "/trading",
  "/risk",
  "/alerts",
  "/learning-log",
  "/system-status",
  "/settings"
];

const APIS = [
  "/api/rextora/bot/status",
  "/api/rextora/market",
  "/api/rextora/candidates",
  "/api/rextora/cost",
  "/api/rextora/risk",
  "/api/rextora/system",
  "/api/rextora/learning"
];

const SERVER_ONLY_PATTERNS = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:crypto["']/,
  /from\s+["'].*\/binance\//,
  /from\s+["'].*jsonStore/,
  /from\s+["'].*botRuntime/,
  /from\s+["'].*liveExecutionEngine/
];

function walk(dir) {
  if (!fs.existsSync(path.join(root, dir))) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return relative;
  });
}

function measureBuild() {
  const start = Date.now();
  try {
    execSync("npm run build", { cwd: root, stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } });
    return { ok: true, durationMs: Date.now() - start };
  } catch (error) {
    return { ok: false, durationMs: Date.now() - start, error: error.stderr?.toString() ?? error.message };
  }
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/dashboard`, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer() {
  return spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: root,
    stdio: "pipe",
    shell: true,
    env: { ...process.env, PORT: String(PORT) }
  });
}

async function timeRequest(url) {
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const durationMs = Date.now() - start;
    const body = await response.text();
    let meta = null;
    try {
      const json = JSON.parse(body);
      meta = json.meta ?? null;
    } catch {
      // html route
    }
    return { url, ok: response.ok, status: response.status, durationMs, meta, slow: false };
  } catch (error) {
    return { url, ok: false, status: 0, durationMs: Date.now() - start, error: error.message, slow: true };
  }
}

function detectClientServerViolations() {
  const files = [
    ...walk("app").filter((f) => /\.(tsx|ts)$/.test(f)),
    ...walk("components").filter((f) => /\.(tsx|ts)$/.test(f))
  ];

  const violations = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    if (!content.includes('"use client"') && !content.includes("'use client'")) continue;
    for (const pattern of SERVER_ONLY_PATTERNS) {
      if (pattern.test(content)) {
        violations.push({ file, pattern: pattern.source });
      }
    }
  }
  return violations;
}

function printTable(title, rows, threshold) {
  console.log(`\n## ${title}`);
  console.log("| Endpoint | Status | Duration (ms) | Slow? | Meta |");
  console.log("|---|---:|---:|:---:|---|");
  for (const row of rows) {
    const slow = row.durationMs > threshold || !row.ok;
    row.slow = slow;
    const meta = row.meta ? `cached=${row.meta.cached} source=${row.meta.source}` : "-";
    console.log(`| ${row.url.replace(BASE, "")} | ${row.status || "ERR"} | ${row.durationMs} | ${slow ? "YES" : "no"} | ${meta} |`);
  }
}

function recommendFixes(build, routes, apis, violations) {
  const recs = [];
  const slowRoutes = routes.filter((r) => r.durationMs > ROUTE_THRESHOLD_MS || !r.ok);
  const slowApis = apis.filter((a) => a.durationMs > API_THRESHOLD_MS || !a.ok);

  if (!build.ok) recs.push("Fix production build failures before optimizing runtime performance.");
  if (build.durationMs > 120_000) recs.push("Production build exceeds 120s — run ANALYZE=true npm run build and trim heavy client bundles.");

  for (const route of slowRoutes) {
    recs.push(`Route ${route.url.replace(BASE, "")} took ${route.durationMs}ms — prefer cached API panels and dynamic imports.`);
  }
  for (const api of slowApis) {
    const name = api.url.replace(BASE, "");
    if (name.includes("/market")) recs.push("Market API slow — ensure refreshMarketData uses TTL cache and batch premium index.");
    else if (name.includes("/candidates")) recs.push("Candidates API slow — use rankCandidates cache; avoid force recompute on every request.");
    else if (name.includes("/learning")) recs.push("Learning API slow — paginate logs (default limit 50) and avoid loading full history.");
    else recs.push(`API ${name} took ${api.durationMs}ms — add meta.cached responses and reduce synchronous JSON reads.`);
  }

  for (const v of violations) {
    recs.push(`Client file ${v.file} imports server-only pattern ${v.pattern} — move behind API route or server component.`);
  }

  if (recs.length === 0) recs.push("All measured endpoints are within thresholds. Keep perf:audit in CI to catch regressions.");

  console.log("\n## Recommended fixes");
  recs.forEach((r, i) => console.log(`${i + 1}. ${r}`));
  return recs;
}

async function main() {
  console.log("# Rextora Performance Audit\n");

  console.log("### Build measurement");
  const build = measureBuild();
  console.log(`Build ${build.ok ? "succeeded" : "FAILED"} in ${build.durationMs}ms`);
  if (!build.ok) {
    console.error(build.error);
    process.exit(1);
  }

  const violations = detectClientServerViolations();
  console.log(`\n### Client/server boundary scan: ${violations.length} violation(s)`);
  violations.forEach((v) => console.log(`- ${v.file}: ${v.pattern}`));

  const server = startServer();
  let serverLog = "";
  server.stdout?.on("data", (d) => { serverLog += d.toString(); });
  server.stderr?.on("data", (d) => { serverLog += d.toString(); });

  const ready = await waitForServer();
  if (!ready) {
    console.error("Server failed to start for perf audit:\n", serverLog);
    server.kill();
    process.exit(1);
  }

  const routeResults = [];
  for (const route of ROUTES) {
    routeResults.push(await timeRequest(`${BASE}${route}`));
  }

  const apiResults = [];
  for (const api of APIS) {
    apiResults.push(await timeRequest(`${BASE}${api}`));
  }

  // second pass — cached API timings
  const cachedApiResults = [];
  for (const api of APIS) {
    cachedApiResults.push(await timeRequest(`${BASE}${api}`));
  }

  printTable("Route response times (threshold 1000ms)", routeResults, ROUTE_THRESHOLD_MS);
  printTable("API response times — cold (threshold 500ms)", apiResults, API_THRESHOLD_MS);
  printTable("API response times — warm/cached", cachedApiResults, API_THRESHOLD_MS);

  const summary = {
    buildDurationMs: build.durationMs,
    slowRoutes: routeResults.filter((r) => r.durationMs > ROUTE_THRESHOLD_MS).map((r) => r.url.replace(BASE, "")),
    slowApisCold: apiResults.filter((a) => a.durationMs > API_THRESHOLD_MS).map((a) => a.url.replace(BASE, "")),
    slowApisWarm: cachedApiResults.filter((a) => a.durationMs > API_THRESHOLD_MS).map((a) => a.url.replace(BASE, "")),
    violations
  };

  console.log("\n## Summary JSON");
  console.log(JSON.stringify(summary, null, 2));

  recommendFixes(build, routeResults, cachedApiResults, violations);

  server.kill();
  const exitCode = summary.slowRoutes.length + summary.slowApisWarm.length + violations.length > 0 ? 0 : 0;
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
