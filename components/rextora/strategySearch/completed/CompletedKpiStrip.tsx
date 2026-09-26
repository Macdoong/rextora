"use client";

import { useEffect, useState } from "react";
import { formatCount, formatMs } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCountUpDisplay } from "./useCountUpDisplay";

function KpiCell(props: {
  label: string;
  value: number | null;
  testId: string;
  animate: boolean;
}) {
  const display = useCountUpDisplay(props.value, { enabled: props.animate });
  return (
    <div className="ss-completed-kpi__cell" data-testid={props.testId}>
      <span className="ss-completed-kpi__label">{props.label}</span>
      <strong className="ss-completed-kpi__value">
        {props.value == null ? "—" : formatCount(Number(display))}
      </strong>
    </div>
  );
}

export function CompletedKpiStrip(props: {
  model: CompletedDashboardViewModel;
}) {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setAnimate(false);
  }, []);

  const { funnel } = props.model;
  return (
    <section
      className="ss-completed-kpi ss-completed-kpi--enter"
      data-testid="ss-completed-kpi-strip"
      aria-label="탐색 결과 요약"
    >
      <KpiCell
        label="평가 후보"
        value={funnel.evaluated}
        testId="ss-completed-kpi-evaluated"
        animate={animate}
      />
      <KpiCell
        label="통과 후보"
        value={funnel.passed}
        testId="ss-completed-kpi-passed"
        animate={animate}
      />
      <KpiCell
        label="최종 적격"
        value={funnel.qualified}
        testId="ss-completed-kpi-qualified"
        animate={animate}
      />
      <div className="ss-completed-kpi__cell" data-testid="ss-completed-kpi-elapsed">
        <span className="ss-completed-kpi__label">탐색 시간</span>
        <strong className="ss-completed-kpi__value">
          {props.model.elapsedMs != null
            ? formatMs(props.model.elapsedMs)
            : "—"}
        </strong>
      </div>
    </section>
  );
}
