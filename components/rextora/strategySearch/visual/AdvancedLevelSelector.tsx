"use client";

const LEVELS = [
  {
    value: "automatic",
    label: "자동",
    description: "핵심 설정을 자동으로 적용합니다.",
  },
  {
    value: "basic",
    label: "기본",
    description: "자주 쓰는 주요 설정을 조정합니다.",
  },
  {
    value: "expert",
    label: "전문가",
    description: "전체 세부 설정을 직접 조정합니다.",
  },
] as const;

export type AdvancedConfigLevel = (typeof LEVELS)[number]["value"];

export function AdvancedLevelSelector(props: {
  value: AdvancedConfigLevel;
  disabled?: boolean;
  onChange: (value: AdvancedConfigLevel) => void;
}) {
  return (
    <div
      className="ss-level-selector"
      role="radiogroup"
      aria-label="설정 수준"
      data-testid="ss-config-level-control"
    >
      {LEVELS.map((level) => {
        const selected = props.value === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={props.disabled}
            className={
              "ss-level-card" + (selected ? " is-selected" : "")
            }
            data-testid={`ss-config-level-${level.value}`}
            data-level={level.value}
            onClick={() => props.onChange(level.value)}
          >
            <span className="ss-level-card__check" aria-hidden="true">
              {selected ? "✓" : ""}
            </span>
            <strong>{level.label}</strong>
            <span>{level.description}</span>
          </button>
        );
      })}
    </div>
  );
}
