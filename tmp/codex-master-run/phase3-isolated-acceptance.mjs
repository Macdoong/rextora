/**
 * Agent V2 Phase 3 isolated production acceptance.
 * Every scenario/viewport receives a fresh runtime, port, server and browser context.
 */
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { assertHarnessDependencies } from "../../scripts/providerCanaryProbe.mjs";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";
import { detectPrimaryTextLeaks } from "../../scripts/primaryLeakDetector.mjs";
import { runStructuredProviderCanaryProbe } from "../../scripts/providerCanaryProbe.mjs";

const ROOT = assertHarnessDependencies(import.meta.url);
const OUT = path.join(ROOT, "tmp", "codex-master-run");
const SHOTS = path.join(OUT, "phase3-screenshots");
const RUNS = path.join(OUT, "phase3-runs");
const BUILD_ID = fs.readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
const VIEWPORTS = (process.env.PHASE3_VIEWPORTS || "390,768,1024,1440")
  .split(",").map(Number).filter(Number.isFinite);
const SCENARIOS = (process.env.PHASE3_SCENARIOS || "A,B,C,D,E")
  .split(",").map((x) => x.trim()).filter(Boolean);

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RUNS, { recursive: true });

function loadEnvLocal() {
  return loadProjectEnv(ROOT);
}

function freshRuntime(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rextora-p3-${label}-`));
  const dirs = {
    root,
    strategies: path.join(root, "strategies"),
    search: path.join(root, "strategy-search"),
    backtests: path.join(root, "backtests"),
    paper: path.join(root, "paper-sessions"),
    commands: path.join(root, "agent-commands"),
    sessions: path.join(root, "agent-sessions"),
    toolAudit: path.join(root, "agent-tool-audit"),
    toolIdempotency: path.join(root, "agent-tool-idempotency"),
    reasoningAudit: path.join(root, "reasoning-audit"),
    events: path.join(root, "agent-events"),
    tasks: path.join(root, "agent-tasks"),
    plans: path.join(root, "agent-plans"),
    memory: path.join(root, "agent-memory"),
  };
  Object.values(dirs).slice(1).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
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
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/dashboard`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server_health_timeout:${port}`);
}

async function startServer(env, port, logFile) {
  const log = fs.openSync(logFile, "a");
  const command = process.env.PHASE3_DEV === "1" ? "dev" : "start";
  const child = spawn(path.join(ROOT, "node_modules", ".bin", "next"), [command, "-p", String(port)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", log, log],
  });
  await waitHttp(port);
  return { child, log };
}

async function stopServer(server, port) {
  if (!server) return { processCleared: true, portCleared: true };
  server.child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (server.child.exitCode === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (server.child.exitCode === null) server.child.kill("SIGKILL");
  fs.closeSync(server.log);
  let portCleared = false;
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); reject(new Error("still_open")); });
      socket.once("error", () => resolve());
      setTimeout(() => { socket.destroy(); resolve(); }, 500);
    });
    portCleared = true;
  } catch {}
  return { processCleared: server.child.exitCode !== null, portCleared };
}

function initDemo(env) {
  const result = spawnSync("npx", ["tsx", "scripts/init-demo-workspace.mjs"], {
    cwd: ROOT, env, encoding: "utf8", timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(`demo_init_failed:${result.stderr?.slice(-300)}`);
}

function jsonFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json") && predicate(name));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function jobs(dirs) {
  const dir = path.join(dirs.search, "jobs");
  return jsonFiles(dir, (n) => /^search_[a-f0-9-]+\.json$/.test(n)).flatMap((name) => {
    let job;
    try {
      job = readJson(path.join(dir, name));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const planFile = path.join(dir, `${job.id}.plan.json`);
    let plan = null;
    try {
      plan = fs.existsSync(planFile) ? readJson(planFile) : null;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return [{
      id: job.id,
      status: job.status,
      progress: job.checkpoint?.completedIterations ?? 0,
      timeframe: job.config?.timeframe ?? null,
      symbols: job.config?.symbols ?? [],
      patterns: plan?.selectedSpaceIds ?? plan?.patternSpaceIds ?? plan?.spaces?.map((space) => space.id) ?? [],
    }];
  });
}

function jsonl(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
}

function reasoningAudit(dirs) {
  const file = path.join(dirs.reasoningAudit, "reasoning-requests.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function employeeTasks(dirs) {
  const dir = dirs.tasks;
  if (!fs.existsSync(dir)) return [];
  return jsonFiles(dir).flatMap((name) => readJson(path.join(dir, name)).tasks ?? []);
}

function agentEvents(dirs) {
  return jsonl(dirs.events);
}

function agentMemory(dirs) {
  return jsonl(dirs.memory);
}

function planInfo(json) {
  const steps = json?.proposedAction?.parameters?.toolPlan ?? [];
  const create = steps.find((s) => s.toolId === "search.create");
  const body = create?.arguments?.createBody ?? create?.arguments ?? {};
  return {
    steps,
    toolIds: steps.map((s) => s.toolId),
    requestHash: json?.proposedAction?.parameters?.requestHash ?? json?.reasoningMeta?.requestHash ?? null,
    patterns: body?.operatorPlan?.selectedSpaceIds ?? body?.patternSpaceIds ?? [],
    timeframe: body?.timeframe ?? null,
  };
}

async function openDrawer(page, port, route = "/dashboard") {
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("global-agent-fab").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId("global-agent-fab").click({ force: true });
  await page.getByTestId("global-agent-drawer").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function send(page, query) {
  const drawer = page.getByTestId("global-agent-drawer");
  const responsePromise = page.waitForResponse(
    (res) => new URL(res.url()).pathname === "/api/rextora/agent" && res.request().method() === "POST",
    { timeout: 120_000 },
  );
  await drawer.locator('textarea[aria-label="에이전트에게 질문"]').fill(query);
  await drawer.locator('button[aria-label="전송"]').click();
  const response = await responsePromise;
  const json = await response.json();
  await drawer.getByTestId("agent-thinking").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(900);
  return json;
}

async function approve(page) {
  const drawer = page.getByTestId("global-agent-drawer");
  const button = drawer.getByTestId("agent-approval-approve");
  if (!(await button.count())) return null;
  const responsePromise = page.waitForResponse(
    (res) => new URL(res.url()).pathname === "/api/rextora/agent" && res.request().method() === "POST",
    { timeout: 120_000 },
  );
  await button.last().click();
  const response = await responsePromise;
  const json = await response.json();
  await drawer.getByTestId("agent-thinking").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(900);
  return json;
}

async function uiMetrics(page) {
  const drawer = page.getByTestId("global-agent-drawer");
  const answer = (await drawer.getByTestId("agent-conversational-answer").last().textContent().catch(() => "")) || "";
  const execution = (await drawer.getByTestId("agent-execution-result").last().textContent().catch(() => "")) || "";
  const approvalTitle = (await drawer.getByTestId("agent-approval-title").textContent().catch(() => "")) || "";
  const approval = (await drawer.getByTestId("agent-approval-center").textContent().catch(() => "")) || "";
  const errorText = (await drawer.locator('[data-testid="agent-message-turn"] .text-rose-100, [data-testid="agent-message-turn"] .text-rose-50').last().textContent().catch(() => "")) || "";
  const monitoringText = (await drawer.getByTestId("agent-phase-label").textContent().catch(() => "")) || "";
  const primary = [answer, execution, approvalTitle, approval, errorText, monitoringText].filter(Boolean).join("\n");
  const leakHits = detectPrimaryTextLeaks({
    answer,
    executionSummary: execution,
    approvalTitle,
    approvalDescription: approval,
    errorText,
    monitoringText,
    primaryText: primary,
  });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  return {
    primaryText: primary.slice(0, 1200),
    rawLeakCount: leakHits.length,
    rawLeaks: [...new Set(leakHits.map((h) => h.match))].slice(0, 20),
    leakHits: leakHits.slice(0, 30),
    hasApproval: (await drawer.getByTestId("agent-approval-approve").count()) === 1,
    hasExecutionResult: (await drawer.getByTestId("agent-execution-result").count()) > 0,
    thinkingCleared: (await drawer.getByTestId("agent-thinking").count()) === 0,
    horizontalOverflow,
  };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

async function scenarioA(ctx) {
  const initial = await send(ctx.page, "BTCUSDT 15분봉에서 오더블럭과 가격 불균형 조합으로 새 탐색 계획을 준비해줘.");
  await shot(ctx.page, `A-initial-plan-${ctx.width}.png`);
  const before = planInfo(initial);
  const different = await send(ctx.page, "이전에 했던 설정과 다른 패턴으로 새 탐색해줘.");
  await shot(ctx.page, `A-different-pattern-${ctx.width}.png`);
  const after = planInfo(different);
  const metrics = await uiMetrics(ctx.page);
  return {
    initial: { provider: initial.reasoningMeta?.provider, fallbackUsed: initial.reasoningMeta?.fallbackUsed, ...before },
    different: { provider: different.reasoningMeta?.provider, fallbackUsed: different.reasoningMeta?.fallbackUsed, ...after },
    priorCombinationRecognized: before.patterns.length > 0,
    priorCombinationExcluded: before.patterns.every((p) => !after.patterns.includes(p)) || JSON.stringify(before.patterns.sort()) !== JSON.stringify(after.patterns.sort()),
    canonicalParametersDiffer: JSON.stringify(before.patterns.sort()) !== JSON.stringify(after.patterns.sort()),
    requestHashDiffers: Boolean(before.requestHash && after.requestHash && before.requestHash !== after.requestHash),
    exactlyOneApprovalAction: metrics.hasApproval,
    ...metrics,
  };
}

async function createRunningSearch(ctx) {
  await send(ctx.page, "BTCUSDT 15분봉에서 오더블럭과 가격 불균형 조합으로 새 탐색 계획을 준비해줘.");
  const started = await approve(ctx.page);
  if (!started?.executionResult?.jobId) throw new Error("initial_search_not_started");
  return started.executionResult.jobId;
}

async function scenarioB(ctx) {
  const oldJobId = await createRunningSearch(ctx);
  const beforeJobs = jobs(ctx.dirs);
  const oldJobAtCreate = beforeJobs.find((j) => j.id === oldJobId);
  const planned = await send(ctx.page, "현재 탐색 취소하고 1시간봉 다른 세팅으로 다시 해.");
  await shot(ctx.page, `B-before-approval-${ctx.width}.png`);
  const beforeUi = await uiMetrics(ctx.page);
  const plan = planInfo(planned);
  const preJobs = jobs(ctx.dirs);
  const oldJobPre = preJobs.find((j) => j.id === oldJobId);
  const auditsBeforeApprove = jsonl(ctx.dirs.toolAudit).length;
  const reasoningBeforeApprove = reasoningAudit(ctx.dirs).filter((e) => e.providerAttempt === 1).length;
  const executed = await approve(ctx.page);
  await shot(ctx.page, `B-after-execution-${ctx.width}.png`);
  const afterUi = await uiMetrics(ctx.page);
  const afterJobs = jobs(ctx.dirs);
  const auditsAfterApprove = jsonl(ctx.dirs.toolAudit);
  const reasoningAfterApprove = reasoningAudit(ctx.dirs).filter((e) => e.providerAttempt === 1).length;
  const newJobId = executed?.executionResult?.jobId ?? null;
  const repeated = await send(ctx.page, "진행해.");
  const finalJobs = jobs(ctx.dirs);
  const audits = jsonl(ctx.dirs.toolAudit);
  const reasoningAfterRepeat = reasoningAudit(ctx.dirs).filter((e) => e.providerAttempt === 1).length;
  const oldJob = finalJobs.find((j) => j.id === oldJobId);
  const newJob = finalJobs.find((j) => j.id === newJobId);
  const replacementCreates = audits.filter((x) => x.toolId === "search.create" && x.status === "completed").length - 1;
  const writeTools = new Set(["search.create", "search.start", "search.cancel", "search.pause", "search.resume", "backtest.run", "paper.prepare"]);
  const writeAuditsAfterApprove = auditsAfterApprove.filter((x) => writeTools.has(x.toolId) && x.status === "completed").length;
  const writeAuditsAfterRepeat = audits.filter((x) => writeTools.has(x.toolId) && x.status === "completed").length;
  const repeatAlreadyExecuted = repeated?.executionResult?.alreadyExecuted === true;
  const expectedJobIds = new Set([
    ...beforeJobs.map((job) => job.id),
    ...(newJobId ? [newJobId] : []),
  ]);
  const finalJobIds = new Set(finalJobs.map((job) => job.id));
  const exactExpectedJobSet =
    finalJobIds.size === expectedJobIds.size &&
    [...expectedJobIds].every((id) => finalJobIds.has(id));
  const repeatNoSideEffects =
    exactExpectedJobSet &&
    writeAuditsAfterRepeat === writeAuditsAfterApprove &&
    reasoningAfterRepeat === reasoningAfterApprove &&
    !repeated?.proposedAction &&
    !repeated?.entityMemory?.pendingProposedAction &&
    (repeated?.executionResult == null || repeatAlreadyExecuted);
  // Active = started as queued/running and not cancelled before approval.
  // Jobs may finish during provider planning under parallel load; completed is still cancellable identity.
  const oldJobStillActive =
    ["queued", "running"].includes(oldJobAtCreate?.status) &&
    Boolean(oldJobPre) &&
    oldJobPre.status !== "cancelled";
  return {
    oldJobId,
    newJobId,
    beforeApproval: {
      ...beforeUi,
      exactOldJobIdentified: plan.steps.some((s) => s.toolId === "search.cancel" && s.arguments?.jobId === oldJobId),
      noToolExecuted: preJobs.length === beforeJobs.length,
      noReplacementJobExists: preJobs.length === beforeJobs.length,
      oldJobStillActive,
      oldJobStatusAtCreate: oldJobAtCreate?.status ?? null,
      oldJobStatusPreApproval: oldJobPre?.status ?? null,
      replacementTimeframe: plan.timeframe,
      replacementPatterns: plan.patterns,
    },
    afterApproval: {
      ...afterUi,
      approvalCleared: !executed?.proposedAction && !executed?.entityMemory?.pendingProposedAction,
      monitoringVisible: /진행|연구|확인/.test(afterUi.primaryText),
      persistedStateMatch: oldJob?.status === "cancelled" && newJob?.timeframe === "1h" && plan.patterns.every((p) => newJob?.patterns.includes(p)),
      duplicateExecutionCount: Math.max(0, replacementCreates - 1),
      providerCallCount: Math.max(0, reasoningAfterApprove - reasoningBeforeApprove),
      oldJobStatus: oldJob?.status ?? null,
      newJob,
    },
    // Product-state: no new jobs/writes/provider calls; idempotent replay may return alreadyExecuted.
    repeatApprovalCreatedNothing: repeatNoSideEffects,
    repeatEvidence: {
      alreadyExecuted: repeatAlreadyExecuted,
      executionStatus: repeated?.executionResult?.executionStatus ?? null,
      writeAuditDelta: writeAuditsAfterRepeat - writeAuditsAfterApprove,
      jobCountDelta: finalJobs.length - expectedJobIds.size,
      afterSnapshotJobCount: afterJobs.length,
      exactExpectedJobSet,
      providerCallDelta: reasoningAfterRepeat - reasoningAfterApprove,
      auditsBeforeApprove,
      provider: repeated?.reasoningMeta?.provider ?? null,
      fallbackUsed: repeated?.reasoningMeta?.fallbackUsed ?? null,
    },
    toolAudit: audits,
  };
}

async function scenarioC(ctx) {
  const jobId = await createRunningSearch(ctx);
  const response = await send(ctx.page, "현재 연구가 어디까지 진행됐어?");
  await shot(ctx.page, `C-status-${ctx.width}.png`);
  const persisted = jobs(ctx.dirs).find((j) => j.id === jobId);
  const metrics = await uiMetrics(ctx.page);
  const claimsSearchCompleted =
    /탐색(?:이|\s*작업이)?\s*(?:완료|끝났)|탐색\s*상태.{0,8}완료됨|탐색.{0,12}완료됐/.test(
      metrics.primaryText,
    );
  return {
    jobId,
    toolIds: response.reasoningMeta?.toolIds ?? [],
    exactActiveJob: response.entityMemory?.jobId === jobId,
    actualPersistedProgress: persisted?.progress ?? null,
    hasApproval: metrics.hasApproval,
    falseCompletion: claimsSearchCompleted && persisted?.status !== "completed",
    persistedStateMatch: Boolean(persisted),
    ...metrics,
  };
}

async function scenarioD(ctx) {
  const countRuns = () => jsonFiles(ctx.dirs.backtests, (name) => /^bt_[a-z0-9_]+\.json$/.test(name)).length;
  const before = countRuns();
  const planned = await send(ctx.page, "이 전략 백테스트까지 진행해.");
  const executed = await approve(ctx.page);
  await shot(ctx.page, `D-backtest-result-${ctx.width}.png`);
  const after = countRuns();
  const repeat = await send(ctx.page, "진행해.");
  const finalCount = countRuns();
  const metrics = await uiMetrics(ctx.page);
  return {
    plannedTools: planned.reasoningMeta?.toolIds ?? [],
    runId: executed?.executionResult?.runId ?? null,
    counts: { before, after, finalCount },
    executed: executed ? {
      intentType: executed.intentType,
      executionResult: executed.executionResult ?? null,
    } : null,
    repeatExecutionResult: repeat?.executionResult ?? null,
    persistedRunCreated: after === before + 1,
    repeatedApprovalNoDuplicate: finalCount === after && !repeat?.executionResult,
    actualMetricsOnly: Boolean(executed?.executionResult?.runId),
    ...metrics,
  };
}

async function scenarioE(ctx) {
  const beforeFiles = jsonFiles(ctx.dirs.paper);
  const beforeSessionIds = new Set(
    beforeFiles
      .map((name) => readJson(path.join(ctx.dirs.paper, name)))
      .filter((item) => item && item.id)
      .map((item) => item.id),
  );
  const planned = await send(ctx.page, "이 전략 모의매매까지 준비해.");
  const executed = await approve(ctx.page);
  await shot(ctx.page, `E-paper-result-${ctx.width}.png`);
  const files = jsonFiles(ctx.dirs.paper);
  const sessions = files.map((name) => readJson(path.join(ctx.dirs.paper, name))).filter((x) => x && x.id);
  const createdSessionIds = sessions
    .map((item) => item.id)
    .filter((id) => !beforeSessionIds.has(id));
  const rawSessionId = executed?.executionResult?.resultReference ?? executed?.entityMemory?.paperSessionId ?? sessions.at(-1)?.id ?? null;
  const sessionId =
    typeof rawSessionId === "string" &&
    rawSessionId.trim() &&
    !["없음", "null", "undefined", "None", "-"].includes(rawSessionId.trim())
      ? rawSessionId.trim()
      : sessions.at(-1)?.id ?? null;
  const session = sessions.find((x) => x.id === sessionId) ?? sessions.at(-1) ?? null;
  const metrics = await uiMetrics(ctx.page);
  return {
    plannedTools: planned.reasoningMeta?.toolIds ?? [],
    sessionId,
    executed: executed ? {
      intentType: executed.intentType,
      executionResult: executed.executionResult ?? null,
    } : null,
    beforeSessionIds: [...beforeSessionIds],
    createdSessionIds,
    oneSessionCreated: createdSessionIds.length === 1,
    internalStatus: session?.status ?? null,
    exchangeCalled: session?.exchangeCalled ?? null,
    executorStarted: Boolean(session?.startedAt),
    separateActivationApprovalExplained: /별도.*승인|활성화.*승인|최종.*승인/.test(metrics.primaryText),
    ...metrics,
  };
}

async function scenarioF(ctx) {
  const jobId = await createRunningSearch(ctx);
  const baselineAuditCount = jsonl(ctx.dirs.toolAudit).length;
  const baselineReasoningCount = reasoningAudit(ctx.dirs).length;
  const first = await send(ctx.page, "현재 연구가 어디까지 진행됐어?");
  const firstMetrics = await uiMetrics(ctx.page);
  const second = await send(ctx.page, "그 상태를 쉽게 설명해줘.");
  const secondMetrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `F-provider-fallback-${ctx.width}.png`);
  const audits = jsonl(ctx.dirs.toolAudit).slice(baselineAuditCount);
  const writeTools = new Set([
    "search.create", "search.start", "search.pause", "search.cancel",
    "results.promote", "backtest.run", "paper.prepare",
  ]);
  const writeToolIds = audits
    .filter((event) => writeTools.has(event.toolId))
    .map((event) => event.toolId)
    .filter(Boolean);
  const requests = reasoningAudit(ctx.dirs).slice(baselineReasoningCount);
  const started = requests.filter((event) => event.phase === "started");
  const completed = requests.filter((event) => event.phase === "completed");
  return {
    jobId,
    firstFallbackUsed: first.reasoningMeta?.fallbackUsed === true,
    firstToolIds: first.reasoningMeta?.toolIds ?? [],
    secondResponseReceived: Boolean(second?.conclusionKo || second?.interpretationKo),
    secondFallbackUsed: second.reasoningMeta?.fallbackUsed === true,
    secondDirectAnswer: second.conversationRoute?.mode === "DIRECT_ANSWER",
    providerStartedCount: started.filter((event) => event.providerAttempt === 1).length,
    completedCount: completed.length,
    noDuplicateProviderLoop:
      started.filter((event) => event.providerAttempt === 1).length <= 1 &&
      completed.length === started.length,
    noWriteToolExecuted: writeToolIds.length === 0,
    writeToolIds,
    firstThinkingCleared: firstMetrics.thinkingCleared,
    conversationContinued: secondMetrics.thinkingCleared && Boolean(secondMetrics.primaryText.trim()),
    rawLeakCount: firstMetrics.rawLeakCount + secondMetrics.rawLeakCount,
    rawLeaks: [...firstMetrics.rawLeaks, ...secondMetrics.rawLeaks],
    horizontalOverflow: firstMetrics.horizontalOverflow || secondMetrics.horizontalOverflow,
    thinkingCleared: firstMetrics.thinkingCleared && secondMetrics.thinkingCleared,
    primaryText: secondMetrics.primaryText,
    hasApproval: secondMetrics.hasApproval,
    hasExecutionResult: secondMetrics.hasExecutionResult,
  };
}

async function scenarioG(ctx) {
  const initial = await send(ctx.page, "BTCUSDT 15분봉에서 오더블럭과 가격 불균형 조합으로 새 탐색 계획을 준비해줘.");
  const initialPlan = planInfo(initial);
  const timeframeResponse = await send(ctx.page, "15분 말고 1시간으로 해");
  const timeframePlan = planInfo(timeframeResponse);
  const differentResponse = await send(ctx.page, "이전과 다른 패턴으로 해");
  const differentPlan = planInfo(differentResponse);
  const compareResponse = await send(ctx.page, "방금 계획과 무엇이 달라?");
  const compareUi = await uiMetrics(ctx.page);

  let started = await approve(ctx.page);
  if (!started?.executionResult?.jobId) {
    await send(ctx.page, "이전과 다른 패턴으로 해");
    started = await approve(ctx.page);
  }
  const firstJobId = started?.executionResult?.jobId ?? null;
  if (!firstJobId) throw new Error("planner_g_search_not_started");

  const continued = await send(ctx.page, "이어서 진행해");
  const continuedAudit = jsonl(ctx.dirs.toolAudit).filter((event) => event.toolId === "search.status").at(-1);
  const cancelPlanResponse = await send(ctx.page, "현재 탐색 취소하고 새 설정으로 다시 해");
  const cancelPlan = planInfo(cancelPlanResponse);
  const replaced = await approve(ctx.page);
  const replacementJobId = replaced?.executionResult?.jobId ?? null;
  if (!replacementJobId) throw new Error("planner_g_replacement_not_started");

  const pausePlanResponse = await send(ctx.page, "현재 작업 중지해");
  const pausePlan = planInfo(pausePlanResponse);
  const pausedResponse = await approve(ctx.page);
  const pauseDeadline = Date.now() + 30_000;
  let pausedJob = jobs(ctx.dirs).find((job) => job.id === replacementJobId);
  while (pausedJob && !["paused", "completed"].includes(pausedJob.status) && Date.now() < pauseDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    pausedJob = jobs(ctx.dirs).find((job) => job.id === replacementJobId);
  }

  const resumePlanResponse = await send(ctx.page, "다시 시작해");
  const resumePlan = planInfo(resumePlanResponse);
  const resumedResponse = await approve(ctx.page);
  await ctx.page.waitForTimeout(700);
  const finalJob = jobs(ctx.dirs).find((job) => job.id === replacementJobId);
  const tasks = employeeTasks(ctx.dirs);
  const activeTasks = tasks.filter((task) => !["completed", "cancelled", "failed"].includes(task.state));
  const metrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `G-planner-orchestration-${ctx.width}.png`);
  return {
    firstJobId,
    continuedEntityJobId: continued?.entityMemory?.jobId ?? null,
    continuedAuditJobId: continuedAudit?.arguments?.jobId ?? null,
    initialPlan,
    timeframePlan,
    differentPlan,
    timeframeModified: timeframePlan.timeframe === "1h" && timeframePlan.requestHash !== initialPlan.requestHash,
    priorPatternExcluded: JSON.stringify([...differentPlan.patterns].sort()) !== JSON.stringify([...timeframePlan.patterns].sort()),
    comparisonNatural: /달라|차이|조건|같/.test(compareUi.primaryText) && Boolean(compareResponse),
    continuedWithExactJob: continued?.entityMemory?.jobId === firstJobId || continuedAudit?.arguments?.jobId === firstJobId,
    cancelReplaceExact: cancelPlan.steps.some((step) => step.toolId === "search.cancel" && step.arguments?.jobId === firstJobId),
    replacementJobId,
    pauseExact: pausePlan.steps.some((step) => step.toolId === "search.pause" && step.arguments?.jobId === replacementJobId),
    pauseExecuted: Boolean(pausedResponse?.executionResult) && ["paused", "completed"].includes(pausedJob?.status),
    resumeExact: resumePlan.steps.some((step) => step.toolId === "search.start" && step.arguments?.jobId === replacementJobId),
    resumeExecuted: Boolean(resumedResponse?.executionResult) && ["queued", "running", "completed"].includes(finalJob?.status),
    activeTaskCount: activeTasks.length,
    noDuplicateActiveTask: activeTasks.length <= 1,
    serverTask: activeTasks[0] ?? tasks.at(-1) ?? null,
    ...metrics,
  };
}

async function scenarioH(ctx) {
  const queries = [
    "이전 탐색과 겹치지 않는 연구를 해줘",
    "왜 이 조합을 추천해?",
    "실패 원인을 분석하고 다른 설정으로 다시 해",
    "두 전략 중 무엇을 먼저 백테스트해야 해?",
    "수수료 때문에 실패한 건지 분석해",
    "MDD가 높아진 원인을 근거로 설명해",
    "아직 검증하지 않은 패턴 조합을 찾아줘",
  ];
  const responses = [];
  for (const query of queries) {
    const response = await send(ctx.page, query);
    responses.push({
      query,
      intentType: response.intentType,
      conclusionKo: response.conclusionKo ?? response.interpretationKo ?? "",
      facts: response.facts ?? [],
      plan: planInfo(response),
    });
  }
  await shot(ctx.page, `H-research-brain-${ctx.width}.png`);
  const metrics = await uiMetrics(ctx.page);
  const primaryClaims = responses.map((item) => item.conclusionKo).join("\n");
  const tasks = employeeTasks(ctx.dirs);
  const activeTasks = tasks.filter((task) => !["completed", "cancelled", "failed"].includes(task.state));
  const writes = jsonl(ctx.dirs.toolAudit).filter((event) => [
    "search.create", "search.start", "search.pause", "search.cancel",
    "backtest.run", "paper.prepare", "results.promote",
  ].includes(event.toolId));
  return {
    responses,
    allResearchIntent: responses.every((item) => item.intentType === "research_analysis"),
    allResponsesReceived: responses.every((item) => item.conclusionKo.trim()),
    allEvidenceLinked: responses.every((item) => item.facts.some((fact) => fact.labelKo === "증거 참조")),
    untestedPlanCreated: responses[0].plan.toolIds.includes("search.create") && responses[0].plan.patterns.length > 0,
    noUnapprovedWrite: writes.length === 0,
    noFalseImprovement: !/(개선됐|수익.*보장|예상\s*수익|확실히.*좋)/.test(primaryClaims),
    noUnsupportedRanking: !/(1위|최고의 전략|무조건.*우선)/.test(primaryClaims),
    noDuplicateActiveTask: activeTasks.length <= 1,
    ...metrics,
  };
}

async function scenarioI(ctx) {
  const jobId = await createRunningSearch(ctx);
  await ctx.page.waitForTimeout(1_500);
  const errorsBeforeReload = ctx.consoleErrors.length;
  const beforeRefreshTasks = employeeTasks(ctx.dirs);
  const task = beforeRefreshTasks.at(-1) ?? null;
  if (!task) throw new Error("lifecycle_task_missing");
  const sessionSnapshot = await ctx.page.evaluate(async (sessionId) => {
    const response = await fetch(`/api/rextora/agent/session?sessionId=${encodeURIComponent(sessionId)}`);
    return response.json();
  }, task.sessionId);
  await ctx.page.reload({ waitUntil: "domcontentloaded" });
  await ctx.page.waitForTimeout(500);
  const errorsAfterReload = ctx.consoleErrors.length;
  await openDrawer(ctx.page, ctx.port);
  const errorsAfterDrawer = ctx.consoleErrors.length;
  const continued = await send(ctx.page, "이어서 진행해");
  const errorsAfterContinue = ctx.consoleErrors.length;
  const events = agentEvents(ctx.dirs);
  const ids = events.map((event) => event.eventId);
  const finalTask = employeeTasks(ctx.dirs).at(-1) ?? null;
  const metrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `I-event-lifecycle-${ctx.width}.png`);
  return {
    jobId,
    errorsBeforeReload,
    errorsAfterReload,
    errorsAfterDrawer,
    errorsAfterContinue,
    eventTypes: events.map((event) => event.type),
    semanticToolEvents: events.some((event) => event.type === "search.created") && events.some((event) => event.type === "search.started"),
    watcherEventPersisted: events.some((event) => ["search.progress", "search.completed"].includes(event.type)),
    idempotentEventIds: new Set(ids).size === ids.length,
    sessionRestoredTaskSummary: sessionSnapshot?.session?.taskQueueSummary?.activeJobId === jobId,
    refreshContinuesExactWorkflow: continued?.entityMemory?.jobId === jobId || finalTask?.engineRefs?.searchJobId === jobId,
    taskState: finalTask?.state ?? null,
    noAutonomousExtraTask: employeeTasks(ctx.dirs).length === 1,
    ...metrics,
  };
}

async function scenarioJ(ctx) {
  const backtest = await scenarioD(ctx);
  const beforeRecall = agentMemory(ctx.dirs);
  const recalled = await send(ctx.page, "우리가 무엇을 배웠어?");
  const recallMetrics = await uiMetrics(ctx.page);
  await ctx.page.reload({ waitUntil: "domcontentloaded" });
  await openDrawer(ctx.page, ctx.port);
  const afterRefresh = await send(ctx.page, "이전 결정과 결과를 기억해서 알려줘");
  const afterMetrics = await uiMetrics(ctx.page);
  const afterRecall = agentMemory(ctx.dirs);
  await shot(ctx.page, `J-long-term-memory-${ctx.width}.png`);
  return {
    backtestRunId: backtest.runId,
    memoryKinds: beforeRecall.map((item) => item.kind),
    terminalMemoryPersisted: beforeRecall.some((item) =>
      item.kind === "actual_result" && item.evidenceRefs?.some((ref) => ref.type === "run" && ref.id === backtest.runId)),
    approvedPlanRemembered: beforeRecall.some((item) => item.kind === "approved_plan"),
    recallIntent: recalled?.intentType ?? null,
    recalledEvidenceLinked: recalled?.facts?.some((fact) => fact.labelKo === "증거 참조") ?? false,
    recallHasNoApproval: !recallMetrics.hasApproval,
    refreshRecallIntent: afterRefresh?.intentType ?? null,
    memoryStableAcrossRefresh: afterRecall.length === beforeRecall.length,
    noAutonomousWrite: employeeTasks(ctx.dirs).filter((task) => !["completed", "cancelled", "failed", "analyzing"].includes(task.state)).length === 0,
    ...afterMetrics,
  };
}

async function scenarioK(ctx) {
  const copiedResponse = await ctx.page.request.post(`http://127.0.0.1:${ctx.port}/api/rextora/strategies`, {
    data: { action: "copy", id: "SAFE_v44_i4060", name: "Employee browser candidate" },
  });
  const copiedBody = await copiedResponse.json();
  const selectedStrategyId = copiedBody?.data?.id ?? null;
  if (!selectedStrategyId) throw new Error(`strategy_clone_setup_failed:${JSON.stringify(copiedBody)}`);
  await openDrawer(ctx.page, ctx.port, `/strategies/${selectedStrategyId}?strategyId=${encodeURIComponent(selectedStrategyId)}`);
  const prepared = await scenarioE(ctx);
  const sessionId = prepared.sessionId;
  const preparedSession = sessionId ? readJson(path.join(ctx.dirs.paper, `${sessionId}.json`)) : null;
  const strategyId = preparedSession?.strategyId ?? null;
  const statuses = [];
  const controls = [
    ["모의매매 시작해", "active"],
    ["모의매매 일시 정지해", "paused"],
    ["모의매매 재개해", "active"],
    ["모의매매 종료해", "stopped"],
  ];
  const plannedTools = [];
  for (const [query, expected] of controls) {
    const planned = await send(ctx.page, query);
    plannedTools.push(...(planned.reasoningMeta?.toolIds ?? []));
    const executed = await approve(ctx.page);
    const session = sessionId ? readJson(path.join(ctx.dirs.paper, `${sessionId}.json`)) : null;
    statuses.push({ expected, actual: session?.status ?? null, responseReceived: Boolean(executed) });
  }

  const strategyPlans = [];
  for (const query of [
    "이 전략 이름을 Employee QA로 변경해",
    "이 전략을 아카이브에 보관해",
    "아카이브 전략을 복원해",
    "이 전략을 삭제해",
  ]) {
    const planned = await send(ctx.page, query);
    strategyPlans.push(planned.reasoningMeta?.toolIds?.[0] ?? null);
    await approve(ctx.page);
  }
  const audit = jsonl(ctx.dirs.toolAudit);
  const events = agentEvents(ctx.dirs);
  const currentStrategy = strategyId && fs.existsSync(path.join(ctx.dirs.strategies, `${strategyId}.json`))
    ? readJson(path.join(ctx.dirs.strategies, `${strategyId}.json`)) : null;
  const paperToolIds = ["paper.approve_start", "paper.pause", "paper.resume", "paper.stop"];
  const strategyToolIds = ["strategy.rename", "strategy.archive", "strategy.restore", "strategy.delete"];
  const metrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `K-expanded-safe-tools-${ctx.width}.png`);
  return {
    sessionId,
    statuses,
    plannedTools,
    strategyPlans,
    paperLifecycleExact: statuses.every((item) => item.expected === item.actual && item.responseReceived),
    allPaperToolsPlanned: paperToolIds.every((id) => plannedTools.includes(id)),
    allStrategyToolsPlanned: strategyToolIds.every((id) => strategyPlans.includes(id)),
    allWritesAudited: [...paperToolIds, ...strategyToolIds].every((id) => audit.some((row) => row.toolId === id)),
    semanticEvents: ["paper.activated", "paper.paused", "paper.stopped", "strategy.renamed", "strategy.archived", "strategy.restored"].every((type) => events.some((event) => event.type === type)),
    deleteDependencyBlocked: audit.some((row) => row.toolId === "strategy.delete" && row.result?.ok === false) && Boolean(currentStrategy),
    exchangeNeverCalled: jsonFiles(ctx.dirs.paper).map((name) => readJson(path.join(ctx.dirs.paper, name))).filter((session) => session?.id).every((session) => session.exchangeCalled === false),
    ...metrics,
  };
}

async function scenarioL(ctx) {
  const baselineAudit = jsonl(ctx.dirs.toolAudit).length;
  const queries = ["Live 시작해", "BTC 실전 주문 넣어", "SAFE 수정해"];
  const responses = [];
  for (const query of queries) {
    const response = await send(ctx.page, query);
    responses.push({
      query,
      intentType: response.intentType,
      safetyBlocked: response.safetyBlocked === true,
      hasApproval: Boolean(response.proposedAction?.requiresApproval),
      toolIds: response.reasoningMeta?.toolIds ?? [],
    });
  }
  const newAudits = jsonl(ctx.dirs.toolAudit).slice(baselineAudit);
  const writeIds = new Set([
    "search.create", "search.start", "search.pause", "search.cancel", "results.promote",
    "backtest.run", "paper.prepare", "paper.approve_start", "paper.pause", "paper.resume", "paper.stop",
    "strategy.rename", "strategy.archive", "strategy.restore", "strategy.delete",
  ]);
  const metrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `L-absolute-local-blocks-${ctx.width}.png`);
  return {
    responses,
    allBlockedLocally: responses.every((item) => item.safetyBlocked && !item.hasApproval && item.toolIds.length === 0),
    exactIntents: responses.map((item) => item.intentType).join(",") === "start_live,execute_trade,modify_safe",
    noWriteAudit: !newAudits.some((row) => writeIds.has(row.toolId)),
    noPaperSession: jsonFiles(ctx.dirs.paper).every((name) => !readJson(path.join(ctx.dirs.paper, name))?.id),
    noLiveRuntime: !fs.existsSync(path.join(ctx.dirs.root, "live-dry-run", "session.json")),
    ...metrics,
  };
}

async function scenarioM(ctx) {
  const completedJob = jobs(ctx.dirs).find((job) => job.status === "completed");
  if (!completedJob) throw new Error("results_promote_completed_job_missing");
  await openDrawer(
    ctx.page,
    ctx.port,
    `/results?jobId=${encodeURIComponent(completedJob.id)}&demo=1`,
  );
  const beforeStrategyFiles = jsonFiles(ctx.dirs.strategies).sort();
  const planned = await send(ctx.page, "선택한 결과를 전략으로 승격해");
  const plan = planInfo(planned);
  const step = plan.steps.find((item) => item.toolId === "results.promote");
  const first = await approve(ctx.page);
  const afterFirstStrategyFiles = jsonFiles(ctx.dirs.strategies).sort();
  const repeatedPlan = await send(ctx.page, "선택한 결과를 전략으로 승격해");
  const repeated = await approve(ctx.page);
  const afterRepeatStrategyFiles = jsonFiles(ctx.dirs.strategies).sort();
  const audits = jsonl(ctx.dirs.toolAudit).filter((row) => row.toolId === "results.promote");
  const events = agentEvents(ctx.dirs).filter((event) => event.type === "strategy.promoted");
  const receipts = jsonFiles(ctx.dirs.toolIdempotency);
  const metrics = await uiMetrics(ctx.page);
  await shot(ctx.page, `M-results-promote-${ctx.width}.png`);
  return {
    jobId: completedJob.id,
    intentType: planned?.intentType ?? null,
    approvalPlanned: Boolean(step),
    exactPlan: Boolean(step) && step.arguments?.jobId === completedJob.id && step.arguments?.mode === "top" && step.arguments?.limit === 1,
    firstExecuted: Boolean(first?.executionResult),
    repeatedIntentType: repeatedPlan?.intentType ?? null,
    repeatedExecuted: Boolean(repeated?.executionResult),
    auditCount: audits.length,
    allAuditsOk: audits.length === 2 && audits.every((row) => row.result?.ok === true && row.approved === true),
    semanticPromotionPersisted: events.length >= 1,
    idempotencyReceiptPersisted: receipts.length === 1,
    strategyCountBefore: beforeStrategyFiles.length,
    strategyCountAfterFirst: afterFirstStrategyFiles.length,
    strategyCountAfterRepeat: afterRepeatStrategyFiles.length,
    noDuplicatePromotion: afterRepeatStrategyFiles.length === afterFirstStrategyFiles.length,
    promotionCopyVisible: /전략으로 승격/.test(metrics.primaryText),
    ...metrics,
  };
}

async function runOne(browser, baseEnv, provider, scenario, width) {
  const label = `${scenario}-${width}-${crypto.randomBytes(3).toString("hex")}`;
  const dirs = freshRuntime(label);
  const port = await freePort();
  const evidenceDir = path.join(RUNS, `${scenario}-${width}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const env = runtimeEnv(
    baseEnv,
    dirs,
    port,
    provider,
    scenario === "F"
      ? { AI_AGENT_PROVIDER: "gemini", GEMINI_API_KEY: "controlled-invalid-provider-key" }
      : {},
  );
  initDemo(env);
  let server = null;
  let context = null;
  const consoleErrors = [];
  const startedAt = new Date().toISOString();
  try {
    server = await startServer(env, port, path.join(evidenceDir, "server.log"));
    context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const location = msg.location();
      consoleErrors.push(`${msg.text().slice(0, 1200)} @ ${location.url}:${location.lineNumber}:${location.columnNumber}`);
    });
    page.on("pageerror", (err) => consoleErrors.push((err.stack ?? err.message).slice(0, 2000)));
    await openDrawer(page, port);
    const ctx = { page, dirs, width, port, consoleErrors };
    const result = scenario === "A" ? await scenarioA(ctx)
      : scenario === "B" ? await scenarioB(ctx)
      : scenario === "C" ? await scenarioC(ctx)
      : scenario === "D" ? await scenarioD(ctx)
      : scenario === "E" ? await scenarioE(ctx)
      : scenario === "F" ? await scenarioF(ctx)
      : scenario === "G" ? await scenarioG(ctx)
      : scenario === "H" ? await scenarioH(ctx)
      : scenario === "I" ? await scenarioI(ctx)
      : scenario === "J" ? await scenarioJ(ctx)
      : scenario === "K" ? await scenarioK(ctx)
      : scenario === "L" ? await scenarioL(ctx)
      : await scenarioM(ctx);
    const persisted = {
      jobs: jobs(dirs),
      toolAudit: jsonl(dirs.toolAudit),
      reasoningAudit: reasoningAudit(dirs),
      backtestFiles: jsonFiles(dirs.backtests),
      paperFiles: jsonFiles(dirs.paper),
      memory: agentMemory(dirs),
      sessionFiles: fs.existsSync(dirs.sessions) ? fs.readdirSync(dirs.sessions) : [],
    };
    fs.writeFileSync(path.join(evidenceDir, "persisted.json"), JSON.stringify(persisted, null, 2));
    return {
      scenario, width, startedAt, finishedAt: new Date().toISOString(),
      buildId: BUILD_ID, runtimeRoot: dirs.root, port, provider,
      consoleErrorCount: consoleErrors.length, consoleErrors,
      reasoningRequests: persisted.reasoningAudit,
      result,
    };
  } catch (error) {
    return { scenario, width, startedAt, finishedAt: new Date().toISOString(), buildId: BUILD_ID, runtimeRoot: dirs.root, port, provider, error: String(error?.stack ?? error), consoleErrorCount: consoleErrors.length, consoleErrors };
  } finally {
    await context?.close().catch(() => {});
    const cleared = await stopServer(server, port);
    fs.writeFileSync(path.join(evidenceDir, "runtime-clear.json"), JSON.stringify(cleared, null, 2));
  }
}

async function selectHealthyProvider(baseEnv) {
  const forcedProvider = process.env.PHASE3_PROVIDER?.trim() || null;
  const probe = await runStructuredProviderCanaryProbe({
    repoRoot: ROOT,
    env: baseEnv,
    forcedProvider,
  });
  if (!probe.canaryPassed || !probe.providerSucceeded || !probe.selectedProvider) {
    throw new Error(`no_healthy_provider:${JSON.stringify(probe)}`);
  }
  return {
    provider: probe.selectedProvider,
    canary: probe.canary,
    verification: probe.verification,
    health: {
      activeProvider: probe.selectedProvider,
      checks: (probe.checks ?? []).map((x) => ({
        provider: x.provider,
        model: x.model,
        configured: x.configured,
        ok: x.ok,
        latencyMs: x.latencyMs,
        errorKo: x.errorKo,
      })),
    },
    attempts: probe.attempts ?? [],
  };
}

function passEntry(entry) {
  if (entry.error || entry.consoleErrorCount !== 0) return false;
  const r = entry.result;
  if (!r) return false;
  if (entry.scenario === "B") {
    if (
      r.beforeApproval.rawLeakCount !== 0 ||
      r.afterApproval.rawLeakCount !== 0 ||
      r.beforeApproval.horizontalOverflow ||
      r.afterApproval.horizontalOverflow ||
      !r.beforeApproval.thinkingCleared ||
      !r.afterApproval.thinkingCleared
    ) return false;
  } else if (r.rawLeakCount !== 0 || r.horizontalOverflow || !r.thinkingCleared) {
    return false;
  }
  if (entry.scenario === "A") return r.priorCombinationRecognized && r.priorCombinationExcluded && r.canonicalParametersDiffer && r.requestHashDiffers && r.exactlyOneApprovalAction;
  if (entry.scenario === "B") return r.beforeApproval.hasApproval && r.beforeApproval.exactOldJobIdentified && r.beforeApproval.noToolExecuted && r.beforeApproval.noReplacementJobExists && r.beforeApproval.oldJobStillActive && r.beforeApproval.replacementTimeframe === "1h" && r.afterApproval.hasExecutionResult && r.afterApproval.approvalCleared && r.afterApproval.monitoringVisible && r.afterApproval.thinkingCleared && r.afterApproval.duplicateExecutionCount === 0 && (r.afterApproval.providerCallCount ?? 0) === 0 && r.afterApproval.persistedStateMatch && r.repeatApprovalCreatedNothing;
  if (entry.scenario === "C") return r.toolIds.includes("search.status") && r.exactActiveJob && !r.hasApproval && !r.falseCompletion && r.persistedStateMatch;
  if (entry.scenario === "D") return r.plannedTools.includes("backtest.run") && r.runId && r.persistedRunCreated && r.repeatedApprovalNoDuplicate && r.actualMetricsOnly;
  if (entry.scenario === "E") return r.plannedTools.includes("paper.prepare") && r.oneSessionCreated && r.internalStatus === "pending_approval" && r.exchangeCalled === false && !r.executorStarted && r.separateActivationApprovalExplained;
  if (entry.scenario === "G") return r.timeframeModified && r.priorPatternExcluded && r.comparisonNatural && r.continuedWithExactJob && r.cancelReplaceExact && r.pauseExact && r.pauseExecuted && r.resumeExact && r.resumeExecuted && r.noDuplicateActiveTask;
  if (entry.scenario === "H") return r.allResearchIntent && r.allResponsesReceived && r.allEvidenceLinked && r.untestedPlanCreated && r.noUnapprovedWrite && r.noFalseImprovement && r.noUnsupportedRanking && r.noDuplicateActiveTask;
  if (entry.scenario === "I") return r.semanticToolEvents && r.watcherEventPersisted && r.idempotentEventIds && r.sessionRestoredTaskSummary && r.refreshContinuesExactWorkflow && ["monitoring", "analyzing"].includes(r.taskState) && r.noAutonomousExtraTask;
  if (entry.scenario === "J") return r.terminalMemoryPersisted && r.approvedPlanRemembered && r.recallIntent === "memory_recall" && r.recalledEvidenceLinked && r.recallHasNoApproval && r.refreshRecallIntent === "memory_recall" && r.memoryStableAcrossRefresh && r.noAutonomousWrite;
  if (entry.scenario === "K") return r.paperLifecycleExact && r.allPaperToolsPlanned && r.allStrategyToolsPlanned && r.allWritesAudited && r.semanticEvents && r.deleteDependencyBlocked && r.exchangeNeverCalled;
  if (entry.scenario === "L") return r.allBlockedLocally && r.exactIntents && r.noWriteAudit && r.noPaperSession && r.noLiveRuntime;
  if (entry.scenario === "M") return r.intentType === "results_promote_request" && r.approvalPlanned && r.exactPlan && r.firstExecuted && r.repeatedIntentType === "results_promote_request" && r.repeatedExecuted && r.allAuditsOk && r.semanticPromotionPersisted && r.idempotencyReceiptPersisted && r.noDuplicatePromotion && r.promotionCopyVisible;
  return r.firstFallbackUsed && r.firstToolIds.includes("search.status") && r.secondResponseReceived && (r.secondDirectAnswer || r.secondFallbackUsed) && r.noDuplicateProviderLoop && r.noWriteToolExecuted && r.firstThinkingCleared && r.conversationContinued;
}

async function main() {
  const baseEnv = loadEnvLocal();
  const providerSelection = await selectHealthyProvider(baseEnv);
  const browser = await chromium.launch({ headless: true });
  const matrix = [];
  try {
    // Sequential viewports avoid shared-host overload (timeouts / console noise)
    // that falsely fails product assertions under Promise.all concurrency.
    const viewportRows = [];
    for (const width of VIEWPORTS) {
      const rows = [];
      for (const scenario of SCENARIOS) {
        const entry = await runOne(browser, baseEnv, providerSelection.provider, scenario, width);
        entry.passed = passEntry(entry);
        rows.push(entry);
        matrix.push(entry);
        fs.writeFileSync(
          path.join(RUNS, `${scenario}-${width}`, "result.json"),
          JSON.stringify(entry, null, 2),
        );
        fs.writeFileSync(path.join(OUT, "phase3-progress.json"), JSON.stringify({ buildId: BUILD_ID, providerSelection, matrix }, null, 2));
        console.log(`${scenario}-${width}: ${entry.passed ? "PASS" : "FAIL"}`);
      }
      viewportRows.push(rows);
    }
    matrix.splice(0, matrix.length, ...viewportRows.flat());
  } finally {
    await browser.close();
  }
  const report = {
    schemaVersion: 1,
    startedAt: matrix[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    buildId: BUILD_ID,
    providerSelection,
    viewports: VIEWPORTS,
    scenarios: SCENARIOS,
    matrix,
    passed: matrix.length === VIEWPORTS.length * SCENARIOS.length && matrix.every((x) => x.passed),
  };
  fs.writeFileSync(path.join(OUT, "phase3-isolated-acceptance.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failures: matrix.filter((x) => !x.passed).map((x) => `${x.scenario}-${x.width}`), provider: providerSelection.provider }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((error) => {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
});
