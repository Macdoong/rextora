"use client";

export function StrategyTradeRulePanel({
  direction,
  disabled,
  onDirectionChange,
}: {
  direction: "both" | "long" | "short";
  disabled?: boolean;
  onDirectionChange: (value: "both" | "long" | "short") => void;
}) {
  return (
    <section className="ss-rule-panel" data-testid="ss-trade-rule-panel">
      <h3 className="ss-subsection-title">탐색 방향</h3>
      <p className="ss-helper mt-1">롱 = 상승 방향 · 숏 = 하락 방향</p>
      <div className="ss-rule-dir" role="group" aria-label="탐색 방향">
        {(
          [
            ["both", "롱·숏 모두"],
            ["long", "롱"],
            ["short", "숏"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              "ss-rule-chip" +
              (direction === value ? " ss-rule-chip--active" : "")
            }
            disabled={disabled}
            data-testid={`ss-direction-${value}`}
            aria-pressed={direction === value}
            onClick={() => onDirectionChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
