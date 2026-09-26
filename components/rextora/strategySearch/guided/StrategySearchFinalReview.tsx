"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { StrategySearchSetupStepId } from "./strategySearchStepModel";
import { STRATEGY_SEARCH_SETUP_STEPS } from "./strategySearchStepModel";
import { buildAppliedSettingsPreview } from "../formValidation";
import {
  SEARCH_DEPTH_PROFILES,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import { guidedStepBadgeKo } from "./guidedStepBadge";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { searchModeCustomerLabel } from "../customerDisplay";
import { qualificationTargetSummaryLines } from "./GuidedQualificationTargets";
import { durationPresetLabelKo } from "./GuidedApproachEssentials";

/** Target-mode Step 5 shows these in the dedicated target review block. */
const TARGET_MODE_VALIDATION_REVIEW_LABELS = [
  "비용 검증",
  "레버리지",
  "안정성 검증",
] as const;

const REVIEW_GROUPS: Array<{
  stepId: StrategySearchSetupStepId;
  titleKo: string;
  pickLabels: string[];
}> = [
  {
    stepId: "market",
    titleKo: "분석 대상",
    pickLabels: ["코인", "타임프레임", "분석 기간"],
  },
  {
    stepId: "approach",
    titleKo: "탐색 방식",
    pickLabels: ["탐색 방식", "탐색 프리셋", "탐색 수준"],
  },
  {
    stepId: "strategy",
    titleKo: "전략 · 범위",
    pickLabels: ["선택 전략군", "탐색 방향", "전략군 수"],
  },
  {
    stepId: "validation",
    titleKo: "검증 · 위험",
    pickLabels: [
      "최대 허용 낙폭",
      "최소 거래 수",
      "최소 수익률",
      "합격 기준",
      "비용 검증",
      "레버리지",
      "합격 목표",
    ],
  },
];

function reviewValueMap(form: StrategySearchOperatorFormState) {
  const preview = buildAppliedSettingsPreview(form);
  const rowMap = new Map<string, string>();
  for (const row of [...preview.rows, ...preview.detailRows]) {
    if (!rowMap.has(row.labelKo)) rowMap.set(row.labelKo, row.valueKo);
  }
  const depth = SEARCH_DEPTH_PROFILES[form.depthProfile];
  if (depth) rowMap.set("탐색 수준", depth.labelKo);
  return { preview, rowMap };
}

function launchSummaryLines(form: StrategySearchOperatorFormState): string[] {
  const { rowMap } = reviewValueMap(form);
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  return [
    `${rowMap.get("코인") ?? form.symbol} · ${rowMap.get("타임프레임") ?? form.timeframe}`,
    rowMap.get("분석 기간") ?? "—",
    searchModeCustomerLabel(mode),
    rowMap.get("탐색 수준") ?? "—",
    rowMap.get("선택 전략군") ?? "—",
    rowMap.get("합격 기준") ?? "—",
  ];
}

function launchSummaryCompactLine(
  form: StrategySearchOperatorFormState,
  targetMode: boolean,
): string {
  const { rowMap } = reviewValueMap(form);
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  const modeLabel = targetMode
    ? "목표 기준 자동 탐색"
    : mode === "automatic"
      ? "시간 기준 자동 탐색"
      : searchModeCustomerLabel(mode);
  return [
    rowMap.get("코인") ?? form.symbol,
    rowMap.get("타임프레임") ?? form.timeframe,
    rowMap.get("분석 기간") ?? "—",
    modeLabel,
  ].join(" · ");
}

export function StrategySearchFinalReview(props: {
  form: StrategySearchOperatorFormState;
  onEditStep: (stepId: StrategySearchSetupStepId) => void;
}) {
  const { preview, rowMap } = reviewValueMap(props.form);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const launchLines = launchSummaryLines(props.form);
  const targetMode =
    resolvePatternSelectionMode({
      patternConfigLevel: props.form.patternConfigLevel,
      autoStrategyCombo: props.form.autoStrategyCombo,
    }) === "automatic" &&
    props.form.autoSearchObjective === "qualified_target";
  const launchCompactLine = launchSummaryCompactLine(props.form, targetMode);

  return (
    <div
      className="ss-guided-review ss-guided-review--enter"
      data-testid="ss-guided-final-review"
    >
      <div className="ss-guided-review__grid">
        {REVIEW_GROUPS.map((group, index) => {
          const pickLabels =
            targetMode && group.stepId === "validation"
              ? [...TARGET_MODE_VALIDATION_REVIEW_LABELS]
              : group.pickLabels;
          const values = pickLabels
            .map((label) => rowMap.get(label))
            .filter((v) => v && v !== "—");
          const headline =
            values.slice(0, 3).join(" · ") || values.join(" · ") || "—";
          return (
            <article
              key={group.titleKo}
              className="ss-guided-review__card"
              data-testid={`ss-guided-review-${group.titleKo}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <header className="ss-guided-review__head">
                <h3 className="ss-guided-review__title">{group.titleKo}</h3>
                <span
                  className="ss-guided-review__step-badge"
                  data-testid={`ss-guided-review-step-badge-${group.stepId}`}
                >
                  {guidedStepBadgeKo(group.stepId)}
                </span>
              </header>
              <p className="ss-guided-review__headline">{headline}</p>
              <button
                type="button"
                className="ss-guided-review__jump"
                data-testid={`ss-guided-review-edit-${group.stepId}`}
                onClick={() => props.onEditStep(group.stepId)}
              >
                설정으로 이동
                <ArrowRight className="ss-guided-review__jump-icon" aria-hidden />
              </button>
            </article>
          );
        })}
      </div>

      {targetMode ? (
        <section
          className="ss-guided-target-review"
          data-testid="ss-guided-target-review"
          aria-label="목표 기준 자동 탐색"
        >
          <h3 className="ss-guided-target-review__title">목표 기준 자동 탐색</h3>
          <dl className="ss-guided-target-review__rows">
            <div>
              <dt>탐색 방식</dt>
              <dd>목표 기준 자동 탐색</dd>
            </div>
            <div>
              <dt>목표 조건</dt>
              <dd>{qualificationTargetSummaryLines(props.form).join(" · ")}</dd>
            </div>
            <div>
              <dt>최대 탐색 시간</dt>
              <dd>
                {durationPresetLabelKo(
                  props.form.durationPreset,
                  props.form.maxRuntimeMinutesOverride,
                )}
              </dd>
            </div>
            <div>
              <dt>종료 조건</dt>
              <dd>
                검증 조건을 만족하는 후보를 찾으면 종료합니다. 못 찾으면 최대
                탐색 시간 또는 안전 한도에서 종료됩니다.
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section
        className="ss-guided-launch-summary ss-guided-launch-summary--compact"
        data-testid="ss-guided-launch-summary"
      >
        <h3 className="ss-guided-launch-summary__title">탐색 시작 요약</h3>
        <p
          className="ss-guided-launch-summary__compact-line"
          data-testid="ss-guided-launch-compact"
        >
          {launchCompactLine}
        </p>
      </section>

      <details
        className="ss-guided-review__details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="ss-guided-review__details-summary">
          상세 보기
          <ChevronDown className="ss-guided-review__details-chevron" aria-hidden />
        </summary>
        <dl className="ss-guided-review__details-rows">
          <div className="ss-guided-review__row">
            <dt>탐색 상세</dt>
            <dd>
              <ul className="ss-guided-launch-summary__detail-list">
                {launchLines.map((line, index) => (
                  <li key={`launch:${index}:${line}`}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="ss-guided-review__row">
            <dt>탐색 이름</dt>
            <dd>{props.form.searchName.trim() || "—"}</dd>
          </div>
          {preview.rows.map((row) => (
            <div key={row.labelKo} className="ss-guided-review__row">
              <dt>{row.labelKo}</dt>
              <dd>{row.valueKo}</dd>
            </div>
          ))}
        </dl>
      </details>

      {preview.summary.status !== "ok" ? (
        <p
          className="ss-guided-review__status"
          data-testid="ss-config-validation-status"
        >
          {preview.summary.labelKo}
        </p>
      ) : null}
    </div>
  );
}
