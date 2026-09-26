"use client";

import type { SearchDepthProfileId } from "../formDefaults";
import { SEARCH_DEPTH_PROFILES, type DurationPresetId } from "../formDefaults";
import { guidedNumberClass, guidedSelectClass } from "./guidedFieldClass";
import { StrategySearchFieldHelp } from "./StrategySearchFieldHelp";

export const DURATION_PRESET_MINUTES: Record<
  Exclude<DurationPresetId, "custom">,
  string
> = {
  "60": "60",
  "180": "180",
  "360": "360",
  "720": "720",
  "1440": "1440",
};

const DURATION_PRESET_LABEL_KO: Record<
  Exclude<DurationPresetId, "custom">,
  string
> = {
  "60": "1시간",
  "180": "3시간",
  "360": "6시간",
  "720": "12시간",
  "1440": "24시간",
};

export function durationPresetLabelKo(
  preset: DurationPresetId,
  maxRuntimeMinutesOverride: string,
): string {
  if (preset === "custom") {
    const trimmed = maxRuntimeMinutesOverride.trim();
    return trimmed ? `${trimmed}분` : "직접 설정";
  }
  return (
    DURATION_PRESET_LABEL_KO[preset as Exclude<DurationPresetId, "custom">] ??
    `${maxRuntimeMinutesOverride}분`
  );
}

export function GuidedDurationControl(props: {
  durationPreset: DurationPresetId;
  maxRuntimeMinutesOverride: string;
  maxRuntimeError?: string;
  disabled?: boolean;
  prominent?: boolean;
  /** Hides redundant preset minute note (automatic Step 2 primary control). */
  suppressPresetNote?: boolean;
  label?: string;
  onDurationPreset: (preset: DurationPresetId) => void;
  onMaxRuntime: (value: string) => void;
}) {
  const sectionClass =
    "ss-guided-duration-control" +
    (props.prominent ? " ss-guided-duration-control--primary" : "");
  return (
    <div className={sectionClass} data-testid="ss-guided-duration-control">
      <label className="ss-guided-field" htmlFor="ss-duration-guided">
        <span className="ss-field-label mb-1 block">
          {props.label ?? "탐색 시간"}
        </span>
        <select
          id="ss-duration-guided"
          data-testid="ss-duration"
          className={guidedSelectClass}
          value={props.durationPreset}
          disabled={props.disabled}
          onChange={(e) =>
            props.onDurationPreset(e.target.value as DurationPresetId)
          }
        >
          <option value="60">1시간</option>
          <option value="180">3시간</option>
          <option value="360">6시간</option>
          <option value="720">12시간</option>
          <option value="1440">24시간</option>
          <option value="custom">직접 설정</option>
        </select>
      </label>

      {props.durationPreset === "custom" ? (
        <label className="ss-guided-field" htmlFor="ss-max-runtime-primary">
          <span className="ss-field-label mb-1 block">최대 실행 시간 (분)</span>
          <div className="ss-guided-control-unit">
            <input
              id="ss-max-runtime-primary"
              data-testid="ss-max-runtime-primary"
              className={guidedNumberClass}
              type="number"
              min={1}
              inputMode="numeric"
              value={props.maxRuntimeMinutesOverride}
              disabled={props.disabled}
              onChange={(e) => props.onMaxRuntime(e.target.value)}
            />
            <span className="ss-guided-control-unit__suffix" aria-hidden="true">
              분
            </span>
          </div>
          {props.maxRuntimeError ? (
            <span className="mt-1 block text-xs text-red-300" role="alert">
              {props.maxRuntimeError}
            </span>
          ) : null}
        </label>
      ) : props.suppressPresetNote ? null : (
        <p className="ss-guided-runtime-preset-note" data-testid="ss-runtime-preset-note">
          최대 실행 시간:{" "}
          {DURATION_PRESET_MINUTES[
            props.durationPreset as Exclude<DurationPresetId, "custom">
          ] ?? props.maxRuntimeMinutesOverride}
          분 (프리셋)
        </p>
      )}
    </div>
  );
}

export function GuidedApproachEssentials(props: {
  depthProfile: SearchDepthProfileId;
  depthHint: string;
  durationPreset: DurationPresetId;
  maxRuntimeMinutesOverride: string;
  maxRuntimeError?: string;
  disabled?: boolean;
  layout?: "full" | "depthOnly";
  onDepth: (id: SearchDepthProfileId) => void;
  onDurationPreset: (preset: DurationPresetId) => void;
  onMaxRuntime: (value: string) => void;
}) {
  const layout = props.layout ?? "full";
  return (
    <section
      className="ss-guided-approach-essentials"
      data-testid="ss-guided-approach-essentials"
      data-layout={layout}
    >
      {layout === "full" ? (
        <h3 className="ss-guided-approach-essentials__title">탐색 깊이 · 시간</h3>
      ) : null}
      <div className="ss-guided-approach-essentials__grid">
        <label className="ss-guided-field" htmlFor="ss-depth-guided">
          <span className="ss-field-label mb-1 block">
            탐색 수준
            <StrategySearchFieldHelp fieldId="depthProfile" />
          </span>
          <select
            id="ss-depth-guided"
            data-testid="ss-depth"
            className={guidedSelectClass}
            value={props.depthProfile}
            disabled={props.disabled}
            onChange={(e) =>
              props.onDepth(e.target.value as SearchDepthProfileId)
            }
          >
            {(Object.keys(SEARCH_DEPTH_PROFILES) as SearchDepthProfileId[]).map(
              (id) => (
                <option key={id} value={id}>
                  {SEARCH_DEPTH_PROFILES[id].labelKo}
                </option>
              ),
            )}
          </select>
          <span className="ss-helper mt-1 block">{props.depthHint}</span>
        </label>

        {layout === "full" ? (
          <GuidedDurationControl
            durationPreset={props.durationPreset}
            maxRuntimeMinutesOverride={props.maxRuntimeMinutesOverride}
            maxRuntimeError={props.maxRuntimeError}
            disabled={props.disabled}
            onDurationPreset={props.onDurationPreset}
            onMaxRuntime={props.onMaxRuntime}
          />
        ) : null}
      </div>
    </section>
  );
}
