"use client";

import { SearchFamilyGlyph } from "./SearchFamilyGlyph";
import { StrategyHelpTooltip } from "./StrategyHelpTooltip";
import {
  DIRECT_LAYER_OPTIONS,
  PATTERN_LAYER_HELP,
} from "./searchVisualCopy";

export function StrategyPatternLayerPanel({
  selectedIds,
  disabled,
  onToggle,
}: {
  selectedIds: readonly string[];
  disabled?: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <section className="ss-layer-panel" data-testid="ss-pattern-layer-panel">
      <h3 className="ss-subsection-title">탐색할 전략군</h3>
      <p className="ss-helper mt-1">
        Rextora가 나눠 탐색할 전략군을 고릅니다. 선택한 항목은 하나의 결합
        전략이 아닙니다.
      </p>
      <div className="ss-layer-grid">
        {DIRECT_LAYER_OPTIONS.map((layer) => {
          const help = PATTERN_LAYER_HELP[layer.id];
          const checked = selectedIds.includes(layer.id);
          return (
            <label
              key={layer.id}
              className={
                "ss-layer-card" + (checked ? " ss-layer-card--active" : "")
              }
            >
              <input
                type="checkbox"
                className="ss-layer-card__input"
                disabled={disabled}
                checked={checked}
                data-testid={`ss-layer-${layer.id}`}
                onChange={(event) => onToggle(layer.id, event.target.checked)}
              />
              <span className="ss-layer-card__title">
                <SearchFamilyGlyph id={layer.id} />
                {layer.label}
                {help ? (
                  <StrategyHelpTooltip
                    label={layer.label}
                    content={help.help}
                  />
                ) : null}
              </span>
              {help ? (
                <span className="ss-layer-card__copy">{help.help}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}
