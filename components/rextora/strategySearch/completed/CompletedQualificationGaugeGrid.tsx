"use client";

import { buildQualificationGaugeModels } from "./completedQualificationGauges";
import { CompletedQualificationGauge } from "./CompletedQualificationGauge";
import type { CompletedDashboardViewModel } from "./completedViewModel";

export function CompletedQualificationGaugeGrid(props: {
  model: CompletedDashboardViewModel;
}) {
  const gauges = buildQualificationGaugeModels(props.model);
  if (gauges.length === 0) return null;

  return (
    <section
      className="ss-completed-qual-gauge-grid"
      data-testid="ss-completed-qualification-gauges"
      aria-label="검증 기준 충족 여부"
    >
      <h3 className="ss-completed-qual-gauge-grid__title ss-completed-type-section">검증 기준</h3>
      <div className="ss-completed-qual-gauge-grid__cards">
        {gauges.map((g, i) => (
          <CompletedQualificationGauge
            key={g.id}
            gauge={g}
            delayMs={700 + i * 120}
            dataStable={props.model.dataStable}
          />
        ))}
      </div>
    </section>
  );
}
