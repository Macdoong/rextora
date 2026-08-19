"use strict";

/**
 * Aggregate-only directory-enumeration trace for build diagnostics.
 * It does not change paths, return values, callbacks, Dir objects, or errors.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { fileURLToPath } = require("node:url");

const outputFile = process.env.REXTORA_FS_TRACE_OUTPUT;
if (!outputFile) {
  throw new Error("REXTORA_FS_TRACE_OUTPUT is required");
}

const repoRoot = path.resolve(process.env.REXTORA_FS_TRACE_ROOT || process.cwd());
const homeRoot = os.homedir();
const tmpRoot = os.tmpdir();
const rows = new Map();
const inFlight = new Map();
const startedAt = new Date().toISOString();
let writing = false;
let peakRssBytes = 0;
let peakHeapUsedBytes = 0;
let totalCalls = 0;
let totalReturnedEntries = 0;
let nextInFlightId = 1;

function sanitize(value) {
  let resolved;
  try {
    if (value instanceof URL) resolved = fileURLToPath(value);
    else if (Buffer.isBuffer(value)) resolved = value.toString("utf8");
    else resolved = String(value);
    resolved = path.resolve(resolved);
  } catch {
    return "<UNREPRESENTABLE_PATH>";
  }
  if (resolved === repoRoot) return "<REPO>";
  if (resolved.startsWith(`${repoRoot}${path.sep}`)) {
    return `<REPO>/${path.relative(repoRoot, resolved).split(path.sep).join("/")}`;
  }
  if (resolved === homeRoot) return "<HOME>";
  if (resolved.startsWith(`${homeRoot}${path.sep}`)) {
    return `<HOME>/${path.relative(homeRoot, resolved).split(path.sep).join("/")}`;
  }
  if (resolved === tmpRoot) return "<TMP>";
  if (resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    return `<TMP>/${path.relative(tmpRoot, resolved).split(path.sep).join("/")}`;
  }
  return resolved;
}

function callerSample() {
  const stack = new Error("directory-enumeration-trace").stack || "";
  return stack
    .split("\n")
    .slice(3, 14)
    .map((line) => line.replaceAll(repoRoot, "<REPO>").replaceAll(homeRoot, "<HOME>"))
    .join("\n");
}

function entryCount(result) {
  return Array.isArray(result) ? result.length : 0;
}

function record(api, target, count, elapsedMs, error, caller) {
  if (writing) return;
  const key = `${api}\u0000${sanitize(target)}`;
  let row = rows.get(key);
  if (!row) {
    row = {
      api,
      path: sanitize(target),
      callCount: 0,
      successfulCalls: 0,
      errorCount: 0,
      totalReturnedEntries: 0,
      maxEntriesInOneScan: 0,
      totalElapsedMs: 0,
      maxElapsedMs: 0,
      firstCallerSample: caller || callerSample(),
      firstErrorCode: null,
    };
    rows.set(key, row);
  }
  row.callCount += 1;
  totalCalls += 1;
  if (error) {
    row.errorCount += 1;
    row.firstErrorCode ||= typeof error.code === "string" ? error.code : "UNKNOWN";
  } else {
    row.successfulCalls += 1;
    row.totalReturnedEntries += count;
    row.maxEntriesInOneScan = Math.max(row.maxEntriesInOneScan, count);
    totalReturnedEntries += count;
  }
  row.totalElapsedMs += elapsedMs;
  row.maxElapsedMs = Math.max(row.maxElapsedMs, elapsedMs);
  const memory = process.memoryUsage();
  peakRssBytes = Math.max(peakRssBytes, memory.rss);
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
}

function beginAsyncScan(api, target, caller) {
  const id = nextInFlightId++;
  inFlight.set(id, {
    id,
    api,
    path: sanitize(target),
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    callerSample: caller,
  });
  // Persist before entering native directory enumeration so an OOM in
  // AfterScanDir still leaves the exact outstanding path in evidence.
  flush();
  return id;
}

function finishAsyncScan(id) {
  inFlight.delete(id);
}

function snapshot() {
  return {
    pid: process.pid,
    ppid: process.ppid,
    argv: process.argv.slice(0, 3).map((value) =>
      value.replaceAll(repoRoot, "<REPO>").replaceAll(homeRoot, "<HOME>"),
    ),
    startedAt,
    updatedAt: new Date().toISOString(),
    totalCalls,
    totalReturnedEntries,
    peakRssBytes,
    peakHeapUsedBytes,
    inFlight: [...inFlight.values()].map(({ startedAtMs, ...scan }) => ({
      ...scan,
      ageMs: Math.max(0, Date.now() - startedAtMs),
    })),
    directories: [...rows.values()].sort(
      (a, b) =>
        b.totalReturnedEntries - a.totalReturnedEntries ||
        b.callCount - a.callCount ||
        b.totalElapsedMs - a.totalElapsedMs,
    ),
  };
}

function flush() {
  if (writing) return;
  writing = true;
  const lockDir = `${outputFile}.lock`;
  let locked = false;
  try {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.mkdirSync(lockDir);
    locked = true;
    let aggregate = { schemaVersion: 1, processes: {} };
    try {
      aggregate = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    } catch (error) {
      if (error && error.code !== "ENOENT") aggregate = { schemaVersion: 1, processes: {} };
    }
    aggregate.schemaVersion = 1;
    aggregate.processes ||= {};
    aggregate.processes[String(process.pid)] = snapshot();
    aggregate.updatedAt = new Date().toISOString();
    const temporary = `${outputFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, outputFile);
  } catch (error) {
    if (!error || error.code !== "EEXIST") {
      process.stderr.write(`[traceBuildFs] flush failed: ${error && error.code ? error.code : "UNKNOWN"}\n`);
    }
  } finally {
    if (locked) {
      try {
        fs.rmdirSync(lockDir);
      } catch {}
    }
    writing = false;
  }
}

const originalReaddir = fs.readdir;
fs.readdir = function tracedReaddir(target, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") return Reflect.apply(originalReaddir, this, arguments);
  const start = process.hrtime.bigint();
  const caller = callerSample();
  const inFlightId = beginAsyncScan("fs.readdir", target, caller);
  const tracedCallback = function tracedCallback(error, result) {
    finishAsyncScan(inFlightId);
    record("fs.readdir", target, entryCount(result), Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    return Reflect.apply(cb, this, arguments);
  };
  return typeof options === "function"
    ? Reflect.apply(originalReaddir, this, [target, tracedCallback])
    : Reflect.apply(originalReaddir, this, [target, options, tracedCallback]);
};

const originalReaddirSync = fs.readdirSync;
fs.readdirSync = function tracedReaddirSync(target, options) {
  const start = process.hrtime.bigint();
  const caller = callerSample();
  try {
    const result = Reflect.apply(originalReaddirSync, this, arguments);
    record("fs.readdirSync", target, entryCount(result), Number(process.hrtime.bigint() - start) / 1e6, null, caller);
    return result;
  } catch (error) {
    record("fs.readdirSync", target, 0, Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    throw error;
  }
};

const originalOpendir = fs.opendir;
fs.opendir = function tracedOpendir(target, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (typeof cb !== "function") return Reflect.apply(originalOpendir, this, arguments);
  const start = process.hrtime.bigint();
  const caller = callerSample();
  const inFlightId = beginAsyncScan("fs.opendir", target, caller);
  const tracedCallback = function tracedCallback(error) {
    finishAsyncScan(inFlightId);
    record("fs.opendir", target, 0, Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    return Reflect.apply(cb, this, arguments);
  };
  return typeof options === "function"
    ? Reflect.apply(originalOpendir, this, [target, tracedCallback])
    : Reflect.apply(originalOpendir, this, [target, options, tracedCallback]);
};

const originalOpendirSync = fs.opendirSync;
fs.opendirSync = function tracedOpendirSync(target, options) {
  const start = process.hrtime.bigint();
  const caller = callerSample();
  try {
    const result = Reflect.apply(originalOpendirSync, this, arguments);
    record("fs.opendirSync", target, 0, Number(process.hrtime.bigint() - start) / 1e6, null, caller);
    return result;
  } catch (error) {
    record("fs.opendirSync", target, 0, Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    throw error;
  }
};

const promises = fs.promises;
const originalPromisesReaddir = promises.readdir;
promises.readdir = async function tracedPromisesReaddir(target, options) {
  const start = process.hrtime.bigint();
  const caller = callerSample();
  const inFlightId = beginAsyncScan("fs.promises.readdir", target, caller);
  try {
    const result = await Reflect.apply(originalPromisesReaddir, this, arguments);
    finishAsyncScan(inFlightId);
    record("fs.promises.readdir", target, entryCount(result), Number(process.hrtime.bigint() - start) / 1e6, null, caller);
    return result;
  } catch (error) {
    finishAsyncScan(inFlightId);
    record("fs.promises.readdir", target, 0, Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    throw error;
  }
};

const originalPromisesOpendir = promises.opendir;
promises.opendir = async function tracedPromisesOpendir(target, options) {
  const start = process.hrtime.bigint();
  const caller = callerSample();
  const inFlightId = beginAsyncScan("fs.promises.opendir", target, caller);
  try {
    const result = await Reflect.apply(originalPromisesOpendir, this, arguments);
    finishAsyncScan(inFlightId);
    record("fs.promises.opendir", target, 0, Number(process.hrtime.bigint() - start) / 1e6, null, caller);
    return result;
  } catch (error) {
    finishAsyncScan(inFlightId);
    record("fs.promises.opendir", target, 0, Number(process.hrtime.bigint() - start) / 1e6, error, caller);
    throw error;
  }
};

const interval = setInterval(flush, 2000);
interval.unref();
process.once("beforeExit", flush);
process.once("exit", flush);
