"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import {
  COMPLETED_COMPARE_SCORE_LABEL,
  formatCompositeScore,
  formatSignedReturnPct,
} from "./completedDisplayFormat";
import { CompletedCompareScoreCaption } from "./CompletedScoreHelp";
import { formatMddAbsPct, formatPct } from "../formatters";
import { usePresentationEnter } from "./usePresentationEnter";
import {
  compareBarDomainMax,
  compareBarWidthPct,
  compareThresholdMarkerPct,
} from "./completedCompareChartScale";

export function CompletedCandidateVisualComparison(props: {
  model: CompletedDashboardViewModel;
}) {
  const entered = usePresentationEnter(1100, props.model.dataStable);
  const rows = props.model.compareCandidates;
  if (rows.length === 0) return null;

  const passThresholds = props.model.analysisContext?.passThresholds;
  const minTotalReturn = passThresholds?.minTotalReturn ?? null;
  const maxMddLimit =
    passThresholds?.maxMdd != null
      ? Math.abs(passThresholds.maxMdd)
      : null;

  const retValues = rows.map((r) => Math.abs(r.netReturn ?? 0));
  const mddValues = rows.map((r) => Math.abs(r.maxDrawdown ?? 0));
  const retDomain = compareBarDomainMax(retValues, minTotalReturn);
  const mddDomain = compareBarDomainMax(mddValues, maxMddLimit);
  const maxTrades = Math.max(...rows.map((r) => r.tradeCount ?? 0), 1);
  const commonContext = props.model.compareCommonStrategyContext;

  return (
    <section
      className={
        "ss-completed-candidate-viz" +
        (entered ? " ss-completed-candidate-viz--entered" : "")
      }
      data-testid="ss-completed-candidate-matrix"
      aria-label="후보 지표 비교"
    >
      <h3 className="ss-completed-type-section">후보 지표 비교</h3>
      {commonContext ? (
        <p
          className="ss-completed-type-helper ss-completed-candidate-viz__common"
          data-testid="ss-completed-compare-common-context"
        >
          {commonContext}
        </p>
      ) : null}

      <div
        className="ss-completed-candidate-viz__desktop"
        data-testid="ss-completed-candidate-charts-desktop"
      >
        <article
          className="ss-completed-candidate-viz__chart"
          data-testid="ss-completed-chart-return"
        >
          <h4 className="ss-completed-type-card-title">수익률 비교</h4>
          {minTotalReturn != null ? (
            <p
              className="ss-completed-candidate-viz__threshold-caption"
              data-testid="ss-completed-return-threshold-label"
            >
              최소 수익률 기준 {formatPct(minTotalReturn) ?? ""}
            </p>
          ) : null}
          <ul className="ss-completed-candidate-viz__chart-list">
            {rows.map((row) => (
              <li key={`ret-${row.id}`}>
                <span className="ss-completed-candidate-viz__name">
                  {row.isRecommended ? "★ " : ""}
                  {row.displayPrimary}
                  <em className="ss-completed-candidate-viz__score">
                    {formatCompositeScore(row.score)}
                  </em>
                </span>
                <div className="ss-completed-candidate-viz__bar-wrap">
                  <div className="ss-completed-candidate-viz__bar-track">
                    <div
                      className="ss-completed-candidate-viz__bar ss-completed-candidate-viz__bar--return"
                      style={{
                        width: `${compareBarWidthPct(Math.abs(row.netReturn ?? 0), retDomain)}%`,
                      }}
                    />
                    {minTotalReturn != null ? (
                      <div
                        className="ss-completed-candidate-viz__threshold-line"
                        data-testid="ss-completed-return-threshold-marker"
                        style={{
                          left: `${compareThresholdMarkerPct(minTotalReturn, retDomain)}%`,
                        }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </div>
                <span className="ss-completed-type-metric">
                  {formatSignedReturnPct(row.netReturn)}
                </span>
              </li>
            ))}
          </ul>
          {minTotalReturn != null ? (
            <p className="ss-completed-candidate-viz__threshold-foot">
              기준 {formatPct(minTotalReturn) ?? ""}
            </p>
          ) : null}
        </article>
        <article
          className="ss-completed-candidate-viz__chart"
          data-testid="ss-completed-chart-mdd"
        >
          <h4 className="ss-completed-type-card-title">
            최대 낙폭 비교{" "}
            <span className="ss-completed-type-caption">(낮을수록 유리)</span>
          </h4>
          {maxMddLimit != null ? (
            <p
              className="ss-completed-candidate-viz__threshold-caption"
              data-testid="ss-completed-mdd-threshold-label"
            >
              한도 {formatMddAbsPct(maxMddLimit) ?? ""}
            </p>
          ) : null}
          <ul className="ss-completed-candidate-viz__chart-list">
            {rows.map((row) => (
              <li key={`mdd-${row.id}`}>
                <span className="ss-completed-candidate-viz__name">{row.displayPrimary}</span>
                <div className="ss-completed-candidate-viz__bar-wrap">
                  <div className="ss-completed-candidate-viz__bar-track">
                    <div
                      className="ss-completed-candidate-viz__bar ss-completed-candidate-viz__bar--mdd"
                      style={{
                        width: `${compareBarWidthPct(
                          Math.abs(row.maxDrawdown ?? 0),
                          mddDomain,
                        )}%`,
                      }}
                    />
                    {maxMddLimit != null ? (
                      <div
                        className="ss-completed-candidate-viz__threshold-line ss-completed-candidate-viz__threshold-line--mdd"
                        data-testid="ss-completed-mdd-threshold-marker"
                        style={{
                          left: `${compareThresholdMarkerPct(maxMddLimit, mddDomain)}%`,
                        }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </div>
                <span className="ss-completed-type-metric">
                  {row.maxDrawdown != null ? formatMddAbsPct(row.maxDrawdown) : "—"}
                </span>
              </li>
            ))}
          </ul>
          {maxMddLimit != null ? (
            <p className="ss-completed-candidate-viz__threshold-foot">
              한도 {formatMddAbsPct(maxMddLimit) ?? ""}
            </p>
          ) : null}
        </article>
        <article
          className="ss-completed-candidate-viz__chart"
          data-testid="ss-completed-chart-trades"
        >
          <h4 className="ss-completed-type-card-title">거래수 비교</h4>
          <ul className="ss-completed-candidate-viz__chart-list">
            {rows.map((row) => (
              <li key={`tr-${row.id}`}>
                <span className="ss-completed-candidate-viz__name">{row.displayPrimary}</span>
                <div className="ss-completed-candidate-viz__dots">
                  {Array.from({ length: Math.min(row.tradeCount ?? 0, 28) }).map((_, i) => (
                    <span key={i} className="ss-completed-candidate-viz__dot" />
                  ))}
                </div>
                <span className="ss-completed-type-metric">{row.tradeCount ?? "—"}회</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <ul
        className="ss-completed-candidate-viz__mobile"
        data-testid="ss-completed-matrix-mobile"
      >
        {rows.map((row) => {
          const retMet =
            minTotalReturn != null &&
            row.netReturn != null &&
            row.netReturn >= minTotalReturn;
          const mddMet =
            maxMddLimit != null &&
            row.maxDrawdown != null &&
            Math.abs(row.maxDrawdown) <= maxMddLimit;
          return (
            <li
              key={row.id}
              className={
                "ss-completed-candidate-viz__card" +
                (row.isRecommended ? " ss-completed-candidate-viz__card--rec" : "")
              }
              data-testid={`ss-completed-matrix-row-${row.rank}`}
            >
              <strong className="ss-completed-candidate-viz__card-title">
                {row.isRecommended && !row.displayPrimary.startsWith("★")
                  ? "★ "
                  : ""}
                {row.displayPrimary}
              </strong>
              <div className="ss-completed-candidate-viz__card-compact">
                <div className="ss-completed-candidate-viz__card-col">
                  <div className="ss-completed-candidate-viz__card-metric-head">
                    <span className="ss-completed-candidate-viz__card-label">수익률</span>
                    <span className="ss-completed-candidate-viz__card-value">
                      {formatSignedReturnPct(row.netReturn)}
                    </span>
                  </div>
                  <div className="ss-completed-candidate-viz__bar-track ss-completed-candidate-viz__bar-track--compact">
                    <div
                      className="ss-completed-candidate-viz__bar ss-completed-candidate-viz__bar--return"
                      style={{
                        width: `${compareBarWidthPct(Math.abs(row.netReturn ?? 0), retDomain)}%`,
                      }}
                    />
                  </div>
                  {minTotalReturn != null ? (
                    <span
                      className="ss-completed-candidate-viz__thresh-hint"
                      data-testid={`ss-matrix-return-thresh-${row.rank}`}
                    >
                      기준 {formatPct(minTotalReturn) ?? ""}{" "}
                      {retMet ? "✓" : "—"}
                    </span>
                  ) : null}
                </div>
                <div className="ss-completed-candidate-viz__card-col">
                  <div className="ss-completed-candidate-viz__card-metric-head">
                    <span className="ss-completed-candidate-viz__card-label">최대 낙폭</span>
                    <span className="ss-completed-candidate-viz__card-value">
                      {row.maxDrawdown != null ? formatMddAbsPct(row.maxDrawdown) : "—"}
                    </span>
                  </div>
                  <div className="ss-completed-candidate-viz__bar-track ss-completed-candidate-viz__bar-track--compact">
                    <div
                      className="ss-completed-candidate-viz__bar ss-completed-candidate-viz__bar--mdd"
                      style={{
                        width: `${compareBarWidthPct(
                          Math.abs(row.maxDrawdown ?? 0),
                          mddDomain,
                        )}%`,
                      }}
                    />
                  </div>
                  {maxMddLimit != null ? (
                    <span
                      className="ss-completed-candidate-viz__thresh-hint"
                      data-testid={`ss-matrix-mdd-thresh-${row.rank}`}
                    >
                      한도 {formatMddAbsPct(maxMddLimit) ?? ""}{" "}
                      {mddMet ? "✓" : "—"}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="ss-completed-candidate-viz__card-compact ss-completed-candidate-viz__card-compact--meta">
                <span>
                  <span className="ss-completed-candidate-viz__card-label">거래수</span>{" "}
                  {row.tradeCount ?? "—"}회
                </span>
                <span data-testid={`ss-matrix-score-${row.rank}`}>
                  <CompletedCompareScoreCaption
                    minScoreEnabled={props.model.minScoreEnabled}
                  />{" "}
                  {formatCompositeScore(row.score)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
