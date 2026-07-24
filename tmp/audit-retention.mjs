/**
 * One-off audit via vitest-style dynamic import through compiled path is hard;
 * duplicate lightweight classification using raw JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.join(process.cwd(), "data", "rextora", "strategy-search");
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
const strategiesDir = path.join(process.cwd(), "data", "rextora", "strategies");
const strategyIndex = JSON.parse(
  fs.readFileSync(path.join(strategiesDir, "index.json"), "utf8"),
);
const strategyIds = new Set(
  (strategyIndex.strategies || strategyIndex || []).map?.((s) => s.id) ||
    Object.keys(strategyIndex),
);

// load strategy files for description scan
const strategyFiles = fs
  .readdirSync(strategiesDir)
  .filter((f) => f.endsWith(".json") && f !== "index.json");
const strategies = strategyFiles.map((f) =>
  JSON.parse(fs.readFileSync(path.join(strategiesDir, f), "utf8")),
);

const ACTIVE = new Set([
  "queued",
  "running",
  "pause_requested",
  "paused",
  "cancel_requested",
]);
const TERMINAL = new Set(["completed", "cancelled", "failed"]);

function getPlan(jobId) {
  const p = path.join(root, "jobs", `${jobId}.plan.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function reasonFor(job) {
  if (!job) return "corrupt";
  if (ACTIVE.has(job.status)) return "active_status";
  if (!TERMINAL.has(job.status)) return "unclassified";
  const plan = getPlan(job.id);
  if (plan) {
    if (plan.promotions?.some((p) => p.status === "pending"))
      return "incomplete_promotion";
    if (
      plan.completionReason == null &&
      plan.spaces?.some((s) => s.status === "active" || s.status === "pending")
    )
      return "open_campaign";
    if (
      plan.promotions?.some(
        (p) =>
          (p.status === "promoted" || p.status === "duplicate") &&
          p.strategyId &&
          strategies.some((s) => s.id === p.strategyId),
      )
    )
      return "strategy_reference_plan";
  }
  const descHit = strategies.some(
    (s) =>
      typeof s.description === "string" &&
      s.description.includes(`job=${job.id}`),
  );
  if (descHit) return "strategy_reference_description";
  return "eligible";
}

const survivors = [];
for (const row of index.jobs) {
  const fp = path.join(root, "jobs", `${row.id}.json`);
  let job = null;
  try {
    job = JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    job = null;
  }
  const reason = reasonFor(job);
  survivors.push({
    id: row.id,
    status: job?.status ?? row.status,
    createdAt: job?.createdAt ?? row.createdAt,
    reason,
    hasPlan: fs.existsSync(path.join(root, "jobs", `${row.id}.plan.json`)),
    hasExec: fs.existsSync(
      path.join(root, "jobs", `${row.id}.execution.json`),
    ),
    hasTrials: fs.existsSync(path.join(root, "trials", row.id)),
  });
}

const counts = {};
for (const s of survivors) counts[s.reason] = (counts[s.reason] || 0) + 1;
survivors.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

// description matching breadth: any strategy description containing "job="
const descRefs = [];
for (const s of strategies) {
  const d = s.description || "";
  const m = [...d.matchAll(/job=(search_[0-9a-f-]+)/gi)].map((x) => x[1]);
  if (m.length) descRefs.push({ strategyId: s.id, jobs: m });
}

console.log(
  JSON.stringify(
    {
      indexed: index.jobs.length,
      counts,
      eligibleOldestFirst: survivors
        .filter((s) => s.reason === "eligible")
        .map((s) => ({ id: s.id, status: s.status, createdAt: s.createdAt })),
      nonEligible: survivors
        .filter((s) => s.reason !== "eligible")
        .map((s) => ({
          id: s.id,
          status: s.status,
          reason: s.reason,
          createdAt: s.createdAt,
        })),
      descRefs,
      strategyCount: strategies.length,
      visibleIfLimited20: survivors
        .slice()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 20)
        .map((s) => s.id),
    },
    null,
    2,
  ),
);
