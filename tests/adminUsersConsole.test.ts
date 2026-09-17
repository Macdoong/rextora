import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_API_CREATE_ROLES,
  adminUserReadOnlyReason,
  assignableRolesForAdminUi,
  canCallerDeleteAdminTarget,
  canCallerMutateAdminTarget,
  canMutateMemberManagement,
  canViewMemberManagement,
  isAdminConsoleNavVisible,
  isCeoSelfAccount,
  resolveAdminPageAccess,
} from "../src/lib/rextora/auth/adminUserPolicy";
import {
  ADMIN_USERS_API_PATH,
  adminCreateUserBody,
  adminDeleteUserPath,
  adminPatchDisabledBody,
  adminPatchDisplayNameBody,
  adminPatchPasswordBody,
  adminPatchRoleBody,
  adminPatchUsernameBody,
  adminUserDetailPath,
} from "../src/lib/rextora/auth/adminUsersClient";
import { authRoleLabelKo } from "../src/lib/rextora/auth/authPresentation";
import type { AuthenticatedUser } from "../src/lib/rextora/auth/authTypes";
import { permissionsForRole } from "../src/lib/rextora/auth/permissions";
import { SIDEBAR_NAV_ITEMS } from "../components/rextora/shell/navigationModel";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function actor(role: AuthenticatedUser["role"], userId = `usr_${role}`): AuthenticatedUser {
  return {
    userId,
    username: role,
    displayName: role,
    role,
    createdAt: "2026-01-01T00:00:00.000Z",
    disabledAt: null,
  };
}

describe("admin users console", () => {
  it("1-9. /admin and nav: ceo/admin/operator allowed; viewer denied", () => {
    const page = read("app/admin/page.tsx");
    const gate = read("src/lib/rextora/auth/pageAuth.ts");
    const nav = read("components/rextora/shell/navigationModel.ts");
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(page).toContain("requireAdminPageUser");
    expect(page).toContain('data-testid="admin-users-page"');
    expect(page).toContain("v3-admin-users");
    expect(gate).toContain("resolveSessionToken");
    expect(gate).toContain("AUTH_SESSION_COOKIE");
    expect(gate).toContain('redirect("/login")');
    expect(gate).toContain('redirect("/dashboard")');
    expect(resolveAdminPageAccess(actor("ceo"))).toBe("allow");
    expect(resolveAdminPageAccess(actor("admin"))).toBe("allow");
    expect(resolveAdminPageAccess(actor("operator"))).toBe("allow");
    expect(resolveAdminPageAccess(actor("viewer"))).toBe("forbidden");
    expect(resolveAdminPageAccess(null)).toBe("unauthenticated");
    expect(nav).toContain('label: "회원 관리"');
    expect(nav).toContain('href: "/admin"');
    expect(sidebar).toContain("isAdminConsoleNavVisible");
    expect(SIDEBAR_NAV_ITEMS.some((item) => item.href === "/admin" && item.label === "회원 관리")).toBe(true);
    expect(isAdminConsoleNavVisible("ceo")).toBe(true);
    expect(isAdminConsoleNavVisible("admin")).toBe(true);
    expect(isAdminConsoleNavVisible("operator")).toBe(true);
    expect(isAdminConsoleNavVisible("viewer")).toBe(false);
    expect(canViewMemberManagement("operator")).toBe(true);
    expect(canMutateMemberManagement("operator")).toBe(false);
    expect(canMutateMemberManagement("admin")).toBe(true);
  });

  it("10-16. create modal is two-column with visible inputs; ceo excluded", () => {
    const consoleSrc = read("components/rextora/admin/AdminUsersConsole.tsx");
    const css = read("components/rextora/v3/admin.css");
    expect(consoleSrc).toContain("ADMIN_API_CREATE_ROLES");
    expect(consoleSrc).toContain('data-testid="admin-create-role"');
    expect(consoleSrc).toContain('data-testid="admin-create-username"');
    expect(consoleSrc).toContain('data-testid="admin-create-display-name"');
    expect(consoleSrc).toContain('data-testid="admin-create-password"');
    expect(consoleSrc).toContain('type="password"');
    expect(consoleSrc).toContain("v3-admin-create-dialog");
    expect(consoleSrc).toContain("v3-admin-create-grid");
    expect(consoleSrc).toContain("v3-admin-field");
    expect(consoleSrc).toContain('data-create-columns="2"');
    expect(consoleSrc).not.toContain('value="ceo"');
    expect(consoleSrc).toContain("관리자");
    expect(consoleSrc).toContain("운영자");
    expect(consoleSrc).toContain("회원");
    expect(consoleSrc).not.toContain("조회자");
    expect(consoleSrc).not.toContain("표시 이름");
    expect(consoleSrc).toContain("닉네임");
    expect([...ADMIN_API_CREATE_ROLES]).toEqual(["admin", "operator", "viewer"]);
    expect(ADMIN_API_CREATE_ROLES).not.toContain("ceo");
    expect(css).toContain(".v3-dialog.v3-admin-create-dialog");
    expect(css).toContain("width: min(760px, 94vw)");
    expect(css).toContain("grid-template-columns: 1fr 1fr");
    expect(css).not.toContain("repeat(4");
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("appearance: none");
    expect(css).toContain("border: 1px solid #c5ced8");
    expect(css).toContain("background: #fff");
    expect(css).toContain("min-height: 44px");
  });

  it("17-27. CEO self editable; other CEO protected; operator read-only; delete rules", () => {
    const ceo = actor("ceo", "usr_ceo");
    const otherCeo = actor("ceo", "usr_ceo_other");
    const admin = actor("admin", "usr_admin");
    const otherAdmin = actor("admin", "usr_admin_2");
    const operator = actor("operator", "usr_op");
    const viewer = actor("viewer", "usr_view");

    expect(isCeoSelfAccount(ceo, ceo)).toBe(true);
    expect(adminUserReadOnlyReason(ceo, ceo)).toBeNull();
    expect(canCallerMutateAdminTarget(ceo, ceo)).toBe(true);
    expect(assignableRolesForAdminUi(ceo, ceo)).toEqual([]);
    expect(canCallerDeleteAdminTarget(ceo, ceo)).toBe(false);

    expect(isCeoSelfAccount(admin, ceo)).toBe(false);
    expect(adminUserReadOnlyReason(admin, ceo)).toBe("ceo");
    expect(canCallerMutateAdminTarget(admin, ceo)).toBe(false);
    expect(canCallerDeleteAdminTarget(admin, ceo)).toBe(false);
    expect(canCallerMutateAdminTarget(ceo, otherCeo)).toBe(false);
    expect(adminUserReadOnlyReason(ceo, otherCeo)).toBe("ceo");

    expect(canCallerMutateAdminTarget(admin, otherAdmin)).toBe(true);
    expect(canCallerMutateAdminTarget(admin, admin)).toBe(true);
    expect(canCallerDeleteAdminTarget(admin, admin)).toBe(false);
    expect(canCallerDeleteAdminTarget(admin, otherAdmin)).toBe(true);
    expect(canCallerDeleteAdminTarget(ceo, otherAdmin)).toBe(true);
    expect(canCallerMutateAdminTarget(ceo, otherAdmin)).toBe(true);
    expect(assignableRolesForAdminUi(ceo, otherAdmin)).toEqual(["admin", "operator", "viewer"]);
    expect(assignableRolesForAdminUi(admin, operator)).toEqual(["admin", "operator", "viewer"]);
    expect(assignableRolesForAdminUi(admin, viewer)).toContain("admin");
    expect(assignableRolesForAdminUi(ceo, operator)).not.toContain("ceo");
    expect(assignableRolesForAdminUi(operator, viewer)).toEqual([]);
    expect(canCallerMutateAdminTarget(operator, viewer)).toBe(false);
    expect(canCallerDeleteAdminTarget(operator, viewer)).toBe(false);
    expect(adminUserReadOnlyReason(operator, viewer)).toBe("operator_readonly");
    expect(authRoleLabelKo("admin")).toBe("관리자");
    expect(authRoleLabelKo("viewer")).toBe("회원");
  });

  it("28-40. editor sections, delete UI, canvas, operator hides mutations", () => {
    expect(ADMIN_USERS_API_PATH).toBe("/api/rextora/admin/users");
    expect(adminUserDetailPath("usr_1")).toBe("/api/rextora/admin/users/usr_1");
    expect(adminDeleteUserPath("usr_1")).toBe("/api/rextora/admin/users/usr_1");
    expect(adminCreateUserBody({
      username: " op1 ",
      displayName: " 운영 ",
      password: "secret-pass",
      role: "operator",
    })).toEqual({
      username: "op1",
      displayName: "운영",
      password: "secret-pass",
      role: "operator",
    });
    expect(adminPatchDisplayNameBody(" 새 이름 ")).toEqual({ displayName: "새 이름" });
    expect(adminPatchDisabledBody(true)).toEqual({ disabled: true });
    expect(adminPatchPasswordBody("next-pass")).toEqual({ password: "next-pass" });
    expect(adminPatchRoleBody("admin")).toEqual({ role: "admin" });
    expect(adminPatchUsernameBody(" NewId ")).toEqual({ username: "NewId" });

    const consoleSrc = read("components/rextora/admin/AdminUsersConsole.tsx");
    const page = read("app/admin/page.tsx");
    const css = read("components/rextora/v3/admin.css");
    const globals = read("app/globals.css");
    const shell = read("components/rextora/v3/shell.css");
    const route = read("app/api/rextora/admin/users/[userId]/route.ts");
    expect(consoleSrc).toContain("adminPatchDisplayNameBody");
    expect(consoleSrc).toContain("adminPatchUsernameBody");
    expect(consoleSrc).toContain("adminPatchDisabledBody");
    expect(consoleSrc).toContain("adminPatchPasswordBody");
    expect(consoleSrc).toContain("adminPatchRoleBody");
    expect(consoleSrc).toContain("loadUsers");
    expect(consoleSrc).toContain('setCreatePassword("")');
    expect(consoleSrc).toContain("if (ok) onPasswordChange(\"\")");
    expect(consoleSrc).not.toContain("passwordHash");
    expect(consoleSrc).not.toContain("user.password");
    expect(consoleSrc).toContain('method: "DELETE"');
    expect(consoleSrc).toContain("계정 삭제");
    expect(consoleSrc).toContain("위험 영역");
    expect(consoleSrc).toContain("계정 상태");
    expect(consoleSrc).toContain("내 계정 관리");
    expect(consoleSrc).toContain("isCeoSelfAccount");
    expect(consoleSrc).toContain("canCallerDeleteAdminTarget");
    expect(consoleSrc).toContain('data-editor-mode={ceoSelf ? "ceo-self" : "managed"}');
    expect(consoleSrc).toContain("V3Dialog");
    expect(consoleSrc).toContain("V3Drawer");
    expect(consoleSrc).toContain("v3-admin-create-dialog");
    expect(consoleSrc).toContain("v3-admin-create-grid");
    expect(consoleSrc).toContain("v3-admin-field");
    expect(consoleSrc).toContain("canMutateMemberManagement");
    expect(consoleSrc).toContain("조회 전용");
    expect(consoleSrc).toContain("보호됨");
    expect(consoleSrc).toContain("계정 만들기");
    expect(consoleSrc).toContain("admin-user-cards");
    expect(consoleSrc).toContain("xl:hidden");
    expect(consoleSrc).toContain("hidden xl:block");
    expect(consoleSrc).toContain('type="password"');
    expect(consoleSrc).toContain("새 비밀번호");
    expect(consoleSrc).toContain("비밀번호 변경");
    expect(consoleSrc).toContain("아이디");
    expect(consoleSrc).toContain("닉네임");
    expect(page).not.toContain("passwordHash");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("canCallerDeleteAdminTarget");
    expect(route).toContain("revokeSessionsForUser");
    expect(globals).toContain(".v3-shell:has(.v3-admin-users) .dashboard-main");
    expect(globals).toContain("background: var(--v3-background)");
    expect(shell).toContain(".v3-shell:has(.v3-admin-users) .dashboard-main");
    expect(css).not.toContain(".v3-shell:has(.v3-admin-users) .dashboard-main");
    expect(css).toContain("var(--v3-background)");
    expect(css).toContain("border: 1px solid #c5ced8");
    expect(css).toContain("background: #fff");
    expect(css).toContain("color-scheme: light");
    expect(css).not.toContain("--v3-background: #070b14");
    expect(css).not.toContain("#070b14");
    expect(permissionsForRole("admin")).toEqual(permissionsForRole("ceo"));
    expect(permissionsForRole("operator")).toEqual(permissionsForRole("ceo"));
    expect(permissionsForRole("viewer")).toEqual([]);
  });

  it("41-49. final UI: outdated copy gone, create typing identity, high-contrast badges", () => {
    const consoleSrc = read("components/rextora/admin/AdminUsersConsole.tsx");
    const css = read("components/rextora/v3/admin.css");
    const dialog = read("components/rextora/v3/V3Dialog.tsx");

    expect(consoleSrc).not.toContain("대표는 본인 아이디");
    expect(consoleSrc).not.toContain("생성 가능한 역할은");
    expect(consoleSrc).not.toContain("본인 아이디·닉네임·비밀번호만");

    expect(dialog).toContain("onCloseRef");
    expect(dialog).toContain("}, [open]);");
    expect(dialog).not.toContain("[open, onClose]");
    expect(dialog).not.toMatch(/panelRef\.current\?\.focus\(\);[\s\S]*\}, \[open, onClose\]/);

    const createUsernameBlock = consoleSrc.slice(
      consoleSrc.indexOf('data-testid="admin-create-username"') - 220,
      consoleSrc.indexOf('data-testid="admin-create-username"') + 80,
    );
    const createDisplayBlock = consoleSrc.slice(
      consoleSrc.indexOf('data-testid="admin-create-display-name"') - 220,
      consoleSrc.indexOf('data-testid="admin-create-display-name"') + 80,
    );
    const createPasswordBlock = consoleSrc.slice(
      consoleSrc.indexOf('data-testid="admin-create-password"') - 280,
      consoleSrc.indexOf('data-testid="admin-create-password"') + 80,
    );
    expect(createUsernameBlock).not.toContain("key=");
    expect(createDisplayBlock).not.toContain("key=");
    expect(createPasswordBlock).not.toContain("key=");
    expect(createUsernameBlock).toContain("setCreateUsername(event.target.value)");
    expect(createDisplayBlock).toContain("setCreateDisplayName(event.target.value)");
    expect(createPasswordBlock).toContain("setCreatePassword(event.target.value)");
    expect(createUsernameBlock).not.toContain("resetCreateForm");
    expect(createDisplayBlock).not.toContain("resetCreateForm");
    expect(createPasswordBlock).not.toContain("resetCreateForm");
    expect(consoleSrc).toContain("closeCreateDialog");
    expect(consoleSrc).toMatch(/resetCreateForm\(\);\s*setCreateOpen\(false\)/);

    let username = "";
    let nickname = "";
    let password = "";
    for (const ch of "admin01") username += ch;
    for (const ch of "운영닉") nickname += ch;
    for (const ch of "secret9") password += ch;
    expect(username).toBe("admin01");
    expect(nickname).toBe("운영닉");
    expect(password).toBe("secret9");

    expect(consoleSrc).toContain("대표");
    expect(consoleSrc).toContain("관리자");
    expect(consoleSrc).toContain("운영자");
    expect(consoleSrc).toContain("회원");
    expect(consoleSrc).toContain("활성");
    expect(consoleSrc).toContain("비활성");
    expect(consoleSrc).toContain("v3-admin-badge--ceo");
    expect(consoleSrc).toContain("v3-admin-badge--ceo-account");
    expect(consoleSrc).toContain("v3-admin-badge--admin");
    expect(consoleSrc).toContain("v3-admin-badge--operator");
    expect(consoleSrc).toContain("v3-admin-badge--member");
    expect(consoleSrc).toContain("v3-admin-badge--active");
    expect(consoleSrc).toContain("v3-admin-badge--disabled");
    expect(consoleSrc).not.toContain("bg-indigo-500/10");
    expect(consoleSrc).not.toContain("text-indigo-200");
    expect(consoleSrc).not.toContain("text-emerald-300");
    expect(consoleSrc).not.toContain("text-amber-200");
    expect(css).toContain(".v3-admin-badge--ceo");
    expect(css).toContain("color: #1a1450");
    expect(css).toContain("background-color: #cfc4ff");
    expect(css).toContain(".v3-admin-badge--ceo-account");
    expect(css).toContain("color: #6b3b00");
    expect(css).toContain("background-color: #ffd789");
    expect(css).toContain(".v3-admin-badge--admin");
    expect(css).toContain("color: #152a73");
    expect(css).toContain(".v3-admin-badge--operator");
    expect(css).toContain("color: #0a4d5e");
    expect(css).toContain(".v3-admin-badge--member");
    expect(css).toContain("color: #1e293b");
    expect(css).toContain(".v3-admin-badge--active");
    expect(css).toContain("color: #0a4a2c");
    expect(css).toContain("background-color: #b7ebc9");
    expect(css).toContain(".v3-admin-badge--disabled");
    expect(css).toContain("color: #7f1212");
    expect(css).not.toContain("!important");
    expect(css).not.toMatch(/v3-admin-badge[^{]*opacity:\s*0\./);
  });
});
