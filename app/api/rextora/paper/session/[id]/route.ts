import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  PaperSessionError,
  approveAndStartPaperSession,
  getPaperSessionById,
  pausePaperSessionService,
  resumePaperSessionService,
  stopPaperSessionService,
} from "@/src/lib/rextora/paper/paperSessionService";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  const start = Date.now();
  try {
    const { id } = await ctx.params;
    const session = getPaperSessionById(id);
    if (!session) {
      return apiErrorResponse("session not found", Date.now() - start, 404);
    }
    return apiJsonResponse(
      { session },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    if (error instanceof PaperSessionError && error.code === "CORRUPT_SESSION") {
      return apiErrorResponse(error.message, Date.now() - start, 422);
    }
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
      strategyId?: string;
      idempotencyKey?: string;
      stopReason?: string;
    } | null;
    const action = body?.action;

    if (
      action !== "pause" &&
      action !== "resume" &&
      action !== "stop" &&
      action !== "approve"
    ) {
      return apiErrorResponse(
        "action must be pause|resume|stop|approve",
        Date.now() - start,
        400,
      );
    }

    const session =
      action === "pause"
        ? await pausePaperSessionService({
            sessionId: id,
            strategyId: body?.strategyId,
            idempotencyKey: body?.idempotencyKey,
          })
        : action === "resume"
          ? await resumePaperSessionService({
              sessionId: id,
              strategyId: body?.strategyId,
              idempotencyKey: body?.idempotencyKey,
            })
          : action === "approve"
            ? await approveAndStartPaperSession({
                sessionId: id,
                strategyId: body?.strategyId,
                idempotencyKey: body?.idempotencyKey,
              })
            : await stopPaperSessionService({
                sessionId: id,
                strategyId: body?.strategyId,
                stopReason: body?.stopReason,
                idempotencyKey: body?.idempotencyKey,
              });

    return apiJsonResponse(
      { session, action },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    if (error instanceof PaperSessionError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "INVALID_STATE" ||
              error.code === "DUPLICATE_START" ||
              error.code === "DUPLICATE_PAUSE" ||
              error.code === "WRONG_STRATEGY" ||
              error.code === "WRONG_SESSION"
            ? 409
            : error.code === "CORRUPT_SESSION"
              ? 422
              : 400;
      return apiErrorResponse(error.message, Date.now() - start, status);
    }
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session action failed",
      Date.now() - start,
    );
  }
}
