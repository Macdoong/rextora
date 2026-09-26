"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCount } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCountUpDisplay } from "./useCountUpDisplay";
import { useCompletedMotion } from "./useCompletedMotion";

export function CompletedPassFailDistribution(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion();
  const passed = props.model.passFail.passed ?? 0;
  const failed = props.model.passFail.failed ?? 0;
  const total = passed + failed;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const [ringPct, setRingPct] = useState(animate ? 0 : passRate);
  useEffect(() => {
    if (!animate) {
      setRingPct(passRate);
      return;
    }
    const start = performance.now();
    const duration = 620;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setRingPct(passRate * t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, passRate]);

  const passedDisplay = useCountUpDisplay(passed, { enabled: animate, durationMs: 600 });
  const failedDisplay = useCountUpDisplay(failed, { enabled: animate, durationMs: 600 });

  const circumference = 2 * Math.PI * 42;
  const dash = useMemo(
    () => (ringPct / 100) * circumference,
    [ringPct, circumference],
  );

  return (
    <section
      className="ss-completed-passfail-donut ss-completed-passfail-donut--enter"
      data-testid="ss-completed-passfail-donut"
      aria-label="평가 결과 분포"
    >
      <h3 className="ss-completed-passfail-donut__title">평가 결과</h3>
      <div className="ss-completed-passfail-donut__chart">
        <svg viewBox="0 0 100 100" className="ss-completed-passfail-donut__svg">
          <circle
            className="ss-completed-passfail-donut__track"
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="10"
          />
          <circle
            className="ss-completed-passfail-donut__pass"
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            data-testid="ss-completed-passfail-ring-pass"
            data-passed={passed}
            data-failed={failed}
          />
        </svg>
        <div className="ss-completed-passfail-donut__center">
          <span className="ss-completed-passfail-donut__rate">
            {passRate.toFixed(2)}%
          </span>
          <span className="ss-completed-passfail-donut__rate-label">통과율</span>
        </div>
      </div>
      <ul className="ss-completed-passfail-donut__legend">
        <li>
          <strong>{formatCount(Number(passedDisplay))}개</strong> 통과
        </li>
        <li>
          <strong>{formatCount(Number(failedDisplay))}개</strong> 실패
        </li>
        <li className="ss-completed-passfail-donut__total">
          총 {formatCount(total)}건 평가
        </li>
      </ul>
    </section>
  );
}
