#!/usr/bin/env node
/**
 * Production build for tester readiness.
 * Temporarily relocates giant strategy-search job/trial trees so Next/webpack
 * file scanning cannot OOM. Restores them after build. Never touches SAFE.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "tmp/rextora-tester-readiness/build");
fs.mkdirSync(outDir, { recursive: true });

const parkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-build-park-"));
const heavy = [
  "data/rextora/strategy-search/jobs",
  "data/rextora/strategy-search/trials",
  "data/rextora/strategy-search/owners",
];

const parked = [];
function park() {
  for (const rel of heavy) {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(parkRoot, rel.replace(/\//g, "__"));
    fs.renameSync(from, to);
    fs.mkdirSync(from, { recursive: true });
    parked.push({ from, to, rel });
  }
}

function restore() {
  for (const { from, to } of parked) {
    if (fs.existsSync(from)) {
      // remove empty placeholder created for path stability
      try {
        fs.rmSync(from, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    fs.renameSync(to, from);
  }
}

const startedAt = Date.now();
let exitCode = 1;
try {
  spawnSync("rm", ["-rf", path.join(root, ".next")], { stdio: "ignore" });
  park();
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"]
      .filter(Boolean)
      .join(" "),
  };
  const result = spawnSync("npx", ["next", "build", "--webpack"], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(outDir, "build.stdout.txt"), result.stdout ?? "");
  fs.writeFileSync(path.join(outDir, "build.stderr.txt"), result.stderr ?? "");
  exitCode = result.status ?? 1;
} finally {
  restore();
  try {
    fs.rmSync(parkRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const buildId = fs.existsSync(path.join(root, ".next/BUILD_ID"))
  ? fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim()
  : null;

const meta = {
  command: "npx next build --webpack",
  parkedPaths: heavy,
  exitCode,
  durationMs: Date.now() - startedAt,
  BUILD_ID: buildId,
  finishedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, "build-meta.json"), JSON.stringify(meta, null, 2));
if (buildId) fs.writeFileSync(path.join(outDir, "BUILD_ID.txt"), buildId + "\n");
console.log(JSON.stringify(meta));
process.exit(exitCode);
