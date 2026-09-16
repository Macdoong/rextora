"use client";

import { V3Gate, type V3GateState } from "@/components/rextora/v3/V3Gate";
import type { LiveGateOperatorChecklistItem } from "@/src/lib/rextora/live/liveGateOperatorPresentation";

function gateState(
  status: LiveGateOperatorChecklistItem["status"],
): V3GateState {
  if (status === "passed") return "success";
  if (status === "warning" || status === "needed") return "warning";
  return "danger";
}

function segmentClass(
  status: LiveGateOperatorChecklistItem["status"],
): string {
  if (status === "passed") return "is-pass";
  if (status === "warning" || status === "needed") return "is-wait";
  return "is-block";
}

export function LiveGateChecklist({
  items,
}: {
  items: LiveGateOperatorChecklistItem[];
}) {
  const passCount = items.filter((item) => item.status === "passed").length;
  const waitCount = items.filter(
    (item) => item.status === "needed" || item.status === "warning",
  ).length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return (
    <section className="v3-lv-gates" data-testid="live-gate-checklist">
      {items.length ? (
        <>
          <div
            className="v3-lv-segments"
            style={{
              gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
            }}
            data-testid="live-gate-segments"
            aria-label={`게이트 ${passCount} 통과, ${waitCount} 대기, ${blockedCount} 차단`}
          >
            {items.map((item, index) => (
              <i
                key={item.id}
                className={`v3-lv-segment ${segmentClass(item.status)}`}
                style={{ animationDelay: `${index * 36}ms` }}
                title={`${item.labelKo} · ${item.statusLabelKo}`}
              />
            ))}
          </div>
          <p className="v3-lv-segment-meta">
            통과 {passCount} · 대기 {waitCount} · 차단 {blockedCount}
          </p>
        </>
      ) : null}
      <h3 className="v3-lv-section-title">게이트 점검</h3>
      {items.map((item) => (
        <V3Gate
          key={item.id}
          label={item.labelKo}
          description={`${item.explanationKo} ${item.nextActionKo}`}
          state={gateState(item.status)}
          trailing={<em>{item.statusLabelKo}</em>}
          data-testid={`live-gate-check-${item.id}`}
        />
      ))}
    </section>
  );
}
