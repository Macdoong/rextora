"use client";

import Link from "next/link";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { V3Card } from "@/components/rextora/v3/V3Card";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import {
  LIVE_DISABLED_LABEL,
  LIVE_ORDERS_BLOCKED_LABEL,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import {
  RISK_OPERATOR_UNAVAILABLE,
  riskOperatorRecoveryCopy,
  riskOperatorRowsFromUnified,
  riskOperatorUtilizationFromUnified,
  type RiskOperatorSemantic,
} from "@/src/lib/rextora/risk/riskOperatorPresentation";
import { OPERATOR_STATUS } from "@/src/lib/rextora/ui/operatorTerminology";

export type RiskWorkbenchState = {
  semantic: RiskOperatorSemantic;
  labelKo: string;
};

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

type StatusTone = "neutral" | "success" | "warning" | "danger";

function semanticTone(
  loaded: boolean,
  semantic: RiskOperatorSemantic,
): StatusTone {
  if (!loaded) return "neutral";
  if (
    semantic === "emergency_stop" ||
    semantic === "risk_halted" ||
    semantic === "limit_reached"
  ) {
    return "danger";
  }
  if (semantic === "warning") return "warning";
  if (semantic === "normal") return "success";
  return "neutral";
}

function statusClass(tone: StatusTone): string {
  if (tone === "success") return "ok";
  if (tone === "warning") return "warn";
  if (tone === "danger") return "bad";
  return "";
}

function formatTechnical(value: unknown): string {
  if (value == null) return RISK_OPERATOR_UNAVAILABLE;
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    return Number.isFinite(value) ? formatNumber(value) : RISK_OPERATOR_UNAVAILABLE;
  }
  const text = String(value).trim();
  return text || RISK_OPERATOR_UNAVAILABLE;
}

export function RiskOperatorWorkbench({
  loaded,
  riskView,
  riskState,
  liveStatus,
  realOrderStatus,
  emergencyStopActive,
  approvalLabel,
  modeLabel,
}: {
  loaded: boolean;
  riskView: UnifiedRiskView | null;
  riskState: RiskWorkbenchState;
  liveStatus: string;
  realOrderStatus: string;
  emergencyStopActive: boolean;
  approvalLabel: string;
  modeLabel: string;
}) {
  const rows = riskOperatorRowsFromUnified(riskView ?? {});
  const utilization = riskOperatorUtilizationFromUnified(riskView ?? {});
  const emergencyLabel = emergencyStopActive ? "긴급 정지" : "비활성";
  const tone = semanticTone(loaded, riskState.semantic);
  const statusLabel = loaded ? riskState.labelKo : OPERATOR_STATUS.loading;
  const halted =
    loaded &&
    (riskState.semantic === "risk_halted" ||
      riskState.semantic === "emergency_stop");
  const breachedRows = rows.filter((row) => row.breached);
  const globalBreached = Boolean(riskView?.limitBreached) || breachedRows.length > 0;
  const showDanger = halted || globalBreached;
  const recoveryLabel = riskOperatorRecoveryCopy(null);
  const closest = utilization.closest;
  const dailyLossUsage = utilization.metrics.find((metric) => metric.id === "daily_loss");
  const usagePct =
    dailyLossUsage?.usageRatio != null
      ? dailyLossUsage.usageRatio * 100
      : null;
  const gaugeDeg =
    usagePct == null ? 0 : Math.min(100, Math.max(0, usagePct)) * 3.6;
  const gaugeFill =
    tone === "danger"
      ? "var(--v3-danger)"
      : tone === "warning"
        ? "var(--v3-warning)"
        : tone === "success"
          ? "var(--v3-success)"
          : "#c7ced8";

  const inspectNext = !loaded
    ? "위험 상태를 불러오는 중입니다."
    : showDanger
      ? "한도 위반 또는 중단 사유를 확인한 뒤 실전 진입에서 긴급 제어를 검토하세요."
      : closest
        ? `가장 가까운 한도는 ${closest.labelKo}입니다. 현재 ${closest.combinedLabel}.`
        : "표시할 한도 데이터가 없습니다.";

  return (
    <>
      <div className="v3-rk-pagehead">
        <header>
          <h1 className="rextora-page-title">위험 관리</h1>
          <p>
            현재 한도와 사용량만 표시합니다. 한도 값은 여기서 바꾸지 않습니다.
          </p>
        </header>
        <p className="v3-rk-asof">읽기 전용 · 변경 없음</p>
      </div>

      <AgentContextStrip pageLabelKo="위험 관리" />

      <section
        className={`v3-rk-statusbar${showDanger ? " is-danger" : ""}`}
        data-testid="live-safety-header"
      >
        <div className="v3-rk-status-main">
          <span>현재 위험 상태</span>
          <b className={statusClass(tone)} data-testid="risk-state-label">
            {statusLabel}
          </b>
          <p>
            {LIVE_DISABLED_LABEL} · {LIVE_ORDERS_BLOCKED_LABEL}
          </p>
        </div>
        <div className="v3-rk-status-cell">
          <span>실전 매매</span>
          <b>{liveStatus}</b>
        </div>
        <div className="v3-rk-status-cell">
          <span>실제 주문</span>
          <b>{realOrderStatus}</b>
        </div>
        <div className="v3-rk-status-cell">
          <span>긴급 정지</span>
          <b className={emergencyStopActive ? "bad" : "ok"}>{emergencyLabel}</b>
        </div>
        <div className="v3-rk-status-cell">
          <span>운영자 승인</span>
          <b>{approvalLabel}</b>
        </div>
      </section>

      <p className="v3-rk-inspect">
        {modeLabel} · {inspectNext}
      </p>

      <div className="v3-rk-grid">
        <V3Card
          className="v3-rk-s8"
          title="위험 한도"
          meta="현재값 / 한도"
          interactive
        >
          <section data-testid="risk-limits-panel">
            <ul className="v3-rk-metrics">
              {utilization.metrics.map((row) => {
                const pct =
                  row.usageRatio == null ? null : row.usageRatio * 100;
                const barWidth =
                  pct == null ? null : Math.min(100, Math.max(0, pct));
                return (
                  <li
                    key={row.id}
                    className={`v3-rk-metric${row.breached ? " is-breached" : ""}`}
                    data-testid={`risk-limit-${row.id}`}
                  >
                    <span>{row.labelKo}</span>
                    <b>{row.combinedLabel}</b>
                    <small>
                      현재 {row.currentLabel} · 한도 {row.limitLabel} · 남은 여유{" "}
                      {row.remainingLabel}
                    </small>
                    {barWidth == null ? (
                      <p className="v3-rk-unavailable">{RISK_OPERATOR_UNAVAILABLE}</p>
                    ) : (
                      <div
                        className={`v3-progress${row.breached ? " is-breached" : ""}`}
                        aria-hidden="true"
                      >
                        <i style={{ width: `${barWidth}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </V3Card>

        <V3Card
          className="v3-rk-s4"
          title="보호 상태"
          meta="일일 손실 사용량"
          interactive
        >
          <div className="v3-rk-gauge-wrap">
            <div
              className="v3-rk-gauge"
              style={{
                ["--deg" as string]: `${gaugeDeg}deg`,
                ["--fill" as string]: gaugeFill,
              }}
              aria-label={
                usagePct == null
                  ? RISK_OPERATOR_UNAVAILABLE
                  : `일일 손실 사용량 ${formatNumber(usagePct)}%`
              }
              data-testid="risk-daily-loss-usage"
            >
              <b>
                {usagePct == null
                  ? "—"
                  : `${formatNumber(Math.min(100, Math.max(0, usagePct)))}%`}
              </b>
            </div>
            <div className="v3-rk-stack">
              <div className="v3-rk-metric">
                <span>위험 중단</span>
                <b className={halted && riskState.semantic === "risk_halted" ? "bad" : "ok"}>
                  {riskState.semantic === "risk_halted" ? riskState.labelKo : "미발생"}
                </b>
              </div>
              <div className="v3-rk-metric">
                <span>긴급 정지</span>
                <b className={emergencyStopActive ? "bad" : "ok"}>{emergencyLabel}</b>
              </div>
            </div>
          </div>
        </V3Card>
      </div>

      {showDanger ? (
        <section className="v3-rk-breach" data-testid="risk-breach-panel">
          <h2>{halted ? "거래가 위험 제한으로 중단되었습니다" : "한도 도달"}</h2>
          <ul>
            {emergencyStopActive ? <li>긴급 정지가 활성입니다.</li> : null}
            {riskView?.limitBreached ? (
              <li>일일 손실 한도에 도달했습니다.</li>
            ) : null}
            {breachedRows.map((row) => (
              <li key={row.id}>
                원인: {row.labelKo} 한도 도달 · {recoveryLabel}
              </li>
            ))}
            {breachedRows.length === 0 &&
            !emergencyStopActive &&
            !riskView?.limitBreached ? (
              <li>{riskState.labelKo}</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <V3Card title="다음 확인" meta="탐색만 가능">
        <p className="v3-rk-note">
          한도 위반 시 신규 진입이 막힐 수 있습니다. 한도 편집은 설정에서만
          합니다. 긴급 정지·청산·취소는 실전 진입에서만 실행합니다.
        </p>
        <p className="v3-rk-note">복구 안내: {recoveryLabel}</p>
        <div className="v3-rk-toolbar">
          <Link
            href="/live-trading"
            className="v3-rk-btn-secondary v3-hover"
            data-testid="risk-live-control-link"
          >
            실전 진입에서 긴급 제어
          </Link>
          <Link
            href="/settings#risk"
            className="v3-rk-btn-ghost v3-hover"
            data-testid="risk-settings-link"
          >
            한도 설정은 시스템 설정에서 확인
          </Link>
        </div>
      </V3Card>

      <details className="v3-rk-tech">
        <summary>기술 정보</summary>
        <dl className="v3-rk-tech-grid">
          <div>
            <dt>원본 위험 상태</dt>
            <dd>{formatTechnical(riskView?.riskState)}</dd>
          </div>
          <div>
            <dt>한도 도달</dt>
            <dd>{formatTechnical(riskView?.limitBreached)}</dd>
          </div>
          <div>
            <dt>일일 손실 사용량</dt>
            <dd>
              {usagePct == null ? RISK_OPERATOR_UNAVAILABLE : `${formatNumber(usagePct)}%`}
            </dd>
          </div>
          <div>
            <dt>남은 일일 손실 여유</dt>
            <dd>
              {utilization.metrics.find((metric) => metric.id === "daily_loss")
                ?.remainingLabel ?? RISK_OPERATOR_UNAVAILABLE}
            </dd>
          </div>
          <div>
            <dt>남은 포지션 수</dt>
            <dd>
              {utilization.metrics.find((metric) => metric.id === "positions")
                ?.remainingLabel ?? RISK_OPERATOR_UNAVAILABLE}
            </dd>
          </div>
          <div>
            <dt>남은 일일 거래</dt>
            <dd>
              {utilization.metrics.find((metric) => metric.id === "daily_trades")
                ?.remainingLabel ?? RISK_OPERATOR_UNAVAILABLE}
            </dd>
          </div>
          <div>
            <dt>당일 실현 손실</dt>
            <dd>{formatTechnical(riskView?.todayRealizedLossUsdt)}</dd>
          </div>
          <div>
            <dt>당일 미실현 손실</dt>
            <dd>{formatTechnical(riskView?.todayUnrealizedLossUsdt)}</dd>
          </div>
          <div>
            <dt>당일 총 손실</dt>
            <dd>{formatTechnical(riskView?.todayTotalLossUsdt)}</dd>
          </div>
          {rows.map((row) => (
            <div key={`delta-${row.id}`}>
              <dt>{row.labelKo} 차이</dt>
              <dd>{row.deltaLabel}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
