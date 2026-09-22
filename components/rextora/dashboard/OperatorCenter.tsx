"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import { authRoleLabelKo } from "@/src/lib/rextora/auth/authPresentation";
import {
  LIVE_DISABLED_LABEL,
  LIVE_ORDERS_BLOCKED_LABEL,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import {
  buildOperatorActionQueue,
  groupOperatorActions,
  operatorActionQueueEmptyCopy,
} from "@/src/lib/rextora/ui/operatorActionQueue";
import { buildOperatorPipeline } from "@/src/lib/rextora/ui/operatorPipeline";
import {
  OPERATOR_EMPTY,
  OPERATOR_LABEL,
  OPERATOR_STATUS,
} from "@/src/lib/rextora/ui/operatorTerminology";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { V3Kpi } from "@/components/rextora/v3/V3Kpi";
import { V3PermissionGate } from "@/components/rextora/v3/V3PermissionGate";
import { requestOpenAssistant } from "@/components/rextora/agent/agentPersistence";
import { useOperatorPageContext } from "@/components/rextora/shell/OperatorPageContext";
import {
  paperSessionVisualState,
  resolveExplicitCurrentStrategy,
} from "@/src/lib/rextora/ui/operatorCurrentStrategy";
import {
  formatTodayTradingCostLine,
  hasOperatorSearchResult,
  hasRelevantPaperSession,
  normalizeOperatorQueueCopy,
  resolveOperatorRiskGaugeTone,
  shouldShowOperatorPrimaryAction,
} from "@/src/lib/rextora/ui/operatorCenterPresentation";
import { DashboardActionLink } from "./DashboardActionLink";
import { DashboardPrimaryAction } from "./DashboardPrimaryAction";
import {
  RESEARCH_RECOVERY_HREF,
  dashboardAttentionHiddenCopy,
  dashboardRecoveryViewAllLabel,
  dashboardResearchLifecycleHref,
  dashboardResearchLifecycleLabel,
} from "./dashboardResearchSelection";
import {
  formatDisplayPrice,
  formatLeverageMultiple,
} from "@/src/lib/rextora/displayFormat";
import { formatUsdt, type DashPosition, type DashStatus } from "./dashboardData";
import { useDashboardData } from "./dashboardData";
import {
  CandidateAvailability,
  CountSegments,
  FreshnessPulse,
  LimitGauge,
  OccupancyIndicator,
  PaperStateFlow,
  QueueIndicator,
  ScalarSignedBar,
  StatusDot,
  SystemNodes,
  WinRateRing,
  resolveSystemNodeTone,
} from "./OperatorCenterVisuals";

function SafetyStrip({
  error,
  initialLoading,
  status,
  roleLabel,
  readOnly,
  positionsLabel,
  pnlLabel,
}: {
  error: string | null;
  initialLoading: boolean;
  status: DashStatus | null;
  roleLabel: string;
  readOnly: boolean;
  positionsLabel: string;
  pnlLabel: string;
}) {
  const liveAllowed = Boolean(status?.liveAllowed);
  const modeLabel = status?.modeLabel?.trim() || OPERATOR_STATUS.paperMode;
  const systemLabel = status?.emergencyActive
    ? OPERATOR_STATUS.emergency
    : error
      ? "상태 확인 실패"
      : initialLoading
        ? OPERATOR_STATUS.loading
        : OPERATOR_STATUS.operatingNormal;
  const riskLabel = status?.emergencyActive
    ? OPERATOR_STATUS.emergency
    : OPERATOR_STATUS.operatingNormal;
  const displayMode =
    modeLabel === "모의 거래" ? OPERATOR_STATUS.paperMode : modeLabel;
  const approvalShort = status?.canStartLive
    ? OPERATOR_STATUS.completed
    : OPERATOR_STATUS.waiting;
  const liveShort = liveAllowed ? OPERATOR_STATUS.liveReady : OPERATOR_STATUS.blocked;

  return (
    <section
      className="op-safety v3-oc-hero"
      data-testid="dashboard-operational-panel"
      aria-label="운영 및 안전 상태"
    >
      <div className="v3-oc-hero-main">
        <p className="v3-oc-hero-kicker">
          현재 운영 상태 · {roleLabel}
          {readOnly ? " · 조회 전용" : ""}
        </p>
        <h2 className="v3-oc-hero-title">{displayMode}</h2>
        <div className="v3-oc-pills" data-testid="operator-status-pills">
          <span className="v3-oc-pill">{systemLabel}</span>
          <span className={`v3-oc-pill${liveAllowed && status?.canStartLive ? " is-ok" : " is-bad"}`}>
            {status?.canStartLive ? OPERATOR_STATUS.liveReady : OPERATOR_STATUS.blocked}
          </span>
          <span className="v3-oc-pill">
            {status?.lastUpdatedAt
              ? `갱신 ${new Date(status.lastUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
              : "갱신 대기"}
          </span>
        </div>
        <p
          className="op-safety-banner v3-oc-hero-copy"
          data-testid="dashboard-operational-status"
          data-status={error ? "error" : initialLoading ? "loading" : "info"}
        >
          {error
            ? OPERATOR_EMPTY.loadError
            : initialLoading
              ? OPERATOR_EMPTY.loading
              : `${systemLabel} · ${LIVE_ORDERS_BLOCKED_LABEL} · ${approvalShort}`}
        </p>
        <div className="v3-oc-hero-facts v3-oc-sr">
          <div className="op-safety-item" data-testid="operator-mode">
            <span className="op-kicker">{OPERATOR_LABEL.currentMode}</span>
            <strong>{displayMode}</strong>
          </div>
          <div className="op-safety-item" data-testid="operator-system-state">
            <span className="op-kicker">{OPERATOR_LABEL.systemState}</span>
            <strong>{systemLabel}</strong>
          </div>
          <div className="op-safety-item" data-testid="operator-role-mode">
            <span className="op-kicker">권한</span>
            <strong>{roleLabel}</strong>
            {readOnly ? <span className="op-safety-sub">조회 전용 · 변경 없음</span> : null}
          </div>
        </div>
      </div>
      <div className="v3-oc-hero-cell">
        <span>포지션</span>
        <b>{positionsLabel}</b>
      </div>
      <div className="v3-oc-hero-cell">
        <span>실현 손익</span>
        <b>{pnlLabel}</b>
      </div>
      <div className="v3-oc-hero-cell" data-testid="operator-risk-state">
        <span>위험</span>
        <b className={status?.emergencyActive ? "v3-oc-tone-bad" : "v3-oc-tone-ok"}>
          {riskLabel}
        </b>
      </div>
      <div className="v3-oc-hero-cell">
        <span>승인</span>
        <b className="v3-oc-tone-warn">{approvalShort}</b>
      </div>
      <div className="v3-oc-hero-cell op-safety-item--live" data-testid="operator-live-state">
        <span>실전</span>
        <b className={liveAllowed ? "v3-oc-tone-ok" : "v3-oc-tone-bad"}>{liveShort}</b>
      </div>
    </section>
  );
}

export function OperatorCenter() {
  const data = useDashboardData();
  const pageContext = useOperatorPageContext();
  const { user, can } = useAuth();
  const readOnly = !can("research:run") && !can("paper:operate") && !can("backtest:run");
  const roleLabel = authRoleLabelKo(user?.role);

  const pipeline = useMemo(
    () =>
      buildOperatorPipeline({
        researchLabel: dashboardResearchLifecycleLabel(data.researchSelection),
        researchHref: dashboardResearchLifecycleHref(data.researchSelection),
        completedRecent: data.completedRecent,
        paperName: data.paperName,
        paperSessionStatus: data.paperSessionStatus,
        liveAllowed: data.status?.liveAllowed,
        canStartLive: data.status?.canStartLive,
        liveBlockReason: data.status?.liveBlockReason,
        emergencyActive: data.status?.emergencyActive,
      }),
    [
      data.completedRecent,
      data.paperName,
      data.paperSessionStatus,
      data.researchSelection,
      data.status,
    ],
  );

  const actionItems = useMemo(
    () =>
      buildOperatorActionQueue({
        emergencyActive: data.status?.emergencyActive,
        liveAllowed: data.status?.liveAllowed,
        canStartLive: data.status?.canStartLive,
        liveBlockReason: data.status?.liveBlockReason,
        attentionResearch: data.visibleAttentionResearch,
        completedRecent: data.completedRecent,
        terminalResearch: data.terminalResearch,
        paperSessionStatus: data.paperSessionStatus,
      }),
    [
      data.completedRecent,
      data.terminalResearch,
      data.paperSessionStatus,
      data.status,
      data.visibleAttentionResearch,
    ],
  );
  const actionGroups = useMemo(
    () => groupOperatorActions(actionItems),
    [actionItems],
  );
  const emptyActions = operatorActionQueueEmptyCopy();

  const currentResearch = data.researchSelection.currentResearch;
  const positions = (Array.isArray(data.status?.positions)
    ? data.status.positions
    : []) as DashPosition[];
  const tradeCount = data.status?.todayStats?.trades;
  const explicitStrategy = resolveExplicitCurrentStrategy({
    pageContextStrategyName:
      pageContext && "strategyLabel" in pageContext
        ? pageContext.strategyLabel
        : null,
    pageContextStrategyId: pageContext?.strategyId ?? null,
    paperName: data.paperName,
    paperSessionStatus: data.paperSessionStatus,
    activeStrategyName: data.status?.activeStrategy?.name,
    researchName: currentResearch?.searchName,
  });
  const strategyName = explicitStrategy?.name ?? null;
  const hasSelectedStrategy = Boolean(explicitStrategy);
  const symbolTimeframe =
    pageContext?.symbol || pageContext?.timeframe
      ? `${pageContext.symbol ?? "—"} / ${pageContext.timeframe ?? "—"}`
      : null;
  const equity = data.status?.metrics?.accountEquity ?? data.status?.todayStats?.accountEquity;
  const realized = data.status?.todayStats?.realizedPnlUsdt ?? data.status?.metrics?.todayRealizedPnlUsdt;
  const unrealized = data.status?.todayStats?.unrealizedPnlUsdt ?? data.status?.metrics?.todayUnrealizedPnlUsdt;
  const winRate = data.status?.todayStats?.winRate ?? data.status?.metrics?.winRate;
  const pnlLabel = formatUsdt(realized);
  const currentStageId =
    pipeline.find((step) => step.tone === "in_progress")?.id ?? pipeline[0]?.id;
  const approvalLabel = data.status?.canStartLive
    ? OPERATOR_STATUS.completed
    : data.status?.liveBlockReason ?? OPERATOR_STATUS.waiting;
  const riskSummary = data.status?.emergencyActive
    ? OPERATOR_STATUS.emergency
    : OPERATOR_STATUS.operatingNormal;
  const liveGateLabel = data.status?.canStartLive ? "준비됨" : "차단";
  const paperState = paperSessionVisualState(data.paperSessionStatus);
  const paperSummary =
    data.paperSessionStatus ?? OPERATOR_STATUS.waiting;
  const risk = data.status?.risk;
  const showPrimaryAction = shouldShowOperatorPrimaryAction({
    hasSelectedStrategy,
    primaryAction: data.primaryAction,
  });
  const showResultsAction = hasOperatorSearchResult(
    data.completedRecent,
    data.jobs,
  );
  const showPaperAction = hasRelevantPaperSession(data.paperSessionStatus);
  const riskTone = resolveOperatorRiskGaugeTone({
    riskState: risk?.riskState,
    emergencyActive: data.status?.emergencyActive,
  });
  const queueCopy = data.status?.operations?.queueStatusLabel
    ? normalizeOperatorQueueCopy(data.status.operations.queueStatusLabel)
    : OPERATOR_STATUS.waiting;
  const todayTradingCostLine = formatTodayTradingCostLine(
    data.status?.todayStats ?? {},
  );

  return (
    <div
      className="op-center rextora-dashboard v3-oc"
      data-testid="lifecycle-dashboard"
      data-operator-center="true"
      data-readonly={readOnly ? "true" : "false"}
    >
      <SafetyStrip
        error={data.error}
        initialLoading={data.initialLoading}
        status={data.status}
        roleLabel={roleLabel}
        readOnly={readOnly}
        positionsLabel={positions.length === 0 ? "0" : `${positions.length}건`}
        pnlLabel={pnlLabel}
      />

      <div className="v3-oc-kpis" data-testid="operator-trading">
        <V3Kpi
          label="계좌 자산"
          value={formatUsdt(equity)}
          helper="전체 계정 기준"
          visual={
            <span className="v3-oc-kpi-vis">
              <StatusDot tone={equity == null ? "idle" : "ok"} label={equity == null ? "확인 불가" : "잔고"} />
            </span>
          }
        />
        <V3Kpi
          label="오늘 실현 손익"
          value={pnlLabel}
          helper={todayTradingCostLine ?? "전체 계정 기준"}
          visual={
            <span className="v3-oc-kpi-vis">
              {Number.isFinite(risk?.usagePct) ? (
                <LimitGauge current={risk?.usagePct} limit={100} tone={riskTone} />
              ) : (
                <ScalarSignedBar value={realized} />
              )}
            </span>
          }
        />
        <V3Kpi
          label="미실현 손익"
          value={formatUsdt(unrealized)}
          visual={
            <span className="v3-oc-kpi-vis">
              <ScalarSignedBar value={unrealized} />
            </span>
          }
        />
        <V3Kpi
          label="오늘 거래"
          value={
            tradeCount == null || tradeCount === 0 ? (
              <span data-testid="operator-zero-trades" aria-label={OPERATOR_EMPTY.trades}>
                0
              </span>
            ) : (
              `${tradeCount}건`
            )
          }
          visual={
            <span className="v3-oc-kpi-vis">
              {Number.isFinite(risk?.maxDailyTrades) ? (
                <LimitGauge current={tradeCount ?? risk?.dailyTrades} limit={risk?.maxDailyTrades} tone={riskTone} />
              ) : (
                <CountSegments value={tradeCount} />
              )}
            </span>
          }
        />
        <V3Kpi
          label="오늘 승률"
          value={tradeCount === 0 || winRate == null ? "—" : `${winRate}%`}
          visual={
            <span className="v3-oc-kpi-vis">
              <WinRateRing value={winRate} tradeCount={tradeCount} />
            </span>
          }
        />
        <V3Kpi
          label="모의매매 상태"
          value={data.paperSessionStatus ?? OPERATOR_STATUS.waiting}
          helper={paperSummary}
          visual={
            <span className="v3-oc-kpi-vis">
              <PaperStateFlow state={paperState} />
            </span>
          }
        />
      </div>

      <div className="v3-oc-grid12">
        <V3Card
          className="v3-oc-s8"
          title="전략 검증 단계"
          meta={hasSelectedStrategy ? strategyName : undefined}
        >
          <p className="v3-oc-strategy-title" data-testid="operator-selected-strategy">
            {hasSelectedStrategy ? strategyName : OPERATOR_EMPTY.strategy}
          </p>
          <div className="v3-oc-tags">
            {symbolTimeframe ? <span className="v3-oc-tag">{symbolTimeframe}</span> : null}
            <span className="v3-oc-tag">{OPERATOR_STATUS.paperMode}</span>
          </div>
          <section
            className="op-pipeline"
            aria-label="거래 파이프라인"
            data-testid="operator-pipeline"
          >
            {data.initialLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <ol className="op-pipeline-track v3-oc-pipeline">
                {pipeline.map((step, index) => (
                  <li
                    key={step.id}
                    className={`op-pipeline-step v3-oc-stage is-${step.tone}${step.id === currentStageId ? " is-current" : ""}`}
                  >
                    <Link
                      href={step.href}
                      className="op-pipeline-link"
                      data-testid={step.testId}
                    >
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <span className="op-pipeline-label">{step.label}</span>
                      <span className="op-pipeline-status">{step.status}</span>
                    </Link>
                    {index < pipeline.length - 1 ? (
                      <span className="op-pipeline-arrow" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section
            className="op-strategy"
            data-testid="operator-current-strategy"
            aria-label={OPERATOR_LABEL.currentStrategy}
          >
            <div className="op-strategy-grid" data-testid="dash-current-research">
              <div>
                <span className="op-kicker">전략 이름</span>
                <p className="op-metric">{hasSelectedStrategy ? strategyName : "—"}</p>
              </div>
              <div>
                <span className="op-kicker">{OPERATOR_LABEL.symbolTimeframe}</span>
                <p className="op-metric">{symbolTimeframe ?? OPERATOR_STATUS.unavailable}</p>
              </div>
              <div data-testid="dash-paper-summary">
                <span className="op-kicker">모의매매</span>
                <p className="op-metric">{paperSummary}</p>
              </div>
              <div>
                <span className="op-kicker">실전 승인</span>
                <p className="op-metric">{approvalLabel}</p>
              </div>
            </div>
            {!hasSelectedStrategy ? (
              <div className="v3-oc-empty-strategy" data-testid="operator-no-strategy">
                <DashboardActionLink
                  href="/strategy-search"
                  variant="primary"
                  size="lg"
                  className="rextora-dashboard-primary-cta"
                  data-testid="operator-start-search"
                >
                  새 탐색 시작
                </DashboardActionLink>
              </div>
            ) : null}
            {showResultsAction || showPaperAction ? (
            <div className="v3-oc-inline-links">
              {showResultsAction ? (
              <DashboardActionLink href="/results" size="sm" data-testid="dash-open-results">
                탐색 결과
              </DashboardActionLink>
              ) : null}
              {showPaperAction ? (
              <DashboardActionLink href="/paper-trading" size="sm" data-testid="dash-open-paper">
                모의매매 확인
              </DashboardActionLink>
              ) : null}
            </div>
            ) : null}
          </section>
        </V3Card>

        <V3Card
          className="v3-oc-s4"
          title="지금 확인할 것"
          meta={`${actionItems.length}건`}
        >
          {readOnly ? (
            <section
              className="op-primary-readonly"
              data-testid="dashboard-primary-action"
              aria-label="조회 전용"
            >
              <p className="op-kicker">조회 전용</p>
              <p className="op-section-title">운영 상태를 확인할 수 있습니다.</p>
              <p className="op-section-desc">이 권한에서는 탐색·모의·실전을 시작하지 않습니다.</p>
            </section>
          ) : showPrimaryAction ? (
            <V3PermissionGate allowed>
              <DashboardPrimaryAction
                initialLoading={data.initialLoading}
                primaryAction={data.primaryAction}
              />
            </V3PermissionGate>
          ) : null}
          <section
            className="op-actions"
            data-testid="dash-review-required"
            aria-label={OPERATOR_LABEL.actionQueue}
          >
            {data.initialLoading ? (
              <Skeleton className="h-24" />
            ) : actionItems.length === 0 ? (
              <p className="v3-oc-empty">{emptyActions.message}</p>
            ) : (
              <div className="op-action-groups v3-oc-actions">
                {actionGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`op-action-group is-${group.id}`}
                    data-testid={`operator-action-group-${group.id}`}
                  >
                    <h3 className="op-action-group-title">{group.label}</h3>
                    <ul>
                      {group.items.map((item, itemIndex) => (
                        <li key={item.id} className={`op-action-item v3-oc-action is-${item.severity}`}>
                          <span className="v3-oc-action-index" aria-hidden="true">
                            {itemIndex + 1}
                          </span>
                          <div>
                            <p className="op-action-title">{item.title}</p>
                            <p className="op-action-desc">{item.description}</p>
                          </div>
                          {item.targetRoute ? (
                            <Link href={item.targetRoute} className="op-action-link">
                              {item.actionLabel ?? "이동"}
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {dashboardAttentionHiddenCopy(data.attentionHiddenCount) ? (
              <p
                className="op-section-desc"
                data-testid="dash-attention-hidden-count"
              >
                {dashboardAttentionHiddenCopy(data.attentionHiddenCount)}
              </p>
            ) : null}
            {data.attentionHiddenCount > 0 ? (
              <Link
                href={RESEARCH_RECOVERY_HREF}
                className="op-action-link"
                data-testid="dash-attention-view-all"
              >
                {dashboardRecoveryViewAllLabel()}
              </Link>
            ) : null}
          </section>
        </V3Card>

        <V3Card className="v3-oc-s7" title="시장 · 실행">
          <section className="op-ops" data-testid="operator-execution-monitor" aria-label="시장 및 실행">
            <div className="v3-oc-metric-stack v3-oc-ops-grid">
              <div className="v3-oc-metric">
                <span>감시 종목</span>
                <b>{data.status?.operations?.watchedSymbolCount ?? 0}</b>
                <CountSegments value={data.status?.operations?.watchedSymbolCount} />
              </div>
              <div className="v3-oc-metric">
                <span>진입 가능 후보</span>
                <b>{data.status?.operations?.eligibleCandidateCount ?? 0}</b>
                <CandidateAvailability value={data.status?.operations?.eligibleCandidateCount} />
              </div>
              <div className="v3-oc-metric">
                <span>열린 포지션</span>
                <b>
                  {positions.length === 0 ? (
                    <span data-testid="operator-zero-positions" aria-label={OPERATOR_EMPTY.positions}>
                      0
                    </span>
                  ) : Number.isFinite(risk?.maxPositions) ? (
                    `${positions.length} / ${risk?.maxPositions}`
                  ) : (
                    `${positions.length}건`
                  )}
                </b>
                <OccupancyIndicator
                  value={data.status?.operations?.openPositionCount ?? positions.length}
                  limit={risk?.maxPositions}
                />
              </div>
              <div className="v3-oc-metric">
                <span>실행 큐</span>
                <b className="v3-oc-queue-copy">{queueCopy}</b>
                <QueueIndicator label={queueCopy} />
              </div>
              <div className="v3-oc-metric v3-oc-metric--wide">
                <span>마지막 갱신</span>
                <b>
                  {data.status?.lastUpdatedAt
                    ? new Date(data.status.lastUpdatedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : OPERATOR_STATUS.waiting}
                </b>
                <FreshnessPulse updatedAt={data.status?.lastUpdatedAt} />
              </div>
            </div>
          </section>
        </V3Card>

        <V3Card className="v3-oc-s5" title="현재 포지션">
          <section className="op-position" data-testid="operator-current-position" aria-label="현재 포지션">
            {positions.length === 0 ? (
              <div className="v3-oc-empty-position">
                <StatusDot tone="idle" label="" />
                <p className="v3-oc-empty">{OPERATOR_EMPTY.positions}</p>
              </div>
            ) : (
              <ul className="v3-oc-position-list">
                {positions.slice(0, 4).map((row, index) => (
                  <li key={`${row.symbol ?? "pos"}-${index}`} className="v3-oc-position-row">
                    <div className="v3-oc-position-head">
                      <strong>{row.symbol ?? "—"}</strong>
                      <span className="v3-oc-position-side">{row.side ?? "—"}</span>
                      <b className={Number(row.unrealizedPnl) < 0 ? "v3-oc-tone-bad" : Number(row.unrealizedPnl) > 0 ? "v3-oc-tone-ok" : undefined}>
                        {formatUsdt(row.unrealizedPnl)}
                      </b>
                    </div>
                    <div className="v3-oc-position-facts">
                      <span>손익률 {row.pnlPct == null ? "—" : `${row.pnlPct.toFixed(2)}%`}</span>
                      <span>레버리지 {row.leverage == null ? "—" : `${row.leverage}x`}</span>
                      <span>진입 {formatDisplayPrice(row.entryPrice)}</span>
                      <span>현재 {formatDisplayPrice(row.currentPrice)}</span>
                      <span>{row.protectionLabel ?? "보호 없음"}</span>
                    </div>
                    <ScalarSignedBar value={row.unrealizedPnl} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </V3Card>

        <V3Card className="v3-oc-s7" title="위험 · 실전">
          <section
            className="op-risk"
            data-testid="dash-live-summary"
            aria-label="위험 및 실전 준비"
          >
            {data.initialLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="v3-oc-metric-stack">
                <div className="v3-oc-metric">
                  <span>위험 상태</span>
                  <b className={data.status?.emergencyActive ? "v3-oc-tone-bad" : "v3-oc-tone-ok"}>
                    {risk?.riskState ?? riskSummary}
                  </b>
                </div>
                <div className="v3-oc-risk-grid">
                <div className="v3-oc-metric">
                  <span>일 손실</span>
                  <b>
                    {risk?.currentDailyLossPct == null
                      ? "—"
                      : `${risk.currentDailyLossPct}% / ${risk.dailyLossLimitPct ?? "—"}%`}
                  </b>
                  <LimitGauge current={risk?.usagePct} limit={100} tone={riskTone} />
                </div>
                <div className="v3-oc-metric">
                  <span>낙폭</span>
                  <b>
                    {risk?.accountDrawdownPct == null
                      ? "—"
                      : `${risk.accountDrawdownPct}% / ${risk.accountLossLimitPct ?? "—"}%`}
                  </b>
                  <LimitGauge
                    current={risk?.accountDrawdownPct}
                    limit={risk?.accountLossLimitPct}
                    invert
                    tone={riskTone}
                  />
                </div>
                <div className="v3-oc-metric">
                  <span>포지션</span>
                  <b>
                    {risk?.openPositions ?? positions.length} / {risk?.maxPositions ?? "—"}
                  </b>
                  <LimitGauge current={risk?.openPositions ?? positions.length} limit={risk?.maxPositions} tone={riskTone} />
                </div>
                <div className="v3-oc-metric">
                  <span>레버리지</span>
                  <b>
                    {formatLeverageMultiple(risk?.currentLeverage)} / {formatLeverageMultiple(risk?.maxLeverage)}
                  </b>
                  <LimitGauge current={risk?.currentLeverage} limit={risk?.maxLeverage} tone={riskTone} />
                </div>
                <div className="v3-oc-metric">
                  <span>연속 손실</span>
                  <b>
                    {risk?.consecutiveLosses ?? "—"} / {risk?.consecutiveLossLimit ?? "—"}
                  </b>
                  <LimitGauge
                    current={risk?.consecutiveLosses}
                    limit={risk?.consecutiveLossLimit}
                    tone={riskTone}
                  />
                </div>
                <div className="v3-oc-metric">
                  <span>오늘 거래 한도</span>
                  <b>
                    {risk?.dailyTrades ?? tradeCount ?? "—"} / {risk?.maxDailyTrades ?? "—"}
                  </b>
                  <LimitGauge current={risk?.dailyTrades ?? tradeCount} limit={risk?.maxDailyTrades} tone={riskTone} />
                </div>
                </div>
                <div className="v3-oc-metric">
                  <span>실전 게이트</span>
                  <b className={data.status?.canStartLive ? "v3-oc-tone-info" : "v3-oc-tone-bad"}>
                    {liveGateLabel}
                  </b>
                </div>
                <div className="v3-oc-metric">
                  <span>승인</span>
                  <b className="v3-oc-tone-warn">{approvalLabel}</b>
                </div>
                <div className="op-inline-links">
                  <Link href="/risk" className="op-action-link">
                    위험 관리
                  </Link>
                  <Link href="/live-trading" className="op-action-link" data-testid="dash-open-live">
                    실전 진입
                  </Link>
                  <p className="op-section-desc">
                    승인 조건과 현재 차단 이유를 확인하세요.
                  </p>
                </div>
              </div>
            )}
          </section>
        </V3Card>

        <V3Card className="v3-oc-s5" title={OPERATOR_LABEL.systemHealth}>
          <section className="op-health" aria-label={OPERATOR_LABEL.systemHealth}>
            <div className="v3-oc-metric-stack">
              <div className="v3-oc-metric">
                <span>시세 · 실행 · 큐 · API</span>
                <SystemNodes
                  market={resolveSystemNodeTone({
                    kind: "market",
                    lastUpdatedAt: data.status?.lastUpdatedAt,
                  })}
                  execution={resolveSystemNodeTone({
                    kind: "execution",
                    botStatusLabel: data.status?.botStatusLabel,
                  })}
                  queue={resolveSystemNodeTone({
                    kind: "queue",
                    queueStatusLabel: data.status?.operations?.queueStatusLabel,
                  })}
                  api={resolveSystemNodeTone({
                    kind: "api",
                    loadError: data.error,
                    lastUpdatedAt: data.status?.lastUpdatedAt,
                  })}
                />
              </div>
              <div className="v3-oc-metric">
                <span>실행 상태</span>
                <b>{data.status?.botStatusLabel ?? OPERATOR_STATUS.waiting}</b>
              </div>
              <div className="v3-oc-metric">
                <span>실전 허용</span>
                <b>{data.status?.liveAllowed ? "설정됨" : LIVE_DISABLED_LABEL}</b>
              </div>
              <div className="v3-oc-metric">
                <span>상세</span>
                <Link href="/settings#system" className="op-action-link">
                  시스템 설정
                </Link>
              </div>
            </div>
          </section>
        </V3Card>

        <V3Card className="v3-oc-full v3-oc-ai-strip">
          <section
            className="op-ai"
            data-testid="dashboard-executive-briefing"
            aria-label={OPERATOR_LABEL.aiEmployee}
          >
            <div className="v3-oc-ai-row">
              <div
                className={
                  data.initialLoading || data.researchSelection.executingResearch
                    ? "v3-oc-ai-mark is-working"
                    : "v3-oc-ai-mark"
                }
                aria-hidden="true"
              >
                AI
              </div>
              <div className="v3-oc-ai-copy">
                <strong>{OPERATOR_LABEL.aiEmployee}</strong>
                <span>
                  {readOnly
                    ? "조회만 가능합니다."
                    : data.generationHint ?? data.primaryAction.description}
                </span>
              </div>
              <button
                type="button"
                className="v3-oc-ai-open"
                onClick={() => requestOpenAssistant()}
              >
                AI 열기
              </button>
            </div>
            <dl className="op-ai-grid v3-oc-ai-facts v3-oc-sr">
              <div>
                <dt>AI 상태</dt>
                <dd>
                  {data.initialLoading
                    ? OPERATOR_STATUS.loading
                    : data.researchSelection.executingResearch
                      ? OPERATOR_STATUS.inProgress
                      : OPERATOR_STATUS.ready}
                </dd>
              </div>
              <div>
                <dt>현재 분석 대상</dt>
                <dd>
                  {currentResearch?.searchName || OPERATOR_STATUS.unavailable}
                </dd>
              </div>
              <div>
                <dt>다음 작업</dt>
                <dd>{readOnly ? "조회만 가능합니다." : data.primaryAction.label}</dd>
              </div>
            </dl>
          </section>
        </V3Card>
      </div>
    </div>
  );
}
