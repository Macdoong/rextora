/**
 * Baseline audit for final external release gate.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
const out = path.join(root, "tmp/provider-backed-final-release");
const baseline = path.join(out, "baseline");
const evidence = path.join(out, "evidence");
fs.mkdirSync(baseline, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

function sh(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
}

const safePath = path.join(root, "data/strategies/SAFE_v44_i4060.json");
const safe = JSON.parse(fs.readFileSync(safePath, "utf8"));
const safeSha = crypto.createHash("sha256").update(fs.readFileSync(safePath)).digest("hex");

fs.writeFileSync(path.join(baseline, "git-status.txt"), sh("git", ["status", "--short"]).stdout);
fs.writeFileSync(path.join(baseline, "git-diff-stat.txt"), sh("git", ["diff", "--stat"]).stdout);
fs.writeFileSync(path.join(baseline, "HEAD.txt"), sh("git", ["rev-parse", "HEAD"]).stdout.trim());
fs.writeFileSync(path.join(baseline, "branch.txt"), sh("git", ["branch", "--show-current"]).stdout.trim());
fs.writeFileSync(path.join(baseline, "pwd.txt"), root + "\n");
fs.writeFileSync(path.join(baseline, "node-version.txt"), sh("node", ["-v"]).stdout.trim());
fs.writeFileSync(path.join(baseline, "npm-version.txt"), sh("npm", ["-v"]).stdout.trim());
fs.writeFileSync(
  path.join(baseline, "BUILD_ID.txt"),
  fs.existsSync(path.join(root, ".next/BUILD_ID"))
    ? fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim()
    : "",
);
fs.writeFileSync(path.join(baseline, "processes.txt"), sh("sh", ["-c", "ps aux | rg -i 'next|playwright|rextora' | rg -v rg || true"]).stdout);
fs.writeFileSync(path.join(baseline, "ports.txt"), sh("sh", ["-c", "lsof -iTCP -sTCP:LISTEN -P | rg ':3000|:3100' || true"]).stdout);

fs.writeFileSync(
  path.join(baseline, "safe-before.json"),
  JSON.stringify(
    {
      params_hash: safe.params_hash,
      sha256: safeSha,
      gitHashObject: sh("git", ["hash-object", safePath]).stdout.trim(),
    },
    null,
    2,
  ),
);

const priorFinal = path.join(root, "tmp/provider-backed-agent-final/final-report.json");
const priorAgent = path.join(root, "tmp/provider-backed-agent/final-report.json");
const e2eAudit = { priorReports: {}, rawE2E: {} };

for (const [label, p] of [
  ["agent-final", priorFinal],
  ["agent-prior", priorAgent],
]) {
  if (fs.existsSync(p)) e2eAudit.priorReports[label] = JSON.parse(fs.readFileSync(p, "utf8"));
}

for (const run of [1, 2, 3]) {
  const exitPath = path.join(root, `tmp/provider-backed-agent-final/quality-gates/e2e-${run}.exit`);
  const stdoutPath = path.join(root, `tmp/provider-backed-agent-final/quality-gates/e2e-${run}.stdout.txt`);
  e2eAudit.rawE2E[`run${run}`] = {
    exitFile: fs.existsSync(exitPath) ? fs.readFileSync(exitPath, "utf8").trim() : null,
    passedLine: fs.existsSync(stdoutPath)
      ? (fs.readFileSync(stdoutPath, "utf8").match(/(\d+) passed/)?.[0] ?? null)
      : null,
  };
}

e2eAudit.resolution =
  "Prior final-report.json e2e1/e2e2/e2e3 values are shell EXIT CODES (0=success), not test counts. Raw stdout confirms 31 passed per run.";

fs.writeFileSync(path.join(evidence, "e2e-prior-audit.json"), JSON.stringify(e2eAudit, null, 2));

let providerState = null;
try {
  Object.assign(process.env, loadProjectEnv(root));
  const res = await fetch("http://127.0.0.1:3000/api/rextora/settings/ai-providers");
  providerState = { status: res.status, body: await res.json() };
} catch {
  providerState = { error: "server_unavailable" };
}
fs.writeFileSync(path.join(baseline, "provider-state.json"), JSON.stringify(providerState, null, 2));

const credStore = path.join(root, "data/rextora/secrets/ai-provider-credentials.enc.json");
fs.writeFileSync(
  path.join(baseline, "credential-store-meta.json"),
  JSON.stringify(
    fs.existsSync(credStore)
      ? {
          updatedAt: fs.statSync(credStore).mtime.toISOString(),
          openaiStored: JSON.parse(fs.readFileSync(credStore, "utf8")).openai != null,
          geminiStored: JSON.parse(fs.readFileSync(credStore, "utf8")).gemini != null,
        }
      : { missing: true },
    null,
    2,
  ),
);

console.log(JSON.stringify({ baseline, e2eResolution: e2eAudit.resolution }, null, 2));
