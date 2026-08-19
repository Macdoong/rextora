"use client";

import { Layers3, ShieldAlert, Compass, Target } from "lucide-react";
import type { MissionTimeline } from "@/src/lib/rextora/agent/missionTimeline";
import type { ResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import { MissionTimeline as MissionTimelineView } from "./MissionTimeline";
import { sanitizePrimaryUserText } from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

interface AgentWorkspacePanelProps {
  timeline: MissionTimeline;
  workspace: ResearchWorkspaceSummary | null;
  compact?: boolean;
}

export function AgentWorkspacePanel({
  timeline,
  workspace,
  compact = false,
}: AgentWorkspacePanelProps) {
  return (
    <aside
      className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3"
      data-testid="agent-workspace-panel"
      aria-label="AI 워크스페이스"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Layers3 className="size-3.5 text-emerald-400" />
        AI 워크스페이스
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <Target className="size-3" />
            현재 미션
          </p>
          <p className="mt-1 text-sm text-slate-100" data-testid="agent-workspace-mission">
            {sanitizePrimaryUserText(timeline.currentObjectiveKo)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <Compass className="size-3" />
            라이프사이클
          </p>
          <p className="mt-1 text-sm text-slate-100" data-testid="agent-workspace-lifecycle">
            {sanitizePrimaryUserText(timeline.lifecycleLabelKo)}
            {workspace
              ? ` · ${sanitizePrimaryUserText(workspace.jobsKo)}`
              : ""}
          </p>
        </div>
      </div>

      <MissionTimelineView timeline={timeline} compact={compact} />

      <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 p-2.5">
        <p className="flex items-center gap-1 text-[11px] text-amber-200/80">
          <ShieldAlert className="size-3" />
          차단 · 대기
        </p>
        <ul className="mt-1 space-y-1 text-xs text-slate-300" data-testid="agent-workspace-blockers">
          {timeline.blockersKo.slice(0, 3).map((b) => (
            <li key={b}>{sanitizePrimaryUserText(b)}</li>
          ))}
        </ul>
        {timeline.nextRecommendation ? (
          <p
            className="mt-2 text-sm font-medium text-emerald-100"
            data-testid="agent-workspace-next-action"
          >
            다음 행동 ·{" "}
            {sanitizePrimaryUserText(timeline.nextRecommendation.labelKo)}
          </p>
        ) : null}
      </div>

      {(timeline.whyRecommendedKo ||
        timeline.whyRejectedKo ||
        timeline.whyWaitingKo) && (
        <div
          className="space-y-1.5 rounded-lg bg-slate-900/50 p-2.5 text-xs text-slate-400"
          data-testid="agent-workspace-explainability"
        >
          {timeline.whyRecommendedKo ? (
            <p>
              <span className="text-slate-500">왜 추천 · </span>
              {sanitizePrimaryUserText(timeline.whyRecommendedKo)}
            </p>
          ) : null}
          {timeline.whyRejectedKo ? (
            <p>
              <span className="text-slate-500">왜 거부 · </span>
              {sanitizePrimaryUserText(timeline.whyRejectedKo)}
            </p>
          ) : null}
          {timeline.whyWaitingKo ? (
            <p>
              <span className="text-slate-500">왜 대기 · </span>
              {sanitizePrimaryUserText(timeline.whyWaitingKo)}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
