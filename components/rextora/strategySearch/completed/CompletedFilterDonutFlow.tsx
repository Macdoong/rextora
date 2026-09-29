"use client";

import { formatCount } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { usePresentationEnter } from "./usePresentationEnter";
import { useCompletedMotion } from "./useCompletedMotion";
import { CompletedPassRateHelp } from "./CompletedPassRateHelp";

const MIN_TERMINAL_VISUAL_PCT = 10;

/** Step-reduction bar width; terminal stages get a minimum visual width when count > 0. */
function waterfallVisualPct(
  count: number,
  baseline: number,
  terminal: boolean,
): number {
  if (baseline <= 0 || count <= 0) return terminal ? MIN_TERMINAL_VISUAL_PCT : 0;
  const ratio = (count / baseline) * 100;
  if (terminal) return Math.max(ratio, MIN_TERMINAL_VISUAL_PCT);
  return Math.min(100, ratio);
}

export function CompletedFilterDonutFlow(props: {
  model: CompletedDashboardViewModel;
}) {
  const entered = usePresentationEnter(300, props.model.dataStable);
  const motion = useCompletedMotion() && props.model.dataStable && entered;
  const { funnel, passFail, passRatePct } = props.model;
  const generated = funnel.generated;
  const evaluated = funnel.evaluated;
  const passed = passFail.passed ?? funnel.passed ?? 0;
  const failed = passFail.failed ?? 0;
  const qualified = funnel.qualified;
  const evaluatedForRate = evaluated ?? (passed + failed || 0);
  const passRate =
    passRatePct ??
    (evaluatedForRate > 0 ? (passed / evaluatedForRate) * 100 : 0);
  const baseline = evaluatedForRate > 0 ? evaluatedForRate : 1;
  const showGeneratedContext =
    generated != null &&
    evaluated != null &&
    generated !== evaluated;

  return (
    <section
      className={
        "ss-completed-waterfall" +
        (entered ? " ss-completed-waterfall--entered" : "") +
        (motion ? " ss-completed-waterfall--motion" : "")
      }
      data-testid="ss-completed-verification-flow"
      aria-label="후보 검증 흐름"
    >
      <h3 className="ss-completed-type-section">후보 검증 흐름</h3>
      <div
        className="ss-completed-waterfall__headline ss-completed-type-metric"
        data-testid="ss-completed-verification-headline"
      >
        {formatCount(passed)}개 통과 / {formatCount(evaluatedForRate)}개 평가
      </div>
      <div className="ss-completed-waterfall__secondary ss-completed-type-helper">
        <span data-testid="ss-waterfall-failed-count">
          {formatCount(failed)}개 탈락
        </span>
        {passRatePct != null ? (
          <>
            <span aria-hidden="true"> · </span>
            <span>통과율 {passRate.toFixed(2)}%</span>
            <CompletedPassRateHelp
              evaluated={evaluatedForRate}
              passed={passed}
              passRatePct={passRate}
            />
          </>
        ) : null}
      </div>

      <div
        className="ss-completed-waterfall__chart"
        data-testid="ss-completed-waterfall-chart"
      >
        {showGeneratedContext ? (
          <div
            className="ss-completed-waterfall__row ss-completed-waterfall__row--gen"
            data-testid="ss-verification-flow-generated"
          >
            <div className="ss-completed-waterfall__row-head">
              <span className="ss-completed-type-caption">후보 생성</span>
              <span className="ss-completed-type-metric">{formatCount(generated)}</span>
            </div>
          </div>
        ) : generated != null ? (
          <span className="ss-completed-waterfall__gen-hint ss-completed-type-helper">
            <span data-testid="ss-verification-flow-generated">
              후보 생성 {formatCount(generated)}
            </span>
          </span>
        ) : null}

        <div
          className="ss-completed-waterfall__row ss-completed-waterfall__row--eval"
          data-testid="ss-verification-flow-evaluated"
        >
          <div className="ss-completed-waterfall__row-head">
            <span className="ss-completed-type-caption">평가 후보</span>
            <span
              className="ss-completed-type-metric"
              data-testid="ss-waterfall-value-evaluated"
            >
              {evaluated == null ? "—" : formatCount(evaluated)}
            </span>
          </div>
          <div className="ss-completed-waterfall__track">
            <div
              className="ss-completed-waterfall__fill ss-completed-waterfall__fill--eval"
              data-visual-width="presentation"
              style={{ width: `${waterfallVisualPct(evaluatedForRate, baseline, false)}%` }}
            />
          </div>
        </div>

        <div
          className="ss-completed-waterfall__row ss-completed-waterfall__row--fail"
          data-testid="ss-verification-flow-rejected"
        >
          <div className="ss-completed-waterfall__row-head">
            <span className="ss-completed-type-caption">검증 탈락</span>
            <span
              className="ss-completed-type-metric"
              data-testid="ss-waterfall-value-failed"
            >
              {formatCount(failed)}
            </span>
          </div>
          <div className="ss-completed-waterfall__track">
            <div
              className="ss-completed-waterfall__fill ss-completed-waterfall__fill--fail"
              data-visual-width="presentation"
              style={{ width: `${waterfallVisualPct(failed, baseline, false)}%` }}
            />
          </div>
        </div>

        <div
          className="ss-completed-waterfall__row ss-completed-waterfall__row--pass"
          data-testid="ss-verification-flow-passed"
        >
          <div className="ss-completed-waterfall__row-head">
            <span className="ss-completed-type-caption">검증 통과</span>
            <span
              className="ss-completed-type-metric"
              data-testid="ss-waterfall-value-passed"
            >
              {formatCount(passed)}
            </span>
          </div>
          <div className="ss-completed-waterfall__track">
            <div
              className="ss-completed-waterfall__fill ss-completed-waterfall__fill--pass"
              data-visual-width="presentation"
              style={{
                width: `${waterfallVisualPct(passed, baseline, true)}%`,
              }}
            />
          </div>
        </div>

        <div
          className="ss-completed-waterfall__row ss-completed-waterfall__row--qualified"
          data-testid="ss-verification-flow-qualified"
        >
          <div className="ss-completed-waterfall__row-head">
            <span className="ss-completed-type-caption">최종 적격</span>
            <span
              className="ss-completed-type-metric"
              data-testid="ss-waterfall-value-qualified"
            >
              {formatCount(qualified)} ✓
            </span>
          </div>
          <div className="ss-completed-waterfall__track">
            <div
              className="ss-completed-waterfall__fill ss-completed-waterfall__fill--qual"
              data-visual-width="presentation"
              style={{
                width: `${waterfallVisualPct(qualified, baseline, true)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
