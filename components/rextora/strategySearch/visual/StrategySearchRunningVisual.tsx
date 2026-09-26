"use client";

import type { ReactNode } from "react";
import { formatMddAbsPct, formatPct } from "../formatters";
import { CandidateFlowVisual } from "./CandidateFlowVisual";
import { CandidateMetricSparkline } from "./CandidateMetricSparkline";
import { RecentCandidateStrip } from "./RecentCandidateStrip";
import { SearchFamilyGlyph } from "./SearchFamilyGlyph";
import { type SearchScopeProgress } from "./searchScopeVisual";
import { useFreshActivityKeys } from "./useFreshActivityKeys";
import {
  RUNNING_NETWORK_CENTER,
  RUNNING_NETWORK_HEIGHT,
  RUNNING_NETWORK_WIDTH,
  RUNNING_WORKFLOW_STEPS,
  WORKFLOW_LABEL_KO,
  candidateMetricSparklinePoints,
  candidateVisualItems,
  familyNodeMatchesLabel,
  familyTransitionLabels,
  formatActivityClock,
  formatActivityEventLineKo,
  recentActivityEventsForFeed,
  resolveRunningVisualMode,
  runningCompactTimeframe,
  runningFamilyNodes,
  runningMetricValues,
  runningVisualCopy,
  shouldRenderRunningVisual,
} from "./runningVisualModel";

const WORKFLOW_ICONS = [
  "M4 12h12M12 6l6 6-6 6",
  "M5 16V8l5 4-5 4Zm7-8h6v8h-6",
  "M4 14h3l2-4 3 8 2-4h4",
  "M5 11.5 9 16l8-9",
  "M5 7h12M5 12h8M5 17h10",
] as const;

export function StrategySearchRunningVisual({
  progress,
  familyIds,
  symbol,
  timeframe,
}: {
  progress?: SearchScopeProgress | null;
  familyIds: readonly string[];
  symbol?: string | null;
  timeframe?: string | null;
}) {
  const mode = resolveRunningVisualMode(progress?.status);
  const events = progress?.recentActivityEvents;
  const freshKeys = useFreshActivityKeys(events);
  if (!shouldRenderRunningVisual(progress?.status)) return null;

  const copy = runningVisualCopy(mode);
  const metrics = runningMetricValues(progress);
  const nodes = runningFamilyNodes(familyIds, progress);
  const feed = recentActivityEventsForFeed(progress);
  const candidates = candidateVisualItems(events);
  const transitions = familyTransitionLabels(events, freshKeys);
  const returnPoints = candidateMetricSparklinePoints(candidates, "netReturn");
  const mddPoints = candidateMetricSparklinePoints(candidates, "mdd");
  const { cx, cy } = RUNNING_NETWORK_CENTER;
  const statusBits = [
    symbol?.trim() || null,
    timeframe ? runningCompactTimeframe(timeframe) : null,
    metrics.elapsed !== "—" ? metrics.elapsed : null,
  ].filter(Boolean);
  const showAmbient = mode === "running" || mode === "pause_requested";
  const statusSummary = [copy.titleKo, metrics.family, metrics.evaluated]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      id="ss-running-view-anchor"
      className="ss-run-visual"
      data-testid="ss-running-visual"
      data-run-mode={mode}
      data-engine-active={copy.claimsActiveEngine ? "true" : "false"}
      data-engine-size="compact"
      aria-label={copy.titleKo}
    >
      <header className="ss-run-visual__head">
        <p
          className="ss-run-visual__kicker"
          data-testid="ss-running-visual-kicker"
        >
          {mode === "running" ? "AI 연구 엔진" : "탐색 상태"}
        </p>
        <h2
          className="ss-run-visual__title"
          data-testid="ss-running-visual-title"
        >
          {copy.titleKo}
        </h2>
        <p className="ss-run-visual__sub" data-testid="ss-running-visual-sub">
          {copy.subcopyKo}
        </p>
        {statusBits.length > 0 ? (
          <p
            className="ss-run-visual__status"
            data-testid="ss-running-visual-status-row"
          >
            {statusBits.join(" · ")}
          </p>
        ) : null}
        <span className="ss-sr-only" aria-live="polite">
          {statusSummary}
        </span>
      </header>

      <div className="ss-run-visual__stage">
        <div className="ss-run-visual__engine">
          <div
            className="ss-run-network ss-run-network--compact"
            data-testid="ss-running-network"
            data-compact="true"
          >
            <div className="ss-run-stage ss-run-stage--compact">
              <svg
                className="ss-run-network__svg"
                viewBox={`0 0 ${RUNNING_NETWORK_WIDTH} ${RUNNING_NETWORK_HEIGHT}`}
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <radialGradient id="ss-run-core-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.5" />
                    <stop offset="55%" stopColor="#3257d7" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#3257d7" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle className="ss-run-halo" cx={cx} cy={cy} r="68" />
                <circle
                  className="ss-run-sweep ss-run-anim"
                  cx={cx}
                  cy={cy}
                  r="54"
                />
                <circle
                  className="ss-run-orbit ss-run-anim"
                  cx={cx}
                  cy={cy}
                  r="40"
                />
                <circle cx={cx} cy={cy} r="34" fill="url(#ss-run-core-glow)" />
                {nodes.map((node) => (
                  <g key={`rel-${node.id}`}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={node.x}
                      y2={node.y}
                      className={
                        "ss-run-link" +
                        (node.state === "active" ? " ss-run-link--active" : "")
                      }
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.state === "active" ? 5 : 3.2}
                      className={
                        "ss-run-family-dot" +
                        (node.state === "active"
                          ? " ss-run-family-dot--active"
                          : "")
                      }
                    />
                  </g>
                ))}
                {showAmbient ? (
                  <circle
                    className="ss-run-particle ss-run-anim"
                    cx={cx}
                    cy={cy - 40}
                    r="2.4"
                  />
                ) : null}
                <g className="ss-run-core ss-run-anim">
                  <circle cx={cx} cy={cy} r="22" className="ss-run-core__disc" />
                  <circle cx={cx} cy={cy} r="13" className="ss-run-core__inner" />
                </g>
              </svg>
              <div className="ss-run-core-copy" data-testid="ss-running-core">
                <strong>Rextora</strong>
                <span>AI 탐색</span>
              </div>
            </div>
            <ul className="ss-run-family-chips">
              {nodes.map((node) => {
                const justStarted = Array.from(transitions.started).some(
                  (label) => familyNodeMatchesLabel(node, label),
                );
                const justCompleted = Array.from(transitions.completed).some(
                  (label) => familyNodeMatchesLabel(node, label),
                );
                return (
                  <li key={node.id}>
                    <article
                      className={
                        "ss-run-node-card" +
                        (node.state === "active" ? " is-active" : "") +
                        (justStarted ? " is-just-started" : "") +
                        (justCompleted ? " is-just-completed" : "")
                      }
                      data-testid={`ss-running-node-${node.id}`}
                      data-family-id={node.id}
                      data-family-state={node.state}
                      data-family-just-started={justStarted ? "true" : "false"}
                      data-family-just-completed={
                        justCompleted ? "true" : "false"
                      }
                    >
                      <SearchFamilyGlyph id={node.id} />
                      <div>
                        <strong>{node.labelKo}</strong>
                        {node.state === "active" ? (
                          <em data-testid={`ss-running-node-active-${node.id}`}>
                            현재 분석
                          </em>
                        ) : node.state === "completed" ? (
                          <em>분석 완료</em>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>

          {metrics.family ? (
            <p
              className="ss-run-visual__activity"
              data-testid="ss-running-visual-activity"
            >
              현재 분석
              <strong>{metrics.family}</strong>
            </p>
          ) : null}
        </div>

        <CandidateFlowVisual
          items={candidates}
          events={events}
          freshKeys={freshKeys}
        />
      </div>

      <RecentCandidateStrip items={candidates} freshKeys={freshKeys} />

      <div className="ss-run-sparks" data-testid="ss-running-sparks">
        <CandidateMetricSparkline
          titleKo="최근 후보 수익률"
          points={returnPoints}
          formatValue={formatPct}
          kind="return"
          testId="ss-running-spark-return"
        />
        <CandidateMetricSparkline
          titleKo="최근 후보 최대낙폭"
          points={mddPoints}
          formatValue={formatMddAbsPct}
          kind="mdd"
          testId="ss-running-spark-mdd"
        />
      </div>

      <ul className="ss-run-metrics" data-testid="ss-running-metrics">
        <li>
          <span>평가</span>
          <strong
            key={metrics.evaluated}
            className="ss-live-count"
            data-testid="ss-running-metric-evaluated"
          >
            {metrics.evaluated}
          </strong>
        </li>
        <li>
          <span>평가 통과</span>
          <strong
            key={metrics.gatePassed}
            className="ss-live-count"
            data-testid="ss-running-metric-gate-passed"
          >
            {metrics.gatePassed}
          </strong>
        </li>
        <li>
          <span>평가 실패</span>
          <strong
            key={metrics.rejected}
            className="ss-live-count"
            data-testid="ss-running-metric-rejected"
          >
            {metrics.rejected}
          </strong>
        </li>
        <li>
          <span>최종 적격</span>
          <strong
            key={metrics.qualified}
            className="ss-live-count"
            data-testid="ss-running-metric-qualified"
          >
            {metrics.qualified}
          </strong>
        </li>
        <li>
          <span>경과</span>
          <strong
            key={metrics.elapsed}
            className="ss-live-count"
            data-testid="ss-running-metric-elapsed"
          >
            {metrics.elapsed}
          </strong>
        </li>
      </ul>

      <section
        className="ss-run-feed ss-run-feed--secondary"
        data-testid="ss-running-activity-feed"
        data-feed-priority="secondary"
        aria-label="최근 활동 로그"
      >
        <h3 className="ss-run-feed__title">실시간 탐색 활동</h3>
        {feed.length === 0 ? (
          <p
            className="ss-run-feed__empty"
            data-testid="ss-running-activity-empty"
          >
            평가가 시작되면 탐색 활동이 여기에 표시됩니다.
          </p>
        ) : (
          <ol className="ss-run-feed__list">
            {feed.map((event, index) => {
              const clock = formatActivityClock(event.at);
              return (
                <li
                  key={`${event.type}-${event.at}-${index}`}
                  data-testid={`ss-running-activity-${event.type}`}
                  data-activity-type={event.type}
                >
                  <span>{formatActivityEventLineKo(event)}</span>
                  {clock ? <time dateTime={event.at}>{clock}</time> : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div
        className="ss-run-flow"
        data-testid="ss-running-workflow"
        data-workflow="ambient"
      >
        <p className="ss-run-flow__label">{WORKFLOW_LABEL_KO}</p>
        <ol className="ss-run-flow__list">
          {RUNNING_WORKFLOW_STEPS.map((step, index) => (
            <li key={step}>
              <svg
                viewBox="0 0 22 22"
                width="16"
                height="16"
                aria-hidden="true"
                className="ss-run-flow__icon"
              >
                <path
                  d={WORKFLOW_ICONS[index]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function RunningConfigSummary({
  titleKo,
  marketLine,
  scopeLine,
  expanded,
  onToggle,
  children,
}: {
  titleKo: string;
  marketLine: string;
  scopeLine: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      className="ss-run-config"
      data-testid="ss-running-config"
      data-expanded={expanded ? "true" : "false"}
    >
      <header className="ss-run-config__head">
        <div>
          <h3 className="ss-run-config__title">{titleKo}</h3>
          <p
            className="ss-run-config__market"
            data-testid="ss-running-config-line1"
          >
            {marketLine}
          </p>
          <p
            className="ss-run-config__scope"
            data-testid="ss-running-config-line2"
          >
            {scopeLine}
          </p>
        </div>
        <button
          type="button"
          className="ss-run-config__toggle"
          data-testid="ss-running-config-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? "설정 접기 ▴" : "설정 보기 ▾"}
        </button>
      </header>
      {expanded ? (
        <div data-testid="ss-running-config-details">{children}</div>
      ) : null}
    </section>
  );
}
