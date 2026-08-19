"use client";

import Link from "next/link";
import { ShieldCheck, X, ArrowRight, FileSearch, Play } from "lucide-react";
import type { ProposedAction } from "@/src/lib/rextora/agent/proposedAction";
import type { AgentPlanDraft } from "@/src/lib/rextora/agent/planDrafts";
import type { MissionTimeline } from "@/src/lib/rextora/agent/missionTimeline";
import { sanitizePrimaryUserText } from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

interface ApprovalCenterProps {
  pendingAction: ProposedAction | null;
  pendingPlan?: AgentPlanDraft | null;
  timeline: MissionTimeline;
  onCancel?: () => void;
  onExplain?: () => void;
  /** Explicit approve → typed command execution via chat approve_pending. */
  onApprove?: () => void;
}

/**
 * Compact Approval Center — one primary pending action.
 * Executable typed commands and validated V2 tool plans expose one approval.
 * Navigation-only proposals keep review/open/cancel actions.
 */
export function ApprovalCenter({
  pendingAction,
  pendingPlan = null,
  timeline: _timeline,
  onCancel,
  onExplain,
  onApprove,
}: ApprovalCenterProps) {
  const title =
    pendingAction?.summary ??
    pendingPlan?.titleKo ??
    null;
  const hasTypedCommand = Boolean(pendingPlan?.typedCommand);
  const hasToolPlan = Boolean(
    pendingAction?.requiresApproval &&
      Array.isArray(pendingAction.parameters?.toolPlan) &&
      pendingAction.parameters.toolPlan.some(
        (step) =>
          step &&
          typeof step === "object" &&
          "requiresApproval" in step &&
          step.requiresApproval === true,
      ),
  );
  const hasExecutableApproval = hasTypedCommand || hasToolPlan;

  // Timeline recommendations must not open Approval Center without a live pending
  // action/plan — otherwise status reads resurrect stale awaiting_approval rows.
  if (!pendingAction && !pendingPlan) {
    return (
      <div
        className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2.5 text-xs text-slate-500"
        data-testid="agent-approval-center-empty"
      >
        대기 중인 승인 없음
      </div>
    );
  }

  if (!title) {
    return (
      <div
        className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2.5 text-xs text-slate-500"
        data-testid="agent-approval-center-empty"
      >
        대기 중인 승인 없음
      </div>
    );
  }

  const reviewHref =
    pendingPlan?.reviewRoute ??
    pendingAction?.targetRoute ??
    undefined;
  const openHref =
    pendingPlan?.openRoute ??
    pendingAction?.targetRoute ??
    undefined;

  return (
    <section
      className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/15 px-3 py-3"
      data-testid="agent-approval-center"
      aria-label="통합 승인 센터"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-100">
            <ShieldCheck className="size-3.5" />
            승인 센터
          </p>
          <p className="mt-1 text-sm text-slate-100" data-testid="agent-approval-title">
            {sanitizePrimaryUserText(title)}
          </p>
          <p className="mt-1 text-[11px] text-amber-100/70" data-testid="agent-approval-policy">
            {hasExecutableApproval
              ? "승인하면 표시된 계획을 한 번 실행합니다."
              : "승인하면 관련 화면을 엽니다."}
          </p>
        </div>
        {onExplain ? (
          <button
            type="button"
            onClick={onExplain}
            className="shrink-0 rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/30"
            data-testid="agent-approval-explain"
          >
            왜 대기?
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {hasExecutableApproval && onApprove ? (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            data-testid="agent-approval-approve"
          >
            <Play className="size-3.5" />
            승인하고 실행
          </button>
        ) : null}
        {reviewHref ? (
          <Link
            href={reviewHref}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
              hasExecutableApproval
                ? "border border-emerald-500/40 text-emerald-100 hover:bg-emerald-900/40"
                : "bg-emerald-600/90 text-white hover:bg-emerald-500"
            }`}
            data-testid="agent-approval-review"
          >
            <FileSearch className="size-3.5" />
            계획 검토
          </Link>
        ) : null}
        {openHref ? (
          <Link
            href={openHref}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            data-testid="agent-approval-open"
          >
            화면 열기
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            data-testid="agent-approval-cancel"
          >
            <X className="size-3.5" />
            취소
          </button>
        ) : null}
      </div>
    </section>
  );
}
