"use client";

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, RotateCcw, Play, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  useAgentSession,
  type UseAgentSessionResult,
} from "./useAgentSession";
import { useSharedAgentSession } from "./AgentSessionProvider";
import { AgentInput } from "./AgentInput";
import { AgentSuggestions } from "./AgentSuggestions";
import { AgentMessage } from "./AgentMessage";
import { AgentWorkspacePanel } from "./AgentWorkspacePanel";
import { ApprovalCenter } from "./ApprovalCenter";
import { AgentModelSelector } from "./AgentModelSelector";

interface AgentPanelProps {
  variant?: "embedded" | "drawer";
  shared?: boolean;
}

export function AgentPanel({
  variant = "embedded",
  shared = false,
}: AgentPanelProps) {
  if (shared) return <AgentPanelShared variant={variant} />;
  return <AgentPanelLocal variant={variant} />;
}

function AgentPanelShared({
  variant,
}: {
  variant: "embedded" | "drawer";
}) {
  const session = useSharedAgentSession();
  return <AgentPanelInner variant={variant} session={session} />;
}

function AgentPanelLocal({
  variant,
}: {
  variant: "embedded" | "drawer";
}) {
  const session = useAgentSession();
  return <AgentPanelInner variant={variant} session={session} />;
}

function AgentPanelInner({
  variant,
  session,
}: {
  variant: "embedded" | "drawer";
  session: UseAgentSessionResult;
}) {
  const {
    turns,
    isThinking,
    sessionHydrated,
    sendQuery,
    stopResponse,
    clearSession,
    cancelPendingPlan,
    resumeWhereLeftOff,
    pinnedObjective,
    workspace,
    pendingProposedAction,
    missionTimeline,
    canResume,
    entityMemory,
    providerSelection,
    setProviderSelection,
  } = session;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, isThinking]);

  const isEmpty = turns.length === 0;
  const isDrawer = variant === "drawer";
  const hasPendingApproval = Boolean(
    pendingProposedAction || entityMemory?.pendingPlan,
  );
  // Drawer: show only the latest turn for scanability; full history on expand.
  const visibleTurns = isDrawer && !detailsOpen ? turns.slice(-1) : turns;

  return (
    <section
      className={
        isDrawer
          ? "flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950"
          : "flex w-full flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/90 shadow-xl"
      }
      data-testid="dashboard-agent-workspace"
      data-agent-session-hydrated={sessionHydrated ? "true" : "false"}
      aria-label="AI 트레이딩 직원"
    >
      {!isDrawer ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 ring-1 ring-emerald-500/30">
              <BrainCircuit className="size-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-100">
                AI 트레이딩 직원
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <Badge tone="success">승인 후 실행</Badge>
                <AgentModelSelector
                  value={providerSelection}
                  onChange={setProviderSelection}
                  disabled={isThinking}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canResume && !isEmpty ? (
              <button
                type="button"
                onClick={() => void resumeWhereLeftOff()}
                disabled={isThinking}
                data-testid="agent-resume-session"
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-emerald-500/35 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-900/40 disabled:opacity-40"
              >
                <Play className="size-4" />
                <span className="hidden sm:inline">이어서</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearSession}
              disabled={isEmpty && !isThinking}
              aria-label="새 대화"
              data-testid="agent-new-conversation"
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">새 대화</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Compact approval — primary when pending */}
      <div
        className="space-y-2 border-b border-slate-800/50 px-3 py-2"
        data-testid="agent-session-chrome"
      >
        {isDrawer ? (
          <AgentModelSelector
            value={providerSelection}
            onChange={setProviderSelection}
            disabled={isThinking}
          />
        ) : null}
        {pinnedObjective ? (
          <p
            className="truncate text-xs text-emerald-100/80"
            data-testid="agent-pinned-objective"
          >
            {pinnedObjective}
          </p>
        ) : null}
        <ApprovalCenter
          pendingAction={pendingProposedAction}
          pendingPlan={entityMemory?.pendingPlan ?? null}
          timeline={missionTimeline}
          onCancel={cancelPendingPlan}
          onExplain={() => void sendQuery("왜 기다리는 거야?")}
          onApprove={() => void sendQuery("진행해")}
        />
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex min-h-9 w-full items-center justify-between rounded-lg border border-slate-800 px-2.5 py-1.5 text-left text-[11px] text-slate-400 hover:text-slate-200"
          data-testid="agent-details-toggle"
          aria-expanded={detailsOpen}
        >
          <span>워크스페이스 · 타임라인 · 이전 대화</span>
          <ChevronDown
            className={`size-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
          />
        </button>
        {detailsOpen ? (
          <div className="max-h-48 space-y-2 overflow-y-auto" data-testid="agent-details-panel">
            <AgentWorkspacePanel
              timeline={missionTimeline}
              workspace={workspace}
              compact
            />
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className={
          isDrawer
            ? "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2"
            : "flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5"
        }
        style={
          isDrawer
            ? undefined
            : { minHeight: "14rem", maxHeight: "min(48vh, 28rem)" }
        }
        aria-live="polite"
        aria-label="에이전트 대화"
        data-testid="agent-conversation-scroll"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-5 text-center">
            <p className="text-sm font-medium text-slate-200">
              {canResume
                ? "멈춘 지점에서 이어서 진행할까요?"
                : "오늘 무엇을 하면 좋을까요?"}
            </p>
            {canResume ? (
              <button
                type="button"
                onClick={() => void resumeWhereLeftOff()}
                disabled={isThinking}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                data-testid="agent-continue-cta"
              >
                <Play className="size-4" />
                이어서 진행
              </button>
            ) : (
              <AgentSuggestions onSelect={sendQuery} disabled={isThinking} />
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {visibleTurns.map((turn) => (
              <AgentMessage
                key={turn.id}
                query={turn.query}
                response={turn.response}
                error={turn.error}
                isLoading={turn.isLoading}
                timestamp={turn.timestamp}
                onRetry={() => sendQuery(turn.query)}
                onFollowUp={sendQuery}
                onCancelPlan={cancelPendingPlan}
                hideApprovalActions={hasPendingApproval}
              />
            ))}
            {isDrawer && turns.length > 1 && !detailsOpen ? (
              <button
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={() => setDetailsOpen(true)}
              >
                이전 대화 {turns.length - 1}개 보기
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-slate-800/70 px-3 py-2.5 sm:px-4">
        <AgentInput
          onSend={sendQuery}
          onStop={stopResponse}
          disabled={isThinking}
          disabledReason={
            isThinking
              ? "저장된 데이터를 확인해 답변을 준비하고 있습니다."
              : undefined
          }
        />
      </div>
    </section>
  );
}
