"use client";

import type { RiskLimitRow } from "@/src/lib/rextora/risk/riskOperatorPresentation";
import { riskOperatorRecoveryCopy } from "@/src/lib/rextora/risk/riskOperatorPresentation";

export function RiskLimitsPanel({
  stateLabel,
  rows,
  usageById,
  recoveryKo,
}: {
  stateLabel: string;
  rows: RiskLimitRow[];
  usageById?: Record<string, number | null>;
  recoveryKo?: string | null;
}) {
  return (
    <section data-testid="risk-limits-panel">
      <p className="v3-lv-note" data-testid="risk-state-label">
        {stateLabel}
      </p>
      <ul className="v3-lv-stack" style={{ marginTop: 10, padding: 0, listStyle: "none" }}>
        {rows.map((row) => {
          const usage = usageById?.[row.id];
          const barWidth =
            usage == null ? null : Math.min(100, Math.max(0, usage * 100));
          return (
            <li
              key={row.id}
              className={`v3-lv-metric${row.breached ? " is-mismatch" : ""}`}
              data-testid={`risk-limit-${row.id}`}
            >
              <span>{row.labelKo}</span>
              <b className={row.breached ? "bad" : undefined}>{row.combinedLabel}</b>
              <small>
                현재 {row.currentLabel} · 제한 {row.limitLabel} · 차이{" "}
                {row.deltaLabel}
              </small>
              {barWidth == null ? null : (
                <div
                  className={`v3-progress${row.breached ? " is-breached" : ""}`}
                  aria-hidden="true"
                >
                  <i style={{ width: `${barWidth}%` }} />
                </div>
              )}
              {row.breached ? (
                <small>
                  원인: {row.labelKo} 한도 도달 ·{" "}
                  {riskOperatorRecoveryCopy(recoveryKo)}
                </small>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
