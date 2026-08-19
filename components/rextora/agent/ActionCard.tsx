"use client";

import { ArrowRight, ShieldCheck, FileSearch, X } from "lucide-react";
import Link from "next/link";
import type { AgentAction } from "@/src/lib/rextora/agent/types";
import type { AgentPlanDraft } from "@/src/lib/rextora/agent/planDrafts";
import { analytics } from "./agentAnalytics";
import { sanitizePrimaryUserText } from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

interface ActionCardProps {
  action: AgentAction;
  plan?: AgentPlanDraft | null;
  compact?: boolean;
  onCancel?: () => void;
}

function targetLabelForHref(href?: string): string {
  if (!href) return "관련 화면";
  if (href.startsWith("/backtest")) return "백테스트";
  if (href.startsWith("/results")) return "탐색 결과";
  if (href.startsWith("/strategy-search")) return "전략 탐색";
  if (href.startsWith("/paper-trading")) return "모의 매매";
  if (href.startsWith("/live-trading")) return "실전 매매";
  if (href.startsWith("/dashboard")) return "대시보드";
  if (href.startsWith("/settings")) return "설정";
  return "관련 화면";
}

function openLabelForPlan(plan: AgentPlanDraft | null | undefined, href?: string): string {
  if (plan?.kind === "search_plan" || plan?.kind === "approval_draft") {
    if (plan.openRoute.includes("strategy-search") || href?.includes("strategy-search")) {
      return "전략 탐색 열기";
    }
  }
  if (plan?.kind === "backtest_plan" || href?.includes("/backtest")) {
    return "백테스트 열기";
  }
  if (plan?.kind === "paper_plan" || href?.includes("/paper-trading")) {
    return "모의매매 열기";
  }
  return `${targetLabelForHref(href)} 열기`;
}

export function ActionCard({
  action,
  plan = null,
  compact = false,
  onCancel,
}: ActionCardProps) {
  if (action.type === "none") return null;

  const handleClick = () => {
    analytics.actionCardOpened(action.type, action.href);
    if (action.href) {
      analytics.expertScreenOpened(action.href);
    }
  };

  const reviewHref = plan?.reviewRoute ?? action.href;
  const openHref = plan?.openRoute ?? action.href;
  const showApprovalTrio = Boolean(
    plan && plan.requiresApproval && reviewHref && onCancel,
  );

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3"
          : "flex flex-col gap-3 rounded-lg border border-violet-500/20 bg-violet-950/20 px-3 py-2.5"
      }
      data-testid="agent-action-card"
      data-plan-kind={plan?.kind ?? undefined}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-100">
          {sanitizePrimaryUserText(plan?.titleKo ?? action.labelKo)}
        </p>
        {(plan?.summaryKo || action.descriptionKo) && (
          <p className="mt-0.5 text-xs text-slate-400">
            {sanitizePrimaryUserText(plan?.summaryKo ?? action.descriptionKo)}
          </p>
        )}
        {plan && (
          <dl
            className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
            data-testid="agent-plan-fields"
          >
            {plan.fields.slice(0, 6).map((field) => (
              <div key={field.key} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                  {field.labelKo}
                </dt>
                <dd className="truncate text-sm text-slate-200">
                  {sanitizePrimaryUserText(field.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {action.requiresApproval && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-300/90">
            <ShieldCheck className="size-3 shrink-0" />
            <span>
              {plan?.typedCommand
                ? "승인하면 이 계획을 한 번 실행합니다"
                : "승인 전에는 실행되지 않습니다"}
            </span>
          </div>
        )}
        {!action.requiresApproval && (
          <p className="mt-1 text-xs text-slate-500">
            화면만 엽니다.
          </p>
        )}
      </div>

      {showApprovalTrio ? (
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          data-testid="agent-approval-actions"
        >
          <Link
            href={reviewHref!}
            onClick={handleClick}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            data-testid="agent-action-review"
          >
            <FileSearch className="size-3.5" />
            계획 검토
          </Link>
          <Link
            href={openHref!}
            onClick={handleClick}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-900/50"
            data-testid="agent-action-open"
          >
            {openLabelForPlan(plan, openHref)}
            <ArrowRight className="size-3.5" />
          </Link>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            data-testid="agent-action-cancel"
          >
            <X className="size-3.5" />
            취소
          </button>
        </div>
      ) : (
        action.href && (
          <Link
            href={action.href}
            onClick={handleClick}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            data-testid="agent-action-cta"
          >
            {action.labelKo.includes("열기") || action.labelKo.includes("검토")
              ? action.labelKo
              : `${targetLabelForHref(action.href)} 열기`}
            <ArrowRight className="size-3.5" />
          </Link>
        )
      )}
    </div>
  );
}
