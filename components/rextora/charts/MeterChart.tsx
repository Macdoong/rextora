"use client";

import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import type { MeterValue } from "@/src/lib/rextora/charts/types";

export function MeterChart({
  title,
  meters,
  compact = false
}: {
  title?: string;
  meters: MeterValue[];
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3" data-chart="meters">
      {title && <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>}
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        {meters.map((m) => {
          const color =
            m.tone === "up" ? CHART_THEME.up : m.tone === "down" ? CHART_THEME.down : m.tone === "warn" ? CHART_THEME.warning : CHART_THEME.accent;
          return (
            <div key={m.label}>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>{m.label}</span>
                <span>{Math.round(m.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-slate-800">
                <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, m.value))}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
