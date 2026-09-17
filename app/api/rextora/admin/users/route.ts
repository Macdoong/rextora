import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { isAdminApiCreateRole } from "@/src/lib/rextora/auth/adminUserPolicy";
import { toPublicUser } from "@/src/lib/rextora/auth/authTypes";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";
import {
  forbiddenResponse,
  originRejectedResponse,
  requireAdmin,
  requireMemberManagementViewer,
} from "@/src/lib/rextora/auth/requireUser";
import { createUser, listUsers } from "@/src/lib/rextora/auth/userStore";

export async function GET(request: Request) {
  const auth = requireMemberManagementViewer(request);
  if (!auth.ok) return auth.response;
  const start = Date.now();
  const users = listUsers().map(toPublicUser);
  return apiJsonResponse(
    { users },
    { source: "admin-users", cached: false, durationMs: Date.now() - start },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  const start = Date.now();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiErrorResponse("요청 본문이 올바르지 않습니다.", Date.now() - start, 400);
  }

  const allowed = new Set(["username", "displayName", "password", "role"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return apiErrorResponse("지원하지 않는 필드입니다.", Date.now() - start, 400);
  }

  const username = typeof body.username === "string" ? body.username : "";
  const displayName = typeof body.displayName === "string" ? body.displayName : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;

  if (role === "ceo") {
    return forbiddenResponse();
  }
  if (!isAdminApiCreateRole(role)) {
    return apiErrorResponse("역할이 올바르지 않습니다.", Date.now() - start, 400);
  }
  if (typeof body.password !== "string" || password.length < 1) {
    return apiErrorResponse("비밀번호가 필요합니다.", Date.now() - start, 400);
  }

  try {
    const user = await createUser({
      username,
      displayName,
      password,
      role,
    });
    return apiJsonResponse(
      { user: toPublicUser(user) },
      { source: "admin-users-create", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용자를 만들 수 없습니다.";
    const conflict = message.includes("이미");
    return apiErrorResponse(message, Date.now() - start, conflict ? 409 : 400);
  }
}
