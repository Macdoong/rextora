import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/rextora/auth/password";
import {
  createInitialCeo,
  getUserByUsername,
  resetUserPassword,
  userCount,
} from "../src/lib/rextora/auth/userStore";
import {
  argvContainsPassword,
  parseResetUsernameArg,
} from "../src/lib/rextora/auth/resetPasswordCli";

const ROOT = path.resolve(__dirname, "..");

describe("owner password reset", () => {
  const prevDataDir = process.env.REXTORA_DATA_DIR;
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-pw-reset-"));
    process.env.REXTORA_DATA_DIR = tmp;
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = prevDataDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("updates only passwordHash for an existing user", async () => {
    const created = await createInitialCeo({
      username: "dlwlstjs14",
      displayName: "admin",
      password: "old-owner-pass",
    });
    const before = getUserByUsername("dlwlstjs14");
    expect(before?.userId).toBe(created.userId);
    const publicUser = await resetUserPassword({
      username: "dlwlstjs14",
      password: "new-owner-pass",
    });
    expect(publicUser.username).toBe("dlwlstjs14");
    expect(publicUser.displayName).toBe("admin");
    expect(publicUser.role).toBe("ceo");
    expect(publicUser.userId).toBe(created.userId);
    expect(userCount()).toBe(1);
    const after = getUserByUsername("dlwlstjs14");
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.passwordHash.includes("new-owner-pass")).toBe(false);
    expect(await verifyPassword("new-owner-pass", after!.passwordHash)).toBe(true);
    expect(await verifyPassword("old-owner-pass", after!.passwordHash)).toBe(false);
    expect(after).toMatchObject({
      userId: created.userId,
      username: "dlwlstjs14",
      displayName: "admin",
      role: "ceo",
      createdAt: created.createdAt,
      disabledAt: created.disabledAt ?? null,
    });
  });

  it("refuses unknown users and does not create a second account", async () => {
    await createInitialCeo({
      username: "dlwlstjs14",
      displayName: "admin",
      password: "old-owner-pass",
    });
    await expect(
      resetUserPassword({ username: "nobody", password: "x" }),
    ).rejects.toThrow("사용자를 찾을 수 없습니다.");
    expect(userCount()).toBe(1);
  });

  it("CLI rejects password argv and parses username", () => {
    expect(argvContainsPassword(["node", "x", "--password=secret"])).toBe(true);
    expect(parseResetUsernameArg(["--username=dlwlstjs14"])).toBe("dlwlstjs14");
    const src = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/auth/resetPasswordCli.ts"),
      "utf8",
    );
    expect(src).toContain("resetUserPassword");
    expect(src).toContain("assertProductionAuthStore");
    expect(src).toContain("readHiddenPasswordFromTty");
    const store = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/auth/userStore.ts"),
      "utf8",
    );
    expect(store).toContain("await hashPassword(input.password)");
    const script = fs.readFileSync(
      path.join(ROOT, "scripts/rextora-auth-reset-password.mjs"),
      "utf8",
    );
    expect(script).toContain("delete process.env.REXTORA_DATA_DIR");
  });

  it("hashPassword remains the canonical hasher", async () => {
    const encoded = await hashPassword("only-for-test");
    expect(encoded.startsWith("scrypt$")).toBe(true);
    expect(encoded.includes("only-for-test")).toBe(false);
  });
});
