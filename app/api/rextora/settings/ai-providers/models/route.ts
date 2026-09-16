import { NextResponse } from "next/server";
import { getProviderModelsPublic } from "@/src/lib/rextora/agent/v2/providers";
import { assertLocalOperatorRequest } from "@/src/lib/rextora/agent/v2/providers/providerRequestGuard";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

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
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (provider !== "openai" && provider !== "gemini") {
    return NextResponse.json(
      { error: true, messageKo: "공급자를 지정해 주세요." },
      { status: 400 },
    );
  }
  try {
    const result = await getProviderModelsPublic(provider, forceRefresh);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: true,
        messageKo:
          err instanceof Error
            ? err.message
            : "모델 목록을 불러오지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
