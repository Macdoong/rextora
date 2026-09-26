"use client";

import { formatMddAbsPct, formatPct } from "../formatters";
import { buildReturnMddScatterLayout } from "./completedChartScale";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCompletedMotion } from "./useCompletedMotion";

export function CompletedReturnRiskChart(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion();
  const layout = buildReturnMddScatterLayout(props.model.compareCandidates);
  const candidates = props.model.compareCandidates.filter(
    (c) => c.netReturn != null || c.maxDrawdown != null,
  );

  if (candidates.length === 0) return null;

  return (
    <section
      className="ss-completed-risk-chart ss-completed-risk-chart--enter"
      data-testid="ss-completed-return-risk-section"
      aria-label="성과 위험 비교"
    >
      <h3 className="ss-completed-risk-chart__title">성과 · 위험 비교</h3>
      <p className="ss-completed-risk-chart__hint">
        왼쪽일수록 낙폭이 낮음 · 위쪽일수록 수익률이 높음
      </p>

      {layout ? (
        <div
          className="ss-completed-risk-chart__desktop"
          data-testid="ss-completed-return-mdd-scatter"
        >
          <svg
            viewBox="0 0 100 100"
            className="ss-completed-risk-chart__svg"
            role="img"
            aria-label="수익률 대 최대 낙폭 산점도"
          >
            {[20, 50, 80].map((y) => (
              <line
                key={`gy-${y}`}
                x1="12"
                y1={y}
                x2="96"
                y2={y}
                className="ss-completed-risk-chart__grid"
              />
            ))}
            {[25, 50, 75].map((x) => (
              <line
                key={`gx-${x}`}
                x1={x}
                y1="8"
                x2={x}
                y2="92"
                className="ss-completed-risk-chart__grid"
              />
            ))}
            <line x1="12" y1="92" x2="96" y2="92" className="ss-completed-risk-chart__axis" />
            <line x1="12" y1="8" x2="12" y2="92" className="ss-completed-risk-chart__axis" />
            <text x="54" y="99" className="ss-completed-risk-chart__axis-label">
              최대 낙폭
            </text>
            <text
              x="4"
              y="50"
              className="ss-completed-risk-chart__axis-label ss-completed-risk-chart__axis-label--y"
            >
              수익률
            </text>
            {layout.axes.xTicks.map((tick, i) => (
              <text
                key={`xt-${i}`}
                x={12 + (i / (layout.axes.xTicks.length - 1)) * 84}
                y="97"
                className="ss-completed-risk-chart__tick"
              >
                {formatMddAbsPct(tick) ?? ""}
              </text>
            ))}
            {layout.axes.yTicks.map((tick, i) => (
              <text
                key={`yt-${i}`}
                x="8"
                y={92 - (i / (layout.axes.yTicks.length - 1)) * 84}
                className="ss-completed-risk-chart__tick ss-completed-risk-chart__tick--y"
              >
                {formatPct(tick) ?? ""}
              </text>
            ))}
            {layout.points.map((pt, index) => (
              <circle
                key={pt.id}
                className={
                  "ss-completed-risk-chart__point" +
                  (pt.isRecommended ? " ss-completed-risk-chart__point--rec" : "") +
                  (animate ? " ss-completed-risk-chart__point--animate" : "")
                }
                style={{ animationDelay: `${120 + index * 60}ms` }}
                cx={pt.xPct}
                cy={pt.yPct}
                r={pt.isRecommended ? 2.8 : 2.2}
                data-testid={
                  pt.isRecommended
                    ? "ss-completed-risk-point-recommended"
                    : "ss-completed-risk-point"
                }
                data-net-return={pt.netReturn}
                data-mdd-abs={pt.mddAbs}
              >
                <title>
                  {pt.label} · 수익률 {formatPct(pt.netReturn)} · MDD{" "}
                  {formatMddAbsPct(pt.mddAbs)}
                </title>
              </circle>
            ))}
          </svg>
        </div>
      ) : null}

      <ul
        className="ss-completed-risk-chart__mobile"
        data-testid="ss-completed-return-mdd-cards"
      >
        {candidates.map((row) => (
          <li
            key={row.id}
            className={
              "ss-completed-risk-chart__card" +
              (row.isRecommended ? " ss-completed-risk-chart__card--rec" : "")
            }
          >
            <strong>{row.label}</strong>
            <span>
              수익률 {row.netReturn != null ? formatPct(row.netReturn) : "—"}
            </span>
            <span>
              MDD{" "}
              {row.maxDrawdown != null ? formatMddAbsPct(row.maxDrawdown) : "—"}
            </span>
            {row.isRecommended ? (
              <span className="ss-completed-risk-chart__badge">추천</span>
            ) : null}
          </li>
        ))}
      </ul>

      <p
        className="ss-completed-visuals__no-equity"
        data-testid="ss-completed-no-equity-chart"
      >
        누적 수익 곡선 데이터는 이 탐색 결과에 포함되어 있지 않습니다.
      </p>
    </section>
  );
}
