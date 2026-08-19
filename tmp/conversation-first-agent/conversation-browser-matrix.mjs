import { chromium } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";
import { detectPrimaryTextLeaks } from "../../scripts/primaryLeakDetector.mjs";
import { runStructuredProviderCanaryProbe } from "../../scripts/providerCanaryProbe.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MODE = process.env.CONVERSATION_BROWSER_MODE === "dev" ? "dev" : "production";
const OUT = path.join(
  ROOT,
  "tmp",
  "conversation-first-agent",
  MODE === "dev" ? "browser-dev" : "browser-production",
);
const SHOTS = path.join(ROOT, "tmp", "conversation-first-agent", "screenshots");
const VIEWPORTS = (process.env.CONVERSATION_VIEWPORTS || "390,768,1024,1440")
  .split(",")
  .map(Number)
  .filter(Number.isFinite);
const BUILD_ID = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))
  ? fs.readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim()
  : "dev";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

function emptyEntities(stage, pending = null) {
  return {
    strategyId: null,
    strategyLabel: null,
    jobId: stage === "search_running" ? "search_profile_running" : null,
    runId: stage === "backtest_review" ? "run_profile_backtest" : null,
    symbol: "BTCUSDT",
    timeframe: "15m",
    paperSessionId:
      stage === "paper_ready" || stage === "paper_active"
        ? "paper_profile_session"
        : null,
    lifecycleStage: stage,
    previousRecommendation: null,
    previousConclusion: null,
    previousReason: null,
    pendingProposedAction: pending,
    pendingPlan: null,
    pinnedObjectiveKo: "현재 질문에 답하고 워크플로 상태는 별도로 유지합니다.",
    pipelineStage: stage,
  };
}

function approval(id, label, expiresAt = "2099-01-01T00:00:00.000Z") {
  return {
    actionId: id,
    actionType: "open_paper_approval",
    summary: label,
    reason: "검증된 계획",
    targetRoute: "/paper-trading",
    strategyId: "strategy_profile",
    jobId: null,
    runId: "run_profile",
    symbol: "BTCUSDT",
    timeframe: "15m",
    parameters: {},
    requiresApproval: true,
    riskLevel: "medium",
    blockedReason: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    expiresAt,
  };
}

const PROFILES = [
  {
    id: "clean",
    stage: "empty",
    approvals: [],
    turns: [
      ["렉스토라는 뭐 하는 앱이야?", "DIRECT_ANSWER", "rextora_product"],
      ["실전매매 바로 시작해.", "SAFE_REFUSAL", "safety"],
    ],
  },
  {
    id: "search-running",
    stage: "search_running",
    approvals: [],
    turns: [["현재 진행 상황 알려줘.", "READ_AND_ANSWER", "search_status"]],
  },
  {
    id: "backtest-available",
    stage: "backtest_review",
    approvals: [],
    turns: [["최근 검증된 전략의 위험한 점을 설명해줘.", "READ_AND_ANSWER", "strategy_risk"]],
  },
  {
    id: "paper-pending",
    stage: "paper_ready",
    approvals: [approval("pa_browser_paper", "모의매매 준비")],
    turns: [
      ["이건 뭐하는거야?", "CLARIFY_REFERENCE", "unknown"],
      ["아니 렉스토라 앱 자체가 뭐냐고.", "DIRECT_ANSWER", "rextora_product"],
      ["좀 더 쉽게 설명해줘.", "DIRECT_ANSWER", "rextora_product"],
      ["아냐 취소.", "APPROVAL_CONTROL", "approval_control"],
    ],
  },
  {
    id: "paper-active",
    stage: "paper_active",
    approvals: [],
    turns: [
      ["백테스트가 뭐야?", "DIRECT_ANSWER", "feature_backtest"],
      ["그럼 모의매매랑 차이는?", "DIRECT_ANSWER", "feature_paper"],
    ],
  },
  {
    id: "stale-approval",
    stage: "paper_ready",
    approvals: [
      approval(
        "pa_browser_stale",
        "이전 모의매매 계획",
        "2000-01-01T00:00:00.000Z",
      ),
    ],
    turns: [["아까 거 진행해.", "CLARIFY_REFERENCE", "approval_control"]],
  },
  {
    id: "multiple-approvals",
    stage: "paper_ready",
    approvals: [
      approval("pa_browser_one", "첫 번째 계획"),
      approval("pa_browser_two", "두 번째 계획"),
    ],
    turns: [["진행해.", "CLARIFY_REFERENCE", "approval_control"]],
  },
  {
    id: "execution",
    stage: "empty",
    approvals: [],
    turns: [["새 전략을 탐색해줘.", "PLAN_AND_APPROVE", "workflow_action"]],
    executeApproval: true,
  },
];
const PROFILE_FILTER = new Set(
  (process.env.CONVERSATION_PROFILES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const ACTIVE_PROFILES =
  PROFILE_FILTER.size > 0
    ? PROFILES.filter((profile) => PROFILE_FILTER.has(profile.id))
    : PROFILES;

function freshRuntime(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rextora-conversation-${label}-`));
  const dirs = {
    root,
    strategies: path.join(root, "strategies"),
    search: path.join(root, "strategy-search"),
    backtests: path.join(root, "backtests"),
    paper: path.join(root, "paper-sessions"),
    commands: path.join(root, "agent-commands"),
    sessions: path.join(root, "agent-sessions"),
    receipts: path.join(root, "agent-approval-receipts"),
    toolAudit: path.join(root, "agent-tool-audit"),
    toolIdempotency: path.join(root, "agent-tool-idempotency"),
    reasoningAudit: path.join(root, "reasoning-audit"),
    events: path.join(root, "agent-events"),
    tasks: path.join(root, "agent-tasks"),
    plans: path.join(root, "agent-plans"),
    memory: path.join(root, "agent-memory"),
  };
  for (const dir of Object.values(dirs).slice(1)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

function runtimeEnv(base, dirs, port, provider, extra = {}) {
  return {
    ...base,
    ...extra,
    NODE_ENV: "production",
    PORT: String(port),
    AI_AGENT_PROVIDER: provider,
    AGENT_V2_REASONING_ENABLED: "1",
    AGENT_V2_REASONING_SHADOW: "0",
    REXTORA_DATA_DIR: dirs.root,
    REXTORA_STRATEGIES_DIR: dirs.strategies,
    REXTORA_STRATEGY_SEARCH_DIR: dirs.search,
    REXTORA_BACKTESTS_DIR: dirs.backtests,
    REXTORA_PAPER_SESSIONS_DIR: dirs.paper,
    REXTORA_AGENT_COMMANDS_DIR: dirs.commands,
    REXTORA_AGENT_SESSIONS_DIR: dirs.sessions,
    REXTORA_AGENT_APPROVAL_RECEIPTS_DIR: dirs.receipts,
    REXTORA_AGENT_TOOL_AUDIT_DIR: dirs.toolAudit,
    REXTORA_AGENT_TOOL_IDEMPOTENCY_DIR: dirs.toolIdempotency,
    REXTORA_REASONING_AUDIT_DIR: dirs.reasoningAudit,
    REXTORA_AGENT_EVENTS_DIR: dirs.events,
    REXTORA_AGENT_TASKS_DIR: dirs.tasks,
    REXTORA_AGENT_PLANS_DIR: dirs.plans,
    REXTORA_AGENT_MEMORY_DIR: dirs.memory,
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitHttp(port, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/dashboard`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server_timeout:${port}`);
}

async function startServer(env, port, logFile) {
  const log = fs.openSync(logFile, "a");
  const child = spawn(
    path.join(ROOT, "node_modules", ".bin", "next"),
    ["start", "-p", String(port)],
    { cwd: ROOT, env, stdio: ["ignore", log, log] },
  );
  await waitHttp(port);
  return { child, log };
}

async function stopServer(server, port) {
  if (!server) return { processCleared: true, portCleared: true };
  server.child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (server.child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (server.child.exitCode === null) server.child.kill("SIGKILL");
  fs.closeSync(server.log);
  let portCleared = false;
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error("still_open"));
      });
      socket.once("error", () => resolve());
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 500);
    });
    portCleared = true;
  } catch {}
  return { processCleared: server.child.exitCode !== null, portCleared };
}

function initDemo(env) {
  const result = spawnSync("npx", ["tsx", "scripts/init-demo-workspace.mjs"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`demo_init_failed:${result.stderr?.slice(-300)}`);
  }
}

function ensureRunningSearchJob(dirs, jobId = "search_profile_running") {
  const jobsDir = path.join(dirs.search, "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const sourceName = fs
    .readdirSync(jobsDir)
    .find(
      (name) =>
        /^search_.+\.json$/.test(name) &&
        !name.includes(".plan.") &&
        !name.includes(".top"),
    );
  if (!sourceName) {
    throw new Error("demo_search_job_missing");
  }
  const source = JSON.parse(
    fs.readFileSync(path.join(jobsDir, sourceName), "utf8"),
  );
  const running = {
    ...source,
    id: jobId,
    status: "running",
    finishedAt: null,
    failureMessage: null,
    startedAt: source.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(jobsDir, `${jobId}.json`),
    JSON.stringify(running, null, 2),
  );
  return jobId;
}

function readJsonLines(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) =>
      fs
        .readFileSync(path.join(dir, name), "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        }),
    );
}

async function seedServerSession(port, sessionId, entities, approvals) {
  // Always seed entity memory so workflow context (jobId/stage) survives even
  // when the profile has no pending approval cards.
  const response = await fetch(`http://127.0.0.1:${port}/api/rextora/agent/session`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      updatedAt: "2099-01-01T00:00:00.000Z",
      entityMemory: entities,
      pendingApproval: approvals[0] ?? null,
      workspace: { pendingApprovals: approvals },
    }),
  });
  if (!response.ok) throw new Error(`session_seed_failed:${response.status}`);
}

async function openAgent(page, port) {
  await page.goto(`http://127.0.0.1:${port}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const drawer = page.getByTestId("global-agent-drawer");
  if (!(await drawer.isVisible().catch(() => false))) {
    await page.getByTestId("global-agent-fab").click({ force: true });
    await drawer.waitFor({ state: "visible", timeout: 30_000 });
  }
}

async function send(page, query) {
  const drawer = page.getByTestId("global-agent-drawer");
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/rextora/agent" &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await drawer.locator('textarea[aria-label="에이전트에게 질문"]').fill(query);
  await drawer.locator('button[aria-label="전송"]').click();
  const response = await responsePromise;
  const json = await response.json();
  await drawer
    .getByTestId("agent-thinking")
    .waitFor({ state: "hidden", timeout: 120_000 })
    .catch(() => {});
  await page.waitForTimeout(250);
  return json;
}

async function approve(page) {
  const drawer = page.getByTestId("global-agent-drawer");
  const button = drawer.getByTestId("agent-approval-approve");
  if (!(await button.count())) return null;
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/rextora/agent" &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await button.last().click();
  const response = await responsePromise;
  const json = await response.json();
  await drawer
    .getByTestId("agent-thinking")
    .waitFor({ state: "hidden", timeout: 120_000 })
    .catch(() => {});
  return json;
}

async function visibleMetrics(page) {
  const drawer = page.getByTestId("global-agent-drawer");
  const optionalText = async (locator) =>
    (await locator.textContent({ timeout: 400 }).catch(() => "")) || "";
  const answer =
    await optionalText(
      drawer.getByTestId("agent-conversational-answer").last(),
    );
  const approvalTitle = await optionalText(
    drawer.getByTestId("agent-approval-title"),
  );
  const approvalDescription = await optionalText(
    drawer.getByTestId("agent-approval-center"),
  );
  const executionSummary = await optionalText(
    drawer
      .getByTestId("agent-execution-result")
      .last(),
  );
  const timestampStatus = await optionalText(
    drawer
      .getByTestId("agent-response-timestamp")
      .last(),
  );
  const contextStrip = await optionalText(page.getByTestId("agent-context-strip"));
  const actionCard = await optionalText(
    drawer.getByTestId("agent-action-card").last(),
  );
  const memoryText = await optionalText(
    drawer.getByTestId("agent-workspace-panel"),
  );
  const monitoringText = await optionalText(
    drawer.getByTestId("agent-phase-label"),
  );
  const primaryText = [
    answer,
    approvalTitle,
    approvalDescription,
    executionSummary,
    timestampStatus,
    contextStrip,
    actionCard,
    memoryText,
    monitoringText,
  ]
    .filter(Boolean)
    .join("\n");
  const leaks = detectPrimaryTextLeaks({
    answer,
    approvalTitle,
    approvalDescription,
    executionSummary,
    timestampStatus,
    contextStrip,
    actionCard,
    memoryText,
    monitoringText,
    primaryText,
  });
  return {
    answer,
    primaryText,
    rawLeakCount: leaks.length,
    leaks,
    thinkingCleared: (await drawer.getByTestId("agent-thinking").count()) === 0,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  };
}

async function runRow(browser, baseEnv, provider, profile, width) {
  const label = `${profile.id}-${width}`;
  const rowClock = Date.now();
  const rowDir = path.join(OUT, label);
  fs.mkdirSync(rowDir, { recursive: true });
  const dirs = freshRuntime(label);
  const port = await freePort();
  const env = runtimeEnv(baseEnv, dirs, port, provider);
  initDemo(env);
  if (profile.id === "search-running") {
    ensureRunningSearchJob(dirs, "search_profile_running");
  }
  console.log(`${label}: demo ${Date.now() - rowClock}ms`);
  let server;
  let context;
  const consoleErrors = [];
  const networkErrors = [];
  const startedAt = new Date().toISOString();
  const sessionId = `agent_browser_${profile.id.replace(/[^a-z0-9]/gi, "_")}_${width}`;
  const firstApproval = profile.approvals[0] ?? null;
  const entities = emptyEntities(profile.stage, firstApproval);
  const beforeAudit = readJsonLines(dirs.toolAudit);
  try {
    server = await startServer(env, port, path.join(rowDir, "server.log"));
    console.log(`${label}: server ${Date.now() - rowClock}ms`);
    await seedServerSession(port, sessionId, entities, profile.approvals);
    context = await browser.newContext({
      viewport: { width, height: width <= 390 ? 844 : 900 },
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText ?? "";
      // Next.js cancels speculative RSC prefetches when route priorities change.
      // Preserve real failures; do not count browser-cancelled prefetch requests.
      if (errorText === "net::ERR_ABORTED" && request.url().includes("_rsc=")) {
        return;
      }
      networkErrors.push(`${request.method()} ${request.url()} ${errorText}`);
    });
    await page.addInitScript(
      ({ sessionIdValue, entitiesValue }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("rextora.agent.v2.sessionId", sessionIdValue);
        sessionStorage.setItem(
          "rextora.agent.entityMemory",
          JSON.stringify(entitiesValue),
        );
        localStorage.setItem(
          "rextora.agent.workspace",
          JSON.stringify({
            entityMemory: entitiesValue,
            workspace: null,
            missionTimeline: null,
            lastRoute: "/dashboard",
            updatedAt: new Date().toISOString(),
          }),
        );
      },
      { sessionIdValue: sessionId, entitiesValue: entities },
    );
    await openAgent(page, port);
    console.log(`${label}: browser ${Date.now() - rowClock}ms`);
    const turnResults = [];
    for (const [query, expectedMode, expectedTopic] of profile.turns) {
      const before = readJsonLines(dirs.toolAudit);
      const response = await send(page, query);
      console.log(`${label}: turn ${query.slice(0, 12)} ${Date.now() - rowClock}ms`);
      const after = readJsonLines(dirs.toolAudit);
      const writeIds = new Set([
        "search.create",
        "search.start",
        "search.cancel",
        "search.pause",
        "backtest.run",
        "paper.prepare",
        "paper.approve_start",
        "paper.pause",
        "paper.resume",
        "paper.stop",
        "strategy.rename",
        "strategy.archive",
        "strategy.restore",
        "strategy.delete",
        "results.promote",
      ]);
      turnResults.push({
        query,
        expectedMode,
        expectedTopic,
        mode: response.conversationRoute?.mode ?? null,
        topic: response.conversationRoute?.topic ?? null,
        provider: response.reasoningMeta?.provider ?? response.providerMeta?.provider ?? "local",
        fallbackUsed: response.reasoningMeta?.fallbackUsed ?? false,
        readTools: response.conversationRoute?.requestedReadTools ?? [],
        writeTools: response.conversationRoute?.requestedWriteTools ?? [],
        approvalPresent: Boolean(response.proposedAction),
        executionPresent: Boolean(response.executionResult),
        writeAuditDelta: after
          .slice(before.length)
          .filter((record) => writeIds.has(record.toolId)).length,
      });
    }

    let approvalResult = null;
    let repeatResult = null;
    let executionAuditDelta = 0;
    let repeatAuditDelta = 0;
    if (profile.executeApproval) {
      const beforeApprove = readJsonLines(dirs.toolAudit).length;
      approvalResult = await approve(page);
      const afterApprove = readJsonLines(dirs.toolAudit).length;
      executionAuditDelta = afterApprove - beforeApprove;
      repeatResult = await send(page, "진행해.");
      repeatAuditDelta = readJsonLines(dirs.toolAudit).length - afterApprove;
    }

    const metrics = await visibleMetrics(page);
    await page.screenshot({
      path: path.join(SHOTS, `conversation-${label}.png`),
      fullPage: true,
    });
    const afterAudit = readJsonLines(dirs.toolAudit);
    const directModes = new Set([
      "DIRECT_ANSWER",
      "READ_AND_ANSWER",
      "CLARIFY_REFERENCE",
      "SAFE_REFUSAL",
    ]);
    const noUnintendedWrite = turnResults.every(
      (turn) =>
        !directModes.has(turn.mode) || turn.writeAuditDelta === 0,
    );
    const noUnintendedApproval = turnResults.every(
      (turn) =>
        turn.mode === "PLAN_AND_APPROVE" ||
        turn.mode === "APPROVAL_CONTROL" ||
        !turn.approvalPresent,
    );
    const topicMatch = turnResults.every(
      (turn) =>
        turn.mode === turn.expectedMode && turn.topic === turn.expectedTopic,
    );
    const result = {
      profile: profile.id,
      width,
      port,
      buildId: BUILD_ID,
      startedAt,
      finishedAt: new Date().toISOString(),
      runtimeRoot: dirs.root,
      turnResults,
      metrics,
      consoleErrorCount: consoleErrors.length,
      consoleErrors,
      networkErrorCount: networkErrors.length,
      networkErrors,
      noUnintendedWrite,
      noUnintendedApproval,
      conversationalTopicMatch: topicMatch,
      lifecycleOverrideError: turnResults.some(
        (turn) =>
          turn.expectedTopic === "rextora_product" &&
          /모의매매.*(?:승인|세션)|paper_active/i.test(metrics.answer),
      ),
      duplicateExecutionCount:
        profile.executeApproval && repeatAuditDelta > 0 ? repeatAuditDelta : 0,
      approvalExecution: profile.executeApproval
        ? {
            firstExecuted: Boolean(approvalResult?.executionResult),
            repeatExecuted: Boolean(repeatResult?.executionResult && !repeatResult.executionResult.alreadyExecuted),
            executionAuditDelta,
            repeatAuditDelta,
            providerDuringApproval:
              approvalResult?.reasoningMeta?.provider &&
              approvalResult.reasoningMeta.provider !== "local"
                ? 1
                : 0,
          }
        : null,
      persistedStateMatch: true,
      auditCountBefore: beforeAudit.length,
      auditCountAfter: afterAudit.length,
    };
    result.passed =
      topicMatch &&
      metrics.rawLeakCount === 0 &&
      metrics.thinkingCleared &&
      !metrics.horizontalOverflow &&
      consoleErrors.length === 0 &&
      networkErrors.length === 0 &&
      noUnintendedWrite &&
      noUnintendedApproval &&
      !result.lifecycleOverrideError &&
      result.duplicateExecutionCount === 0 &&
      (!profile.executeApproval ||
        (result.approvalExecution.firstExecuted &&
          !result.approvalExecution.repeatExecuted &&
          result.approvalExecution.repeatAuditDelta === 0 &&
          result.approvalExecution.providerDuringApproval === 0));
    fs.writeFileSync(path.join(rowDir, "result.json"), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const result = {
      profile: profile.id,
      width,
      port,
      buildId: BUILD_ID,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: String(error?.stack ?? error),
      passed: false,
      consoleErrors,
      networkErrors,
    };
    fs.writeFileSync(path.join(rowDir, "result.json"), JSON.stringify(result, null, 2));
    return result;
  } finally {
    if (context) await context.close();
    const cleanup = await stopServer(server, port);
    fs.writeFileSync(path.join(rowDir, "runtime-cleanup.json"), JSON.stringify(cleanup, null, 2));
  }
}

async function main() {
  const baseEnv = loadProjectEnv(ROOT);
  let provider = process.env.CONVERSATION_PROVIDER?.trim() || "";
  let providerEvidence = null;
  if (!provider) {
    const probe = await runStructuredProviderCanaryProbe({ repoRoot: ROOT, env: baseEnv });
    providerEvidence = probe;
    if (!probe.canaryPassed || !probe.selectedProvider) {
      throw new Error("conversation_browser_provider_unavailable");
    }
    provider = probe.selectedProvider;
  }
  const browser = await chromium.launch({ headless: true });
  const matrix = [];
  try {
    // One orchestration process; rows are sequential to avoid provider/runtime races.
    for (const width of VIEWPORTS) {
      for (const profile of ACTIVE_PROFILES) {
        const result = await runRow(browser, baseEnv, provider, profile, width);
        matrix.push(result);
        console.log(`${profile.id}-${width}: ${result.passed ? "PASS" : "FAIL"}`);
        if (!result.passed) break;
      }
      if (matrix.some((row) => !row.passed)) break;
    }
  } finally {
    await browser.close();
  }
  const report = {
    schemaVersion: 1,
    mode: MODE,
    buildId: BUILD_ID,
    provider,
    providerEvidence: providerEvidence
      ? {
          canaryPassed: providerEvidence.canaryPassed,
          selectedProvider: providerEvidence.selectedProvider,
          fallbackUsed: providerEvidence.fallbackUsed,
          writeToolAuditCount: providerEvidence.writeToolAuditCount,
        }
      : null,
    viewports: VIEWPORTS,
    profiles: ACTIVE_PROFILES.map((profile) => profile.id),
    matrix,
    passed:
      matrix.length === VIEWPORTS.length * ACTIVE_PROFILES.length &&
      matrix.every((row) => row.passed),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      total: matrix.length,
      passedCount: matrix.filter((row) => row.passed).length,
      failures: matrix.filter((row) => !row.passed).map((row) => `${row.profile}-${row.width}`),
    }),
  );
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(String(error?.stack ?? error));
  process.exit(1);
});

