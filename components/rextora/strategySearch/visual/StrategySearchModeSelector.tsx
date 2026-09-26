"use client";

export function StrategySearchModeSelector({
  automatic,
  disabled,
  onSelectAutomatic,
  onSelectDirect,
}: {
  automatic: boolean;
  disabled?: boolean;
  onSelectAutomatic: () => void;
  onSelectDirect: () => void;
}) {
  return (
    <div className="ss-mode-grid" data-testid="ss-search-mode">
      <button
        type="button"
        className={
          "ss-mode-card ss-selection-card ss-mode-card--automatic" +
          (automatic ? " ss-mode-card--active" : "")
        }
        disabled={disabled}
        data-testid="ss-search-mode-automatic"
        aria-pressed={automatic}
        onClick={onSelectAutomatic}
      >
        <span className="ss-mode-card__badge">권장</span>
        <strong className="ss-mode-card__title">자동 탐색</strong>
        <p className="ss-mode-card__copy">
          정해진 시간 동안 Rextora가 전략 조합과 설정을 자동으로 탐색합니다.
        </p>
        <p className="ss-mode-card__flow">
          이번 흐름: 탐색 시간을 정한 뒤 시작합니다.
        </p>
      </button>
      <button
        type="button"
        className={
          "ss-mode-card ss-selection-card ss-mode-card--direct" +
          (!automatic ? " ss-mode-card--active" : "")
        }
        disabled={disabled}
        data-testid="ss-search-mode-direct"
        aria-pressed={!automatic}
        onClick={onSelectDirect}
      >
        <strong className="ss-mode-card__title">탐색 범위 직접 선택</strong>
        <p className="ss-mode-card__copy">
          탐색할 전략군을 직접 고릅니다.
        </p>
        <p className="ss-mode-card__flow">
          이번 흐름: 다음 단계에서 전략군과 방향을 직접 설정합니다.
        </p>
      </button>
    </div>
  );
}
