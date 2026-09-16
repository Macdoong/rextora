import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";
import {
  PaperSessionError,
  getActivePaperSessionService,
  listPaperSessionsService,
  preparePaperSessionService,
  startPaperSessionFromStrategy,
} from "@/src/lib/rextora/paper/paperSessionService";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("recover") === "1") {
      const recoverDenied = await denyUnlessPermitted(request, "paper:operate");
      if (recoverDenied) return recoverDenied;
      const { recoverPaperSessionsAfterRestart } = await import(
        "@/src/lib/rextora/paper/paperSessionService"
      );
      const recovery = recoverPaperSessionsAfterRestart();
      return apiJsonResponse(
        { recovery, active: getActivePaperSessionService() },
        { source: "paper-session", cached: false, durationMs: Date.now() - start },
      );
    }
    const onlyActive = searchParams.get("active") === "1";
    if (onlyActive) {
      return apiJsonResponse(
        { active: getActivePaperSessionService() },
        { source: "paper-session", cached: false, durationMs: Date.now() - start },
      );
    }
    return apiJsonResponse(
      {
        sessions: listPaperSessionsService(),
        active: getActivePaperSessionService(),
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

/**
 * POST body:
 * - prepare (default when approve !== true): creates ready/pending_approval — no executor
 * - approve: true → prepare + start executor (explicit commercial start)
 * - action: "prepare" | "start" for clarity
 */
export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "paper:operate");
  if (denied) return denied;
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => null)) as {
      strategyId?: string;
      virtualBalance?: number;
      backtestResultId?: string | null;
      backtestRunId?: string | null;
      linkedJobId?: string | null;
      sourceResearchJobId?: string | null;
      sourceTrialIteration?: number | null;
      symbol?: string | null;
      timeframe?: string | null;
      requireApproval?: boolean;
      approve?: boolean;
      action?: string;
      idempotencyKey?: string;
    } | null;

    if (!body?.strategyId) {
      return apiErrorResponse("strategyId required", Date.now() - start, 400);
    }

    const wantStart =
      body.approve === true || body.action === "start" || body.action === "approve";

    const prepareInput = {
      strategyId: body.strategyId,
      virtualBalance: body.virtualBalance,
      backtestRunId: body.backtestRunId ?? body.backtestResultId ?? null,
      sourceResearchJobId: body.sourceResearchJobId ?? body.linkedJobId ?? null,
      sourceTrialIteration: body.sourceTrialIteration ?? null,
      symbol: body.symbol,
      timeframe: body.timeframe,
      requireApproval: body.requireApproval === true,
    };

    const session = wantStart
      ? await startPaperSessionFromStrategy({
          ...prepareInput,
          idempotencyKey: body.idempotencyKey,
        })
      : preparePaperSessionService(prepareInput);

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
            : error.code === "DUPLICATE_START"
              ? 409
              : 400;
      return apiErrorResponse(error.message, Date.now() - start, status);
    }
    return apiErrorResponse(
      error instanceof Error ? error.message : "paper session create failed",
      Date.now() - start,
    );
  }
}
