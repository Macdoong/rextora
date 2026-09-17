import type { PublicRextoraUser, RextoraRole } from "@/src/lib/rextora/auth/authTypes";
import { ADMIN_API_CREATE_ROLES } from "@/src/lib/rextora/auth/adminUserPolicy";

export const ADMIN_USERS_API_PATH = "/api/rextora/admin/users";

export type AdminPublicUser = PublicRextoraUser;

export function adminCreateUserBody(input: {
  username: string;
  displayName: string;
  password: string;
  role: (typeof ADMIN_API_CREATE_ROLES)[number];
}) {
  return {
    username: input.username.trim(),
    displayName: input.displayName.trim(),
    password: input.password,
    role: input.role,
  };
}

export function adminPatchUsernameBody(username: string) {
  return { username: username.trim() };
}

export function adminPatchDisplayNameBody(displayName: string) {
  return { displayName: displayName.trim() };
}

export function adminPatchDisabledBody(disabled: boolean) {
  return { disabled };
}

export function adminPatchPasswordBody(password: string) {
  return { password };
}

export function adminPatchRoleBody(role: Exclude<RextoraRole, "ceo">) {
  return { role };
}

export function adminUserDetailPath(userId: string): string {
  return `${ADMIN_USERS_API_PATH}/${encodeURIComponent(userId)}`;
}

export function adminDeleteUserPath(userId: string): string {
  return adminUserDetailPath(userId);
}

export type AdminApiError = {
  status: number;
  message: string;
  code?: string;
};

export function readAdminApiError(status: number, payload: unknown): AdminApiError {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const message =
    typeof record.error === "string" && record.error.trim()
      ? record.error
      : status === 401
        ? "로그인이 필요합니다."
        : status === 403
          ? "이 작업을 수행할 권한이 없습니다."
          : status === 404
            ? "사용자를 찾을 수 없습니다."
            : status === 409
              ? "이미 사용 중인 아이디입니다."
              : "요청을 처리하지 못했습니다.";
  return {
    status,
    message,
    code: typeof record.code === "string" ? record.code : undefined,
  };
}
