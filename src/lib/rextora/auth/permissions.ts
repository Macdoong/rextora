import type { RextoraPermission, RextoraRole } from "./authTypes";

const OPERATOR_PERMISSIONS: readonly RextoraPermission[] = [
  "research:run",
  "backtest:run",
  "paper:operate",
  "live:request",
  "live:emergency_stop",
  "agent:operate",
];

const CEO_PERMISSIONS: readonly RextoraPermission[] = [
  ...OPERATOR_PERMISSIONS,
  "settings:write",
  "risk:write",
  "live:approve",
  "live:revoke",
  "live:start",
  "credentials:manage",
  "strategy:write",
];

export function permissionsForRole(role: RextoraRole): readonly RextoraPermission[] {
  if (role === "ceo") return CEO_PERMISSIONS;
  if (role === "operator") return OPERATOR_PERMISSIONS;
  return [];
}

export function roleHasPermission(role: RextoraRole, permission: RextoraPermission): boolean {
  return permissionsForRole(role).includes(permission);
}
