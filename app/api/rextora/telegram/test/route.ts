import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { sendAssistantTestMessage } from "@/src/lib/rextora/telegramAssistant";

export async function POST() {
  const start = Date.now();

  try {
    const result = await sendAssistantTestMessage();
    return apiJsonResponse(result, { source: "telegram", cached: false, durationMs: Date.now() - start, ok: result.ok });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "telegram test failed", Date.now() - start);
  }
}
