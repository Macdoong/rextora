import { NextResponse } from "next/server";
import { testAndOptionallySaveProvider } from "@/src/lib/rextora/agent/v2/providers";
import { assertLocalOperatorRequest } from "@/src/lib/rextora/agent/v2/providers/providerRequestGuard";

export async function POST(request: Request) {
  const guard = assertLocalOperatorRequest(request);
  if (!guard.ok) {
    return NextResponse.json(
      { error: true, messageKo: guard.messageKo },
      { status: guard.status },
    );
  }
  let body: {
    provider?: string;
    apiKey?: string;
    model?: string | null;
    saveOnSuccess?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: true, messageKo: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (body.provider !== "openai" && body.provider !== "gemini") {
    return NextResponse.json(
      { error: true, messageKo: "공급자를 선택해 주세요." },
      { status: 400 },
    );
  }
  if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 8) {
    return NextResponse.json(
      { error: true, messageKo: "유효한 API 키를 입력해 주세요." },
      { status: 400 },
    );
  }
  const result = await testAndOptionallySaveProvider({
    provider: body.provider,
    apiKey: body.apiKey,
    model: body.model ?? null,
    saveOnSuccess: body.saveOnSuccess === true,
  });
  // Never echo the submitted key.
  return NextResponse.json({
    ok: result.test.ok,
    provider: result.test.provider,
    model: result.test.model,
    latencyMs: result.test.latencyMs,
    structuredOutputValid: result.test.structuredOutputValid,
    writeToolAuditCount: result.test.writeToolAuditCount,
    errorKo: result.test.errorKo,
    responseFingerprint: result.test.responseFingerprint,
    saved: result.saved,
    settings: result.public,
  });
}
