import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import {
  clearDryRunEmergencyStop,
  emergencyStopDryRun,
  LiveDryRunError,
  reconcileDryRun,
  submitDryRunOrder,
  type DryRunOrderSide,
} from "@/src/lib/rextora/live/liveDryRunEngine";

/**
 * POST /api/rextora/live/dry-run
 * Dry-run adapter only — never calls executeLiveEntry / Binance.
 */
export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: "submit" | "emergency_stop" | "reconcile" | "clear_emergency";
      executionKey?: string;
      strategyId?: string;
      strategyHash?: string;
      symbol?: string;
      side?: DryRunOrderSide;
      quantity?: number;
      reason?: string;
    } | null;

    if (!body || typeof body !== "object") {
      return apiErrorResponse("JSON body required", Date.now() - start, 400);
    }

    const action = body.action;
    if (action === "reconcile") {
      const result = reconcileDryRun();
      return apiJsonResponse(result, {
        source: "live-dry-run",
        cached: false,
        durationMs: Date.now() - start,
      });
    }

    if (action === "emergency_stop") {
      const session = emergencyStopDryRun({ reason: body.reason });
      return apiJsonResponse(
        {
          session,
          messageKo: "드라이런 긴급 중단이 적용되었습니다. 신규 진입이 차단됩니다.",
        },
        { source: "live-dry-run", cached: false, durationMs: Date.now() - start },
      );
    }

    if (action === "clear_emergency") {
      const session = clearDryRunEmergencyStop();
      return apiJsonResponse(
        {
          session,
          messageKo: "드라이런 긴급 중단이 해제되었습니다. 명시적 재활성화가 완료되었습니다.",
        },
        { source: "live-dry-run", cached: false, durationMs: Date.now() - start },
      );
    }

    if (action === "submit") {
      const record = submitDryRunOrder({
        executionKey: body.executionKey ?? "",
        strategyId: body.strategyId ?? "",
        strategyHash: body.strategyHash ?? "",
        symbol: body.symbol ?? "",
        side: (body.side ?? "BUY") as DryRunOrderSide,
        quantity: body.quantity ?? 0,
      });
      return apiJsonResponse(
        {
          record,
          messageKo:
            record.state === "EMERGENCY_STOPPED"
              ? "긴급 중단 상태 — 드라이런 주문이 차단되었습니다. 실전 봇은 시작되지 않았습니다."
              : "드라이런 주문이 기록되었습니다. 거래소 호출 없음 · 실전 봇은 시작되지 않았습니다.",
        },
        { source: "live-dry-run", cached: false, durationMs: Date.now() - start },
      );
    }

    return apiErrorResponse(
      "action must be submit|emergency_stop|clear_emergency|reconcile",
      Date.now() - start,
      400,
    );
  } catch (error) {
    if (error instanceof LiveDryRunError) {
      return apiErrorResponse(error.message, Date.now() - start, 400);
    }
    return apiErrorResponse(
      error instanceof Error ? error.message : "live dry-run failed",
      Date.now() - start,
    );
  }
}
