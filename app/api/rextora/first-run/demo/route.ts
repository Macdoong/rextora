import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { initializeDemoWorkspace } from "@/src/lib/rextora/firstRun/demoFixture";
import { classifyFirstRunStatus } from "@/src/lib/rextora/firstRun/firstRunStatus";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

/**
 * Explicit demo workspace initialization.
 * Requires confirm=true — Agent questions alone must never call this.
 * Never starts Paper or Live. Never touches SAFE.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "settings:write");
  if (denied) return denied;
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as {
      confirm?: boolean | string;
    };
    const confirmed =
      body.confirm === true || body.confirm === "true" || body.confirm === "1";
    if (!confirmed) {
      return apiErrorResponse(
        "데모 초기화는 명시적 확인(confirm=true)이 필요합니다.",
        Date.now() - start,
        400,
      );
    }

    const result = initializeDemoWorkspace();
    const status = classifyFirstRunStatus();
    return apiJsonResponse(
      {
        result,
        status,
        noticeKo:
          "데모 데이터는 예시이며 실전 증거나 실전 주문이 아닙니다. Paper/Live는 자동 시작되지 않습니다.",
      },
      { source: "first-run-demo-init", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "demo init failed",
      Date.now() - start,
    );
  }
}
