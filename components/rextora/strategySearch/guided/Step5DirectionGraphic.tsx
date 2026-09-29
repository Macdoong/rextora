"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Step5DirectionKind } from "./step5VisualShared";

const DIRECTION_ARIA: Record<Step5DirectionKind, string> = {
  long: "롱 방향",
  short: "숏 방향",
  both: "양방향",
};

export function Step5DirectionGraphic(props: {
  direction: Step5DirectionKind;
  testId?: string;
}) {
  const { direction } = props;
  return (
    <span
      className="ss-step5-direction-graphic"
      data-testid={props.testId ?? "ss-step5-direction-graphic"}
      data-direction={direction}
      aria-label={DIRECTION_ARIA[direction]}
    >
      {direction === "short" || direction === "both" ? (
        <ArrowLeft className="ss-step5-direction-graphic__icon" aria-hidden />
      ) : null}
      {direction === "long" || direction === "both" ? (
        <ArrowRight className="ss-step5-direction-graphic__icon" aria-hidden />
      ) : null}
    </span>
  );
}
