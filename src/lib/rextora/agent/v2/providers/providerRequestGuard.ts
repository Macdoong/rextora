/**
 * Localhost / operator request guard for AI provider settings APIs.
 */

export function assertLocalOperatorRequest(request: Request): {
  ok: true;
} | { ok: false; status: number; messageKo: string } {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const localHost =
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:");
  if (!localHost) {
    return {
      ok: false,
      status: 403,
      messageKo: "AI 공급자 설정은 로컬 운영자 환경에서만 변경할 수 있습니다.",
    };
  }
  if (origin) {
    try {
      const url = new URL(origin);
      const originLocal =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1";
      if (!originLocal) {
        return {
          ok: false,
          status: 403,
          messageKo: "허용되지 않은 Origin 입니다.",
        };
      }
    } catch {
      return {
        ok: false,
        status: 403,
        messageKo: "Origin 헤더가 올바르지 않습니다.",
      };
    }
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return {
      ok: false,
      status: 413,
      messageKo: "요청 본문이 너무 큽니다.",
    };
  }
  return { ok: true };
}
