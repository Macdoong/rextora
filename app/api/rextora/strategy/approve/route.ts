import { approveStrategyForLive, getStrategyApprovalSummary, revokeStrategyLiveApproval } from "@/src/lib/rextora/strategyLiveApproval";
import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = (await request.json()) as { confirmationText?: string; action?: "approve" | "revoke" };
    if (body.action === "revoke") {
      const state = revokeStrategyLiveApproval();
      return apiJsonResponse(
        { ok: true, message: "전략 실전 승인이 해제되었습니다.", approval: getStrategyApprovalSummary(), state },
        { source: "strategy-approve", durationMs: Date.now() - start }
      );
    }

    const result = approveStrategyForLive(body.confirmationText ?? "");
    return apiJsonResponse(
      {
        ok: result.ok,
        message: result.message,
        approval: getStrategyApprovalSummary(),
        state: result.state
      },
      { source: "strategy-approve", durationMs: Date.now() - start },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "strategy approval failed", Date.now() - start);
  }
}

export async function GET() {
  const start = Date.now();
  return apiJsonResponse(
    { approval: getStrategyApprovalSummary() },
    { source: "strategy-approve", durationMs: Date.now() - start }
  );
}
