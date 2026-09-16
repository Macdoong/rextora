import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { resetDemoWorkspace } from "@/src/lib/rextora/firstRun/demoFixture";
import { classifyFirstRunStatus } from "@/src/lib/rextora/firstRun/firstRunStatus";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

/**
 * Reset ONLY reserved demo records. Never deletes SAFE or real user data.
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
        "데모 초기화 해제는 명시적 확인(confirm=true)이 필요합니다.",
        Date.now() - start,
        400,
      );
    }

    const removed = resetDemoWorkspace();
    const status = classifyFirstRunStatus();
    return apiJsonResponse(
      {
        removed,
        status,
        noticeKo: "데모 레코드만 삭제했습니다. 실제 연구 데이터와 SAFE는 유지됩니다.",
      },
      { source: "first-run-demo-reset", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "demo reset failed",
      Date.now() - start,
    );
  }
}
