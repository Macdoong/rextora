"use client";

import type { StrategySearchOperatorFormState } from "../formDefaults";
import {
  HISTORICAL_PERIOD_PRESETS,
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  type HistoricalPeriodPresetId,
  type TradingStyleId,
} from "../formDefaults";
import { StrategyAutoPresetPanel } from "./StrategyAutoPresetPanel";
import { StrategyPatternLayerPanel } from "./StrategyPatternLayerPanel";
import { StrategySearchModeSelector } from "./StrategySearchModeSelector";
import { StrategySearchScopeMap } from "./StrategySearchScopeMap";
import { StrategyTradeRulePanel } from "./StrategyTradeRulePanel";
import { GuidedCustomPeriodFields } from "../guided/GuidedCustomPeriodFields";
import { GuidedModeOutcomePanel } from "../guided/GuidedModeOutcomePanel";
import {
  guidedControlClass,
  guidedSelectClass,
} from "../guided/guidedFieldClass";
import {
  periodPresetHint,
  timeframeCandleHint,
} from "./searchVisualCopy";
import type { SearchScopeProgress } from "./searchScopeVisual";

const selectClass = "ss-input ss-visual-select ss-field-select mt-1";
const guidedMarketSelect = `${guidedSelectClass} ss-visual-select`;

export type StrategySearchVisualBuilderPanels = {
  mode?: boolean;
  market?: boolean;
  /** Shorthand: both workspaceControls and scopeMap. */
  workspace?: boolean;
  workspaceControls?: boolean;
  scopeMap?: boolean;
};

const DEFAULT_PANELS = {
  mode: true,
  market: true,
  workspace: true,
  workspaceControls: true,
  scopeMap: true,
};

/** Resolves which visual-builder regions mount (exported for integration tests). */
export function resolveVisualBuilderPanels(
  panelsProp?: StrategySearchVisualBuilderPanels,
): {
  mode: boolean;
  market: boolean;
  workspaceControls: boolean;
  scopeMap: boolean;
} {
  const merged = { ...DEFAULT_PANELS, ...panelsProp };
  if (panelsProp?.workspace === false) {
    if (panelsProp.workspaceControls === undefined) {
      merged.workspaceControls = false;
    }
    if (panelsProp.scopeMap === undefined) {
      merged.scopeMap = false;
    }
  } else if (panelsProp?.workspace === true) {
    if (panelsProp.workspaceControls === undefined) {
      merged.workspaceControls = true;
    }
    if (panelsProp.scopeMap === undefined) {
      merged.scopeMap = true;
    }
  }
  return {
    mode: merged.mode,
    market: merged.market,
    workspaceControls: merged.workspaceControls,
    scopeMap: merged.scopeMap,
  };
}

export function StrategySearchVisualBuilder({
  form,
  automatic,
  disabled,
  symbolError,
  timeframeError,
  periodError,
  progress,
  panels: panelsProp,
  onSelectAutomatic,
  onSelectDirect,
  onSymbol,
  onTimeframe,
  onPeriod,
  onTradingStyle,
  onDirection,
  onToggleLayer,
  onCustomPeriodFrom,
  onCustomPeriodTo,
}: {
  form: StrategySearchOperatorFormState;
  automatic: boolean;
  disabled?: boolean;
  symbolError?: string;
  timeframeError?: string;
  periodError?: string;
  progress?: SearchScopeProgress | null;
  panels?: StrategySearchVisualBuilderPanels;
  onSelectAutomatic: () => void;
  onSelectDirect: () => void;
  onSymbol: (symbol: string) => void;
  onTimeframe: (timeframe: string) => void;
  onPeriod: (preset: HistoricalPeriodPresetId) => void;
  onTradingStyle: (style: TradingStyleId) => void;
  onDirection: (value: "both" | "long" | "short") => void;
  onToggleLayer: (id: string, next: boolean) => void;
  onCustomPeriodFrom?: (value: string) => void;
  onCustomPeriodTo?: (value: string) => void;
}) {
  const resolved = resolveVisualBuilderPanels(panelsProp);
  const showControls = resolved.workspaceControls;
  const showMap = resolved.scopeMap;
  const panels = resolved;
  return (
    <div
      className="ss-visual-builder"
      data-testid="ss-visual-builder"
      data-selection-mode={automatic ? "automatic" : "manual"}
    >
      {panels.mode ? (
        <>
          <StrategySearchModeSelector
            automatic={automatic}
            disabled={disabled}
            onSelectAutomatic={onSelectAutomatic}
            onSelectDirect={onSelectDirect}
          />
          <GuidedModeOutcomePanel mode={automatic ? "automatic" : "manual"} />
        </>
      ) : null}

      {panels.market ? (
      <div className="ss-visual-market">
        <label className="block" htmlFor="ss-symbol">
          <span className="ss-field-label mb-1 block">코인</span>
          <select
            id="ss-symbol"
            data-testid="ss-symbols"
            className={panels.market ? guidedMarketSelect : selectClass}
            value={form.symbol}
            disabled={disabled}
            onChange={(event) => onSymbol(event.target.value)}
          >
            {OPERATOR_SUPPORTED_SYMBOLS.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          {symbolError ? (
            <span className="mt-1 block text-xs text-red-300" role="alert">
              {symbolError}
            </span>
          ) : null}
        </label>

        <label className="block" htmlFor="ss-timeframe">
          <span className="ss-field-label mb-1 block">타임프레임</span>
          <select
            id="ss-timeframe"
            data-testid="ss-timeframe"
            className={panels.market ? guidedMarketSelect : selectClass}
            value={form.timeframe}
            disabled={disabled}
            onChange={(event) => onTimeframe(event.target.value)}
          >
            {OPERATOR_SUPPORTED_TIMEFRAMES.map((timeframe) => (
              <option key={timeframe} value={timeframe}>
                {timeframe}
              </option>
            ))}
          </select>
          <span className="ss-helper mt-1 block" data-testid="ss-timeframe-hint">
            {timeframeCandleHint(form.timeframe)}
          </span>
          {timeframeError ? (
            <span className="mt-1 block text-xs text-red-300" role="alert">
              {timeframeError}
            </span>
          ) : null}
        </label>

        <label className="block" htmlFor="ss-period">
          <span className="ss-field-label mb-1 block">분석 기간</span>
          <select
            id="ss-period"
            data-testid="ss-period"
            className={panels.market ? guidedMarketSelect : selectClass}
            value={form.periodPreset}
            disabled={disabled}
            onChange={(event) =>
              onPeriod(event.target.value as HistoricalPeriodPresetId)
            }
          >
            <option value="short">
              {HISTORICAL_PERIOD_PRESETS.short.labelKo}
            </option>
            <option value="standard">
              {HISTORICAL_PERIOD_PRESETS.standard.labelKo}
            </option>
            <option value="long">
              {HISTORICAL_PERIOD_PRESETS.long.labelKo}
            </option>
            <option value="custom">직접 지정</option>
          </select>
          <span className="ss-helper mt-1 block" data-testid="ss-period-hint">
            {periodPresetHint(form.periodPreset)}
          </span>
          {periodError ? (
            <span className="mt-1 block text-xs text-red-300" role="alert">
              {periodError}
            </span>
          ) : null}
        </label>
        {form.periodPreset === "custom" &&
        onCustomPeriodFrom &&
        onCustomPeriodTo ? (
          <GuidedCustomPeriodFields
            availableFromDate={form.availableFromDate}
            availableToDate={form.availableToDate}
            disabled={disabled}
            fromError={periodError}
            onFromChange={onCustomPeriodFrom}
            onToChange={onCustomPeriodTo}
          />
        ) : null}
      </div>
      ) : null}

      {showControls || showMap ? (
      <div className="ss-visual-workspace">
        {showControls ? (
        <div className="ss-visual-controls">
          {automatic ? (
            <StrategyAutoPresetPanel
              tradingStyle={form.tradingStyle}
              disabled={disabled}
              onSelect={onTradingStyle}
            />
          ) : (
            <>
              <StrategyPatternLayerPanel
                selectedIds={form.selectedSpaceIds}
                disabled={disabled || automatic}
                onToggle={onToggleLayer}
              />
              <StrategyTradeRulePanel
                direction={form.patternDirection}
                disabled={disabled}
                onDirectionChange={onDirection}
              />
            </>
          )}
        </div>
        ) : null}

        {showMap ? (
        <StrategySearchScopeMap
          form={form}
          automatic={automatic}
          progress={progress}
        />
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
