import { NextResponse } from "next/server";
import {
  getAiProvidersPublic,
  patchAiProviders,
} from "@/src/lib/rextora/agent/v2/providers";
import { assertLocalOperatorRequest } from "@/src/lib/rextora/agent/v2/providers/providerRequestGuard";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const guard = assertLocalOperatorRequest(request);
  if (!guard.ok) {
    return NextResponse.json(
      { error: true, messageKo: guard.messageKo },
      { status: guard.status },
    );
  }
  return NextResponse.json(getAiProvidersPublic());
}

export async function PATCH(request: Request) {
  const denied = await denyUnlessPermitted(request, "credentials:manage");
  if (denied) return denied;
  const guard = assertLocalOperatorRequest(request);
  if (!guard.ok) {
    return NextResponse.json(
      { error: true, messageKo: guard.messageKo },
      { status: guard.status },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: true, messageKo: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  try {
    const result = await patchAiProviders({
      emergencyDisabled:
        typeof body.emergencyDisabled === "boolean"
          ? body.emergencyDisabled
          : undefined,
      defaultProvider:
        body.defaultProvider === null ||
        body.defaultProvider === "openai" ||
        body.defaultProvider === "gemini"
          ? (body.defaultProvider as "openai" | "gemini" | null)
          : undefined,
      fallbackEnabled:
        typeof body.fallbackEnabled === "boolean"
          ? body.fallbackEnabled
          : undefined,
      fallbackProvider:
        body.fallbackProvider === null ||
        body.fallbackProvider === "openai" ||
        body.fallbackProvider === "gemini"
          ? (body.fallbackProvider as "openai" | "gemini" | null)
          : undefined,
      openai:
        body.openai && typeof body.openai === "object"
          ? (body.openai as { enabled?: boolean; selectedModel?: string | null })
          : undefined,
      gemini:
        body.gemini && typeof body.gemini === "object"
          ? (body.gemini as { enabled?: boolean; selectedModel?: string | null })
          : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const code = err instanceof Error ? err.message : "PATCH_FAILED";
    return NextResponse.json(
      {
        error: true,
        messageKo:
          code === "INVALID_OPENAI_MODEL" || code === "INVALID_GEMINI_MODEL"
            ? "선택한 모델이 현재 카탈로그에 없습니다."
            : "AI 공급자 설정을 저장하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
