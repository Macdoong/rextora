/**
 * Final gate orchestrator — records evidence under tmp/provider-backed-agent-final/
 * Never prints credentials.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadProjectEnv } from "./loadProjectEnv.mjs";
import { resolveRepoRoot } from "./repoPaths.mjs";

const root = resolveRepoRoot(import.meta.url);
const env = loadProjectEnv(root);
Object.assign(process.env, env);
const evidenceRoot = path.join(root, "tmp/provider-backed-agent-final");
const startedAt = new Date().toISOString();

function ensureDir(rel) {
  const full = path.join(evidenceRoot, rel);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

function runGate(name, cmd, args, outRel) {
  const started = Date.now();
  const stdoutPath = path.join(ensureDir(path.dirname(outRel)), path.basename(outRel));
  const stderrPath = stdoutPath.replace(/\.stdout\.txt$/, ".stderr.txt");
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  fs.writeFileSync(stdoutPath, result.stdout ?? "");
  fs.writeFileSync(stderrPath, result.stderr ?? "");
  const gate = {
    command: [cmd, ...args].join(" "),
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status ?? 1,
    stdoutPath,
    stderrPath,
    BUILD_ID: fs.existsSync(path.join(root, ".next/BUILD_ID"))
      ? fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim()
      : null,
  };
  return gate;
}

function safeHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function scanSecrets(dir) {
  const patterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bAIza[A-Za-z0-9_-]{20,}\b/g,
    /Bearer\s+sk-[A-Za-z0-9_-]+/gi,
  ];
  const hits = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full);
        continue;
      }
      if (!/\.(json|txt|md|log|html|tsx?|jsx?|mjs)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const re of patterns) {
        re.lastIndex = 0;
        const m = text.match(re);
        if (m?.length) {
          hits.push({ file: full.replace(root + path.sep, ""), count: m.length });
        }
      }
    }
  }
  walk(dir);
  return hits;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

async function main() {
  ensureDir("baseline");
  ensureDir("quality-gates");
  ensureDir("secret-scan");

  const safePath = path.join(root, "data/strategies/SAFE_v44_i4060.json");
  const safe = JSON.parse(fs.readFileSync(safePath, "utf8"));
  const safeBefore = {
    params_hash: safe.params_hash,
    sha256: safeHash(safePath),
    gitHashObject: spawnSync("git", ["hash-object", safePath], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim(),
  };
  fs.writeFileSync(
    path.join(evidenceRoot, "baseline/safe-before.json"),
    JSON.stringify(safeBefore, null, 2),
  );

  fs.writeFileSync(
    path.join(evidenceRoot, "baseline/git-status.txt"),
    spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).stdout,
  );
  fs.writeFileSync(
    path.join(evidenceRoot, "baseline/git-diff-stat.txt"),
    spawnSync("git", ["diff", "--stat"], { cwd: root, encoding: "utf8" }).stdout,
  );

  const settings = await fetchJson("http://127.0.0.1:3000/api/rextora/settings/ai-providers");
  fs.writeFileSync(
    path.join(evidenceRoot, "baseline/provider-state.json"),
    JSON.stringify(settings.body, null, 2),
  );

  const gates = [];
  gates.push(runGate("lint", "npm", ["run", "lint"], "quality-gates/lint.stdout.txt"));
  gates.push(runGate("unit", "npm", ["test"], "quality-gates/unit.stdout.txt"));

  for (let i = 1; i <= 3; i++) {
    gates.push(
      runGate(`e2e-${i}`, "npm", ["run", "test:e2e"], `quality-gates/e2e-${i}.stdout.txt`),
    );
  }

  const secretHits = scanSecrets(evidenceRoot);
  fs.writeFileSync(
    path.join(evidenceRoot, "secret-scan/evidence-scan.json"),
    JSON.stringify({ secretLeakCount: secretHits.length, hits: secretHits }, null, 2),
  );

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    BUILD_ID: gates[0]?.BUILD_ID ?? null,
    safeBefore,
    gates: gates.map((g) => ({
      command: g.command,
      exitCode: g.exitCode,
      durationMs: g.durationMs,
    })),
    secretLeakCount: secretHits.length,
    allGatesPassed:
      gates.every((g) => g.exitCode === 0) && secretHits.length === 0,
  };
  fs.writeFileSync(
    path.join(evidenceRoot, "quality-gates/summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.allGatesPassed ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
