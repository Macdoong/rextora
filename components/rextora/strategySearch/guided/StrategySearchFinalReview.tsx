"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { StrategySearchSetupStepId } from "./strategySearchStepModel";
import { STRATEGY_SEARCH_SETUP_STEPS } from "./strategySearchStepModel";
import { buildAppliedSettingsPreview } from "../formValidation";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { guidedStepBadgeKo } from "./guidedStepBadge";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { searchModeCustomerLabel } from "../customerDisplay";

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

function launchSummaryLines(form: StrategySearchOperatorFormState): string[] {
  const preview = buildAppliedSettingsPreview(form);
  const rowMap = new Map(preview.rows.map((r) => [r.labelKo, r.valueKo]));
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

export function StrategySearchFinalReview(props: {
  form: StrategySearchOperatorFormState;
  onEditStep: (stepId: StrategySearchSetupStepId) => void;
}) {
  const preview = buildAppliedSettingsPreview(props.form);
  const rowMap = new Map(preview.rows.map((r) => [r.labelKo, r.valueKo]));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const launchLines = launchSummaryLines(props.form);

  return (
    <div
      className="ss-guided-review ss-guided-review--enter"
      data-testid="ss-guided-final-review"
    >
      <div className="ss-guided-review__grid">
        {REVIEW_GROUPS.map((group, index) => {
          const values = group.pickLabels
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

      <section className="ss-guided-launch-summary" data-testid="ss-guided-launch-summary">
        <h3 className="ss-guided-launch-summary__title">탐색 시작 요약</h3>
        <ul className="ss-guided-launch-summary__list">
          {launchLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="ss-guided-launch-summary__name">
          탐색 이름: {props.form.searchName.trim() || "—"}
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
          {preview.rows.map((row) => (
            <div key={row.labelKo} className="ss-guided-review__row">
              <dt>{row.labelKo}</dt>
              <dd>{row.valueKo}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p
        className="ss-guided-review__status"
        data-testid="ss-config-validation-status"
      >
        {preview.summary.labelKo}
      </p>
    </div>
  );
}
