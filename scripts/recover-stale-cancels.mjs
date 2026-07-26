/**
 * One-shot operator recovery for stuck cancel_requested jobs.
 * Uses compiled Next/webpack path via dynamic import of built code is hard;
 * instead call through vitest-less relative transpile with jiti if available.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve("data/rextora/strategy-search");
const jobsDir = path.join(root, "jobs");

function nowIso() {
  return new Date().toISOString();
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function writeJson(fp, data) {
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, fp);
}

function listJobIds() {
  return fs
    .readdirSync(jobsDir)
    .filter(
      (n) =>
        n.startsWith("search_") &&
        n.endsWith(".json") &&
        !n.includes(".plan.") &&
        !n.includes(".execution.") &&
        !n.includes(".generations.") &&
        !n.includes(".top10") &&
        !n.includes(".archive"),
    )
    .map((n) => n.slice(0, -".json".length));
}

function syncIndex(job) {
  const indexPath = path.join(root, "index.json");
  const index = fs.existsSync(indexPath)
    ? readJson(indexPath)
    : { version: 1, updatedAt: nowIso(), jobs: [] };
  index.jobs = (index.jobs || []).filter((r) => r.id !== job.id);
  index.jobs.unshift({
    id: job.id,
    status: job.status,
    strategyTemplateId: job.config?.strategyTemplateId ?? "",
    generatorType: job.config?.generatorType ?? "random",
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedIterations: job.checkpoint?.completedIterations ?? 0,
    finishedAt: job.finishedAt,
  });
  index.updatedAt = nowIso();
  writeJson(indexPath, index);
}

function appendAudit(record) {
  const fp = path.join(root, "recovery-audit.jsonl");
  fs.appendFileSync(fp, `${JSON.stringify(record)}\n`, "utf8");
}

const targets = listJobIds().filter((id) => {
  const job = readJson(path.join(jobsDir, `${id}.json`));
  return job.status === "cancel_requested" || job.status === "cancelling";
});

console.log("stuck_jobs", targets);

for (const id of targets) {
  const jobPath = path.join(jobsDir, `${id}.json`);
  const planPath = path.join(jobsDir, `${id}.plan.json`);
  const top10Path = path.join(jobsDir, `${id}.top10.json`);
  const trialsDir = path.join(root, "trials", id);
  const before = readJson(jobPath);
  const trialCount = fs.existsSync(trialsDir)
    ? fs.readdirSync(trialsDir).filter((n) => n.endsWith(".json")).length
    : 0;
  const top10 = fs.existsSync(top10Path);
  console.log("BEFORE", {
    id,
    status: before.status,
    updatedAt: before.updatedAt,
    trials: trialCount,
    top10,
  });

  // No in-process worker in this standalone script → safe to finalize.
  const at = nowIso();
  if (fs.existsSync(planPath)) {
    const plan = readJson(planPath);
    plan.completionReason = "USER_CANCELLED";
    plan.pausedAtMs = null;
    writeJson(planPath, plan);
  }
  const after = {
    ...before,
    status: "cancelled",
    finishedAt: before.finishedAt ?? at,
    cancelRequestedAt: before.cancelRequestedAt ?? before.updatedAt,
    cancellationAcknowledgedAt: at,
    resultsPreserved: true,
    updatedAt: at,
    failureMessage: null,
  };
  writeJson(jobPath, after);
  syncIndex(after);
  appendAudit({
    jobId: id,
    previousState: before.status,
    recoveredState: "cancelled",
    recoveryTime: at,
    reason: "stale_cancel_requested_recovery",
    resumedGeneration: after.checkpoint?.completedIterations ?? null,
    remainingDurationMs: null,
    trialCount,
    autoResumed: false,
  });
  console.log("AFTER", {
    id,
    status: after.status,
    finishedAt: after.finishedAt,
    trials: trialCount,
    top10,
  });
}
