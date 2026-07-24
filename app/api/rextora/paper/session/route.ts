import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  createPaperSession,
  getActivePaperSession,
  listPaperSessions,
  PaperSessionError,
} from "@/src/lib/rextora/paper/paperSessionStore";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get("active") === "1";
    if (onlyActive) {
      return apiJsonResponse(
        { active: getActivePaperSession() },
        { source: "paper-session", cached: false, durationMs: Date.now() - start },
      );
    }
    return apiJsonResponse(
      {
        sessions: listPaperSessions(),
        active: getActivePaperSession(),
      },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session list failed",
      Date.now() - start,
    );
  }
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => null)) as {
      strategyId?: string;
      virtualBalance?: number;
      backtestResultId?: string | null;
      linkedJobId?: string | null;
      symbol?: string | null;
    } | null;

    if (!body?.strategyId) {
      return apiErrorResponse("strategyId required", Date.now() - start, 400);
    }

    const session = createPaperSession({
      strategyId: body.strategyId,
      virtualBalance: body.virtualBalance,
      backtestResultId: body.backtestResultId,
      linkedJobId: body.linkedJobId,
      symbol: body.symbol,
    });

    return apiJsonResponse(
      { session },
      { source: "paper-session", cached: false, durationMs: Date.now() - start },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PaperSessionError) {
      const status =
        error.code === "STRATEGY_NOT_FOUND"
          ? 404
          : error.code === "STRATEGY_REQUIRED"
            ? 400
            : 400;
      return apiErrorResponse(error.message, Date.now() - start, status);
    }
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session create failed",
      Date.now() - start,
    );
  }
}
