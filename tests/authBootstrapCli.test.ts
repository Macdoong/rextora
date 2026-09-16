import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  readEnvBootstrapFields,
  runAuthBootstrap,
} from "@/src/lib/rextora/auth/bootstrapCli";
import { getUserByUsername, userCount } from "@/src/lib/rextora/auth/userStore";
import { verifyPassword } from "@/src/lib/rextora/auth/password";
import { getEnv } from "@/src/lib/rextora/env";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";
import { invalidateJsonStoreCache } from "@/src/lib/rextora/storage/jsonStore";
import { AUTH_USERS_FILE } from "@/src/lib/rextora/auth/authTypes";

const BOOTSTRAP_ENV_KEYS = [
  "REXTORA_BOOTSTRAP_ALLOWED",
  "REXTORA_BOOTSTRAP_USERNAME",
  "REXTORA_BOOTSTRAP_DISPLAY_NAME",
  "REXTORA_BOOTSTRAP_PASSWORD",
] as const;

const ORIGINAL_BOOTSTRAP_ENV: Record<string, string | undefined> = {};
for (const key of BOOTSTRAP_ENV_KEYS) {
  ORIGINAL_BOOTSTRAP_ENV[key] = process.env[key];
}

const ORIGINAL_DATA_DIR = process.env.REXTORA_DATA_DIR;
const PRODUCTION_AUTH_USERS = path.join(
  process.cwd(),
  "data",
  "rextora",
  AUTH_USERS_FILE,
);

function snapshotProductionAuthUsers(): { exists: boolean; digest: string | null } {
  if (!fs.existsSync(PRODUCTION_AUTH_USERS)) {
    return { exists: false, digest: null };
  }
  const digest = createHash("sha256")
    .update(fs.readFileSync(PRODUCTION_AUTH_USERS))
    .digest("hex");
  return { exists: true, digest };
}

const PRODUCTION_BEFORE = snapshotProductionAuthUsers();

function clearBootstrapEnv(): void {
  for (const key of BOOTSTRAP_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreBootstrapEnv(): void {
  for (const key of BOOTSTRAP_ENV_KEYS) {
    const value = ORIGINAL_BOOTSTRAP_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  restoreBootstrapEnv();
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.REXTORA_DATA_DIR;
  else process.env.REXTORA_DATA_DIR = ORIGINAL_DATA_DIR;
  invalidateJsonStoreCache();
});

async function withIsolatedStore<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-render-bootstrap-test-"));
  const previous = process.env.REXTORA_DATA_DIR;
  process.env.REXTORA_DATA_DIR = root;
  invalidateJsonStoreCache();
  try {
    return await fn(root);
  } finally {
    if (previous === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = previous;
    invalidateJsonStoreCache();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("CEO bootstrap for a fresh disk", () => {
  it("1-4. empty store creates a hashed ceo that verifies", async () => {
    const password = "isolated-bootstrap-pass-9f3a";
    await withIsolatedStore(async (root) => {
      expect(userCount()).toBe(0);
      expect(fs.existsSync(path.join(root, AUTH_USERS_FILE))).toBe(false);

      process.env.REXTORA_BOOTSTRAP_ALLOWED = "1";
      process.env.REXTORA_BOOTSTRAP_USERNAME = "renderceo";
      process.env.REXTORA_BOOTSTRAP_DISPLAY_NAME = "렌더 대표";
      process.env.REXTORA_BOOTSTRAP_PASSWORD = password;

      const created = await runAuthBootstrap(["node", "auth:bootstrap"]);
      expect(created.username).toBe("renderceo");
      expect(created.displayName).toBe("렌더 대표");
      expect(JSON.stringify(created).includes(password)).toBe(false);

      const stored = getUserByUsername("renderceo");
      expect(stored).toBeTruthy();
      expect(stored?.role).toBe("ceo");
      expect(stored?.passwordHash.includes(password)).toBe(false);
      expect(stored?.passwordHash.startsWith("scrypt$")).toBe(true);
      expect(await verifyPassword(password, stored!.passwordHash)).toBe(true);

      const raw = fs.readFileSync(path.join(root, AUTH_USERS_FILE), "utf8");
      expect(raw.includes(password)).toBe(false);
    });
  });

  it("5. same username bootstrap again is rejected", async () => {
    const password = "isolated-bootstrap-pass-9f3a";
    await withIsolatedStore(async () => {
      process.env.REXTORA_BOOTSTRAP_ALLOWED = "1";
      process.env.REXTORA_BOOTSTRAP_USERNAME = "renderceo";
      process.env.REXTORA_BOOTSTRAP_PASSWORD = password;
      await runAuthBootstrap(["node", "auth:bootstrap"]);
      await expect(runAuthBootstrap(["node", "auth:bootstrap"])).rejects.toThrow(
        /이미/,
      );
      expect(userCount()).toBe(1);
    });
  });

  it("6. nonempty store is not overwritten", async () => {
    const password = "isolated-bootstrap-pass-9f3a";
    await withIsolatedStore(async () => {
      process.env.REXTORA_BOOTSTRAP_ALLOWED = "1";
      process.env.REXTORA_BOOTSTRAP_USERNAME = "firstceo";
      process.env.REXTORA_BOOTSTRAP_PASSWORD = password;
      await runAuthBootstrap(["node", "auth:bootstrap"]);
      const first = getUserByUsername("firstceo");
      process.env.REXTORA_BOOTSTRAP_USERNAME = "secondceo";
      await expect(runAuthBootstrap(["node", "auth:bootstrap"])).rejects.toThrow(
        /이미/,
      );
      expect(userCount()).toBe(1);
      expect(getUserByUsername("secondceo")).toBeNull();
      expect(getUserByUsername("firstceo")?.passwordHash).toBe(first?.passwordHash);
    });
  });

  it("7. missing bootstrap password fails closed", () => {
    process.env.REXTORA_BOOTSTRAP_ALLOWED = "1";
    process.env.REXTORA_BOOTSTRAP_USERNAME = "renderceo";
    delete process.env.REXTORA_BOOTSTRAP_PASSWORD;
    expect(() => readEnvBootstrapFields()).toThrow(/비밀번호가 필요합니다/);
    process.env.REXTORA_BOOTSTRAP_PASSWORD = "";
    expect(() => readEnvBootstrapFields()).toThrow(/비밀번호가 필요합니다/);
  });

  it("8. normal app startup does not require bootstrap env vars", () => {
    clearBootstrapEnv();
    expect(getEnv().REXTORA_DEFAULT_MODE).toBe("PAPER");
    expect(
      isSameOriginMutation(
        new Request("http://localhost/api/rextora/auth/login", {
          method: "POST",
          headers: { origin: "http://localhost" },
        }),
      ),
    ).toBe(true);
  });

  it("9. production auth-users.json is unchanged", () => {
    const after = snapshotProductionAuthUsers();
    expect(after.exists).toBe(PRODUCTION_BEFORE.exists);
    expect(after.digest).toBe(PRODUCTION_BEFORE.digest);
  });

  it("10. no HTTP bootstrap or signup route exists", () => {
    const authApi = path.join(process.cwd(), "app/api/rextora/auth");
    expect(fs.existsSync(path.join(authApi, "signup/route.ts"))).toBe(false);
    expect(fs.existsSync(path.join(authApi, "bootstrap/route.ts"))).toBe(false);
  });

  it("env guard is required before username/password are read", () => {
    process.env.REXTORA_BOOTSTRAP_USERNAME = "renderceo";
    process.env.REXTORA_BOOTSTRAP_PASSWORD = "isolated-bootstrap-pass-9f3a";
    delete process.env.REXTORA_BOOTSTRAP_ALLOWED;
    expect(readEnvBootstrapFields()).toBeNull();
  });
});
