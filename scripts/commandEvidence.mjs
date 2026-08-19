/**
 * Reusable command evidence writer for quality gates.
 * Missing raw logs or exit codes must never be reported as PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeGateEvidence(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return payload;
}

export function runAndRecordCommand(input) {
  const {
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    stdoutLogPath,
    stderrLogPath,
    timeoutMs = 600_000,
    parseResult = null,
  } = input;

  if (!stdoutLogPath || !stderrLogPath) {
    return {
      command: [command, ...args].join(" "),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      exitCode: null,
      stdoutLogPath: stdoutLogPath ?? null,
      stderrLogPath: stderrLogPath ?? null,
      parsedResult: null,
      BUILD_ID: null,
      evidenceComplete: false,
      missing: ["stdoutLogPath", "stderrLogPath"].filter((k) => !input[k]),
      pass: false,
    };
  }

  ensureDir(path.dirname(stdoutLogPath));
  ensureDir(path.dirname(stderrLogPath));

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  fs.writeFileSync(stdoutLogPath, stdout);
  fs.writeFileSync(stderrLogPath, stderr);

  const exitCode =
    typeof result.status === "number"
      ? result.status
      : result.error
        ? 1
        : null;

  let parsedResult = null;
  if (typeof parseResult === "function") {
    try {
      parsedResult = parseResult({ stdout, stderr, exitCode });
    } catch (err) {
      parsedResult = { parseError: String(err?.message ?? err) };
    }
  }

  const buildIdPath = path.join(cwd, ".next", "BUILD_ID");
  const BUILD_ID = fs.existsSync(buildIdPath)
    ? fs.readFileSync(buildIdPath, "utf8").trim()
    : null;

  const evidenceComplete =
    exitCode !== null &&
    fs.existsSync(stdoutLogPath) &&
    fs.existsSync(stderrLogPath);

  return {
    command: [command, ...args].join(" "),
    startedAt,
    finishedAt,
    durationMs,
    exitCode,
    stdoutLogPath,
    stderrLogPath,
    parsedResult,
    BUILD_ID,
    evidenceComplete,
    signal: result.signal ?? null,
    error: result.error ? String(result.error.message ?? result.error) : null,
    pass: evidenceComplete && exitCode === 0,
  };
}

export function deriveGateVerdict(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    return { verdict: "NOT VERIFIED", reason: "missing_gate_entries", pass: false };
  }
  for (const entry of list) {
    if (!entry || entry.exitCode === null || entry.exitCode === undefined) {
      return { verdict: "NOT VERIFIED", reason: "missing_exit_code", pass: false };
    }
    if (!entry.stdoutLogPath || !entry.stderrLogPath) {
      return { verdict: "NOT VERIFIED", reason: "missing_log_paths", pass: false };
    }
    if (!fs.existsSync(entry.stdoutLogPath) || !fs.existsSync(entry.stderrLogPath)) {
      return { verdict: "NOT VERIFIED", reason: "missing_raw_logs", pass: false };
    }
    if (entry.exitCode !== 0) {
      return { verdict: "NOT VERIFIED", reason: `exit_${entry.exitCode}`, pass: false };
    }
  }
  return { verdict: "PASS", reason: null, pass: true };
}
