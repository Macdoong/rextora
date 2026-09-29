"use client";

import type { CompletedCandidateCompareRow } from "./completedViewModel";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import {
  formatCompositeScore,
  formatSignedReturnPct,
} from "./completedDisplayFormat";
import { formatMddAbsPct } from "../formatters";
import { usePresentationEnter } from "./usePresentationEnter";

function relBar(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.min(100, (value / max) * 100)}%`;
}

function useMatrixScales(rows: CompletedCandidateCompareRow[]) {
  const maxRet = Math.max(...rows.map((r) => Math.abs(r.netReturn ?? 0)), 0.01);
  const maxMdd = Math.max(
    ...rows.map((r) => Math.abs(r.maxDrawdown ?? 0)),
    0.01,
  );
  const maxTrades = Math.max(...rows.map((r) => r.tradeCount ?? 0), 1);
  return { maxRet, maxMdd, maxTrades };
}

export function CompletedCandidateMetricMatrix(props: {
  model: CompletedDashboardViewModel;
}) {
  const entered = usePresentationEnter(1100, props.model.dataStable);
  const rows = props.model.compareCandidates;
  if (rows.length === 0) return null;
  const scales = useMatrixScales(rows);
  const commonContext = props.model.compareCommonStrategyContext;

  return (
    <section
      className={
        "ss-completed-metric-matrix" +
        (entered ? " ss-completed-metric-matrix--entered" : "")
      }
      data-testid="ss-completed-candidate-matrix"
      aria-label="후보 지표 비교"
    >
      <h3 className="ss-completed-metric-matrix__title">후보 지표 비교</h3>
      {commonContext ? (
        <p
          className="ss-completed-metric-matrix__common"
          data-testid="ss-completed-compare-common-context"
        >
          {commonContext}
        </p>
      ) : null}

      <table
        className="ss-completed-metric-matrix__table ss-completed-metric-matrix__table--desktop"
        data-testid="ss-completed-matrix-desktop"
      >
        <thead>
          <tr>
            <th scope="col">후보</th>
            <th scope="col">수익률</th>
            <th scope="col">최대 낙폭</th>
            <th scope="col">거래</th>
            <th scope="col">종합 평가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid={`ss-completed-matrix-row-${row.rank}`}
              className={row.isRecommended ? "ss-completed-metric-matrix__rec" : ""}
            >
              <td>
                {row.isRecommended ? "★ " : ""}
                {row.displayPrimary}
              </td>
              <td>
                <span>{formatSignedReturnPct(row.netReturn)}</span>
                <div className="ss-completed-metric-matrix__micro">
                  <div
                    style={{
                      width: relBar(Math.abs(row.netReturn ?? 0), scales.maxRet),
                    }}
                  />
                </div>
              </td>
              <td>
                <span>
                  {row.maxDrawdown != null
                    ? formatMddAbsPct(row.maxDrawdown)
                    : "—"}
                </span>
                <div className="ss-completed-metric-matrix__micro ss-completed-metric-matrix__micro--lower">
                  <div
                    style={{
                      width: relBar(
                        Math.abs(row.maxDrawdown ?? 0),
                        scales.maxMdd,
                      ),
                    }}
                  />
                </div>
              </td>
              <td>
                <span>{row.tradeCount ?? "—"}</span>
                <div className="ss-completed-metric-matrix__micro">
                  <div
                    style={{
                      width: relBar(row.tradeCount ?? 0, scales.maxTrades),
                    }}
                  />
                </div>
              </td>
              <td data-testid={`ss-matrix-score-${row.rank}`}>
                {formatCompositeScore(row.score)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul
        className="ss-completed-metric-matrix__cards ss-completed-metric-matrix__cards--mobile"
        data-testid="ss-completed-matrix-mobile"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className={
              "ss-completed-metric-matrix__card" +
              (row.isRecommended ? " ss-completed-metric-matrix__card--rec" : "")
            }
          >
            <strong>
              {row.displayPrimary}
              {row.isRecommended ? " · 추천" : ""}
            </strong>
            <div className="ss-completed-metric-matrix__card-metric">
              <span>수익률</span>
              <span>{formatSignedReturnPct(row.netReturn)}</span>
              <div className="ss-completed-metric-matrix__micro">
                <div
                  style={{
                    width: relBar(Math.abs(row.netReturn ?? 0), scales.maxRet),
                  }}
                />
              </div>
            </div>
            <div className="ss-completed-metric-matrix__card-metric">
              <span>최대 낙폭</span>
              <span>
                {row.maxDrawdown != null
                  ? formatMddAbsPct(row.maxDrawdown)
                  : "—"}
              </span>
              <div className="ss-completed-metric-matrix__micro ss-completed-metric-matrix__micro--lower">
                <div
                  style={{
                    width: relBar(
                      Math.abs(row.maxDrawdown ?? 0),
                      scales.maxMdd,
                    ),
                  }}
                />
              </div>
            </div>
            <div className="ss-completed-metric-matrix__card-metric">
              <span>거래수</span>
              <span>{row.tradeCount ?? "—"}회</span>
            </div>
            <div className="ss-completed-metric-matrix__card-metric">
              <span>종합 평가</span>
              <span>{formatCompositeScore(row.score)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
