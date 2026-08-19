/**
 * Canonical structured external-provider canary probe.
 * Shared by acceptance harnesses and verification scripts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { loadProjectEnv } from "./loadProjectEnv.mjs";
import { resolveRepoRoot } from "./repoPaths.mjs";
import { evaluateStructuredProviderCanary } from "./providerCanary.mjs";

const CANARY_QUERY = "지금 상태만 간단히 알려줘. 새 작업은 만들지 마.";

export function assertHarnessDependencies(fromModuleUrl) {
  const repoRoot = resolveRepoRoot(fromModuleUrl);
  for (const rel of [
    "scripts/primaryLeakDetector.mjs",
    "scripts/providerCanary.mjs",
    "scripts/loadProjectEnv.mjs",
    "scripts/repoPaths.mjs",
    "scripts/init-demo-workspace.mjs",
  ]) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`harness_dependency_missing:${rel}`);
    }
  }
  return repoRoot;
}

function freshRuntime(repoRoot, label) {
  const id = `${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const root = path.join(repoRoot, "tmp", "provider-canary-runtime", id);
  const dirs = {
    root,
    strategies: path.join(root, "strategies"),
    search: path.join(root, "strategy-search"),
    backtests: path.join(root, "backtests"),
    paper: path.join(root, "paper"),
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

function runtimeEnv(base, dirs, port, provider) {
  return {
    ...base,
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

async function startServer(repoRoot, env, port, logFile) {
  const log = fs.openSync(logFile, "a");
  const child = spawn(path.join(repoRoot, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", log, log],
  });
  await waitHttp(port);
  return { child, log };
}

async function stopServer(server) {
  if (!server) return { processCleared: true, portCleared: true };
  server.child.kill("SIGTERM");
  const deadline = Date.now() + 15_000;
  while (server.child.exitCode === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (server.child.exitCode === null) server.child.kill("SIGKILL");
  fs.closeSync(server.log);
  return { processCleared: server.child.exitCode !== null, portCleared: true };
}

function initDemo(repoRoot, env) {
  const result = spawnSync("npx", ["tsx", "scripts/init-demo-workspace.mjs"], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`demo_init_failed:${result.stderr?.slice(-300)}`);
  }
}

function readWriteToolAuditCount(dirs) {
  const auditPath = path.join(dirs.toolAudit, "tool-audit.jsonl");
  if (!fs.existsSync(auditPath)) return 0;
  return fs.readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).length;
}

function configuredProvidersFromHealth(health) {
  return Array.from(
    new Set(
      (health.checks ?? [])
        .filter((check) => check.configured === true)
        .map((check) => check.provider)
        .filter(Boolean),
    ),
  );
}

async function runSingleCanaryAttempt(repoRoot, baseEnv, dirs, port, provider) {
  const env = runtimeEnv(baseEnv, dirs, port, provider);
  initDemo(repoRoot, env);
  const logFile = path.join(dirs.root, "provider-canary-server.log");
  let server;
  try {
    server = await startServer(repoRoot, env, port, logFile);
    const health = await (await fetch(`http://127.0.0.1:${port}/api/rextora/agent/health`)).json();
    const response = await fetch(`http://127.0.0.1:${port}/api/rextora/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CANARY_QUERY,
        turnId: `provider-canary-${Date.now()}-${provider}`,
        sessionId: "provider_canary",
        history: [],
        context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
        entityMemory: null,
        pendingProposedAction: null,
      }),
    });
    const body = await response.json();
    const canary = {
      status: response.status,
      provider: body.reasoningMeta?.provider ?? null,
      model: body.reasoningMeta?.model ?? null,
      fallbackUsed: body.reasoningMeta?.fallbackUsed ?? null,
      validationOk: body.reasoningMeta?.validationOk ?? null,
      toolIds: body.reasoningMeta?.toolIds ?? [],
      writeToolExecuted: Boolean(body.executionResult),
      structuredOutputValid: body.reasoningMeta?.validationOk === true,
      conclusionKo: body.conclusionKo ?? body.interpretationKo ?? null,
      latencyMs: body.reasoningMeta?.latencyMs ?? null,
      errorKo: body.reasoningMeta?.providerErrorKo ?? null,
    };
    const verification = evaluateStructuredProviderCanary({
      requestedProvider: provider,
      healthChecks: health.checks ?? [],
      canary,
      forcedProvider: provider,
    });
    return {
      requestedProvider: provider,
      health,
      canary,
      verification,
      writeToolAuditCount: readWriteToolAuditCount(dirs),
    };
  } finally {
    await stopServer(server);
  }
}

/**
 * Run the canonical structured provider canary against configured external providers.
 */
export async function runStructuredProviderCanaryProbe(options = {}) {
  const repoRoot = options.repoRoot ?? resolveRepoRoot(import.meta.url);
  const baseEnv = loadProjectEnv(repoRoot, options.env ?? process.env);
  const forcedProvider = options.forcedProvider?.trim() || null;
  const dirs = freshRuntime(repoRoot, "provider-probe");
  const port = await freePort();
  const attempts = [];

  if (forcedProvider) {
    attempts.push(await runSingleCanaryAttempt(repoRoot, baseEnv, dirs, port, forcedProvider));
  } else {
    const bootstrapEnv = runtimeEnv(baseEnv, dirs, port, "");
    initDemo(repoRoot, bootstrapEnv);
    const logFile = path.join(dirs.root, "provider-bootstrap.log");
    let bootstrapServer;
    try {
      bootstrapServer = await startServer(repoRoot, bootstrapEnv, port, logFile);
      const health = await (await fetch(`http://127.0.0.1:${port}/api/rextora/agent/health`)).json();
      await stopServer(bootstrapServer);
      bootstrapServer = null;
      const candidates = configuredProvidersFromHealth(health);
      if (!candidates.length) {
        return {
          requestedProvider: null,
          selectedProvider: null,
          providerAttempted: false,
          providerSucceeded: false,
          structuredOutputValid: false,
          canaryPassed: false,
          checks: health.checks ?? [],
          fallbackUsed: true,
          fallbackReason: "provider_missing",
          writeToolAuditCount: 0,
          attempts: [],
          canary: null,
          verification: evaluateStructuredProviderCanary({
            requestedProvider: null,
            healthChecks: health.checks ?? [],
            canary: null,
          }),
        };
      }
      for (const provider of candidates) {
        const attemptPort = await freePort();
        attempts.push(await runSingleCanaryAttempt(repoRoot, baseEnv, freshRuntime(repoRoot, `probe-${provider}`), attemptPort, provider));
      }
    } finally {
      await stopServer(bootstrapServer);
    }
  }

  const selectedAttempt =
    attempts.find(
      (attempt) =>
        attempt.verification.canaryPassed &&
        attempt.verification.providerSucceeded &&
        attempt.verification.fallbackUsed === false &&
        attempt.writeToolAuditCount === 0,
    ) ?? null;

  const primary = selectedAttempt ?? attempts[0] ?? null;
  const verification = primary?.verification ?? evaluateStructuredProviderCanary({
    requestedProvider: null,
    healthChecks: [],
    canary: null,
  });

  return {
    requestedProvider: primary?.requestedProvider ?? null,
    selectedProvider: selectedAttempt?.verification.selectedProvider ?? null,
    providerAttempted: attempts.some((attempt) => attempt.verification.providerAttempted),
    providerSucceeded: Boolean(selectedAttempt),
    structuredOutputValid: selectedAttempt?.canary?.structuredOutputValid === true,
    canaryPassed: Boolean(selectedAttempt),
    checks: primary?.health?.checks ?? [],
    fallbackUsed: !selectedAttempt,
    fallbackReason: selectedAttempt ? null : verification.fallbackReason,
    writeToolAuditCount: selectedAttempt?.writeToolAuditCount ?? attempts[0]?.writeToolAuditCount ?? 0,
    canary: selectedAttempt?.canary ?? primary?.canary ?? null,
    verification: selectedAttempt?.verification ?? verification,
    attempts: attempts.map((attempt) => ({
      requestedProvider: attempt.requestedProvider,
      providerSucceeded: attempt.verification.providerSucceeded,
      canaryPassed: attempt.verification.canaryPassed,
      fallbackUsed: attempt.verification.fallbackUsed,
      fallbackReason: attempt.verification.fallbackReason,
      writeToolAuditCount: attempt.writeToolAuditCount,
    })),
    provider: selectedAttempt?.verification.selectedProvider ?? null,
    health: primary?.health ?? null,
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runStructuredProviderCanaryProbe()
    .then((evidence) => {
      const outArg = process.argv.find((arg) => arg.startsWith("--out="));
      if (outArg) {
        const outPath = path.resolve(outArg.slice("--out=".length));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
      }
      console.log(JSON.stringify({
        canaryPassed: evidence.canaryPassed,
        providerSucceeded: evidence.providerSucceeded,
        selectedProvider: evidence.selectedProvider,
        fallbackUsed: evidence.fallbackUsed,
        writeToolAuditCount: evidence.writeToolAuditCount,
        attemptCount: evidence.attempts?.length ?? 0,
      }, null, 2));
      process.exitCode =
        evidence.canaryPassed &&
        evidence.providerSucceeded &&
        !evidence.fallbackUsed &&
        evidence.writeToolAuditCount === 0
          ? 0
          : 1;
    })
    .catch((error) => {
      console.error(String(error?.stack ?? error));
      process.exitCode = 1;
    });
}
