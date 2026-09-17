import type { RextoraRole } from "./authTypes";

export const AUTH_ROLE_LABEL_KO: Record<RextoraRole, string> = {
  ceo: "대표",
  admin: "관리자",
  operator: "운영자",
  viewer: "회원",
};

export function authRoleLabelKo(role: RextoraRole | null | undefined): string {
  if (role === "ceo" || role === "admin" || role === "operator" || role === "viewer") {
    return AUTH_ROLE_LABEL_KO[role];
  }
  return "권한 없음";
}

export const AUTH_LOGIN_INVALID = "아이디 또는 비밀번호가 올바르지 않습니다.";
export const AUTH_LOGIN_REQUIRED = "로그인이 필요합니다.";
export const AUTH_ACCOUNT_DISABLED = "계정이 비활성화되어 있습니다.";
export const AUTH_FORBIDDEN = "이 작업을 수행할 권한이 없습니다.";
export const AUTH_RATE_LIMITED = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
export const AUTH_ORIGIN_REJECTED = "허용되지 않은 요청 출처입니다.";
export const AUTH_CLIENT_ACTOR_REJECTED =
  "요청 본문의 행위자 식별자는 사용할 수 없습니다. 로그인 세션 신원을 사용합니다.";
