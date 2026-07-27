/**
 * Collect cross-surface evidence for FINAL_RELEASE acceptance report.
 * Read-only — uses official APIs and persisted JSON.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = "http://localhost:3000";
const OUT = "tmp-final-acceptance-evidence.json";

async function getJson(p: string) {
  const r = await fetch(`${BASE}${p}`);
  const t = await r.text();
  try {
    return { status: r.status, body: JSON.parse(t) };
  } catch {
    return { status: r.status, body: t.slice(0, 500) };
  }
}

function sha256File(f: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").toUpperCase();
}

function readJson(f: string) {
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function leverageFromTrades(report: { trades?: Array<Record<string, unknown>> }) {
  const trades = report.trades ?? [];
  const levs = trades.map((t) => Number(t.leverage ?? t.lev ?? 0)).filter((n) => n > 0);
  return {
    count: trades.length,
    min: levs.length ? Math.min(...levs) : null,
    max: levs.length ? Math.max(...levs) : null,
    sample: levs.slice(0, 5),
    allSame: levs.length ? levs.every((l) => l === levs[0]) : null,
    fixedValue: levs.length && levs.every((l) => l === levs[0]) ? levs[0] : null,
  };
}

const evidence: Record<string, unknown> = {
  buildId: fs.readFileSync(".next/BUILD_ID", "utf8").trim(),
  collectedAt: new Date().toISOString(),
  safe: {
    path: "data/strategies/SAFE_v44_i4060.json",
    paramsHash: "7893ca3f0e30",
    sha256: sha256File("data/strategies/SAFE_v44_i4060.json"),
    bytes: fs.statSync("data/strategies/SAFE_v44_i4060.json").size,
  },
  engineProof: null as unknown,
  matrixJobs: null as unknown,
  automaticLifecycle: null as unknown,
  leverageRuns: [] as unknown[],
  paper: null as unknown,
  live: null as unknown,
  identityAudit: [] as unknown[],
};

// ENGINE proof job
const engineJobId = "search_17cfa74c-9c0c-4a40-9620-ac92c5a6a059";
const engineJob = readJson(`data/rextora/strategy-search/jobs/${engineJobId}.json`);
const enginePlan = readJson(`data/rextora/strategy-search/jobs/${engineJobId}.plan.json`);
const engineCp = JSON.parse(engineJob.checkpoint?.randomState ?? "{}");
evidence.engineProof = {
  jobId: engineJobId,
  name: enginePlan.searchName,
  status: engineJob.status,
  failureMessage: engineJob.failureMessage,
  evaluated: engineCp.statistics?.evaluated,
  passed: engineCp.statistics?.passed,
  errors: engineCp.statistics?.errors,
  patternConfigLevel: enginePlan.patternConfigLevel,
  operator: enginePlan.patternCombinationOperator,
  leverageMode: enginePlan.leverageMode,
};

if (fs.existsSync("tmp-final-release-evidence.json")) {
  evidence.matrixJobs = readJson("tmp-final-release-evidence.json");
}

// Automatic lifecycle strategy
const autoStrategyId = "custom_ms39v4j1";
if (fs.existsSync(`data/rextora/strategies/${autoStrategyId}.json`)) {
  const s = readJson(`data/rextora/strategies/${autoStrategyId}.json`);
  evidence.automaticLifecycle = {
    strategyId: s.id,
    displayAlias: s.displayAlias,
    displayName: s.displayName,
    strategyHash: s.strategyHash,
    paramsHash: s.paramsHash,
    sourceParamsHash: s.sourceParamsHash,
    sourceResearchJobId: s.sourceResearchJobId,
    sourceTrialIteration: s.sourceTrialIteration,
    leverage: s.params?.use_dynamic_leverage,
    levMin: s.params?.lev_min,
    levMax: s.params?.lev_max,
  };
}

// Leverage runs — browser-verified saved runs
const levPairs = [
  { mode: "automatic", strategyId: "custom_ms37ep1a", runId: "bt_ms37lx5e_f7eb18" },
  { mode: "fixed_3x", strategyId: "custom_ms37emft", runId: "bt_ms37lqjk_d45471" },
  { mode: "range_2_4", strategyId: "custom_ms37enaq", runId: "bt_ms37lsla_333ff5" },
  { mode: "disabled_1x", strategyId: "custom_ms37eoa6", runId: "bt_ms37luu1_f150ab" },
];

for (const pair of levPairs) {
  const runPath = `data/rextora/backtests/${pair.runId}.json`;
  if (!fs.existsSync(runPath)) continue;
  const run = readJson(runPath);
  const rep = run.report ?? {};
  const lev = leverageFromTrades(rep);
  evidence.leverageRuns.push({
    mode: pair.mode,
    strategyId: pair.strategyId,
    runId: pair.runId,
    strategyHash: rep.strategyHash,
    paramsHash: rep.sourceParamsHash,
    tradeCount: rep.tradeCount,
    netReturn: rep.totalReturn,
    leverage: lev,
    sampleTrade: (rep.trades ?? [])[0] ?? null,
  });
}

// Paper session
const paperIdx = readJson("data/rextora/paper-sessions/index.json");
evidence.paper = { sessions: paperIdx.sessions?.slice?.(0, 5) ?? paperIdx };

// Live dry-run store if exists
const livePath = "data/rextora/live";
if (fs.existsSync(livePath)) {
  evidence.live = fs.readdirSync(livePath);
}

// Identity audit for key strategies
const auditIds = [
  "custom_ms39v4j1",
  "custom_ms37ep1a",
  "custom_ms37emft",
  "custom_ms37enaq",
  "custom_ms37eoa6",
];
for (const id of auditIds) {
  const fp = `data/rextora/strategies/${id}.json`;
  if (!fs.existsSync(fp)) continue;
  const s = readJson(fp);
  evidence.identityAudit.push({
    strategyId: id,
    alias: s.displayAlias ?? s.name,
    displayName: s.displayName ?? s.name,
    strategyHash: s.strategyHash,
    paramsHash: s.paramsHash,
    sourceParamsHash: s.sourceParamsHash,
    sourceResearchJobId: s.sourceResearchJobId,
    sourceTrialIteration: s.sourceTrialIteration,
    symbol: s.symbols?.[0],
    timeframe: s.timeframe,
  });
}

fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
console.log("WROTE", OUT);
