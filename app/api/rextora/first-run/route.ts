import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { classifyFirstRunStatus } from "@/src/lib/rextora/firstRun/firstRunStatus";
import { getDemoDeepLinks } from "@/src/lib/rextora/firstRun/demoFixture";

/**
 * Read-only first-run readiness status.
 * Never returns absolute filesystem paths or secrets.
 */
export async function GET() {
  const start = Date.now();
  try {
    const status = classifyFirstRunStatus();
    const deepLinks = getDemoDeepLinks();
    return apiJsonResponse(
      {
        status,
        deepLinks,
        labels: {
          DEMO_DATA: "데모 데이터",
          REAL_USER_DATA: "실제 사용자 데이터",
          SAFE_PROTECTED: "SAFE 보호 전략",
        },
      },
      { source: "first-run-status", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "first-run status failed",
      Date.now() - start,
    );
  }
}
