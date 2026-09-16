"use client";

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, RotateCcw, Play, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  useAgentSession,
  type UseAgentSessionResult,
} from "./useAgentSession";
import { useSharedAgentSession } from "./AgentSessionProvider";
import { useGlobalAgentPresentation } from "./GlobalAgentPresentationContext";
import { AgentInput } from "./AgentInput";
import { AgentSuggestions } from "./AgentSuggestions";
import { AgentMessage } from "./AgentMessage";
import { AgentWorkspacePanel } from "./AgentWorkspacePanel";
import { ApprovalCenter } from "./ApprovalCenter";
import { AgentModelSelector } from "./AgentModelSelector";

export type AgentPanelVariant =
  | "embedded"
  | "workspace"
  | "drawer"
  | "mobile-sheet";

interface AgentPanelProps {
  variant?: AgentPanelVariant;
  shared?: boolean;
}

export function AgentPanel({
  variant = "embedded",
  shared = false,
}: AgentPanelProps) {
  if (shared) return <AgentPanelShared variant={variant} />;
  return <AgentPanelLocal variant={variant} />;
}

function AgentPanelShared({ variant }: { variant: AgentPanelVariant }) {
  const session = useSharedAgentSession();
  return <AgentPanelInner variant={variant} session={session} />;
}

function AgentPanelLocal({ variant }: { variant: AgentPanelVariant }) {
  const session = useAgentSession();
  return <AgentPanelInner variant={variant} session={session} />;
}

function isCompactVariant(variant: AgentPanelVariant): boolean {
  return variant === "drawer" || variant === "mobile-sheet";
}

function isExpandedVariant(variant: AgentPanelVariant): boolean {
  return variant === "embedded" || variant === "workspace";
}

function AgentPanelInner({
  variant,
  session,
}: {
  variant: AgentPanelVariant;
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
  const { open: globalAgentOpen } = useGlobalAgentPresentation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const suppressEmbeddedForGlobal =
    variant === "embedded" && globalAgentOpen;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, isThinking]);

  const isEmpty = turns.length === 0;
  const compactChrome = isCompactVariant(variant);
  const expandedChrome = isExpandedVariant(variant);
  const isCompactHistory = variant === "drawer" || variant === "mobile-sheet";
  const hasPendingApproval = Boolean(
    pendingProposedAction || entityMemory?.pendingPlan,
  );
  const visibleTurns =
    isCompactHistory && !detailsOpen ? turns.slice(-1) : turns;

  return (
    <section
      className={`rextora-agent-panel rextora-agent-panel--${variant}${
        suppressEmbeddedForGlobal
          ? " rextora-agent-panel--global-open-suppressed"
          : ""
      }`}
      data-testid="dashboard-agent-workspace"
      data-agent-variant={variant}
      data-agent-session-hydrated={sessionHydrated ? "true" : "false"}
      data-global-agent-open={globalAgentOpen ? "true" : "false"}
      aria-hidden={suppressEmbeddedForGlobal ? true : undefined}
      aria-label="AI 트레이딩 직원"
    >
      {expandedChrome ? (
        <div className="rextora-agent-panel-header">
          <div className="rextora-agent-panel-header-main">
            <div className="rextora-agent-panel-mark">
              <BrainCircuit className="size-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="rextora-agent-panel-title">AI 트레이딩 직원</div>
              <div className="rextora-agent-panel-header-meta">
                <Badge tone="success">승인 후 실행</Badge>
                <AgentModelSelector
                  value={providerSelection}
                  onChange={setProviderSelection}
                  disabled={isThinking}
                />
              </div>
            </div>
          </div>
          <div className="rextora-agent-panel-header-actions">
            {canResume && !isEmpty ? (
              <button
                type="button"
                onClick={() => void resumeWhereLeftOff()}
                disabled={isThinking}
                data-testid="agent-resume-session"
                className="rextora-agent-panel-action"
              >
                <Play className="size-4" aria-hidden="true" />
                <span className="rextora-agent-panel-action-label">이어서</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearSession}
              disabled={isEmpty && !isThinking}
              aria-label="새 대화"
              data-testid="agent-new-conversation"
              className="rextora-agent-panel-action"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span className="rextora-agent-panel-action-label">새 대화</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="rextora-agent-panel-chrome" data-testid="agent-session-chrome">
        {compactChrome ? (
          <AgentModelSelector
            value={providerSelection}
            onChange={setProviderSelection}
            disabled={isThinking}
          />
        ) : null}
        {pinnedObjective ? (
          <p className="rextora-agent-pinned-objective" data-testid="agent-pinned-objective">
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
          className="rextora-agent-details-toggle"
          data-testid="agent-details-toggle"
          aria-expanded={detailsOpen}
        >
          <span>워크스페이스 · 타임라인 · 이전 대화</span>
          <ChevronDown
            className={`rextora-agent-details-chevron ${detailsOpen ? "is-open" : ""}`}
            aria-hidden="true"
          />
        </button>
        {detailsOpen ? (
          <div className="rextora-agent-details-panel" data-testid="agent-details-panel">
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
        className="rextora-agent-conversation"
        aria-live="polite"
        aria-label="에이전트 대화"
        data-testid="agent-conversation-scroll"
      >
        {isEmpty ? (
          <div className="rextora-agent-empty">
            <p className="rextora-agent-empty-title">
              {canResume
                ? "멈춘 지점에서 이어서 진행할까요?"
                : "오늘 무엇을 하면 좋을까요?"}
            </p>
            {canResume ? (
              <button
                type="button"
                onClick={() => void resumeWhereLeftOff()}
                disabled={isThinking}
                className="rextora-agent-continue-cta"
                data-testid="agent-continue-cta"
              >
                <Play className="size-4" aria-hidden="true" />
                이어서 진행
              </button>
            ) : (
              <AgentSuggestions onSelect={sendQuery} disabled={isThinking} />
            )}
          </div>
        ) : (
          <div className="rextora-agent-conversation-inner">
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
            {isCompactHistory && turns.length > 1 && !detailsOpen ? (
              <button
                type="button"
                className="rextora-agent-history-link"
                onClick={() => setDetailsOpen(true)}
              >
                이전 대화 {turns.length - 1}개 보기
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="rextora-agent-composer">
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
