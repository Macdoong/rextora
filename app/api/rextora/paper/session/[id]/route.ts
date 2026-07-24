import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  getPaperSession,
  pausePaperSession,
  PaperSessionError,
  resumePaperSession,
  stopPaperSession,
} from "@/src/lib/rextora/paper/paperSessionStore";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  const start = Date.now();
  try {
    const { id } = await ctx.params;
    const session = getPaperSession(id);
    if (!session) {
      return apiErrorResponse("session not found", Date.now() - start, 404);
    }
    return apiJsonResponse(
      { session },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session get failed",
      Date.now() - start,
    );
  }
}

export async function POST(request: Request, ctx: Params) {
  const start = Date.now();
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as {
      action?: string;
    } | null;
    const action = body?.action;

    if (action !== "pause" && action !== "resume" && action !== "stop") {
      return apiErrorResponse(
        "action must be pause|resume|stop",
        Date.now() - start,
        400,
      );
    }

    const session =
      action === "pause"
        ? pausePaperSession(id)
        : action === "resume"
          ? resumePaperSession(id)
          : stopPaperSession(id);

    return apiJsonResponse(
      { session, action },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    if (error instanceof PaperSessionError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "INVALID_STATE"
            ? 409
            : 400;
      return apiErrorResponse(error.message, Date.now() - start, status);
    }
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session action failed",
      Date.now() - start,
    );
  }
}
