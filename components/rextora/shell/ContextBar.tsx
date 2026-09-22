"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/primitives";
import { useSharedAgentSession } from "@/components/rextora/agent/AgentSessionProvider";
import {
  resolveRouteLifecycle,
  type ShellLifecycleStage,
} from "./routeLifecycle";
import { useOperatorPageContext } from "./OperatorPageContext";
import { shellPageLocationLabel } from "./navigationModel";
import { paperOperatorShellContext } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import { backtestOperatorShellContext } from "@/src/lib/rextora/backtest/backtestOperatorPresentation";
import { liveGateOperatorShellContext } from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import {
  OPERATOR_LABEL,
  OPERATOR_STAGE,
  OPERATOR_STATUS,
} from "@/src/lib/rextora/ui/operatorTerminology";

const SHELL_STAGE_LABEL: Record<ShellLifecycleStage, string> = {
  HOME: OPERATOR_STAGE.HOME,
  RESEARCH: OPERATOR_STAGE.RESEARCH,
  STRATEGY: OPERATOR_STAGE.STRATEGY,
  BACKTEST: OPERATOR_STAGE.BACKTEST,
  PAPER: OPERATOR_STAGE.PAPER,
  LIVE_GATE: OPERATOR_STAGE.LIVE_GATE,
  SETTINGS: OPERATOR_STAGE.SETTINGS,
};

const UNAVAILABLE = OPERATOR_STATUS.unavailable;

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : UNAVAILABLE;
}

function resolveTradingModeLabel(
  shellStage: ShellLifecycleStage | null,
): string | null {
  if (shellStage === "PAPER") return OPERATOR_STAGE.PAPER;
  if (shellStage === "LIVE_GATE") return OPERATOR_STAGE.LIVE_GATE;
  return null;
}

function resolveRiskStatusLabel(
  sessionHydrated: boolean,
  workspaceRiskKo: string | undefined,
  hasPendingApproval: boolean,
  pageReadiness: string | null,
): string | null {
  if (pageReadiness?.trim()) return pageReadiness.trim();
  if (
    sessionHydrated &&
    workspaceRiskKo &&
    workspaceRiskKo !== "검증된 리스크 요약 없음"
  ) {
    return workspaceRiskKo;
  }
  if (hasPendingApproval) return OPERATOR_STATUS.approvalPending;
  return null;
}

function resolveAgentStatusLabel(session: {
  sessionHydrated: boolean;
  isThinking: boolean;
  pendingProposedAction: unknown;
  canResume: boolean;
}): string {
  if (!session.sessionHydrated) return OPERATOR_STATUS.hydrating;
  if (session.isThinking) return OPERATOR_STATUS.thinking;
  if (session.pendingProposedAction) return OPERATOR_STATUS.approvalPending;
  if (session.canResume) return OPERATOR_STATUS.resumeAvailable;
  return OPERATOR_STATUS.ready;
}

function ContextField({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  const unavailable = value === UNAVAILABLE;

  return (
    <div className="rextora-context-field" data-testid={testId}>
      <p className="rextora-context-field-label">{label}</p>
      <p
        className={`rextora-context-field-value ${
          unavailable ? "is-unavailable" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Shell context strip — reads route lifecycle mapping and shared Agent session only.
 * Presentation layer; no fetching, storage reads, or lifecycle inference.
 */
export function ContextBar() {
  const pathname = usePathname() ?? "";
  const routeLifecycle = resolveRouteLifecycle(pathname);
  const session = useSharedAgentSession();
  const memory = session.entityMemory;
  const pageContext = useOperatorPageContext();
  const paperPageContext =
    pageContext?.source === "paper" ? pageContext : null;
  const backtestPageContext =
    pageContext?.source === "backtest" ? pageContext : null;
  const liveGatePageContext =
    pageContext?.source === "live_gate" ? pageContext : null;

  const shellStage = routeLifecycle?.stage ?? null;
  const shellStageLabel = shellStage
    ? SHELL_STAGE_LABEL[shellStage]
    : OPERATOR_STAGE.UNMAPPED;
  const pageLocationLabel =
    shellPageLocationLabel(pathname) ?? shellStageLabel;

  const backtestResolved = backtestOperatorShellContext({
    routeIsBacktest: shellStage === "BACKTEST",
    backtestContext: backtestPageContext,
  });
  const liveGateResolved = liveGateOperatorShellContext({
    routeIsLiveGate: shellStage === "LIVE_GATE",
    liveGateContext: liveGatePageContext,
  });
  const paperResolved = paperOperatorShellContext({
    routeIsPaper: shellStage === "PAPER",
    paperContext: paperPageContext,
    agentStrategyId: session.sessionHydrated ? memory?.strategyId : null,
    agentStrategyLabel: session.sessionHydrated ? memory?.strategyLabel : null,
    agentJobId: session.sessionHydrated ? memory?.jobId : null,
    agentPaperSessionId: session.sessionHydrated
      ? memory?.paperSessionId
      : null,
    agentSymbol: session.sessionHydrated ? memory?.symbol : null,
    agentTimeframe: session.sessionHydrated ? memory?.timeframe : null,
  });

  const pageOwnsContext =
    paperResolved.usedPaperPageContext ||
    backtestResolved.usedBacktestPageContext ||
    liveGateResolved.usedLiveGatePageContext;

  const strategy = liveGateResolved.usedLiveGatePageContext
    ? liveGateResolved.strategy
    : backtestResolved.usedBacktestPageContext
      ? backtestResolved.strategy
      : paperResolved.strategy;
  const symbolTimeframe = liveGateResolved.usedLiveGatePageContext
    ? liveGateResolved.symbolTimeframe
    : backtestResolved.usedBacktestPageContext
      ? backtestResolved.symbolTimeframe
      : paperResolved.symbolTimeframe;
  const researchJobId = liveGateResolved.usedLiveGatePageContext
    ? liveGateResolved.researchJobId
    : backtestResolved.usedBacktestPageContext
      ? backtestResolved.researchJobId
      : paperResolved.researchJobId;
  const runId = liveGateResolved.usedLiveGatePageContext
    ? liveGateResolved.runId
    : backtestResolved.usedBacktestPageContext
      ? backtestResolved.runId
      : paperResolved.usedPaperPageContext
        ? null
        : session.sessionHydrated
          ? memory?.runId?.trim() || null
          : null;
  const paperSessionDisplay = liveGateResolved.usedLiveGatePageContext
    ? liveGateResolved.paperSessionLabel
    : backtestResolved.usedBacktestPageContext
      ? backtestResolved.paperSessionLabel
      : paperResolved.paperSessionLabel;

  const primaryStrategy = pageOwnsContext ? strategy : null;
  const primarySymbolTimeframe = pageOwnsContext ? symbolTimeframe : null;

  const tradingModeLabel = resolveTradingModeLabel(shellStage);
  const agentStatusLabel = resolveAgentStatusLabel(session);
  const pageReadiness =
    liveGatePageContext?.readinessLabel ??
    (pageContext && "readinessLabel" in pageContext
      ? (pageContext as { readinessLabel?: string | null }).readinessLabel ??
        null
      : null);
  const riskStatusLabel = resolveRiskStatusLabel(
    session.sessionHydrated,
    session.workspace?.riskKo,
    Boolean(session.pendingProposedAction),
    pageReadiness ?? null,
  );

  const agentSessionValue = session.sessionHydrated
    ? session.pinnedObjective?.trim() ||
      `${session.turns.length}턴`
    : OPERATOR_STATUS.hydrating;

  const strategyChipLabel = primaryStrategy?.trim()
    ? primaryStrategy
    : OPERATOR_STATUS.noStrategy;
  const mobileContextSummary = [
    shellStageLabel,
    strategyChipLabel,
    primarySymbolTimeframe?.trim() || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const showResume =
    session.sessionHydrated && session.canResume && !session.isThinking;

  return (
    <div className="rextora-context-bar v3-shell-topbar" data-testid="shell-context-bar">
      <p className="rextora-context-mobile-summary">{mobileContextSummary}</p>

      <div className="v3-shell-topbar-row">
        <div className="v3-shell-breadcrumb" data-testid="shell-context-breadcrumb">
          <span>Rextora / </span>
          <strong>{pageLocationLabel}</strong>
        </div>

      <div className="rextora-context-primary v3-shell-top-actions" aria-label={OPERATOR_LABEL.currentWork}>
        <div className="rextora-context-primary-item rextora-context-stage-item v3-shell-chip">
          <span className="rextora-context-primary-label">
            {OPERATOR_LABEL.currentStage}
          </span>
          <Badge tone="info" data-testid="shell-context-stage">
            {shellStageLabel}
          </Badge>
        </div>

        <div className="rextora-context-primary-item v3-shell-chip">
          <span className="rextora-context-primary-label">
            {OPERATOR_LABEL.selectedStrategy}
          </span>
          <span
            className="rextora-context-primary-value"
            data-testid="shell-context-strategy-primary"
          >
            {strategyChipLabel}
          </span>
        </div>

        {primarySymbolTimeframe?.trim() ? (
          <div className="rextora-context-primary-item v3-shell-chip">
            <span className="rextora-context-primary-label">
              {OPERATOR_LABEL.symbolTimeframe}
            </span>
            <span className="rextora-context-primary-value">
              {primarySymbolTimeframe}
            </span>
          </div>
        ) : null}

        {tradingModeLabel && tradingModeLabel !== shellStageLabel ? (
          <div
            className="rextora-context-primary-item rextora-context-trading-mode v3-shell-chip"
            data-testid="shell-context-trading-mode"
          >
            <span className="rextora-context-primary-label">
              {OPERATOR_LABEL.currentMode}
            </span>
            <span className="rextora-context-primary-value">
              {tradingModeLabel}
            </span>
          </div>
        ) : null}

        {shellStage === "LIVE_GATE" && pageReadiness?.trim() ? (
          <div
            className="rextora-context-primary-item rextora-context-live v3-shell-chip"
            data-testid="shell-context-live-status"
          >
            <span className="rextora-context-primary-label">
              {OPERATOR_LABEL.liveState}
            </span>
            <span className="rextora-context-primary-value">
              {pageReadiness.trim()}
            </span>
          </div>
        ) : null}

        {riskStatusLabel ? (
          <div
            className="rextora-context-primary-item rextora-context-risk v3-shell-chip"
            data-testid="shell-context-risk-status"
          >
            <span className="rextora-context-primary-label">
              {OPERATOR_LABEL.riskState}
            </span>
            <span className="rextora-context-primary-value rextora-context-risk-value">
              {riskStatusLabel}
            </span>
          </div>
        ) : null}

        <div className="rextora-context-primary-item rextora-context-agent-status v3-shell-chip">
          <span className="rextora-context-primary-label">
            {OPERATOR_LABEL.aiState}
          </span>
          <div className="rextora-context-status-group">
            <span
              className="rextora-context-primary-value"
              data-testid="shell-context-agent-status-label"
            >
              {agentStatusLabel === OPERATOR_STATUS.resumeAvailable
                ? OPERATOR_STATUS.ready
                : agentStatusLabel}
            </span>
            {session.sessionHydrated && session.isThinking ? (
              <Badge tone="warning" data-testid="shell-context-agent-thinking">
                {OPERATOR_STATUS.thinking}
              </Badge>
            ) : null}
            {session.sessionHydrated && session.pendingProposedAction ? (
              <Badge tone="warning" data-testid="shell-context-agent-pending">
                {OPERATOR_STATUS.approvalPending}
              </Badge>
            ) : null}
            {showResume ? (
              <span
                className="rextora-context-resume-quiet"
                data-testid="shell-context-agent-resume"
              >
                {OPERATOR_STATUS.resumeAvailable}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <details className="rextora-context-tech v3-shell-tech">
        <summary>{OPERATOR_LABEL.technicalDetail}</summary>
        <div className="rextora-context-tech-grid" aria-label={OPERATOR_LABEL.selectedWork}>
          <ContextField
            label={OPERATOR_LABEL.selectedStrategy}
            value={displayValue(strategy)}
            testId="shell-context-strategy"
          />
          <ContextField
            label={OPERATOR_LABEL.researchJob}
            value={displayValue(researchJobId)}
            testId="shell-context-job"
          />
          <ContextField
            label={OPERATOR_LABEL.run}
            value={displayValue(runId)}
            testId="shell-context-run"
          />
          <ContextField
            label={
              paperResolved.usedPaperPageContext
                ? OPERATOR_LABEL.paperSession
                : OPERATOR_LABEL.agentPaperSession
            }
            value={paperSessionDisplay}
            testId="shell-context-paper-session"
          />
          <ContextField
            label={OPERATOR_LABEL.symbolTimeframe}
            value={displayValue(symbolTimeframe)}
            testId="shell-context-symbol-timeframe"
          />
          <ContextField
            label={OPERATOR_LABEL.agentSession}
            value={agentSessionValue}
            testId="shell-context-agent-session"
          />
          <div className="rextora-context-route-meta">
            <p className="rextora-context-field-label">{OPERATOR_LABEL.route}</p>
            <p
              className="rextora-context-route-path"
              data-testid="shell-context-pathname"
            >
              {pathname || "/"}
            </p>
            {routeLifecycle ? (
              <p
                className="rextora-context-route-pattern"
                data-testid="shell-context-route-pattern"
              >
                {OPERATOR_LABEL.pattern} {routeLifecycle.pattern}
              </p>
            ) : null}
          </div>
        </div>
      </details>
      </div>
    </div>
  );
}
