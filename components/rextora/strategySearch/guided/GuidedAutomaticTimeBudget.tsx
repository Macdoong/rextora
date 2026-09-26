"use client";

import {
  HISTORICAL_PERIOD_PRESETS,
  type DurationPresetId,
  type HistoricalPeriodPresetId,
} from "../formDefaults";
import { periodPresetHint } from "../visual/searchVisualCopy";
import { timeframeBarLabel } from "../visual/searchScopeVisual";
import { GuidedDurationControl } from "./GuidedApproachEssentials";
import { GuidedAutomaticObjectivePanel } from "./GuidedAutomaticObjectivePanel";

export function automaticAnalysisSummaryLine(props: {
  symbol: string;
  timeframe: string;
  periodPreset: HistoricalPeriodPresetId;
}): string {
  const period =
    props.periodPreset === "custom"
      ? periodPresetHint("custom")
      : `최근 ${HISTORICAL_PERIOD_PRESETS[props.periodPreset].days}일`;
  return `${props.symbol} · ${timeframeBarLabel(props.timeframe)} · ${period}`;
}

export function GuidedAutomaticTimeBudget(props: {
  symbol: string;
  timeframe: string;
  periodPreset: HistoricalPeriodPresetId;
  durationPreset: DurationPresetId;
  maxRuntimeMinutesOverride: string;
  maxRuntimeError?: string;
  disabled?: boolean;
  onDurationPreset: (preset: DurationPresetId) => void;
  onMaxRuntime: (value: string) => void;
}) {
  const analysisLine = (
    <p
      className="ss-guided-auto-time-budget__analysis-line"
      data-testid="ss-auto-analysis-summary-compact"
    >
      <span className="ss-guided-auto-time-budget__analysis-label">분석 조건</span>
      {automaticAnalysisSummaryLine(props)}
    </p>
  );

  return (
    <GuidedAutomaticObjectivePanel
      objective="time_budget"
      testId="ss-guided-auto-time-budget"
      compactGuidanceTestId="ss-auto-time-guidance"
      analysisLine={analysisLine}
    >
      <div className="ss-guided-auto-time-budget__duration">
        <GuidedDurationControl
          durationPreset={props.durationPreset}
          maxRuntimeMinutesOverride={props.maxRuntimeMinutesOverride}
          maxRuntimeError={props.maxRuntimeError}
          disabled={props.disabled}
          onDurationPreset={props.onDurationPreset}
          onMaxRuntime={props.onMaxRuntime}
          prominent
          suppressPresetNote
        />
      </div>
    </GuidedAutomaticObjectivePanel>
  );
}
