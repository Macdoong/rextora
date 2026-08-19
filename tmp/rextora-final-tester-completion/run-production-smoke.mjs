import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = "http://127.0.0.1:3100";
const output = "tmp/rextora-final-tester-completion/production-smoke.json";
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();
const consoleErrors = [];
const badResponses = [];
let browser;

const report = {
  buildId,
  base,
  dashboardStatus: null,
  settingsStatus: null,
  providerApiStatus: null,
  providerApiValidJson: false,
  providers: {},
  agentStatus: null,
  agentValidJson: false,
  agentWriteToolCount: null,
  cssAssets: 0,
  staticChunkAssets: 0,
  staticAssetFailures: [],
  malformedJsonCount: 0,
  chunkLoadErrorCount: 0,
  immediateHTTP5xxCount: 0,
  hydrationErrorCount: 0,
  consoleErrors: [],
  passed: false,
};

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error.message).slice(0, 500)));
  page.on("response", (response) => {
    if (response.status() >= 500) badResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });

  const dashboard = await page.goto(`${base}/dashboard`, { waitUntil: "networkidle", timeout: 60_000 });
  report.dashboardStatus = dashboard?.status() ?? null;
  await page.getByTestId("global-agent-fab").waitFor({ state: "visible", timeout: 30_000 });
  report.cssAssets = await page.locator('link[rel="stylesheet"]').count();
  report.staticChunkAssets = await page.locator('script[src*="/_next/static/"]').count();

  const settings = await page.goto(`${base}/settings`, { waitUntil: "networkidle", timeout: 60_000 });
  report.settingsStatus = settings?.status() ?? null;

  const providerResponse = await context.request.get(`${base}/api/rextora/settings/ai-providers`);
  report.providerApiStatus = providerResponse.status();
  try {
    const providerBody = await providerResponse.json();
    report.providerApiValidJson = true;
    for (const name of ["openai", "gemini"]) {
      const value = providerBody?.[name] ?? {};
      report.providers[name] = {
        configured: value.configured === true,
        stored: value.stored === true,
        enabled: value.enabled === true,
        envFallback: value.envFallback === true,
      };
    }
  } catch {
    report.malformedJsonCount += 1;
  }

  const agentResponse = await context.request.post(`${base}/api/rextora/agent`, {
    data: {
      query: "현재 렉스토라 상태를 읽기 전용으로 간단히 설명해 주세요. 어떤 작업도 실행하지 마세요.",
      turnId: `smoke-${Date.now()}`,
      history: [],
      providerSelection: { provider: "openai", model: "gpt-5-mini" },
      entityMemory: {},
      pendingApprovals: [],
      context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
    },
    timeout: 120_000,
  });
  report.agentStatus = agentResponse.status();
  try {
    const body = await agentResponse.json();
    report.agentValidJson = true;
    report.agentWriteToolCount = (body?.toolAudit ?? []).filter((entry) => entry?.approved === true).length;
  } catch {
    report.malformedJsonCount += 1;
  }

  report.consoleErrors = consoleErrors;
  report.chunkLoadErrorCount = consoleErrors.filter((line) => /ChunkLoadError/i.test(line)).length;
  report.hydrationErrorCount = consoleErrors.filter((line) => /hydration|hydrating/i.test(line)).length;
  report.immediateHTTP5xxCount = badResponses.length;
  report.passed =
    report.dashboardStatus === 200 &&
    report.settingsStatus === 200 &&
    report.providerApiStatus === 200 &&
    report.providerApiValidJson &&
    report.agentStatus === 200 &&
    report.agentValidJson &&
    report.agentWriteToolCount === 0 &&
    report.cssAssets > 0 &&
    report.staticChunkAssets > 0 &&
    report.malformedJsonCount === 0 &&
    report.chunkLoadErrorCount === 0 &&
    report.immediateHTTP5xxCount === 0 &&
    report.hydrationErrorCount === 0;
  await context.close();
} catch (error) {
  report.error = String(error?.stack ?? error).slice(0, 2000);
} finally {
  await browser?.close().catch(() => {});
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({
  passed: report.passed,
  buildId: report.buildId,
  statuses: [report.dashboardStatus, report.settingsStatus, report.providerApiStatus, report.agentStatus],
  providers: report.providers,
  counts: {
    css: report.cssAssets,
    chunks: report.staticChunkAssets,
    malformed: report.malformedJsonCount,
    chunkLoad: report.chunkLoadErrorCount,
    http5xx: report.immediateHTTP5xxCount,
    hydration: report.hydrationErrorCount,
    writes: report.agentWriteToolCount,
  },
}));
process.exitCode = report.passed ? 0 : 1;
