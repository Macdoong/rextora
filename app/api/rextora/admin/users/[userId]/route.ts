import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  canCallerAssignAdminRole,
  canCallerDeleteAdminTarget,
  canCallerMutateAdminTarget,
  canCallerMutateCeoSelfField,
  isAdminApiAssignRole,
  isCeoSelfAccount,
} from "@/src/lib/rextora/auth/adminUserPolicy";
import { isRextoraRole, toPublicUser } from "@/src/lib/rextora/auth/authTypes";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";
import {
  forbiddenResponse,
  originRejectedResponse,
  requireAdmin,
} from "@/src/lib/rextora/auth/requireUser";
import { revokeSessionsForUser } from "@/src/lib/rextora/auth/sessionStore";
import {
  deleteUser,
  disableUser,
  enableUser,
  getUserById,
  resetUserPassword,
  updateUserDisplayName,
  updateUserRole,
  updateUsername,
} from "@/src/lib/rextora/auth/userStore";

type Ctx = { params: Promise<{ userId: string }> };

const PATCH_FIELDS = ["username", "displayName", "disabled", "password", "role"] as const;

export async function PATCH(request: Request, context: Ctx) {
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  const { userId } = await context.params;
  const target = getUserById(userId);
  if (!target) {
    return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
  }
  if (!canCallerMutateAdminTarget(auth.user, target)) {
    return forbiddenResponse();
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiErrorResponse("요청 본문이 올바르지 않습니다.", Date.now() - start, 400);
  }
  if ("userId" in body) {
    return apiErrorResponse("사용자 ID는 변경할 수 없습니다.", Date.now() - start, 400);
  }
  const keys = Object.keys(body);
  const unknown = keys.filter((key) => !(PATCH_FIELDS as readonly string[]).includes(key));
  if (unknown.length > 0) {
    return apiErrorResponse("지원하지 않는 필드입니다.", Date.now() - start, 400);
  }
  const categories = PATCH_FIELDS.filter((key) => key in body);
  if (categories.length !== 1) {
    return apiErrorResponse("한 번에 하나의 항목만 변경할 수 있습니다.", Date.now() - start, 400);
  }
  if (isCeoSelfAccount(auth.user, target) && !canCallerMutateCeoSelfField(categories[0]!)) {
    return forbiddenResponse();
  }

  try {
    if ("username" in body) {
      if (typeof body.username !== "string") {
        return apiErrorResponse("아이디는 2자 이상이어야 합니다.", Date.now() - start, 400);
      }
      const updated = updateUsername(userId, body.username);
      if (!updated) {
        return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
      }
      revokeSessionsForUser(userId);
      return apiJsonResponse(
        { user: toPublicUser(updated) },
        { source: "admin-users-patch", cached: false, durationMs: Date.now() - start },
      );
    }

    if ("displayName" in body) {
      if (typeof body.displayName !== "string") {
        return apiErrorResponse("닉네임이 필요합니다.", Date.now() - start, 400);
      }
      const updated = updateUserDisplayName(userId, body.displayName);
      if (!updated) {
        return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
      }
      return apiJsonResponse(
        { user: toPublicUser(updated) },
        { source: "admin-users-patch", cached: false, durationMs: Date.now() - start },
      );
    }

    if ("disabled" in body) {
      if (typeof body.disabled !== "boolean") {
        return apiErrorResponse("요청 본문이 올바르지 않습니다.", Date.now() - start, 400);
      }
      const updated = body.disabled ? disableUser(userId) : enableUser(userId);
      if (!updated) {
        return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
      }
      if (body.disabled) {
        revokeSessionsForUser(userId);
      }
      return apiJsonResponse(
        { user: toPublicUser(updated) },
        { source: "admin-users-patch", cached: false, durationMs: Date.now() - start },
      );
    }

    if ("password" in body) {
      if (typeof body.password !== "string" || body.password.length < 1) {
        return apiErrorResponse("비밀번호가 필요합니다.", Date.now() - start, 400);
      }
      const updated = await resetUserPassword({
        username: target.username,
        password: body.password,
      });
      revokeSessionsForUser(userId);
      return apiJsonResponse(
        { user: updated },
        { source: "admin-users-patch", cached: false, durationMs: Date.now() - start },
      );
    }

    if ("role" in body) {
      if (!isRextoraRole(body.role) || !isAdminApiAssignRole(body.role)) {
        if (body.role === "ceo" || isRextoraRole(body.role)) {
          return forbiddenResponse();
        }
        return apiErrorResponse("역할이 올바르지 않습니다.", Date.now() - start, 400);
      }
      if (!canCallerAssignAdminRole(auth.user, body.role)) {
        return forbiddenResponse();
      }
      const updated = updateUserRole(userId, body.role);
      if (!updated) {
        return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
      }
      revokeSessionsForUser(userId);
      return apiJsonResponse(
        { user: toPublicUser(updated) },
        { source: "admin-users-patch", cached: false, durationMs: Date.now() - start },
      );
    }

    return apiErrorResponse("요청 본문이 올바르지 않습니다.", Date.now() - start, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용자를 변경할 수 없습니다.";
    const conflict = message.includes("이미");
    return apiErrorResponse(message, Date.now() - start, conflict ? 409 : 400);
  }
}

export async function DELETE(request: Request, context: Ctx) {
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  const { userId } = await context.params;
  const target = getUserById(userId);
  if (!target) {
    return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
  }
  if (!canCallerDeleteAdminTarget(auth.user, target)) {
    return forbiddenResponse();
  }

  try {
    revokeSessionsForUser(userId);
    const deleted = deleteUser(userId);
    if (!deleted) {
      return apiErrorResponse("사용자를 찾을 수 없습니다.", Date.now() - start, 404);
    }
    return apiJsonResponse(
      { user: toPublicUser(deleted) },
      { source: "admin-users-delete", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용자를 삭제할 수 없습니다.";
    return apiErrorResponse(message, Date.now() - start, 403);
  }
}
