#!/usr/bin/env node
/** Run Development 88 matrix with models API error monitoring. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "tmp/rextora-development-88/final");
fs.mkdirSync(outDir, { recursive: true });

const modelsErrors = [];
const startedAt = Date.now();

const pw = spawn(
  "npx",
  ["playwright", "test", "--config=playwright.deployment-dev.config.mjs", "deployment-matrix.spec.ts"],
  {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const stdout = fs.createWriteStream(path.join(outDir, "matrix.stdout.txt"));
const stderr = fs.createWriteStream(path.join(outDir, "matrix.stderr.txt"));

function scanLine(line, stream) {
  if (/SyntaxError: Unexpected end of JSON input/i.test(line)) {
    modelsErrors.push({
      timestamp: new Date().toISOString(),
      stream,
      line: line.trim(),
      classification: null,
    });
  }
  if (line.includes("/api/rextora/settings/ai-providers/models")) {
    modelsErrors.push({
      timestamp: new Date().toISOString(),
      stream,
      line: line.trim(),
      url: "/api/rextora/settings/ai-providers/models",
      classification: null,
    });
  }
}

pw.stdout.on("data", (buf) => {
  const text = buf.toString();
  stdout.write(text);
  for (const line of text.split("\n")) scanLine(line, "stdout");
});

pw.stderr.on("data", (buf) => {
  const text = buf.toString();
  stderr.write(text);
  for (const line of text.split("\n")) scanLine(line, "stderr");
});

pw.on("close", (code) => {
  stdout.end();
  stderr.end();
  const durationMs = Date.now() - startedAt;
  fs.writeFileSync(
    path.join(outDir, "models-api-errors.json"),
    JSON.stringify({ count: modelsErrors.length, errors: modelsErrors }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "matrix-exit.json"),
    JSON.stringify({ exitCode: code, durationMs }, null, 2),
  );
  process.exit(code ?? 1);
});
