"use client";

import type { QualificationGaugeModel } from "./completedQualificationGauges";
import { usePresentationEnter } from "./usePresentationEnter";

function DirectionCue(props: { lowerIsBetter?: boolean }) {
  return (
    <p
      className="ss-completed-qual-bullet__direction ss-completed-type-caption"
      data-testid={
        props.lowerIsBetter
          ? "ss-completed-qual-direction-lower"
          : "ss-completed-qual-direction-higher"
      }
    >
      {props.lowerIsBetter ? "낮을수록 유리 ←" : "높을수록 유리 ↑"}
    </p>
  );
}

function BulletTrack(props: {
  thresholdLeft?: number;
  resultLeft: number;
  entered: boolean;
  animate: boolean;
}) {
  return (
    <div className="ss-completed-qual-bullet__track" aria-hidden="true">
      <div className="ss-completed-qual-bullet__baseline" />
      {props.thresholdLeft != null ? (
        <div
          className={
            "ss-completed-qual-bullet__marker ss-completed-qual-bullet__marker--threshold" +
            (props.animate && props.entered
              ? " ss-completed-qual-bullet__marker--animate-threshold"
              : "")
          }
          style={{ left: `${props.thresholdLeft * 100}%` }}
        />
      ) : null}
      <div
        className={
          "ss-completed-qual-bullet__marker ss-completed-qual-bullet__marker--result" +
          (props.animate && props.entered
            ? " ss-completed-qual-bullet__marker--animate-result"
            : "")
        }
        style={{ left: `${props.resultLeft * 100}%` }}
      />
    </div>
  );
}

export function CompletedQualificationGauge(props: {
  gauge: QualificationGaugeModel;
  delayMs: number;
  dataStable: boolean;
}) {
  const entered = usePresentationEnter(props.delayMs, props.dataStable);

  if (props.gauge.kind === "stability") {
    return (
      <article
        className={
          "ss-completed-qual-gauge ss-completed-qual-gauge--stability-status" +
          (entered ? " ss-completed-qual-gauge--entered" : "")
        }
        data-testid="ss-completed-qual-gauge-jitter"
      >
        <span
          className="ss-completed-qual-stability__icon"
          aria-hidden="true"
        >
          ✓
        </span>
        <h4 className="ss-completed-type-card-title">{props.gauge.label}</h4>
        <p className="ss-completed-qual-stability__subtitle">지터 검증</p>
        <p
          className={
            "ss-completed-qual-stability__status" +
            (entered ? " ss-completed-qual-stability__status--entered" : "")
          }
          data-testid="ss-completed-qual-stability-status"
        >
          {props.gauge.met ? "✓ 안정성 기준 통과" : "안정성 기준 미충족"}
        </p>
      </article>
    );
  }

  const g = props.gauge;

  return (
    <article
      className={
        "ss-completed-qual-gauge ss-completed-qual-gauge--bullet" +
        (g.kind === "lower-is-better" ? " ss-completed-qual-gauge--lower" : "") +
        (entered ? " ss-completed-qual-gauge--entered" : "")
      }
      data-testid={`ss-completed-qual-gauge-${g.id}`}
    >
      <header className="ss-completed-qual-gauge__head">
        <h4 className="ss-completed-type-card-title">{g.label}</h4>
        <span
          className={
            "ss-completed-qual-gauge__head-status" +
            (g.met ? " ss-completed-qual-gauge__head-status--pass" : "")
          }
        >
          {g.met ? "✓ 충족" : "미충족"}
        </span>
      </header>
      {g.kind === "lower-is-better" ? (
        <DirectionCue lowerIsBetter />
      ) : (
        <DirectionCue />
      )}
      {g.kind === "higher-is-better" ? (
        <BulletTrack
          thresholdLeft={g.thresholdMarkerRatio}
          resultLeft={g.resultMarkerRatio}
          entered={entered}
          animate
        />
      ) : g.kind === "lower-is-better" ? (
        <BulletTrack
          thresholdLeft={g.limitMarkerRatio}
          resultLeft={g.resultMarkerRatio}
          entered={entered}
          animate
        />
      ) : (
        <BulletTrack
          thresholdLeft={g.thresholdMarkerRatio}
          resultLeft={g.resultMarkerRatio}
          entered={entered}
          animate
        />
      )}
      <dl className="ss-completed-qual-gauge__facts">
        {g.kind === "higher-is-better" ? (
          <>
            <div>
              <dt className="ss-completed-type-caption">기준</dt>
              <dd>{g.thresholdPct}</dd>
            </div>
            <div>
              <dt className="ss-completed-type-caption">결과</dt>
              <dd data-testid={`ss-qual-gauge-result-${g.id}`}>{g.actualPct}</dd>
            </div>
          </>
        ) : g.kind === "lower-is-better" ? (
          <>
            <div>
              <dt className="ss-completed-type-caption">한도</dt>
              <dd>{g.limitPct}</dd>
            </div>
            <div>
              <dt className="ss-completed-type-caption">결과</dt>
              <dd data-testid={`ss-qual-gauge-result-${g.id}`}>{g.actualPct}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt className="ss-completed-type-caption">기준</dt>
              <dd>{g.minimum}회</dd>
            </div>
            <div>
              <dt className="ss-completed-type-caption">결과</dt>
              <dd data-testid={`ss-qual-gauge-result-${g.id}`}>{g.actual}회</dd>
            </div>
          </>
        )}
      </dl>
      <p className="ss-completed-qual-gauge__delta ss-completed-type-body">
        {g.deltaLabel}
      </p>
    </article>
  );
}
