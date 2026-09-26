"use client";

import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { patternSelectionModeLabelKo } from "@/src/lib/rextora/patternSelectionMode";
import {
  BEGINNER_PRESET_MAP,
  SEARCH_DEPTH_PROFILES,
  SEARCHABLE_SPACE_OPTIONS,
  type StrategySearchOperatorFormState,
  type TradingStyleId,
} from "../formDefaults";

const DIRECTION_KO: Record<string, string> = {
  both: "롱·숏",
  long: "롱만",
  short: "숏만",
};

function presetLabel(style: TradingStyleId): string {
  const key =
    style === "scalping"
      ? "aggressive"
      : style === "stable"
        ? "safe"
        : "balanced";
  return BEGINNER_PRESET_MAP[key].labelKo;
}

export function GuidedMobileScopeSummary(props: {
  form: StrategySearchOperatorFormState;
  selectionMode: PatternSelectionMode;
  combinationSentence: string;
}) {
  const { form, selectionMode, combinationSentence } = props;
  const familyCount =
    selectionMode === "automatic"
      ? "시스템 구성"
      : `${form.selectedSpaceIds.length}개 전략군`;
  const families =
    selectionMode === "manual" && form.selectedSpaceIds.length > 0
      ? form.selectedSpaceIds
          .slice(0, 3)
          .map(
            (id) =>
              SEARCHABLE_SPACE_OPTIONS.find((s) => s.id === id)?.labelKo ?? id,
          )
          .join(" · ")
      : null;

  return (
    <section
      className="ss-guided-mobile-scope-summary"
      data-testid="ss-guided-mobile-scope-summary"
      aria-label="탐색 범위 요약"
    >
      <p className="ss-guided-mobile-scope-summary__lead">
        <strong>{patternSelectionModeLabelKo(selectionMode)}</strong>
        <span aria-hidden="true"> · </span>
        {presetLabel(form.tradingStyle)}
        <span aria-hidden="true"> · </span>
        {SEARCH_DEPTH_PROFILES[form.depthProfile].labelKo}
      </p>
      <ul className="ss-guided-mobile-scope-summary__facts">
        <li>
          <span>전략군</span>
          <span>{familyCount}</span>
        </li>
        {families ? (
          <li>
            <span>선택</span>
            <span>{families}</span>
          </li>
        ) : null}
        <li>
          <span>방향</span>
          <span>{DIRECTION_KO[form.patternDirection] ?? form.patternDirection}</span>
        </li>
        <li>
          <span>조합</span>
          <span>{combinationSentence}</span>
        </li>
      </ul>
      <p className="ss-guided-mobile-scope-summary__hint">
        상세 지도·워크스페이스는 「범위 지도 · 워크스페이스」에서 펼칩니다.
      </p>
    </section>
  );
}
