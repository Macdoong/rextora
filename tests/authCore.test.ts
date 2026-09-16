import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as loginPost } from "../app/api/rextora/auth/login/route";
import { POST as logoutPost } from "../app/api/rextora/auth/logout/route";
import { GET as meGet } from "../app/api/rextora/auth/me/route";
import {
  encodedHashContainsPlaintext,
  hashPassword,
  verifyPassword,
} from "../src/lib/rextora/auth/password";
import {
  createInitialCeo,
  createUser,
  disableUser,
  getUserByUsername,
  userCount,
} from "../src/lib/rextora/auth/userStore";
import {
  createSession,
  expireSessionForTests,
  persistentSessionContainsRawToken,
  resolveSessionToken,
  revokeSessionToken,
} from "../src/lib/rextora/auth/sessionStore";
import {
  AUTH_SESSION_COOKIE,
  AUTH_ERROR,
} from "../src/lib/rextora/auth/authTypes";
import {
  expireLoginLockForTests,
  IP_AUTHORITY_UNAVAILABLE,
} from "../src/lib/rextora/auth/loginRateLimit";
import { argvContainsPassword } from "../src/lib/rextora/auth/bootstrapCli";
import { authedRequest, ensureTestUser, testPassword } from "./helpers/authSession";

describe("auth core", () => {
  it("1-3. password hash never stores plaintext and verifies correctly", async () => {
    const password = "correct-horse-battery";
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(encodedHashContainsPlaintext(a, password)).toBe(false);
    expect(a.includes(password)).toBe(false);
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
  });

  it("4-5. valid login creates session; invalid login does not", async () => {
    const { user } = await ensureTestUser("ceo");
    const bad = await loginPost(
      new Request("http://localhost/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: user.username, password: "nope" }),
      }),
    );
    expect(bad.status).toBe(401);
    const good = await loginPost(
      new Request("http://localhost/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          password: testPassword("ceo"),
        }),
      }),
    );
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(AUTH_SESSION_COOKIE);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.toLowerCase()).not.toContain("secure");
    const token = cookie.split(";")[0]?.split("=")[1] ?? "";
    expect(token.length).toBeGreaterThan(16);
    expect(persistentSessionContainsRawToken(token)).toBe(false);
    const json = (await good.json()) as { data: { user: { passwordHash?: string } } };
    expect(json.data.user.passwordHash).toBeUndefined();
  });

  it("6. expired session fails closed", async () => {
    const { user } = await ensureTestUser("ceo");
    const { token } = createSession(user.userId);
    expireSessionForTests(token, "2000-01-01T00:00:00.000Z");
    expect(resolveSessionToken(token)).toBeNull();
  });

  it("7-8. revoked and logged-out sessions fail", async () => {
    const { user } = await ensureTestUser("ceo");
    const { token } = createSession(user.userId);
    expect(resolveSessionToken(token)?.userId).toBe(user.userId);
    revokeSessionToken(token);
    expect(resolveSessionToken(token)).toBeNull();
    const { token: other } = createSession(user.userId);
    const res = await logoutPost(
      new Request("http://localhost/api/rextora/auth/logout", {
        method: "POST",
        headers: { Cookie: `${AUTH_SESSION_COOKIE}=${other}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(resolveSessionToken(other)).toBeNull();
  });

  it("9. disabled user cannot login", async () => {
    const disabled = await createUser({
      username: "temp_disabled",
      displayName: "비활성",
      role: "viewer",
      password: "disabled-pass-1",
    });
    disableUser(disabled.userId);
    const res = await loginPost(
      new Request("http://localhost/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "temp_disabled", password: "disabled-pass-1" }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(AUTH_ERROR.disabled);
  });

  it("10. duplicate username is blocked", async () => {
    await ensureTestUser("viewer");
    await expect(
      createUser({
        username: "temp_viewer",
        displayName: "dup",
        role: "viewer",
        password: "x",
      }),
    ).rejects.toThrow(/이미 사용/);
  });

  it("11-13. first CEO bootstrap succeeds in TEMP store and blocks a second", async () => {
    expect(argvContainsPassword(["--password=secret"])).toBe(true);
    const { readBootstrapFields } = await import("../src/lib/rextora/auth/bootstrapCli");
    const { invalidateJsonStoreCache } = await import("../src/lib/rextora/storage/jsonStore");
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-bootstrap-"));
    const previous = process.env.REXTORA_DATA_DIR;
    process.env.REXTORA_DATA_DIR = isolated;
    invalidateJsonStoreCache();
    try {
      expect(userCount()).toBe(0);
      const fields = await readBootstrapFields({
        stdinIsTty: false,
        readStdin: () => "bootceo\n부트스트랩 대표\nsuper-secret-pass\n",
      });
      expect(fields.username).toBe("bootceo");
      expect(fields.password).toBe("super-secret-pass");
      const user = await createInitialCeo(fields);
      expect(user.username).toBe("bootceo");
      expect(user.passwordHash.includes("super-secret-pass")).toBe(false);
      expect(JSON.stringify(user).includes("super-secret-pass")).toBe(false);
      await expect(createInitialCeo(fields)).rejects.toThrow(/이미/);
    } finally {
      process.env.REXTORA_DATA_DIR = previous;
      invalidateJsonStoreCache();
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("14. no public signup endpoint", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app/api/rextora/auth/signup/route.ts"))).toBe(false);
  });

  it("/me returns the public user only", async () => {
    const req = await authedRequest("http://localhost/api/rextora/auth/me", { method: "GET" }, "ceo");
    const res = await meGet(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: Record<string, unknown> } };
    expect(body.data.user.username).toBe("temp_ceo");
    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("45-46. login rate limit then reset", async () => {
    expect(IP_AUTHORITY_UNAVAILABLE).toContain("username-based");
    for (let i = 0; i < 8; i += 1) {
      await loginPost(
        new Request("http://localhost/api/rextora/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "rate_user", password: "bad" }),
        }),
      );
    }
    const locked = await loginPost(
      new Request("http://localhost/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "rate_user", password: "bad" }),
      }),
    );
    expect(locked.status).toBe(429);
    expireLoginLockForTests("rate_user", "2000-01-01T00:00:00.000Z");
    const after = await loginPost(
      new Request("http://localhost/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "rate_user", password: "bad" }),
      }),
    );
    expect(after.status).toBe(401);
  });

  it("createInitialCeo refuses when users exist", async () => {
    expect(userCount()).toBeGreaterThan(0);
    await expect(
      createInitialCeo({ username: "x", displayName: "y", password: "z" }),
    ).rejects.toThrow(/이미/);
    expect(getUserByUsername("temp_ceo")).toBeTruthy();
  });
});
