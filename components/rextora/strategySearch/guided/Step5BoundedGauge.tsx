"use client";

import { parseBoundedPercent0To100 } from "./step5VisualShared";

export function Step5BoundedGauge(props: {
  labelKo: string;
  valuePercent: string;
  prefixKo?: "≤" | "≥";
  testId: string;
  gaugeKind: "maxMdd" | "minWinRate";
}) {
  const parsed = parseBoundedPercent0To100(props.valuePercent);
  const marker = parsed ?? 0;
  const valueLabel =
    parsed != null
      ? `${props.prefixKo ?? ""} ${parsed}%`.trim()
      : props.valuePercent.trim() || "—";

  return (
    <div
      className="ss-step5-bounded-gauge ss-step5-bounded-gauge--enter"
      data-testid={props.testId}
      data-gauge-kind={props.gaugeKind}
      aria-label={`${props.labelKo} ${valueLabel}`}
    >
      <div className="ss-step5-bounded-gauge__head">
        <span className="ss-step5-bounded-gauge__label">{props.labelKo}</span>
        <strong className="ss-step5-bounded-gauge__value">{valueLabel}</strong>
      </div>
      <div
        className="ss-step5-bounded-gauge__track"
        role="img"
        aria-hidden="true"
        data-testid={`${props.testId}-track`}
      >
        <span
          className="ss-step5-bounded-gauge__fill"
          style={{ ["--ss-gauge-pct" as string]: `${Math.min(100, Math.max(0, marker))}%` }}
        />
        <span
          className="ss-step5-bounded-gauge__marker"
          style={{ ["--ss-gauge-pct" as string]: `${Math.min(100, Math.max(0, marker))}%` }}
        />
      </div>
    </div>
  );
}
