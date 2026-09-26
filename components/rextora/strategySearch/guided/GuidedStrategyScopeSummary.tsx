"use client";

import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { patternSelectionModeLabelKo } from "@/src/lib/rextora/patternSelectionMode";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { SEARCHABLE_SPACE_OPTIONS } from "../formDefaults";

const DIRECTION_KO: Record<string, string> = {
  both: "롱·숏",
  long: "롱만",
  short: "숏만",
};

const CONFIG_LEVEL_KO: Record<string, string> = {
  automatic: "자동 추천 · 기본값",
  basic: "기본 조정",
  expert: "전문가 범위",
};

function familyLabels(ids: readonly string[]): string[] {
  return ids.map(
    (id) =>
      SEARCHABLE_SPACE_OPTIONS.find((s) => s.id === id)?.labelKo ?? id,
  );
}

export function GuidedStrategyScopeSummary(props: {
  form: StrategySearchOperatorFormState;
  selectionMode: PatternSelectionMode;
  combinationSentence: string;
  patternDefaultsNotice?: boolean;
}) {
  const { form, selectionMode, combinationSentence } = props;
  const families =
    selectionMode === "automatic"
      ? familyLabels(form.selectedSpaceIds.length > 0 ? form.selectedSpaceIds : [])
      : familyLabels(form.selectedSpaceIds);
  const familyLine =
    selectionMode === "automatic"
      ? "시스템이 깊이 프로필에 맞춰 전략군을 구성합니다"
      : families.length > 0
        ? families.slice(0, 5).join(" · ") +
          (families.length > 5 ? ` 외 ${families.length - 5}개` : "")
        : "선택된 전략군 없음";

  const configKo =
    CONFIG_LEVEL_KO[form.patternConfigLevel] ?? form.patternConfigLevel;

  return (
    <section
      className="ss-guided-strategy-essentials"
      data-testid="ss-guided-strategy-essentials"
      aria-label="전략 범위 요약"
    >
      <ul className="ss-guided-strategy-essentials__list">
        <li className="ss-guided-strategy-essentials__row">
          <span className="ss-guided-strategy-essentials__label">탐색 방식</span>
          <span className="ss-guided-strategy-essentials__value">
            {patternSelectionModeLabelKo(selectionMode)}
          </span>
        </li>
        <li className="ss-guided-strategy-essentials__row">
          <span className="ss-guided-strategy-essentials__label">전략군</span>
          <span className="ss-guided-strategy-essentials__value">{familyLine}</span>
        </li>
        <li className="ss-guided-strategy-essentials__row">
          <span className="ss-guided-strategy-essentials__label">탐색 방향</span>
          <span className="ss-guided-strategy-essentials__value">
            {DIRECTION_KO[form.patternDirection] ?? form.patternDirection}
          </span>
        </li>
        <li className="ss-guided-strategy-essentials__row">
          <span className="ss-guided-strategy-essentials__label">패턴 조합</span>
          <span className="ss-guided-strategy-essentials__value">
            {combinationSentence}
          </span>
        </li>
        <li className="ss-guided-strategy-essentials__row">
          <span className="ss-guided-strategy-essentials__label">세부 수준</span>
          <span className="ss-guided-strategy-essentials__value">{configKo}</span>
        </li>
      </ul>
      {props.patternDefaultsNotice ? (
        <p
          className="ss-guided-strategy-essentials__defaults"
          data-testid="ss-pattern-detail-defaults-notice"
        >
          패턴 세부 설정은 현재 탐색 수준의 기본값을 사용합니다.
        </p>
      ) : (
        <p className="ss-guided-strategy-essentials__hint">
          범위 지도·워크스페이스와 패턴 세부값은 아래에서 필요할 때만 펼칩니다.
        </p>
      )}
    </section>
  );
}
