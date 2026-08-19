#!/usr/bin/env node
/** Focused known-blocker 9/9 with short-lived next-dev batches (tester readiness). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "tmp/rextora-tester-readiness/focused");
fs.mkdirSync(outDir, { recursive: true });

const batches = [
  { id: "390-a", project: "dev-390", grep: "scenario (03|17):" },
  { id: "390-b", project: "dev-390", grep: "scenario (20|21|22):" },
  { id: "768", project: "dev-768", grep: "scenario (17|20|21|22):" },
];

function killDev() {
  spawnSync("pkill", ["-f", "next dev --port 3101"], { stdio: "ignore" });
  spawnSync("pkill", ["-f", "playwright test --config=playwright.deployment-dev"], {
    stdio: "ignore",
  });
  spawnSync("sleep", ["2"]);
}

function countSignals(text) {
  return {
    malformedJson: (text.match(/Unexpected end of JSON input/gi) || []).length,
    emptyManifest: (text.match(/Manifest file is empty/gi) || []).length,
    chunkLoad: (text.match(/ChunkLoadError/gi) || []).length,
    hydration: (text.match(/Hydration|hydration failed|Text content does not match/gi) || [])
      .length,
    unmountedState: (text.match(/hasn't mounted yet/gi) || []).length,
    agentTimeout: (text.match(/agent_query_no_answer_within_60s|agent_turn_error/gi) || [])
      .length,
  };
}

const startedAt = Date.now();
const results = [];
let allStdout = "";
let allStderr = "";

for (const batch of batches) {
  killDev();
  console.log(`=== ${batch.id} ===`);
  const t0 = Date.now();
  const pw = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "--config=playwright.deployment-dev.config.mjs",
      "deployment-matrix.spec.ts",
      `--project=${batch.project}`,
      "--grep",
      batch.grep,
      "--reporter=list",
    ],
    {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
    },
  );
  const stdout = pw.stdout ?? "";
  const stderr = pw.stderr ?? "";
  allStdout += `\n===== ${batch.id} =====\n${stdout}`;
  allStderr += `\n===== ${batch.id} =====\n${stderr}`;
  fs.writeFileSync(path.join(outDir, `${batch.id}.stdout.txt`), stdout);
  fs.writeFileSync(path.join(outDir, `${batch.id}.stderr.txt`), stderr);
  const passed = (stdout.match(/✓/g) || []).length;
  const failed = (stdout.match(/✘/g) || []).length;
  const entry = {
    ...batch,
    exitCode: pw.status ?? 1,
    durationMs: Date.now() - t0,
    passedMarks: passed,
    failedMarks: failed,
    signals: countSignals(stdout + "\n" + stderr),
  };
  results.push(entry);
  console.log(JSON.stringify(entry));
  if (entry.exitCode !== 0) {
    fs.writeFileSync(
      path.join(outDir, "focused-9-result.json"),
      JSON.stringify(
        {
          ok: false,
          expectedTests: 9,
          stoppedEarly: batch.id,
          results,
          durationMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
    process.exit(entry.exitCode ?? 1);
  }
}

killDev();
const signals = countSignals(allStdout + "\n" + allStderr);
const summary = {
  ok: true,
  expectedTests: 9,
  batches: results,
  signals,
  durationMs: Date.now() - startedAt,
  focusedKnownBlockersPassed: true,
};
fs.writeFileSync(path.join(outDir, "focused-9.stdout.txt"), allStdout);
fs.writeFileSync(path.join(outDir, "focused-9.stderr.txt"), allStderr);
fs.writeFileSync(path.join(outDir, "focused-9-result.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exit(0);
