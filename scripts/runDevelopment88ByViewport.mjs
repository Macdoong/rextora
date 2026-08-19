#!/usr/bin/env node
/** Run Development 88 as four viewport segments with fresh dev server per half-batch. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "tmp/rextora-release-completion/development");
const viewports = ["390", "768", "1024", "1440"];
const batches = [
  {
    id: "s01-11",
    grep:
      "contains exactly 22 unique scenario IDs|scenario (0[1-9]|10|11):|scenario (18|19):",
  },
  {
    id: "s12-16",
    grep: "scenario (1[2-6]):",
  },
  {
    id: "s17-22",
    grep: "scenario (17|20|21|22):|defines all required viewports",
  },
];
fs.mkdirSync(outDir, { recursive: true });

function killDev() {
  spawnSync("pkill", ["-f", "next dev --port 3101"], { stdio: "ignore" });
  spawnSync("pkill", ["-f", "playwright test --config=playwright.deployment-dev"], {
    stdio: "ignore",
  });
  spawnSync("sleep", ["2"]);
}

function runViewportBatch(vp, batch) {
  killDev();
  const startedAt = Date.now();
  const stdoutPath = path.join(outDir, `matrix-${vp}-${batch.id}.stdout.txt`);
  const stderrPath = path.join(outDir, `matrix-${vp}-${batch.id}.stderr.txt`);
  const resultPath = path.join(outDir, `matrix-${vp}-${batch.id}-result.json`);
  const modelsErrors = [];

  const pw = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "--config=playwright.deployment-dev.config.mjs",
      "deployment-matrix.spec.ts",
      `--project=dev-${vp}`,
      "--grep",
      batch.grep,
    ],
    {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  fs.writeFileSync(stdoutPath, pw.stdout ?? "");
  fs.writeFileSync(stderrPath, pw.stderr ?? "");
  const defaultResult = path.join(outDir, "matrix-result.json");
  if (fs.existsSync(defaultResult)) {
    fs.copyFileSync(defaultResult, resultPath);
  }
  for (const line of (pw.stderr ?? "").split("\n")) {
    if (/SyntaxError: Unexpected end of JSON input/i.test(line)) {
      modelsErrors.push({
        viewport: vp,
        batch: batch.id,
        line: line.trim(),
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    viewport: vp,
    batch: batch.id,
    exitCode: pw.status ?? 1,
    durationMs: Date.now() - startedAt,
    stdoutPath,
    stderrPath,
    resultPath: fs.existsSync(resultPath) ? resultPath : null,
    modelsErrors,
  };
}

const startedAt = Date.now();
const segments = [];
const allModelsErrors = [];

for (const vp of viewports) {
  const vpSegments = [];
  for (const batch of batches) {
    console.log(`=== dev-${vp} ${batch.id} ===`);
    const seg = runViewportBatch(vp, batch);
    segments.push(seg);
    vpSegments.push(seg);
    allModelsErrors.push(...seg.modelsErrors);
    console.log(
      JSON.stringify({
        viewport: vp,
        batch: batch.id,
        exitCode: seg.exitCode,
        durationMs: seg.durationMs,
      }),
    );
    if (seg.exitCode !== 0) {
      fs.writeFileSync(
        path.join(outDir, "matrix-segments.json"),
        JSON.stringify({ segments, allModelsErrors, stoppedEarly: `${vp}-${batch.id}` }, null, 2),
      );
      process.exitCode = seg.exitCode;
      process.exit(seg.exitCode ?? 1);
    }
  }
  fs.writeFileSync(
    path.join(outDir, `matrix-${vp}.stdout.txt`),
    vpSegments.map((s) => fs.readFileSync(s.stdoutPath, "utf8")).join("\n"),
  );
  fs.writeFileSync(
    path.join(outDir, `matrix-${vp}.stderr.txt`),
    vpSegments.map((s) => fs.readFileSync(s.stderrPath, "utf8")).join("\n"),
  );
}

fs.writeFileSync(
  path.join(outDir, "matrix.stdout.txt"),
  segments.map((s) => fs.readFileSync(s.stdoutPath, "utf8")).join("\n"),
);
fs.writeFileSync(
  path.join(outDir, "matrix.stderr.txt"),
  segments.map((s) => fs.readFileSync(s.stderrPath, "utf8")).join("\n"),
);

const merged = {
  config: null,
  suites: [],
  stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 },
};
for (const seg of segments) {
  if (!seg.resultPath || !fs.existsSync(seg.resultPath)) continue;
  const part = JSON.parse(fs.readFileSync(seg.resultPath, "utf8"));
  if (!merged.config) merged.config = part.config;
  merged.suites.push(...(part.suites ?? []));
  for (const k of ["expected", "unexpected", "skipped", "flaky"]) {
    merged.stats[k] += part.stats?.[k] ?? 0;
  }
}
fs.writeFileSync(path.join(outDir, "matrix-result.json"), JSON.stringify(merged, null, 2));
fs.writeFileSync(
  path.join(outDir, "models-api-errors.json"),
  JSON.stringify({ count: allModelsErrors.length, errors: allModelsErrors }, null, 2),
);
fs.writeFileSync(
  path.join(outDir, "matrix-exit.json"),
  JSON.stringify(
    {
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      segments,
      architecture: "viewport-segment-half-batch-restart",
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify({
    ok: true,
    durationMs: Date.now() - startedAt,
    segments: segments.map((s) => ({ vp: s.viewport, batch: s.batch, ms: s.durationMs })),
  }),
);
