import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSIONS_FILE,
  AUTH_USERS_FILE,
} from "../src/lib/rextora/auth/authTypes";
import { createUser, listUsers } from "../src/lib/rextora/auth/userStore";
import {
  createSession,
  resolveSessionToken,
  revokeSessionsForUser,
} from "../src/lib/rextora/auth/sessionStore";
import {
  recoverAtomicJsonFile,
  writeAtomicJsonFile,
} from "../src/lib/rextora/storage/atomicJsonWrite";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import { rextoraDataRoot } from "../src/lib/rextora/storage/runtimePaths";

const PREV_DATA_DIR = process.env.REXTORA_DATA_DIR;

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("auth storage foundation", () => {
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-auth-foundation-"));
    process.env.REXTORA_DATA_DIR = tmp;
    invalidateJsonStoreCache();
  });

  afterEach(() => {
    if (PREV_DATA_DIR === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = PREV_DATA_DIR;
    invalidateJsonStoreCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("1. auth user writes preserve existing JSON schema", async () => {
    const user = await createUser({
      username: "operator_one",
      displayName: "운영자 1",
      role: "operator",
      password: "foundation-pass-1",
    });
    const filePath = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const raw = fs.readFileSync(filePath, "utf8");
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
    const stored = readJson(filePath) as {
      version: number;
      users: Array<Record<string, unknown>>;
    };
    expect(stored.version).toBe(1);
    expect(Array.isArray(stored.users)).toBe(true);
    expect(stored.users).toHaveLength(1);
    expect(stored.users[0]).toEqual({
      userId: user.userId,
      username: "operator_one",
      displayName: "운영자 1",
      role: "operator",
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      disabledAt: null,
    });
    expect(String(stored.users[0]?.passwordHash)).not.toContain("foundation-pass-1");
  });

  it("2. auth user write completes through the atomic writer", async () => {
    const atomic = await import("../src/lib/rextora/storage/atomicJsonWrite");
    const spy = vi.spyOn(atomic, "writeAtomicJsonFile");
    await createUser({
      username: "operator_two",
      displayName: "운영자 2",
      role: "operator",
      password: "foundation-pass-2",
    });
    expect(spy).toHaveBeenCalled();
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    expect(spy.mock.calls.some((call) => call[0] === target)).toBe(true);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
    spy.mockRestore();
  });

  it("3. auth session write completes through the atomic writer", async () => {
    const user = await createUser({
      username: "operator_three",
      displayName: "운영자 3",
      role: "operator",
      password: "foundation-pass-3",
    });
    const atomic = await import("../src/lib/rextora/storage/atomicJsonWrite");
    const spy = vi.spyOn(atomic, "writeAtomicJsonFile");
    createSession(user.userId);
    const target = path.join(rextoraDataRoot(), AUTH_SESSIONS_FILE);
    expect(spy.mock.calls.some((call) => call[0] === target)).toBe(true);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
    const stored = readJson(target) as {
      version: number;
      sessions: Array<Record<string, unknown>>;
    };
    expect(stored.version).toBe(1);
    expect(stored.sessions).toHaveLength(1);
    expect(stored.sessions[0]?.userId).toBe(user.userId);
    expect(stored.sessions[0]?.revokedAt).toBeNull();
    spy.mockRestore();
  });

  it("4. failed replacement does not leave a partially-written target", () => {
    const target = path.join(tmp, "auth-users.json");
    const previous = JSON.stringify(
      { version: 1, users: [{ userId: "usr_keep", username: "keep" }] },
      null,
      2,
    );
    fs.writeFileSync(target, previous, "utf8");
    const rename = fs.renameSync.bind(fs);
    const restoreSpy = vi.spyOn(fs, "renameSync").mockImplementation((src, dest) => {
      if (String(src).endsWith(".tmp") && String(dest) === target) {
        throw new Error("simulated replace failure");
      }
      return rename(src, dest);
    });
    try {
      expect(() =>
        writeAtomicJsonFile(
          target,
          JSON.stringify({ version: 1, users: [{ userId: "usr_new" }] }, null, 2),
        ),
      ).toThrow(/simulated replace failure|atomic json write failed/);
      expect(fs.readFileSync(target, "utf8")).toBe(previous);
      expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    } finally {
      restoreSpy.mockRestore();
    }
  });

  it("5. overlapping user mutations are serialized", async () => {
    const [a, b] = await Promise.all([
      createUser({
        username: "alpha",
        displayName: "알파",
        role: "operator",
        password: "overlap-pass-a",
      }),
      createUser({
        username: "beta",
        displayName: "베타",
        role: "viewer",
        password: "overlap-pass-b",
      }),
    ]);
    const stored = readJson(path.join(rextoraDataRoot(), AUTH_USERS_FILE)) as {
      users: Array<{ username: string; userId: string }>;
    };
    const names = stored.users.map((user) => user.username).sort();
    expect(names).toEqual(["alpha", "beta"]);
    expect(new Set(stored.users.map((user) => user.userId)).size).toBe(2);
    expect(stored.users.some((user) => user.userId === a.userId)).toBe(true);
    expect(stored.users.some((user) => user.userId === b.userId)).toBe(true);
  });

  it("6. overlapping session mutations are serialized", async () => {
    const user = await createUser({
      username: "session_owner",
      displayName: "세션",
      role: "operator",
      password: "session-pass",
    });
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => createSession(user.userId)),
      Promise.resolve().then(() => createSession(user.userId)),
    ]);
    const stored = readJson(path.join(rextoraDataRoot(), AUTH_SESSIONS_FILE)) as {
      sessions: Array<{ sessionId: string; tokenHash: string }>;
    };
    expect(stored.sessions).toHaveLength(2);
    expect(new Set(stored.sessions.map((row) => row.sessionId)).size).toBe(2);
    expect(new Set(stored.sessions.map((row) => row.tokenHash)).size).toBe(2);
    expect(resolveSessionToken(first.token)?.userId).toBe(user.userId);
    expect(resolveSessionToken(second.token)?.userId).toBe(user.userId);
  });

  it("7-8. revokeSessionsForUser revokes only the target user", async () => {
    const target = await createUser({
      username: "revoke_target",
      displayName: "대상",
      role: "operator",
      password: "revoke-pass-1",
    });
    const other = await createUser({
      username: "revoke_other",
      displayName: "다른 사용자",
      role: "viewer",
      password: "revoke-pass-2",
    });
    const keepA = createSession(target.userId);
    const keepB = createSession(target.userId);
    const otherSession = createSession(other.userId);
    const result = revokeSessionsForUser(target.userId);
    expect(result.userId).toBe(target.userId);
    expect(result.revokedCount).toBe(2);
    expect(resolveSessionToken(keepA.token)).toBeNull();
    expect(resolveSessionToken(keepB.token)).toBeNull();
    expect(resolveSessionToken(otherSession.token)?.userId).toBe(other.userId);
    const stored = readJson(path.join(rextoraDataRoot(), AUTH_SESSIONS_FILE)) as {
      sessions: Array<{ userId: string; revokedAt: string | null; tokenHash: string }>;
    };
    const targetRows = stored.sessions.filter((row) => row.userId === target.userId);
    const otherRows = stored.sessions.filter((row) => row.userId === other.userId);
    expect(targetRows).toHaveLength(2);
    expect(targetRows.every((row) => typeof row.revokedAt === "string")).toBe(true);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0]?.revokedAt).toBeNull();
    expect(JSON.stringify(stored)).not.toContain(keepA.token);
    expect(JSON.stringify(stored)).not.toContain(otherSession.token);
  });

  it("9. zero-session revoke is safe", async () => {
    const user = await createUser({
      username: "no_sessions",
      displayName: "없음",
      role: "viewer",
      password: "empty-pass",
    });
    const missingFile = revokeSessionsForUser(user.userId);
    expect(missingFile).toEqual({ userId: user.userId, revokedCount: 0 });
    expect(fs.existsSync(path.join(rextoraDataRoot(), AUTH_SESSIONS_FILE))).toBe(false);
    createSession(
      (
        await createUser({
          username: "has_session",
          displayName: "있음",
          role: "operator",
          password: "has-pass",
        })
      ).userId,
    );
    const emptyForUser = revokeSessionsForUser(user.userId);
    expect(emptyForUser.revokedCount).toBe(0);
    const stored = readJson(path.join(rextoraDataRoot(), AUTH_SESSIONS_FILE)) as {
      sessions: unknown[];
    };
    expect(stored.sessions).toHaveLength(1);
    expect(revokeSessionsForUser("")).toEqual({ userId: "", revokedCount: 0 });
  });

  it("A. normal live target is preferred", async () => {
    await createUser({
      username: "live_ok",
      displayName: "정상",
      role: "operator",
      password: "live-ok-pass",
    });
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const recovery = recoverAtomicJsonFile(target);
    expect(recovery).toEqual({ source: "target", restored: false });
    expect(listUsers().map((user) => user.username)).toEqual(["live_ok"]);
  });

  it("B. missing live + valid backup recovers previous users", () => {
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const committed = {
      version: 1 as const,
      users: [
        {
          userId: "usr_committed",
          username: "committed",
          displayName: "커밋됨",
          role: "operator",
          passwordHash: "scrypt$placeholder",
          createdAt: "2026-01-01T00:00:00.000Z",
          disabledAt: null,
        },
      ],
    };
    fs.writeFileSync(`${target}.bak`, JSON.stringify(committed, null, 2), "utf8");
    invalidateJsonStoreCache();
    expect(listUsers()).toEqual(committed.users);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
    expect(readJson(target)).toEqual(committed);
  });

  it("C. missing live + valid backup + leftover temp restores backup, not temp", () => {
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const committed = {
      version: 1 as const,
      users: [{ userId: "usr_bak", username: "from_bak" }],
    };
    const uncommitted = {
      version: 1 as const,
      users: [{ userId: "usr_tmp", username: "from_tmp" }],
    };
    fs.writeFileSync(`${target}.bak`, JSON.stringify(committed, null, 2), "utf8");
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(uncommitted, null, 2), "utf8");
    invalidateJsonStoreCache();
    expect(listUsers().map((user) => user.username)).toEqual(["from_bak"]);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect((readJson(target) as { users: Array<{ username: string }> }).users[0]?.username).toBe(
      "from_bak",
    );
  });

  it("D. stale backup does not replace valid live data", () => {
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const live = {
      version: 1 as const,
      users: [{ userId: "usr_live", username: "live_user" }],
    };
    const stale = {
      version: 1 as const,
      users: [{ userId: "usr_stale", username: "stale_user" }],
    };
    fs.writeFileSync(target, JSON.stringify(live, null, 2), "utf8");
    fs.writeFileSync(`${target}.bak`, JSON.stringify(stale, null, 2), "utf8");
    invalidateJsonStoreCache();
    expect(listUsers().map((user) => user.username)).toEqual(["live_user"]);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
    expect((readJson(target) as { users: Array<{ username: string }> }).users[0]?.username).toBe(
      "live_user",
    );
  });

  it("E. stale temp does not replace valid live data", () => {
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    const live = {
      version: 1 as const,
      users: [{ userId: "usr_live2", username: "keep_live" }],
    };
    const staleTmp = {
      version: 1 as const,
      users: [{ userId: "usr_tmp2", username: "stale_tmp" }],
    };
    fs.writeFileSync(target, JSON.stringify(live, null, 2), "utf8");
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(staleTmp, null, 2), "utf8");
    invalidateJsonStoreCache();
    expect(listUsers().map((user) => user.username)).toEqual(["keep_live"]);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect((readJson(target) as { users: Array<{ username: string }> }).users[0]?.username).toBe(
      "keep_live",
    );
  });

  it("malformed backup is not promoted as valid auth state", () => {
    const target = path.join(rextoraDataRoot(), AUTH_USERS_FILE);
    fs.writeFileSync(`${target}.bak`, "{not-json", "utf8");
    invalidateJsonStoreCache();
    expect(listUsers()).toEqual([]);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(`${target}.bak`, "utf8")).toBe("{not-json");
  });
});
