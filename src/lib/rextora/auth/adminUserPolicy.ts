import type { AuthenticatedUser, RextoraRole } from "./authTypes";
import type { RextoraUser } from "./authTypes";

export const ADMIN_API_CREATE_ROLES = ["admin", "operator", "viewer"] as const;
export const ADMIN_API_ASSIGN_ROLES = ["admin", "operator", "viewer"] as const;

export function isAdminApiCreateRole(value: unknown): value is "admin" | "operator" | "viewer" {
  return value === "admin" || value === "operator" || value === "viewer";
}

export function isAdminApiAssignRole(value: unknown): value is "admin" | "operator" | "viewer" {
  return isAdminApiCreateRole(value);
}

export function canViewMemberManagement(role: RextoraRole | null | undefined): boolean {
  return role === "ceo" || role === "admin" || role === "operator";
}

export function canMutateMemberManagement(role: RextoraRole | null | undefined): boolean {
  return role === "ceo" || role === "admin";
}

export function canManageAdminConsole(role: RextoraRole | null | undefined): boolean {
  return canMutateMemberManagement(role);
}

export function isAdminConsoleNavVisible(role: RextoraRole | null | undefined): boolean {
  return canViewMemberManagement(role);
}

export function resolveAdminPageAccess(
  user: Pick<AuthenticatedUser, "role"> | null,
): "unauthenticated" | "forbidden" | "allow" {
  if (!user) return "unauthenticated";
  if (canViewMemberManagement(user.role)) return "allow";
  return "forbidden";
}

export function canCallerMutateAdminTarget(
  caller: AuthenticatedUser,
  target: Pick<RextoraUser, "userId" | "role">,
): boolean {
  if (target.role === "ceo") {
    return isCeoSelfAccount(caller, target);
  }
  return canMutateMemberManagement(caller.role);
}

export function isCeoSelfAccount(
  caller: AuthenticatedUser,
  target: Pick<RextoraUser, "userId" | "role">,
): boolean {
  return caller.role === "ceo" && target.role === "ceo" && caller.userId === target.userId;
}

export function canCallerMutateCeoSelfField(field: string): boolean {
  return field === "username" || field === "displayName" || field === "password";
}

export function canCallerDeleteAdminTarget(
  caller: AuthenticatedUser,
  target: Pick<RextoraUser, "userId" | "role">,
): boolean {
  if (!canMutateMemberManagement(caller.role)) return false;
  if (target.role === "ceo") return false;
  if (caller.userId === target.userId) return false;
  return true;
}

export function canCallerAssignAdminRole(caller: AuthenticatedUser, role: RextoraRole): boolean {
  if (role === "ceo") return false;
  if (!canMutateMemberManagement(caller.role)) return false;
  return isAdminApiAssignRole(role);
}

export function assignableRolesForAdminUi(
  caller: AuthenticatedUser,
  target: Pick<RextoraUser, "userId" | "role">,
): Array<"admin" | "operator" | "viewer"> {
  if (isCeoSelfAccount(caller, target)) return [];
  if (!canCallerMutateAdminTarget(caller, target)) return [];
  return ["admin", "operator", "viewer"];
}

export function adminUserReadOnlyReason(
  caller: AuthenticatedUser,
  target: Pick<RextoraUser, "userId" | "role">,
): "ceo" | "operator_readonly" | null {
  if (target.role === "ceo" && !isCeoSelfAccount(caller, target)) return "ceo";
  if (!canMutateMemberManagement(caller.role)) return "operator_readonly";
  return null;
}
