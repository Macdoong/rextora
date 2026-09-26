"use client";

import { formatPct } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";

function FunnelStep(props: {
  label: string;
  value: number | null;
  testId: string;
}) {
  return (
    <li className="ss-completed-funnel__step" data-testid={props.testId}>
      <span>{props.label}</span>
      <strong>{props.value ?? "—"}</strong>
    </li>
  );
}

export function CompletedResultVisuals(props: {
  model: CompletedDashboardViewModel;
}) {
  const { model } = props;
  const candidates = model.compareCandidates.filter(
    (c) => c.netReturn != null || c.maxDrawdown != null,
  );

  return (
    <section
      className="ss-completed-visuals ss-completed-visuals--enter"
      data-testid="ss-completed-result-visuals"
      aria-label="결과 시각화"
    >
      <div className="ss-completed-visuals__block">
        <h3 className="ss-completed-visuals__title">탐색 퍼널</h3>
        <ol className="ss-completed-funnel" data-testid="ss-completed-funnel">
          <FunnelStep
            label="생성"
            value={model.funnel.generated}
            testId="ss-funnel-generated"
          />
          <FunnelStep
            label="평가"
            value={model.funnel.evaluated}
            testId="ss-funnel-evaluated"
          />
          <FunnelStep
            label="통과"
            value={model.funnel.passed}
            testId="ss-funnel-passed"
          />
          <FunnelStep
            label="최종 적격"
            value={model.funnel.qualified}
            testId="ss-funnel-qualified"
          />
        </ol>
      </div>

      <div className="ss-completed-visuals__block">
        <h3 className="ss-completed-visuals__title">통과 · 실패 분포</h3>
        <div
          className="ss-completed-passfail"
          data-testid="ss-completed-passfail"
        >
          <div className="ss-completed-passfail__bar ss-completed-passfail__bar--pass">
            <span>통과</span>
            <strong>{model.passFail.passed ?? 0}</strong>
          </div>
          <div className="ss-completed-passfail__bar ss-completed-passfail__bar--fail">
            <span>실패</span>
            <strong>{model.passFail.failed ?? 0}</strong>
          </div>
        </div>
      </div>

      {candidates.length > 0 ? (
        <>
          <div className="ss-completed-visuals__block">
            <h3 className="ss-completed-visuals__title">상위 후보 수익률 비교</h3>
            <p className="ss-completed-visuals__scope">
              동일 순위 그룹 내 후보만 비교합니다.
            </p>
            <ul
              className="ss-completed-return-bars"
              data-testid="ss-completed-return-bars"
            >
              {candidates.map((row) => {
                const maxAbs = Math.max(
                  ...candidates.map((c) => Math.abs(c.netReturn ?? 0)),
                  0.01,
                );
                const width =
                  row.netReturn != null
                    ? `${Math.min(100, (Math.abs(row.netReturn) / maxAbs) * 100)}%`
                    : "0%";
                return (
                  <li key={row.id}>
                    <span className="ss-completed-return-bars__label">
                      {row.label}
                    </span>
                    <div className="ss-completed-return-bars__track">
                      <div
                        className="ss-completed-return-bars__fill"
                        style={{ width }}
                      />
                    </div>
                    <span className="ss-completed-return-bars__value">
                      {row.netReturn != null ? formatPct(row.netReturn) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="ss-completed-visuals__block ss-completed-visuals__block--risk">
            <h3 className="ss-completed-visuals__title">성과 · 위험 비교</h3>
            <div
              className="ss-completed-scatter-desktop"
              data-testid="ss-completed-return-mdd-scatter"
            >
              {candidates.map((row) => (
                <div
                  key={row.id}
                  className="ss-completed-scatter-desktop__point"
                  style={{
                    left: `${Math.min(92, Math.max(8, 50 + (row.netReturn ?? 0) * 120))}%`,
                    top: `${Math.min(88, Math.max(12, 50 - (row.maxDrawdown ?? 0) * 120))}%`,
                  }}
                  title={`${row.label} · ${formatPct(row.netReturn)} · MDD ${formatPct(row.maxDrawdown)}`}
                />
              ))}
            </div>
            <ul
              className="ss-completed-scatter-mobile"
              data-testid="ss-completed-return-mdd-cards"
            >
              {candidates.map((row) => (
                <li key={row.id} className="ss-completed-scatter-mobile__card">
                  <strong>{row.label}</strong>
                  <span>
                    수익률 {row.netReturn != null ? formatPct(row.netReturn) : "—"}
                  </span>
                  <span>
                    MDD{" "}
                    {row.maxDrawdown != null ? formatPct(row.maxDrawdown) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <p
        className="ss-completed-visuals__no-equity"
        data-testid="ss-completed-no-equity-chart"
      >
        누적 수익 곡선 데이터는 이 탐색 결과에 포함되어 있지 않습니다.
      </p>
    </section>
  );
}
