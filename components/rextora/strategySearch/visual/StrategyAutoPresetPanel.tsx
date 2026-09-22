"use client";

import { BEGINNER_PRESET_MAP, type TradingStyleId } from "../formDefaults";
import {
  autoPresetDepthOrdinal,
  autoPresetEngineValues,
  autoPresetIntentCopy,
  autoPresetShortCopy,
  autoPresetSuitableCopy,
  autoPresetVisualDims,
} from "./autoPresetVisual";

const PRESET_CARDS: Array<{
  style: TradingStyleId;
  preset: keyof typeof BEGINNER_PRESET_MAP;
}> = [
  { style: "stable", preset: "safe" },
  { style: "balanced", preset: "balanced" },
  { style: "scalping", preset: "aggressive" },
];

export function StrategyAutoPresetPanel({
  tradingStyle,
  disabled,
  onSelect,
}: {
  tradingStyle: TradingStyleId;
  disabled?: boolean;
  onSelect: (style: TradingStyleId) => void;
}) {
  return (
    <section className="ss-auto-panel" data-testid="ss-auto-preset-panel">
      <header className="ss-section-head">
        <h3 className="ss-section-head__title">어떤 전략을 찾을까요?</h3>
        <p className="ss-section-head__desc">
          선택한 스타일에 맞춰 합격 기준과 탐색 깊이가 바뀝니다.
        </p>
      </header>
      <div className="ss-preset-grid">
        {PRESET_CARDS.map(({ style, preset }) => {
          const meta = BEGINNER_PRESET_MAP[preset];
          const values = autoPresetEngineValues(style);
          const dims = autoPresetVisualDims(style);
          const depth = autoPresetDepthOrdinal(style);
          const active = tradingStyle === style;
          return (
            <button
              key={style}
              type="button"
              className={
                "ss-preset-card" + (active ? " ss-preset-card--active" : "")
              }
              disabled={disabled}
              data-testid={`ss-auto-preset-${style}`}
              aria-pressed={active}
              onClick={() => onSelect(style)}
            >
              <span className="ss-preset-card__icon" aria-hidden="true" data-preset-icon={style}>
                {style === "stable" ? (
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 3.2 16 5.6v4.4c0 3.6-2.4 5.8-6 6.8-3.6-1-6-3.2-6-6.8V5.6L10 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : style === "balanced" ? (
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M10 3.5v13M4 8.5h12M5.5 8.5 4 13h3L5.5 8.5Zm9 0L16 13h-3l1.5-4.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <path d="M11 3 6 11h4l-1 6 6-9h-4l1-5Z" fill="currentColor" />
                  </svg>
                )}
              </span>
              <strong className="ss-preset-card__name">{meta.labelKo}</strong>
              {active ? (
                <span className="ss-preset-card__selected">선택됨</span>
              ) : null}
              <span className="ss-preset-card__intent">{autoPresetIntentCopy(style)}</span>
              <span className="ss-preset-card__copy">
                {autoPresetShortCopy(style)}
              </span>
              <span className="ss-preset-card__fit">{autoPresetSuitableCopy(style)}</span>
              <span
                className="ss-preset-depth"
                data-testid={`ss-preset-depth-${style}`}
                data-depth={depth.id}
                aria-label={`탐색 깊이 ${depth.rank}/${depth.total}`}
              >
                {Array.from({ length: depth.total }, (_, index) => (
                  <i
                    key={index}
                    className={index < depth.rank ? "is-on" : undefined}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <ul className="ss-preset-bars" aria-label={`${meta.labelKo} 비교 지표`}>
                {dims.map((dim) => (
                  <li key={dim.key} data-visual-key={dim.key}>
                    <span>
                      {dim.labelKo}
                      <em>{dim.valueLabel}</em>
                    </span>
                    <span
                      className="ss-preset-bar"
                      aria-hidden="true"
                    >
                      <span
                        className="ss-preset-bar__fill"
                        style={{ width: `${Math.round(dim.fill * 100)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <span className="ss-preset-chips">
                {meta.criteriaChips.slice(0, 3).map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
                {values.jitterEnabled ? <span>안정성 검증</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
