"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { AgentAction } from "@/src/lib/rextora/agent/types";
import { analytics } from "./agentAnalytics";

interface ActionCardProps {
  action: AgentAction;
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

export function ActionCard({ action }: ActionCardProps) {
  if (action.type === "none") return null;

  const handleClick = () => {
    analytics.actionCardOpened(action.type, action.href);
    if (action.href) {
      analytics.expertScreenOpened(action.href);
    }
  };

  const targetLabel = targetLabelForHref(action.href);

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/20 bg-violet-950/20 px-3 py-2.5"
      data-testid="agent-action-card"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-violet-200">{action.labelKo}</p>
        <p className="mt-1 text-xs text-slate-400">이동 위치: {targetLabel}</p>
        {action.descriptionKo && (
          <p className="mt-0.5 text-xs text-slate-400">{action.descriptionKo}</p>
        )}
        {action.requiresApproval && (
          <div className="mt-1 flex items-center gap-1 text-xs text-amber-400/80">
            <ShieldCheck className="size-3 shrink-0" />
            <span>승인 필요</span>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">
          화면만 열립니다. 실행이나 승인은 자동으로 처리되지 않습니다.
        </p>
      </div>
      {action.href && (
        <Link
          href={action.href}
          onClick={handleClick}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-600/20 px-3 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-600/40 hover:text-white"
        >
          {targetLabel} 열기
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}
