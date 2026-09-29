"use client";

import type { StrategySearchOperatorFormState } from "../formDefaults";
import { durationPresetLabelKo } from "./GuidedApproachEssentials";
import { qualifiedTargetComparisonProfileLabel } from "./qualifiedTargetComparisonProfileDisplay";
import { Step5BoundedGauge } from "./Step5BoundedGauge";

const TARGET_STOP_CONDITION_KO =
  "목표 조건 충족 후보 발견 시 종료";

function formatThresholdBadge(
  prefix: "≥" | "≤",
  value: string,
  suffix: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return `${prefix} ${trimmed}${suffix}`;
}

export function Step5TargetKpiPanel(props: {
  form: StrategySearchOperatorFormState;
}) {
  const { form } = props;
  const winRateSet = form.minWinRate.trim().length > 0;
  const scoreSet = form.minScore.trim().length > 0;

  return (
    <section
      className="ss-step5-target-kpi"
      data-testid="ss-guided-target-review"
      aria-label="목표 기준 자동 탐색"
    >
      <h3 className="ss-step5-target-kpi__title">목표 조건</h3>
      <div className="ss-step5-target-kpi__visual-grid" data-testid="ss-guided-target-metrics">
        <div
          className="ss-step5-target-kpi__badge ss-step5-target-kpi__badge--threshold"
          data-testid="ss-step5-target-min-return-badge"
          data-visual-kind="threshold-badge"
        >
          <span className="ss-step5-target-kpi__cell-label">최소 수익률</span>
          <strong className="ss-step5-target-kpi__cell-value">
            {formatThresholdBadge("≥", form.minTotalReturn, "%")}
          </strong>
        </div>

        <Step5BoundedGauge
          labelKo="최대 낙폭"
          valuePercent={form.maxMdd}
          prefixKo="≤"
          testId="ss-step5-target-max-mdd-gauge"
          gaugeKind="maxMdd"
        />

        <div
          className="ss-step5-target-kpi__badge ss-step5-target-kpi__badge--threshold"
          data-testid="ss-step5-target-min-trades-badge"
          data-visual-kind="threshold-badge"
        >
          <span className="ss-step5-target-kpi__cell-label">최소 거래 수</span>
          <strong className="ss-step5-target-kpi__cell-value">
            {formatThresholdBadge("≥", form.minTradeCount, "회")}
          </strong>
        </div>

        {winRateSet ? (
          <Step5BoundedGauge
            labelKo="최소 승률"
            valuePercent={form.minWinRate}
            prefixKo="≥"
            testId="ss-step5-target-min-win-rate-gauge"
            gaugeKind="minWinRate"
          />
        ) : null}

        {scoreSet ? (
          <div
            className="ss-step5-target-kpi__badge ss-step5-target-kpi__badge--threshold"
            data-testid="ss-step5-target-min-score-badge"
            data-visual-kind="threshold-badge"
          >
            <span className="ss-step5-target-kpi__cell-label">최소 점수</span>
            <strong className="ss-step5-target-kpi__cell-value">
              {formatThresholdBadge("≥", form.minScore, "")}
            </strong>
          </div>
        ) : null}
      </div>
      <dl className="ss-step5-target-kpi__meta">
        <div>
          <dt>후보 비교 기준</dt>
          <dd data-testid="ss-guided-target-comparison-profile">
            {qualifiedTargetComparisonProfileLabel(props.form.qualificationProfile)}
          </dd>
        </div>
        <div>
          <dt>최대 탐색 시간</dt>
          <dd>
            {durationPresetLabelKo(
              props.form.durationPreset,
              props.form.maxRuntimeMinutesOverride,
            )}
          </dd>
        </div>
        <div>
          <dt>종료 조건</dt>
          <dd>{TARGET_STOP_CONDITION_KO}</dd>
        </div>
      </dl>
    </section>
  );
}
