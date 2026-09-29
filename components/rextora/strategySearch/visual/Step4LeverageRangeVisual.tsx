"use client";

import type { LeverageModeId } from "../formDefaults";

function parseLeverage(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(20, n);
}

export function Step4LeverageRangeVisual(props: {
  leverageMode: LeverageModeId;
  leverageFixed: string;
  leverageMin: string;
  leverageMax: string;
}) {
  const trackMax = 20;
  let min = 1;
  let max = 1;
  let modeLabel = "";

  switch (props.leverageMode) {
    case "disabled":
      modeLabel = "1x 고정";
      min = 1;
      max = 1;
      break;
    case "fixed": {
      const fixed = parseLeverage(props.leverageFixed);
      min = fixed;
      max = fixed;
      modeLabel = `${fixed}x 고정`;
      break;
    }
    case "automatic":
      modeLabel = "자동 추천 범위";
      min = parseLeverage(props.leverageMin);
      max = parseLeverage(props.leverageMax);
      if (max < min) max = min;
      break;
    case "range":
      modeLabel = "범위 탐색";
      min = parseLeverage(props.leverageMin);
      max = parseLeverage(props.leverageMax);
      if (max < min) max = min;
      break;
    default:
      break;
  }

  const leftPct = ((min - 1) / (trackMax - 1)) * 100;
  const widthPct = Math.max(((max - min) / (trackMax - 1)) * 100, min === max ? 2 : 0);

  return (
    <div
      className="ss-step4-leverage-visual"
      data-testid="ss-step4-leverage-visual"
      data-leverage-mode={props.leverageMode}
      aria-hidden={props.leverageMode === "disabled" ? undefined : undefined}
    >
      <div className="ss-step4-leverage-visual__meta">
        <span className="ss-step4-leverage-visual__mode">{modeLabel}</span>
        {props.leverageMode !== "disabled" ? (
          <span className="ss-step4-leverage-visual__range-label">
            {min}x — {max}x
          </span>
        ) : null}
      </div>
      <div className="ss-step4-leverage-visual__track" aria-hidden="true">
        <div
          className="ss-step4-leverage-visual__fill"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </div>
      <div
        className="ss-step4-leverage-visual__scale"
        data-testid="ss-step4-leverage-visual-scale"
        aria-hidden="true"
      >
        <span className="ss-step4-leverage-visual__domain ss-step4-leverage-visual__domain--min">
          1x
        </span>
        <span className="ss-step4-leverage-visual__domain ss-step4-leverage-visual__domain--max">
          {trackMax}x
        </span>
      </div>
    </div>
  );
}
