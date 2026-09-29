"use client";

import type { DurationPresetId } from "../formDefaults";
import {
  formatCustomDurationKo,
  STEP5_DURATION_PRESET_RAIL,
} from "./step5VisualShared";

export function Step5DurationPresetRail(props: {
  durationPreset: DurationPresetId;
  maxRuntimeMinutesOverride: string;
  testId?: string;
}) {
  const { durationPreset, maxRuntimeMinutesOverride } = props;
  const isCustom = durationPreset === "custom";

  if (isCustom) {
    return (
      <div
        className="ss-step5-duration-rail ss-step5-duration-rail--custom"
        data-testid={props.testId ?? "ss-step5-duration-rail"}
        aria-label={formatCustomDurationKo(maxRuntimeMinutesOverride)}
      >
        <span className="ss-step5-duration-rail__custom-badge">
          {formatCustomDurationKo(maxRuntimeMinutesOverride)}
        </span>
      </div>
    );
  }

  return (
    <div
      className="ss-step5-duration-rail"
      data-testid={props.testId ?? "ss-step5-duration-rail"}
      role="list"
      aria-label="탐색 시간 프리셋"
    >
      {STEP5_DURATION_PRESET_RAIL.map((slot) => {
        const selected = slot.id === durationPreset;
        return (
          <span
            key={slot.id}
            role="listitem"
            className={
              "ss-step5-duration-rail__slot" +
              (selected ? " ss-step5-duration-rail__slot--selected" : "")
            }
            data-duration-preset={slot.id}
            aria-current={selected ? "true" : undefined}
          >
            {slot.shortKo}
          </span>
        );
      })}
    </div>
  );
}
