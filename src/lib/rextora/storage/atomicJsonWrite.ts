/**
 * Cross-platform crash-safe JSON file replacement.
 *
 * Pattern matches the proven strategy-search durable writer:
 * write+fsync a sibling .tmp, move the live file aside to .bak (so the
 * destination does not exist), then rename .tmp into place.
 *
 * Windows `rename` cannot replace an existing file. Moving the live target
 * to .bak first makes the final rename work on Windows and Linux/Render.
 * Directory fsync is best-effort (unsupported on some Windows volumes).
 *
 * This is process-local filesystem replacement, not a cross-process lock.
 */
import fs from "node:fs";
import path from "node:path";
import { assertTestStoreIsNotProduction } from "./testStoreGuard";

export class AtomicJsonWriteError extends Error {
  readonly targetPath: string;
  constructor(message: string, targetPath: string) {
    super(message);
    this.name = "AtomicJsonWriteError";
    this.targetPath = targetPath;
  }
}

export function tmpPathFor(targetPath: string): string {
  return `${targetPath}.tmp`;
}

export function bakPathFor(targetPath: string): string {
  return `${targetPath}.bak`;
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

function tryParseJsonFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

export type AtomicJsonRecoveryResult = {
  source: "target" | "bak" | "none";
  restored: boolean;
};

/**
 * Repair a crash-interrupted atomic replacement.
 * Valid live target always wins. A valid .bak is restored only when live is
 * missing. Stale .tmp / .bak are removed only after a valid live file exists.
 * Does not fabricate JSON and does not promote a malformed backup.
 */
export function recoverAtomicJsonFile(targetPath: string): AtomicJsonRecoveryResult {
  assertTestStoreIsNotProduction(targetPath);
  const tmp = tmpPathFor(targetPath);
  const bak = bakPathFor(targetPath);

  if (tryParseJsonFile(targetPath)) {
    safeUnlink(tmp);
    safeUnlink(bak);
    return { source: "target", restored: false };
  }

  if (fs.existsSync(targetPath)) {
    return { source: "none", restored: false };
  }

  if (tryParseJsonFile(bak)) {
    try {
      fs.renameSync(bak, targetPath);
    } catch {
      return { source: "none", restored: false };
    }
    if (tryParseJsonFile(targetPath)) {
      safeUnlink(tmp);
      return { source: "bak", restored: true };
    }
    return { source: "none", restored: false };
  }

  return { source: "none", restored: false };
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

export function writeAtomicJsonFile(targetPath: string, payload: string): void {
  assertTestStoreIsNotProduction(targetPath);
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPathFor(targetPath);
  const bak = bakPathFor(targetPath);

  try {
    recoverAtomicJsonFile(targetPath);
    writeTmpFlushed(tmp, payload);

    if (fs.existsSync(targetPath)) {
      safeUnlink(bak);
      fs.renameSync(targetPath, bak);
    }

    fs.renameSync(tmp, targetPath);
    tryFsyncDirectory(dir);

    if (!tryParseJsonFile(targetPath)) {
      throw new AtomicJsonWriteError(
        `atomic json write verification failed for ${path.basename(targetPath)}`,
        targetPath,
      );
    }

    safeUnlink(bak);
  } catch (error) {
    if (!fs.existsSync(targetPath) && tryParseJsonFile(bak)) {
      try {
        fs.renameSync(bak, targetPath);
      } catch {
        // preserve bak for manual recovery
      }
    }
    safeUnlink(tmp);
    if (error instanceof AtomicJsonWriteError) throw error;
    throw new AtomicJsonWriteError(
      `atomic json write failed for ${path.basename(targetPath)}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      targetPath,
    );
  }
}
