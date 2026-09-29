"use client";

import type { StrategySearchOperatorFormState } from "../formDefaults";

function formatPercentCell(value: string, prefix: "≥" | "≤"): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return `${prefix} ${trimmed}%`;
}

function formatTradeCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return `≥ ${trimmed}회`;
}

export function GuidedValidationTargetKpis(props: {
  form: Pick<
    StrategySearchOperatorFormState,
    "minTotalReturn" | "maxMdd" | "minTradeCount" | "minWinRate" | "minScore"
  >;
  onEditStep?: () => void;
}) {
  const extra: { label: string; value: string }[] = [];
  if (props.form.minWinRate.trim()) {
    extra.push({
      label: "최소 승률",
      value: formatPercentCell(props.form.minWinRate, "≥"),
    });
  }
  if (props.form.minScore.trim()) {
    extra.push({
      label: "최소 점수",
      value: `≥ ${props.form.minScore.trim()}`,
    });
  }

  return (
    <section
      className="ss-guided-target-kpis ss-step4-enter"
      data-testid="ss-guided-target-summary"
      aria-label="목표 조건"
      style={{ ["--ss-step4-enter-i" as string]: 0 }}
    >
      <div className="ss-guided-target-kpis__head">
        <h3 className="ss-guided-target-kpis__title">목표 조건</h3>
        {props.onEditStep ? (
          <button
            type="button"
            className="ss-guided-target-kpis__edit"
            data-testid="ss-guided-target-edit-step2"
            onClick={props.onEditStep}
          >
            2단계에서 수정
          </button>
        ) : null}
      </div>
      <p
        className="ss-guided-target-kpis__managed sr-only"
        data-testid="ss-qualification-target-managed"
      >
        거래 수·수익률·승률·점수 기준은 2단계 목표 조건에서만 바꿉니다. 합격
        여부는 그 목표 조건으로 판단합니다.
      </p>
      <div className="ss-guided-target-kpis__grid">
        <div className="ss-guided-target-kpis__cell">
          <span className="ss-guided-target-kpis__label">최소 수익률</span>
          <span className="ss-guided-target-kpis__value">
            {formatPercentCell(props.form.minTotalReturn, "≥")}
          </span>
        </div>
        <div className="ss-guided-target-kpis__cell">
          <span className="ss-guided-target-kpis__label">최대 낙폭</span>
          <span className="ss-guided-target-kpis__value">
            {formatPercentCell(props.form.maxMdd, "≤")}
          </span>
        </div>
        <div className="ss-guided-target-kpis__cell">
          <span className="ss-guided-target-kpis__label">최소 거래 수</span>
          <span className="ss-guided-target-kpis__value">
            {formatTradeCell(props.form.minTradeCount)}
          </span>
        </div>
        {extra.map((row) => (
          <div
            key={row.label}
            className="ss-guided-target-kpis__cell ss-guided-target-kpis__cell--extra"
          >
            <span className="ss-guided-target-kpis__label">{row.label}</span>
            <span className="ss-guided-target-kpis__value">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
