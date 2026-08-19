"use client";

import { CheckCircle2, CircleDashed, Clock3, ShieldAlert, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { MissionTimeline as MissionTimelineModel } from "@/src/lib/rextora/agent/missionTimeline";
import { sanitizePrimaryUserText } from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

interface MissionTimelineProps {
  timeline: MissionTimelineModel;
  compact?: boolean;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  }
  if (status === "awaiting_approval" || status === "next") {
    return <Clock3 className="size-3.5 text-amber-300" />;
  }
  if (status === "blocked") {
    return <ShieldAlert className="size-3.5 text-rose-300" />;
  }
  return <CircleDashed className="size-3.5 text-slate-500" />;
}

export function MissionTimeline({ timeline, compact = false }: MissionTimelineProps) {
  const rows = [
    ...timeline.completed.slice(0, compact ? 2 : 4),
    ...timeline.pendingApprovals.slice(0, 2),
    ...(timeline.nextRecommendation ? [timeline.nextRecommendation] : []),
  ].filter(
    (item, index, arr) => arr.findIndex((x) => x.id === item.id) === index,
  );

  return (
    <div
      className="space-y-2"
      data-testid="agent-mission-timeline"
      aria-label="미션 타임라인"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">미션 타임라인</p>
        <p className="text-[11px] text-slate-500">{timeline.progressPct}%</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500/80 transition-all"
          style={{ width: `${timeline.progressPct}%` }}
          data-testid="agent-mission-progress"
        />
      </div>
      <p className="text-sm text-emerald-100/90" data-testid="agent-mission-objective">
        {sanitizePrimaryUserText(timeline.currentObjectiveKo)}
      </p>
      <ul className="space-y-1.5">
        {rows.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 text-xs text-slate-300"
            data-testid={`agent-mission-item-${item.status}`}
          >
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {sanitizePrimaryUserText(item.labelKo)}
              </p>
              {item.detailKo && !compact ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {sanitizePrimaryUserText(item.detailKo)}
                </p>
              ) : null}
            </div>
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-sky-400/90 hover:underline"
              >
                열기
                <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
