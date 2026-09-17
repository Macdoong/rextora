import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR,
  isRextoraRole,
  REXTORA_ROLES,
  type RextoraPermission,
} from "../src/lib/rextora/auth/authTypes";
import {
  AUTH_FORBIDDEN,
  AUTH_LOGIN_REQUIRED,
  AUTH_ROLE_LABEL_KO,
  authRoleLabelKo,
} from "../src/lib/rextora/auth/authPresentation";
import { permissionsForRole, roleHasPermission } from "../src/lib/rextora/auth/permissions";
import {
  requireAdmin,
  requireAuthenticatedUser,
  requireCeo,
  requireMemberManagementViewer,
} from "../src/lib/rextora/auth/requireUser";
import { createSession } from "../src/lib/rextora/auth/sessionStore";
import { createInitialCeo, createUser, disableUser, getUserByUsername } from "../src/lib/rextora/auth/userStore";
import { attachCookie, authedRequest } from "./helpers/authSession";

const OPERATOR_PERMISSIONS: readonly RextoraPermission[] = [
  "research:run",
  "backtest:run",
  "paper:operate",
  "live:request",
  "live:emergency_stop",
  "agent:operate",
];

const CEO_ONLY_PERMISSIONS: readonly RextoraPermission[] = [
  "settings:write",
  "risk:write",
  "live:approve",
  "live:revoke",
  "live:start",
  "credentials:manage",
  "strategy:write",
];

const USER_FIELDS = [
  "userId",
  "username",
  "displayName",
  "role",
  "passwordHash",
  "createdAt",
  "disabledAt",
] as const;

async function bodyOf(response: Response) {
  return (await response.json()) as {
    ok?: boolean;
    data?: unknown;
    error?: string;
    code?: string;
  };
}

describe("admin role foundation", () => {
  it("1-4. REXTORA_ROLES and isRextoraRole accept the closed four-role set", () => {
    expect([...REXTORA_ROLES]).toEqual(["ceo", "admin", "operator", "viewer"]);
    expect(isRextoraRole("admin")).toBe(true);
    expect(isRextoraRole("ceo")).toBe(true);
    expect(isRextoraRole("operator")).toBe(true);
    expect(isRextoraRole("viewer")).toBe(true);
    expect(isRextoraRole("tester")).toBe(false);
    expect(isRextoraRole("TESTER")).toBe(false);
    expect(isRextoraRole("owner")).toBe(false);
    expect(isRextoraRole("")).toBe(false);
    expect(isRextoraRole(null)).toBe(false);
  });

  it("5-16. admin and operator match CEO application permissions; viewer unchanged", () => {
    expect(permissionsForRole("admin")).toEqual(permissionsForRole("ceo"));
    expect(permissionsForRole("operator")).toEqual(permissionsForRole("ceo"));
    for (const permission of OPERATOR_PERMISSIONS) {
      expect(roleHasPermission("admin", permission)).toBe(true);
      expect(roleHasPermission("operator", permission)).toBe(true);
    }
    for (const permission of CEO_ONLY_PERMISSIONS) {
      expect(roleHasPermission("admin", permission)).toBe(true);
      expect(roleHasPermission("operator", permission)).toBe(true);
      expect(roleHasPermission("ceo", permission)).toBe(true);
    }
    expect(permissionsForRole("ceo")).toEqual([
      ...OPERATOR_PERMISSIONS,
      ...CEO_ONLY_PERMISSIONS,
    ]);
    expect(permissionsForRole("viewer")).toEqual([]);
    expect(authRoleLabelKo("admin")).toBe("관리자");
    expect(authRoleLabelKo("viewer")).toBe("회원");
    expect(AUTH_ROLE_LABEL_KO.admin).toBe("관리자");
    expect(AUTH_ROLE_LABEL_KO.viewer).toBe("회원");
  });

  it("17. authenticated CEO passes requireAdmin", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "ceo");
    const gate = requireAdmin(request);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.user.role).toBe("ceo");
    expect(gate.user.username).toBe("temp_ceo");
  });

  it("18. authenticated admin passes requireAdmin", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "admin");
    const gate = requireAdmin(request);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.user.role).toBe("admin");
    expect(gate.user.username).toBe("temp_admin");
    expect((gate.user as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it("19. authenticated operator is forbidden by requireAdmin", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "operator");
    const gate = requireAdmin(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const body = await bodyOf(gate.response);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
    expect(body.error).toBe(AUTH_FORBIDDEN);
  });

  it("19b. member-management viewer gate allows ceo/admin/operator and denies viewer", async () => {
    const ceo = requireMemberManagementViewer(
      await authedRequest("http://localhost/api/rextora/auth/me", {}, "ceo"),
    );
    const admin = requireMemberManagementViewer(
      await authedRequest("http://localhost/api/rextora/auth/me", {}, "admin"),
    );
    const operator = requireMemberManagementViewer(
      await authedRequest("http://localhost/api/rextora/auth/me", {}, "operator"),
    );
    const viewer = requireMemberManagementViewer(
      await authedRequest("http://localhost/api/rextora/auth/me", {}, "viewer"),
    );
    const unauth = requireMemberManagementViewer(new Request("http://localhost/api/rextora/auth/me"));
    expect(ceo.ok).toBe(true);
    expect(admin.ok).toBe(true);
    expect(operator.ok).toBe(true);
    expect(viewer.ok).toBe(false);
    expect(unauth.ok).toBe(false);
    if (!viewer.ok) expect(viewer.response.status).toBe(403);
    if (!unauth.ok) expect(unauth.response.status).toBe(401);
  });

  it("20. authenticated viewer is forbidden by requireAdmin", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "viewer");
    const gate = requireAdmin(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const body = await bodyOf(gate.response);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
  });

  it("21. unauthenticated request follows existing auth failure behavior", async () => {
    const request = new Request("http://localhost/api/rextora/auth/me");
    const admin = requireAdmin(request);
    const auth = requireAuthenticatedUser(request);
    expect(admin.ok).toBe(false);
    expect(auth.ok).toBe(false);
    if (admin.ok || auth.ok) return;
    expect(admin.response.status).toBe(401);
    expect(auth.response.status).toBe(401);
    const body = await bodyOf(admin.response);
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
    expect(body.error).toBe(AUTH_LOGIN_REQUIRED);
  });

  it("22. disabled admin cannot pass through a stale session", async () => {
    const user = await createUser({
      username: "disabled_admin_gate",
      displayName: "비활성 관리자",
      role: "admin",
      password: "disabled-admin-pass",
    });
    const { token } = createSession(user.userId);
    disableUser(user.userId);
    const request = attachCookie(
      new Request("http://localhost/api/rextora/auth/me"),
      token,
    );
    const gate = requireAdmin(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
    const body = await bodyOf(gate.response);
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
  });

  it("23. requireAdmin returns the canonical authenticated user", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "admin");
    const admin = requireAdmin(request);
    const auth = requireAuthenticatedUser(request);
    expect(admin.ok).toBe(true);
    expect(auth.ok).toBe(true);
    if (!admin.ok || !auth.ok) return;
    expect(admin.user).toEqual(auth.user);
    expect(admin.user.role).toBe("admin");
  });

  it("24-25. requireCeo still rejects admin and accepts CEO", async () => {
    const adminRequest = await authedRequest("http://localhost/api/rextora/auth/me", {}, "admin");
    const ceoRequest = await authedRequest("http://localhost/api/rextora/auth/me", {}, "ceo");
    const adminDenied = requireCeo(adminRequest);
    const ceoAllowed = requireCeo(ceoRequest);
    expect(adminDenied.ok).toBe(false);
    if (adminDenied.ok) return;
    expect(adminDenied.response.status).toBe(403);
    const body = await bodyOf(adminDenied.response);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
    expect(ceoAllowed.ok).toBe(true);
    if (!ceoAllowed.ok) return;
    expect(ceoAllowed.user.role).toBe("ceo");
  });

  it("26-27. existing user records deserialize; admin uses the same schema", async () => {
    const ceo = await createUser({
      username: "persist_ceo_role",
      displayName: "기존 대표",
      role: "ceo",
      password: "persist-ceo-pass",
    });
    const operator = await createUser({
      username: "persist_operator_role",
      displayName: "기존 운영자",
      role: "operator",
      password: "persist-operator-pass",
    });
    const viewer = await createUser({
      username: "persist_viewer_role",
      displayName: "기존 조회",
      role: "viewer",
      password: "persist-viewer-pass",
    });
    const admin = await createUser({
      username: "persist_admin_role",
      displayName: "신규 관리자",
      role: "admin",
      password: "persist-admin-pass",
    });

    for (const user of [ceo, operator, viewer, admin]) {
      expect(Object.keys(user).sort()).toEqual([...USER_FIELDS].sort());
      expect(user).not.toHaveProperty("adminAccess");
      expect(user).not.toHaveProperty("isAdmin");
      const loaded = getUserByUsername(user.username);
      expect(loaded).toEqual(user);
    }
    expect(ceo.role).toBe("ceo");
    expect(operator.role).toBe("operator");
    expect(viewer.role).toBe("viewer");
    expect(admin.role).toBe("admin");
    expect(isRextoraRole(admin.role)).toBe(true);
  });

  it("createInitialCeo still creates only ceo", async () => {
    const { invalidateJsonStoreCache } = await import("../src/lib/rextora/storage/jsonStore");
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-admin-bootstrap-"));
    const previous = process.env.REXTORA_DATA_DIR;
    process.env.REXTORA_DATA_DIR = isolated;
    invalidateJsonStoreCache();
    try {
      const user = await createInitialCeo({
        username: "bootceo",
        displayName: "부트스트랩 대표",
        password: "boot-secret-pass",
      });
      expect(user.role).toBe("ceo");
      expect(user.role).not.toBe("admin");
    } finally {
      process.env.REXTORA_DATA_DIR = previous;
      invalidateJsonStoreCache();
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });
});
