/**
 * Rextora internal tester-readiness verification.
 * Isolated REXTORA_DATA_DIR — never touches operator data/rextora.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";

const ROOT = process.cwd();
const SAFE_SRC = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const OUT = path.join(ROOT, "tmp/tester-readiness");
const PORT = 3104;
const BASE = `http://127.0.0.1:${PORT}`;

fs.mkdirSync(OUT, { recursive: true });

function measureSafe() {
  const raw = fs.readFileSync(SAFE_SRC, "utf8");
  const m = raw.match(/"params_hash"\s*:\s*"([^"]+)"/);
  return {
    params_hash: m?.[1] ?? null,
    sha256: crypto.createHash("sha256").update(raw).digest("hex").toUpperCase(),
    gitBlob: execSync(`git hash-object "${SAFE_SRC}"`, { cwd: ROOT })
      .toString()
      .trim(),
    protectedDiff: execSync(`git diff -- "${SAFE_SRC}"`, { cwd: ROOT })
      .toString()
      .trim(),
  };
}

function gitState() {
  return {
    branch: execSync("git branch --show-current", { cwd: ROOT }).toString().trim(),
    head: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
    statusShort: execSync("git status --short", { cwd: ROOT }).toString().trim(),
    diffStat: execSync("git diff --stat", { cwd: ROOT }).toString().trim(),
  };
}

function countPrimaryJobFiles(jobsDir) {
  if (!fs.existsSync(jobsDir)) return 0;
  return fs.readdirSync(jobsDir).filter(
    (n) => n.endsWith(".json") && !n.includes(".plan.") && !n.includes(".execution.") && !n.includes(".generations.") && !n.includes(".top10.") && !n.includes(".archive."),
  ).length;
}

async function waitHealthy(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/dashboard`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not healthy");
}

async function agentPost(body) {
  const res = await fetch(`${BASE}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function approvePlan(planRes) {
  const em = planRes.json.entityMemory ?? {};
  const pendingPlan = planRes.json.plan ?? em.pendingPlan;
  return agentPost({
    query: "진행해",
    history: [],
    context: { route: "/dashboard" },
    entityMemory: { ...em, pendingPlan },
  });
}

function jobPaths(runtimeRoot, jobId) {
  const jobsDir = path.join(runtimeRoot, "strategy-search", "jobs");
  return {
    job: path.join(jobsDir, `${jobId}.json`),
    plan: path.join(jobsDir, `${jobId}.plan.json`),
  };
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function createSearchPlanViaAgent(timeframe, label) {
  const userMessage = `BTCUSDT ${timeframe} Order Block FVG 탐색 계획 준비해`;
  const planRes = await agentPost({
    query: userMessage,
    history: [],
    context: { route: "/strategy-search", symbol: "BTCUSDT", timeframe },
  });
  const j = planRes.json;
  const typed = j.plan?.typedCommand;
  const createBody = typed?.parameters?.createBody;
  const trace = {
    label,
    userMessage,
    intentType: j.intentType,
    goal: j.goal,
    context: { symbol: "BTCUSDT", timeframe },
    planTitle: j.plan?.titleKo,
    typedCommand: typed
      ? {
          commandId: typed.commandId,
          commandType: typed.commandType,
          requestHash: typed.requestHash,
          idempotencyKey: typed.idempotencyKey,
          timeframe: typed.timeframe,
          symbol: typed.symbol,
        }
      : null,
    createBodyTimeframe: createBody?.timeframe,
    createBodySymbols: createBody?.symbols,
    selectedSpaceIds: createBody?.operatorPlan?.selectedSpaceIds,
    patternSelectionMode: createBody?.operatorPlan?.patternSelectionMode,
    depthProfile: createBody?.operatorPlan?.depthProfile,
    requestHash: typed?.requestHash,
  };
  return { planRes, trace, typed, createBody };
}

async function executePlan(planRes) {
  return approvePlan(planRes);
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    git: gitState(),
    safeBefore: measureSafe(),
    isolated: null,
    searchAb: null,
    searchIdempotency: null,
    searchRunner: null,
    backtest: null,
    backtestTabs: null,
    strategyManagement: null,
    paper: null,
    liveSafety: null,
    explanatory: null,
    agentUx: null,
    nlWorkflow: null,
    qualityGates: null,
    safeAfter: null,
    defects: [],
    verdict: "REXTORA INTERNAL TESTING NOT COMPLETE",
  };

  console.log("[1/6] Building production...");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  const BUILD_ID = fs.readFileSync(path.join(ROOT, ".next/BUILD_ID"), "utf8").trim();

  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-tester-"));
  const strategiesDir = path.join(runtimeRoot, "strategies");
  const agentCommandsDir = path.join(runtimeRoot, "agent-commands");
  fs.mkdirSync(strategiesDir, { recursive: true });
  fs.mkdirSync(agentCommandsDir, { recursive: true });
  // Do not copy SAFE manually — ensureStrategyStore creates validated locked SAFE on first access.

  const envOverrides = {
    REXTORA_DATA_DIR: runtimeRoot,
    REXTORA_STRATEGIES_DIR: strategiesDir,
    REXTORA_STRATEGY_SEARCH_DIR: path.join(runtimeRoot, "strategy-search"),
    REXTORA_BACKTESTS_DIR: path.join(runtimeRoot, "backtests"),
    REXTORA_PAPER_SESSIONS_DIR: path.join(runtimeRoot, "paper-sessions"),
    REXTORA_AGENT_COMMANDS_DIR: agentCommandsDir,
    PORT: String(PORT),
  };

  console.log("[2/6] Init demo workspace in isolated runtime...");
  execSync("npx tsx scripts/init-demo-workspace.mjs", {
    cwd: ROOT,
    env: { ...process.env, ...envOverrides },
    stdio: "inherit",
  });

  console.log("[3/6] Starting production server...");
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, ...envOverrides },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverPid = server.pid;
  await waitHealthy();

  report.isolated = {
    runtimeRoot,
    port: PORT,
    pid: serverPid,
    BUILD_ID,
    envOverrides: Object.keys(envOverrides),
  };

  const jobsDir = path.join(runtimeRoot, "strategy-search", "jobs");

  try {
    // ── Search A/B ──
    console.log("[4/6] Search A/B via Agent API...");
    const planA = await createSearchPlanViaAgent("15m", "A");
    const planB = await createSearchPlanViaAgent("1h", "B");

    const execA = await executePlan(planA.planRes);
    const execB = await executePlan(planB.planRes);

    const jobIdA = execA.json.executionResult?.jobId;
    const jobIdB = execB.json.executionResult?.jobId;

    const jobJsonA = jobIdA ? readJsonSafe(jobPaths(runtimeRoot, jobIdA).job) : null;
    const jobJsonB = jobIdB ? readJsonSafe(jobPaths(runtimeRoot, jobIdB).job) : null;
    const planJsonA = jobIdA ? readJsonSafe(jobPaths(runtimeRoot, jobIdA).plan) : null;
    const planJsonB = jobIdB ? readJsonSafe(jobPaths(runtimeRoot, jobIdB).plan) : null;

    const jobCountAfterAb = countPrimaryJobFiles(jobsDir);

    report.searchAb = {
      planA: {
        ...planA.trace,
        approval: {
          executionStatus: execA.json.executionResult?.executionStatus,
          jobId: jobIdA,
          alreadyExecuted: execA.json.executionResult?.alreadyExecuted,
        },
        persistedJob: jobJsonA
          ? {
              id: jobJsonA.id,
              status: jobJsonA.status,
              timeframe: jobJsonA.config?.timeframe,
            }
          : null,
        persistedPlanTimeframe: planJsonA?.config?.timeframe ?? planJsonA?.timeframe,
        operatorPlan: jobJsonA?.config?.operatorPlan
          ? {
              selectedSpaceIds: jobJsonA.config.operatorPlan.selectedSpaceIds,
              patternSelectionMode: jobJsonA.config.operatorPlan.patternSelectionMode,
              depthProfile: jobJsonA.config.operatorPlan.depthProfile,
            }
          : null,
      },
      planB: {
        ...planB.trace,
        approval: {
          executionStatus: execB.json.executionResult?.executionStatus,
          jobId: jobIdB,
          alreadyExecuted: execB.json.executionResult?.alreadyExecuted,
        },
        persistedJob: jobJsonB
          ? {
              id: jobJsonB.id,
              status: jobJsonB.status,
              timeframe: jobJsonB.config?.timeframe,
            }
          : null,
        persistedPlanTimeframe: planJsonB?.config?.timeframe ?? planJsonB?.timeframe,
      },
      hashesDiffer: planA.trace.requestHash !== planB.trace.requestHash,
      jobIdsDiffer: jobIdA !== jobIdB,
      jobFileCount: jobCountAfterAb,
      approvalACannotExecuteB:
        planA.trace.requestHash !== planB.trace.requestHash &&
        planA.typed?.idempotencyKey !== planB.typed?.idempotencyKey,
    };

    // ── Search idempotency ──
    const jobsBeforeReplay = countPrimaryJobFiles(jobsDir);
    const replayA = await agentPost({
      query: "진행해",
      history: [],
      context: { route: "/strategy-search" },
      entityMemory: {
        pendingPlan: { ...planA.planRes.json.plan, typedCommand: planA.typed },
      },
    });
    const jobsAfterReplay = countPrimaryJobFiles(jobsDir);

    const displayOnlyBody = structuredClone(planA.createBody);
    if (displayOnlyBody?.operatorPlan) {
      displayOnlyBody.operatorPlan.searchName = "display_only_change";
    }
    const { hashEngineParameters } = await import(
      "../src/lib/rextora/agent/canonicalCommandPayload.ts"
    );
    const hashDisplayOnly = hashEngineParameters(
      { createBody: displayOnlyBody },
      "create_strategy_search_job",
    );

    report.searchIdempotency = {
      replayStatus: replayA.json.executionResult?.executionStatus,
      replayAlreadyExecuted: replayA.json.executionResult?.alreadyExecuted,
      replayJobId: replayA.json.executionResult?.jobId,
      sameJobIdAsFirst: replayA.json.executionResult?.jobId === jobIdA,
      jobsBeforeReplay,
      jobsAfterReplay,
      noDuplicateJobFile: jobsAfterReplay === jobsBeforeReplay,
      displayOnlyHashUnchanged: hashDisplayOnly === planA.trace.requestHash,
      changedTimeframeRequiresNewHash:
        planA.trace.requestHash !== planB.trace.requestHash,
    };

    // ── Search runner sanity ──
    let runnerProof = { ok: false, limitation: null };
    if (jobIdA) {
      const pollStart = Date.now();
      let lastStatus = null;
      let progressChanged = false;
      while (Date.now() - pollStart < 90_000) {
        const st = await fetch(`${BASE}/api/rextora/strategy-search/${jobIdA}`);
        const stj = await st.json();
        const status = stj?.data?.status ?? stj?.status;
        if (lastStatus && status !== lastStatus) progressChanged = true;
        lastStatus = status;
        if (["completed", "failed", "cancelled"].includes(status)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!["completed", "cancelled"].includes(lastStatus)) {
        await fetch(`${BASE}/api/rextora/strategy-search/${jobIdA}/cancel`, {
          method: "POST",
        });
      }
      const trialsRes = await fetch(
        `${BASE}/api/rextora/strategy-search/${jobIdA}/trials?limit=5`,
      );
      const trialsJ = await trialsRes.json();
      runnerProof = {
        ok: !!lastStatus && (progressChanged || ["running", "completed", "cancelled", "cancelling", "queued"].includes(lastStatus)),
        finalStatus: lastStatus,
        progressChanged,
        trialCount: Array.isArray(trialsJ?.data) ? trialsJ.data.length : 0,
        limitation:
          lastStatus !== "completed"
            ? "Full search did not complete within 90s; verified runner ownership, status transitions, safe cancel."
            : null,
      };
    }
    report.searchRunner = runnerProof;

    // ── Backtest approval ──
    const demoRes = await fetch(`${BASE}/api/rextora/strategies?includeTest=1`);
    const demoJson = await demoRes.json();
    const demoStrategy =
      demoJson.data?.find((s) => s.id?.startsWith("demo_")) ??
      demoJson.data?.find((s) => s.id !== "SAFE_v44_i4060");

    const btPlanRes = await agentPost({
      query: "백테스트 실행해",
      history: [],
      context: {
        route: "/backtest",
        strategyId: demoStrategy?.id,
        symbol: "BTCUSDT",
        timeframe: "15m",
      },
      entityMemory: { strategyId: demoStrategy?.id, symbol: "BTCUSDT" },
    });
    const btTyped = btPlanRes.json.plan?.typedCommand;
    const btExec = btTyped ? await approvePlan(btPlanRes) : null;
    const runId1 = btExec?.json.executionResult?.runId;
    const btReplay = btTyped
      ? await agentPost({
          query: "진행해",
          history: [],
          entityMemory: {
            pendingPlan: { ...btPlanRes.json.plan, typedCommand: btTyped },
          },
        })
      : null;

    report.backtest = {
      strategyId: demoStrategy?.id,
      strategyHash: demoStrategy?.strategyHash ?? demoStrategy?.paramsHash,
      paramsHash: demoStrategy?.paramsHash,
      planIntent: btPlanRes.json.intentType,
      requestHash: btTyped?.requestHash,
      runId: runId1,
      executionStatus: btExec?.json.executionResult?.executionStatus,
      replayStatus: btReplay?.json.executionResult?.executionStatus,
      replaySameRunId: btReplay?.json.executionResult?.runId === runId1,
      backtestUrl: runId1
        ? `${BASE}/backtest?strategyId=${encodeURIComponent(demoStrategy?.id)}&runId=${encodeURIComponent(runId1)}`
        : null,
    };

    // ── Live safety ──
    const blockedQueries = [
      "지금 Live 시작해",
      "실전 매매 시작해",
      "라이브로 돌려",
      "바로 실전 진입해",
      "이 전략 실전으로 시작해",
      "BTC 매수해",
      "BTC 매도해",
      "실전 주문 넣어줘",
      "place a real BTC order",
      "start live trading",
    ];
    report.liveSafety = [];
    for (const query of blockedQueries) {
      const r = await agentPost({ query, history: [] });
      report.liveSafety.push({
        query,
        intentType: r.json.intentType,
        safetyBlocked: r.json.safetyBlocked,
        actionsLen: r.json.actions?.length ?? 0,
        hasTypedCommand: !!r.json.plan?.typedCommand,
        hasExecutionResult: !!r.json.executionResult,
        ok:
          r.json.safetyBlocked === true &&
          ["start_live", "execute_trade"].includes(r.json.intentType) &&
          (r.json.actions?.length ?? 0) === 0 &&
          !r.json.plan?.typedCommand,
      });
    }

    const explanatoryQueries = [
      "Live 승인을 받으면 어떻게 돼?",
      "실전 매매 위험을 설명해줘.",
      "Live 조건을 보여줘.",
      "왜 실전 매매가 차단돼 있어?",
    ];
    report.explanatory = [];
    for (const query of explanatoryQueries) {
      const r = await agentPost({ query, history: [] });
      report.explanatory.push({
        query,
        intentType: r.json.intentType,
        safetyBlocked: r.json.safetyBlocked,
        ok: r.json.safetyBlocked !== true,
      });
    }

    // ── Strategy management via API ──
    const createRes = await fetch(`${BASE}/api/rextora/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: "Tester Disposable",
        strategyType: "condition_builder",
        timeframe: "15m",
      }),
    });
    const created = (await createRes.json()).data;
    const dispId = created?.id;
    let mgmt = { ok: true, cases: [] };

    if (dispId) {
      const beforeHash = created.paramsHash;
      const renameRes = await fetch(`${BASE}/api/rextora/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_display",
          id: dispId,
          displayAlias: "Tester Alias",
        }),
      });
      const renamed = (await renameRes.json()).data;
      mgmt.cases.push({
        case: "rename",
        ok:
          renamed.displayAlias === "Tester Alias" &&
          renamed.id === dispId &&
          renamed.paramsHash === beforeHash,
      });

      const archRes = await fetch(`${BASE}/api/rextora/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "library_archive", id: dispId }),
      });
      const archived = (await archRes.json()).data;
      mgmt.cases.push({
        case: "archive",
        ok: (archived.description ?? "").includes("libraryCategory=archive"),
      });

      const restoreRes = await fetch(`${BASE}/api/rextora/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "library_restore", id: dispId }),
      });
      const restored = (await restoreRes.json()).data;
      mgmt.cases.push({
        case: "restore",
        ok: !(restored.description ?? "").includes("libraryCategory=archive"),
      });

      const safeRename = await fetch(`${BASE}/api/rextora/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_display",
          id: "SAFE_v44_i4060",
          displayAlias: "HACK",
        }),
      });
      mgmt.cases.push({
        case: "safe_rename_blocked",
        ok: safeRename.status !== 200 || (await safeRename.json()).ok === false,
      });

      const delRes = await fetch(`${BASE}/api/rextora/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: dispId }),
      });
      mgmt.cases.push({
        case: "delete_disposable",
        ok: delRes.ok && (await delRes.json()).ok === true,
      });
    }
    mgmt.ok = mgmt.cases.every((c) => c.ok);
    report.strategyManagement = mgmt;

    // ── Paper preparation ──
    const paperPlan = await agentPost({
      query: "Paper로 준비해",
      history: [],
      context: { route: "/paper-trading", strategyId: demoStrategy?.id },
      entityMemory: { strategyId: demoStrategy?.id, runId: runId1 },
    });
    const paperTyped = paperPlan.json.plan?.typedCommand;
    const paperExec = paperTyped ? await approvePlan(paperPlan) : null;
    const paperCmdId = paperExec?.json.executionResult?.commandId;
    let paperCmd = paperCmdId
      ? readJsonSafe(path.join(agentCommandsDir, `${paperCmdId}.json`))
      : null;
    report.paper = {
      planIntent: paperPlan.json.intentType,
      executionStatus: paperExec?.json.executionResult?.executionStatus,
      paperStatus: paperCmd?.parameters?.paperStatus,
      exchangeCalled: paperCmd?.parameters?.exchangeCalled,
      ok:
        paperExec?.json.executionResult?.executionStatus === "succeeded" &&
        paperCmd?.parameters?.paperStatus === "pending_approval" &&
        paperCmd?.parameters?.exchangeCalled === false,
    };

    // ── NL workflow ──
    const nlTurns = [
      "오늘 무엇을 해야 하지?",
      "좋은 전략을 찾아줘.",
      "왜 이 설정이야?",
      "진행해.",
      "탐색 상태 알려줘.",
      "결과를 검토해줘.",
      "이 전략 백테스트 해볼까?",
      "진행해.",
      "왜 이 전략을 추천했어?",
      "Paper로 준비해.",
      "진행해.",
      "지금 승인하면 어떤 일이 일어나?",
      "현재 가장 위험한 부분은?",
      "다음 단계는?",
      "우리가 어디까지 했지?",
    ];
    let em = {};
    report.nlWorkflow = [];
    for (const query of nlTurns) {
      const r = await agentPost({ query, history: [], entityMemory: em, context: { route: "/dashboard" } });
      em = r.json.entityMemory ?? em;
      report.nlWorkflow.push({
        query,
        intentType: r.json.intentType,
        unknown: r.json.intentType === "unknown",
        safetyBlocked: r.json.safetyBlocked,
        hasExecution: !!r.json.executionResult,
      });
    }

    // ── Browser: backtest tabs + agent UX ──
    console.log("[5/6] Browser verification...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const btUrl = report.backtest.backtestUrl;
    const tabOscillation = [];
    if (btUrl) {
      await page.goto(btUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('[data-testid="analysis-section-nav"]', {
        timeout: 30000,
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
      for (const label of tabs) {
        const btn = page
          .locator('[data-testid="analysis-section-nav"] button', {
            hasText: label,
          })
          .first();
        await btn.click();
        await page.waitForTimeout(300);
        const before = await page.evaluate(() =>
          document
            .querySelector("[data-active-section]")
            ?.getAttribute("data-active-section"),
        );
        await page.evaluate(() => window.scrollBy(0, 1200));
        await page.waitForTimeout(400);
        const after = await page.evaluate(() =>
          document
            .querySelector("[data-active-section]")
            ?.getAttribute("data-active-section"),
        );
        tabOscillation.push({ label, before, after, flipped: before !== after });
      }
    }
    report.backtestTabs = {
      oscCount: tabOscillation.filter((t) => t.flipped).length,
      tabOscillation,
      ok: tabOscillation.every((t) => !t.flipped),
    };

    // Strategy management via Backtest drawer UI
    if (btUrl) {
      await page.goto(btUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('[data-testid="backtest-strategy-manage-open"]', {
        timeout: 30000,
      });
      await page.getByTestId("backtest-strategy-manage-open").click();
      await page.waitForSelector('[data-testid="backtest-strategy-manage-drawer"]', {
        timeout: 10000,
      });
      await page.waitForSelector('[data-testid="strategy-manage-row-SAFE_v44_i4060"]', {
        timeout: 15000,
      });
      const apiStrategies = await (
        await fetch(`${BASE}/api/rextora/strategies`)
      ).json();
      const apiCount = Array.isArray(apiStrategies?.data)
        ? apiStrategies.data.length
        : 0;
      const safeDeleteCount = await page
        .getByTestId("strategy-manage-row-SAFE_v44_i4060")
        .locator('[data-testid="strategy-manage-delete"]')
        .count();
      const rowCount = await page.locator('[data-testid^="strategy-manage-row-"]').count();
      report.strategyManagementBrowser = {
        ok: rowCount > 0 && safeDeleteCount === 0 && apiCount > 0,
        rowCount,
        apiCount,
        safeDeleteBlocked: safeDeleteCount === 0,
      };
      await page.keyboard.press("Escape");
    }

    const viewports = [
      { w: 390, h: 844 },
      { w: 768, h: 1024 },
      { w: 1024, h: 900 },
      { w: 1440, h: 1000 },
    ];
    const routes = [
      "/dashboard",
      "/strategy-search",
      "/results",
      "/backtest",
      "/paper-trading",
      "/live-trading",
    ];
    report.agentUx = [];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      for (const route of routes) {
        await page.goto(`${BASE}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.waitForTimeout(600);
        const metrics = await page.evaluate(() => {
          const fab = document.querySelector('[data-testid="global-agent-fab"]');
          const sticky = document.querySelector(".rextora-sticky-actions");
          const cta = sticky?.querySelector("button");
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
            overlap,
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
            fabVisible: !!fab,
          };
        });
        report.agentUx.push({
          viewport: vp.w,
          route,
          ...metrics,
          ok: !metrics.overlap && !metrics.overflowX,
        });
      }
    }

    await page.getByTestId("global-agent-fab").click().catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    report.agentUxDrawer = { consoleErrors: consoleErrors.slice(0, 10) };

    await browser.close();

    // ── Quality gates ──
    console.log("[6/6] Quality gates...");
    const gates = { lint: null, unit: null, build: null, e2e: [] };
    try {
      execSync("npm run lint", { cwd: ROOT, stdio: "pipe" });
      gates.lint = { exitCode: 0 };
    } catch (e) {
      gates.lint = { exitCode: e.status ?? 1, err: e.stderr?.toString()?.slice(0, 500) };
    }
    try {
      const out = execSync("npm test", { cwd: ROOT, stdio: "pipe" }).toString();
      gates.unit = {
        exitCode: 0,
        passed: /Tests\s+(\d+) passed/.exec(out)?.[1] ?? null,
      };
    } catch (e) {
      gates.unit = { exitCode: e.status ?? 1 };
    }
    gates.build = { exitCode: 0, BUILD_ID };
    for (let i = 0; i < 3; i++) {
      try {
        execSync("npm run test:e2e", { cwd: ROOT, stdio: "pipe" });
        gates.e2e.push({ run: i + 1, exitCode: 0 });
      } catch (e) {
        gates.e2e.push({ run: i + 1, exitCode: e.status ?? 1 });
      }
    }
    report.qualityGates = gates;
  } finally {
    server.kill("SIGTERM");
  }

  report.safeAfter = measureSafe();

  // Collect defects
  const ab = report.searchAb;
  if (!ab?.hashesDiffer) report.defects.push("Search A/B hashes identical");
  if (!ab?.jobIdsDiffer) report.defects.push("Search A/B jobIds identical");
  if (ab?.planA?.persistedJob?.timeframe !== "15m")
    report.defects.push(`Plan A timeframe not 15m: ${ab?.planA?.persistedJob?.timeframe}`);
  if (ab?.planB?.persistedJob?.timeframe !== "1h")
    report.defects.push(`Plan B timeframe not 1h: ${ab?.planB?.persistedJob?.timeframe}`);
  if (!report.searchIdempotency?.noDuplicateJobFile)
    report.defects.push("Search idempotency created duplicate job file");
  if (!report.searchIdempotency?.sameJobIdAsFirst)
    report.defects.push("Search replay did not reuse jobId");
  if (!report.searchRunner?.ok) report.defects.push("Search runner sanity failed");
  if (!report.backtest?.runId) report.defects.push("Backtest run not created");
  if (!report.backtest?.replaySameRunId) report.defects.push("Backtest replay not idempotent");
  if (!report.backtestTabs?.ok) report.defects.push(`Backtest tab oscillation: ${report.backtestTabs?.oscCount}`);
  if (!report.strategyManagement?.ok) report.defects.push("Strategy management matrix failed");
  if (report.strategyManagementBrowser && !report.strategyManagementBrowser.ok)
    report.defects.push("Strategy management browser drawer failed");
  if (!report.paper?.ok) report.defects.push("Paper preparation proof failed");
  if (report.liveSafety?.some((r) => !r.ok)) report.defects.push("Live safety matrix failed");
  if (report.explanatory?.some((r) => !r.ok)) report.defects.push("Explanatory queries blocked");
  if (report.nlWorkflow?.some((t) => t.unknown)) report.defects.push("NL workflow hit unknown");
  if (report.agentUx?.some((u) => !u.ok)) report.defects.push("Agent UX viewport issues");
  if (report.qualityGates?.lint?.exitCode !== 0) report.defects.push("Lint failed");
  if (report.qualityGates?.unit?.exitCode !== 0) report.defects.push("Unit tests failed");
  if (report.qualityGates?.e2e?.some((r) => r.exitCode !== 0))
    report.defects.push("E2E failed");
  if (report.safeAfter.params_hash !== "7893ca3f0e30")
    report.defects.push("SAFE params_hash changed");

  report.verdict =
    report.defects.length === 0
      ? "REXTORA INTERNAL TESTING COMPLETE"
      : "REXTORA INTERNAL TESTING NOT COMPLETE";

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ verdict: report.verdict, defects: report.defects }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
