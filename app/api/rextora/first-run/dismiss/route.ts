import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  dismissFirstRunSetup,
  markFirstRunSetupComplete,
} from "@/src/lib/rextora/firstRun/demoFixture";
import { classifyFirstRunStatus } from "@/src/lib/rextora/firstRun/firstRunStatus";

/**
 * Dismiss onboarding or mark setup complete. Does not create or delete data.
 */
export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "dismiss" | "complete";
    };
    if (body.action === "complete") {
      markFirstRunSetupComplete();
    } else {
      dismissFirstRunSetup();
    }
    const status = classifyFirstRunStatus();
    return apiJsonResponse(
      { status },
      { source: "first-run-dismiss", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "first-run dismiss failed",
      Date.now() - start,
    );
  }
}
