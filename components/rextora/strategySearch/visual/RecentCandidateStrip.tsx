"use client";

import type { CSSProperties } from "react";
import {
  formatCount,
  formatMddAbsPct,
  formatPct,
  formatScore,
} from "../formatters";
import type { CandidateVisualItem } from "./runningVisualModel";
import {
  candidateItemIsEntering,
  enteringStaggerIndex,
  recentCandidateStripItems,
} from "./runningVisualModel";

function outcomeMark(outcome: CandidateVisualItem["outcome"]): string {
  if (outcome === "rejected") return "×";
  if (outcome === "gate_passed") return "✓";
  return "·";
}

function outcomeLabelKo(outcome: CandidateVisualItem["outcome"]): string {
  if (outcome === "rejected") return "탈락";
  if (outcome === "gate_passed") return "평가 통과";
  return "평가";
}

function metricLines(item: CandidateVisualItem): string[] {
  const metrics = item.metrics;
  if (!metrics) return [];
  const lines: string[] = [];
  const net = formatPct(metrics.netReturn);
  if (net) lines.push(`수익률 ${net}`);
  const mdd = formatMddAbsPct(metrics.mdd);
  if (mdd) lines.push(`MDD ${mdd}`);
  if (metrics.tradeCount != null && Number.isFinite(metrics.tradeCount)) {
    lines.push(`거래 ${formatCount(metrics.tradeCount)}회`);
  }
  const win = formatPct(metrics.winRate);
  if (win) lines.push(`승률 ${win}`);
  if (metrics.profitFactor != null && Number.isFinite(metrics.profitFactor)) {
    lines.push(`수익비 ${metrics.profitFactor.toFixed(2)}`);
  }
  const score = formatScore(metrics.score);
  if (score) lines.push(`점수 ${score}`);
  return lines;
}

export function RecentCandidateStrip({
  items,
  freshKeys,
}: {
  items: readonly CandidateVisualItem[];
  freshKeys: ReadonlySet<string>;
}) {
  const visible = recentCandidateStripItems(items);

  return (
    <section
      className="ss-cand-strip"
      data-testid="ss-running-recent-strip"
      aria-label="최근 후보"
    >
      <h3 className="ss-cand-strip__title">최근 후보</h3>
      {visible.length === 0 ? (
        <p
          className="ss-cand-strip__empty"
          data-testid="ss-running-recent-strip-empty"
        >
          아직 평가된 후보가 없습니다.
        </p>
      ) : (
        <ol className="ss-cand-strip__list">
          {visible.map((item) => {
            const entering = candidateItemIsEntering(item, freshKeys);
            const lines = metricLines(item);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={
                    "ss-strip-cell" + (entering ? " is-entering" : "")
                  }
                  data-testid={`ss-strip-cell-${item.evaluatedCount}`}
                  data-outcome={item.outcome}
                  data-enter={entering ? "true" : "false"}
                  data-sequence={item.sequenceLabel}
                  aria-label={`후보 ${item.evaluatedCount} ${outcomeLabelKo(item.outcome)}${
                    lines.length > 0 ? ` · ${lines.join(" · ")}` : ""
                  }`}
                  style={
                    entering
                      ? ({
                          "--enter-i": enteringStaggerIndex(
                            visible,
                            item,
                            freshKeys,
                          ),
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <span aria-hidden="true">{outcomeMark(item.outcome)}</span>
                  {lines.length > 0 ? (
                    <span
                      className="ss-strip-tip"
                      role="tooltip"
                      data-testid={`ss-strip-metrics-${item.evaluatedCount}`}
                    >
                      <strong>후보 {item.evaluatedCount}</strong>
                      {lines.map((line) => (
                        <em key={line}>{line}</em>
                      ))}
                    </span>
                  ) : (
                    <span className="ss-strip-tip" role="tooltip">
                      <strong>후보 {item.evaluatedCount}</strong>
                      <em>{outcomeLabelKo(item.outcome)}</em>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
