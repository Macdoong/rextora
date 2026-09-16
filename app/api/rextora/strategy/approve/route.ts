import {
  approveStrategyForLive,
  getStrategyApprovalSummary,
  revokeStrategyLiveApproval,
} from "@/src/lib/rextora/strategyLiveApproval";
import {
  approveLiveApprovalRequest,
  getLiveApprovalWorkflowView,
  rejectLiveApprovalRequest,
  requestLiveApproval,
  revokeLiveApprovalRequest,
} from "@/src/lib/rextora/live/liveApprovalWorkflow";
import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { roleHasPermission } from "@/src/lib/rextora/auth/permissions";
import { permissionForApproveAction } from "@/src/lib/rextora/auth/routePermissions";
import {
  forbiddenResponse,
  originRejectedResponse,
  rejectClientActorBody,
  requireAuthenticatedUser,
  sessionActorIdentity,
  denyUnlessAuthenticated,
} from "@/src/lib/rextora/auth/requireUser";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";

type ApprovalAction = "approve" | "revoke" | "request" | "reject";

type ApprovalBody = {
  confirmationText?: string;
  action?: ApprovalAction;
  strategyId?: string;
  backtestRunId?: string | null;
  paperSessionId?: string | null;
  symbol?: string | null;
  requestId?: string;
  requestReason?: string | null;
  reviewReason?: string | null;
  revokeReason?: string | null;
  requestedBy?: string | null;
  reviewedBy?: string | null;
  revokedBy?: string | null;
};

function workflowPayload() {
  const workflow = getLiveApprovalWorkflowView();
  return {
    approval: getStrategyApprovalSummary(),
    workflow,
  };
}

function statusForCode(code: string): number {
  if (code === "ok" || code === "duplicate_pending") return 200;
  if (code === "invalid_transition") return 409;
  if (code === "not_found" || code === "unknown_target") return 404;
  if (code === "approval_denied") return 400;
  return 400;
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    if (!isSameOriginMutation(request)) return originRejectedResponse();
    const auth = requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const body = (await request.json()) as ApprovalBody;
    const actorDenied = rejectClientActorBody(body);
    if (actorDenied) return actorDenied;
    const action = body.action ?? "approve";
    const permission = permissionForApproveAction(action);
    if (!roleHasPermission(auth.user.role, permission)) return forbiddenResponse();
    const actor = sessionActorIdentity(auth.user);

    if (action === "request") {
      const result = await requestLiveApproval({
        ...body,
        requestedBy: actor,
      });
      return apiJsonResponse(
        {
          ok: result.ok,
          message: result.message,
          code: result.code,
          conflict: result.conflict,
          idempotent: result.idempotent,
          request: result.request,
          ...workflowPayload(),
          state: result.snapshot,
        },
        { source: "strategy-approve", durationMs: Date.now() - start, ok: result.ok },
        { status: statusForCode(result.code) },
      );
    }

    if (action === "reject") {
      const result = await rejectLiveApprovalRequest({
        ...body,
        reviewedBy: actor,
      });
      return apiJsonResponse(
        {
          ok: result.ok,
          message: result.message,
          code: result.code,
          conflict: result.conflict,
          idempotent: result.idempotent,
          request: result.request,
          ...workflowPayload(),
          state: result.snapshot,
        },
        { source: "strategy-approve", durationMs: Date.now() - start, ok: result.ok },
        { status: statusForCode(result.code) },
      );
    }

    if (action === "revoke") {
      if (body.requestId) {
        const result = await revokeLiveApprovalRequest({
          ...body,
          revokedBy: actor,
        });
        return apiJsonResponse(
          {
            ok: result.ok,
            message: result.message,
            code: result.code,
            conflict: result.conflict,
            idempotent: result.idempotent,
            request: result.request,
            ...workflowPayload(),
            state: result.snapshot,
          },
          { source: "strategy-approve", durationMs: Date.now() - start, ok: result.ok },
          { status: statusForCode(result.code) },
        );
      }
      const state = revokeStrategyLiveApproval(actor);
      return apiJsonResponse(
        {
          ok: true,
          message: "전략 실전 승인이 해제되었습니다.",
          approval: getStrategyApprovalSummary(),
          workflow: getLiveApprovalWorkflowView(),
          state,
        },
        { source: "strategy-approve", durationMs: Date.now() - start },
      );
    }

    if (body.requestId) {
      const result = await approveLiveApprovalRequest({
        requestId: body.requestId,
        confirmationText: body.confirmationText,
        reviewedBy: actor,
        reviewReason: body.reviewReason,
      });
      return apiJsonResponse(
        {
          ok: result.ok,
          message: result.message,
          code: result.code,
          conflict: result.conflict,
          idempotent: result.idempotent,
          request: result.request,
          ...workflowPayload(),
          state: result.snapshot,
        },
        { source: "strategy-approve", durationMs: Date.now() - start, ok: result.ok },
        { status: statusForCode(result.code) },
      );
    }

    const result = approveStrategyForLive(body.confirmationText ?? "", actor);
    return apiJsonResponse(
      {
        ok: result.ok,
        message: result.message,
        approval: getStrategyApprovalSummary(),
        workflow: getLiveApprovalWorkflowView(),
        state: result.state,
      },
      { source: "strategy-approve", durationMs: Date.now() - start },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    return apiErrorResponse(
      error instanceof Error ? error.message : "strategy approval failed",
      Date.now() - start,
    );
  }
}

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const start = Date.now();
  return apiJsonResponse(
    workflowPayload(),
    { source: "strategy-approve", durationMs: Date.now() - start },
  );
}
