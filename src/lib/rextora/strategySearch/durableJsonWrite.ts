/**
 * Shared crash-safe JSON payload write used by persistJob / index writes.
 * Accepts an exact payload string so callers can preserve proven bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { assertTestStoreIsNotProduction } from "../storage/testStoreGuard";

export class DurableJsonWriteError extends Error {
  readonly targetPath: string;
  constructor(message: string, targetPath: string) {
    super(message);
    this.name = "DurableJsonWriteError";
    this.targetPath = targetPath;
  }
}

function tmpPathFor(targetPath: string): string {
  return `${targetPath}.tmp`;
}

function bakPathFor(targetPath: string): string {
  return `${targetPath}.bak`;
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

function tryParseJsonFile(
  filePath: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    if (!fs.existsSync(filePath)) return { ok: false };
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { ok: true, value: null };
  } catch {
    return { ok: false };
  }
}

function writeTmpFlushed(tmpFile: string, payload: string): void {
  const fd = fs.openSync(tmpFile, "w");
  try {
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function tryFsyncDirectory(dir: string): void {
  try {
    const fd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unsupported on some platforms (notably Windows).
  }
}

/** Exact-payload durable write: tmp + bak + rename + fsync + parse verify. */
export function writeDurableJsonPayload(
  targetPath: string,
  payload: string,
): void {
  assertTestStoreIsNotProduction(targetPath);
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPathFor(targetPath);
  const bak = bakPathFor(targetPath);

  try {
    writeTmpFlushed(tmp, payload);

    if (fs.existsSync(targetPath)) {
      safeUnlink(bak);
      fs.renameSync(targetPath, bak);
    }

    fs.renameSync(tmp, targetPath);
    tryFsyncDirectory(dir);

    const verified = tryParseJsonFile(targetPath);
    if (!verified.ok) {
      throw new DurableJsonWriteError(
        `strategy-search write verification failed for ${targetPath}`,
        targetPath,
      );
    }

    safeUnlink(bak);
  } catch (error) {
    if (!fs.existsSync(targetPath) && tryParseJsonFile(bak).ok) {
      try {
        fs.renameSync(bak, targetPath);
      } catch {
        // preserve bak for manual recovery
      }
    }
    safeUnlink(tmp);
    if (error instanceof DurableJsonWriteError) throw error;
    throw new DurableJsonWriteError(
      `strategy-search filesystem write failed for ${targetPath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      targetPath,
    );
  }
}
