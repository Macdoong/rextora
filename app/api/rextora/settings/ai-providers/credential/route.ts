import { NextResponse } from "next/server";
import { removeProviderCredentialPublic } from "@/src/lib/rextora/agent/v2/providers";
import { assertLocalOperatorRequest } from "@/src/lib/rextora/agent/v2/providers/providerRequestGuard";

export async function DELETE(request: Request) {
  const guard = assertLocalOperatorRequest(request);
  if (!guard.ok) {
    return NextResponse.json(
      { error: true, messageKo: guard.messageKo },
      { status: guard.status },
    );
  }
  let body: { provider?: string; confirm?: boolean };
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
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: true, messageKo: "삭제를 확인해야 합니다." },
      { status: 400 },
    );
  }
  const result = removeProviderCredentialPublic(body.provider);
  return NextResponse.json(result);
}
