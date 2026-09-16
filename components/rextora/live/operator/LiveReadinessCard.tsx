"use client";

import type { LiveGateReadinessTone } from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export function LiveReadinessCard({
  tone,
  labelKo,
  detailKo,
}: {
  tone: LiveGateReadinessTone;
  labelKo: string;
  detailKo: string;
}) {
  const toneClass =
    tone === "ready" ? "ok" : tone === "blocked" ? "bad" : "warn";
  return (
    <section
      className="v3-lv-metric"
      data-testid="live-readiness-summary"
      data-tone={tone}
    >
      <span>실전 준비 요약</span>
      <b className={toneClass} data-testid="live-readiness-label">
        {labelKo}
      </b>
      <small>{detailKo}</small>
    </section>
  );
}
