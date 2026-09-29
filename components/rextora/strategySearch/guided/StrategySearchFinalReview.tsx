"use client";

import {
  ArrowRight,
  Layers,
  Settings2,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { StrategySearchSetupStepId } from "./strategySearchStepModel";
import { buildAppliedSettingsPreview } from "../formValidation";
import { type StrategySearchOperatorFormState } from "../formDefaults";
import { guidedStepBadgeKo } from "./guidedStepBadge";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { qualifiedTargetComparisonProfileLabel } from "./qualifiedTargetComparisonProfileDisplay";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { Step5TargetKpiPanel } from "./Step5TargetKpiPanel";
import {
  step5ApplyDepthToRowMap,
  step5CardReviewRows,
  step5CustomerTimeframeInRowMap,
  step5SearchObjectiveLabel,
  type Step5ReviewCardId,
} from "./step5ReviewPresentation";
import { step5StoredRateDisplay } from "./step5RateReviewDisplay";
import { Step5ReviewCardVisual } from "./Step5ReviewCardVisual";

export { step5SearchObjectiveLabel };

const REVIEW_CARD_GROUPS: Array<{
  stepId: StrategySearchSetupStepId;
  cardId: Step5ReviewCardId;
  titleKo: string;
  Icon: LucideIcon;
}> = [
  { stepId: "market", cardId: "market", titleKo: "분석 대상", Icon: Target },
  { stepId: "approach", cardId: "approach", titleKo: "탐색 방식", Icon: Settings2 },
  { stepId: "strategy", cardId: "strategy", titleKo: "전략 · 범위", Icon: Layers },
  {
    stepId: "validation",
    cardId: "validation",
    titleKo: "검증 · 위험",
    Icon: ShieldCheck,
  },
];

function reviewValueMap(form: StrategySearchOperatorFormState) {
  const preview = buildAppliedSettingsPreview(form);
  const targetMode =
    resolvePatternSelectionMode({
      patternConfigLevel: form.patternConfigLevel,
      autoStrategyCombo: form.autoStrategyCombo,
    }) === "automatic" && form.autoSearchObjective === "qualified_target";
  const rows = preview.rows.map((row) => {
    if (row.labelKo === "탐색 방식") {
      return { ...row, valueKo: step5SearchObjectiveLabel(form) };
    }
    if (targetMode && row.labelKo === "합격 기준") {
      return {
        ...row,
        labelKo: "후보 비교 기준",
        valueKo: qualifiedTargetComparisonProfileLabel(form.qualificationProfile),
      };
    }
    return row;
  });
  const detailRows = preview.detailRows.map((row) => {
    if (!targetMode || row.labelKo !== "합격 기준") return row;
    return {
      ...row,
      labelKo: "후보 비교 기준",
      valueKo: qualifiedTargetComparisonProfileLabel(form.qualificationProfile),
    };
  });
  const rowMap = new Map<string, string>();
  for (const row of [...rows, ...detailRows]) {
    if (!rowMap.has(row.labelKo)) rowMap.set(row.labelKo, row.valueKo);
  }
  const withDepth = step5ApplyDepthToRowMap(rowMap, form);
  const customerRowMap = step5CustomerTimeframeInRowMap(withDepth, form);
  return { preview: { ...preview, rows, detailRows }, rowMap: customerRowMap };
}

function launchSummaryLines(form: StrategySearchOperatorFormState): string[] {
  const { rowMap } = reviewValueMap(form);
  return [
    `${rowMap.get("코인") ?? form.symbol} · ${rowMap.get("타임프레임") ?? formatTimeframeCustomerKo(form.timeframe)}`,
    rowMap.get("분석 기간") ?? "—",
    step5SearchObjectiveLabel(form),
    rowMap.get("탐색 깊이") ?? "—",
    rowMap.get("선택 전략군") ?? "—",
    rowMap.get("후보 비교 기준") ?? rowMap.get("합격 기준") ?? "—",
  ];
}

export function StrategySearchFinalReview(props: {
  form: StrategySearchOperatorFormState;
  onEditStep: (stepId: StrategySearchSetupStepId) => void;
}) {
  const { preview, rowMap } = reviewValueMap(props.form);
  const targetMode =
    resolvePatternSelectionMode({
      patternConfigLevel: props.form.patternConfigLevel,
      autoStrategyCombo: props.form.autoStrategyCombo,
    }) === "automatic" &&
    props.form.autoSearchObjective === "qualified_target";
  const launchLines = launchSummaryLines(props.form);
  const searchName = props.form.searchName.trim();
  const fee = step5StoredRateDisplay(props.form.feeRate);
  const slippage = step5StoredRateDisplay(props.form.slippageRate);

  return (
    <div
      className="ss-guided-review ss-guided-review--enter"
      data-testid="ss-guided-final-review"
    >
      {searchName ? (
        <p
          className="ss-guided-review__search-name"
          data-testid="ss-guided-review-search-name"
        >
          <span className="ss-guided-review__search-name-label">탐색 이름</span>
          <span className="ss-guided-review__search-name-value">{searchName}</span>
        </p>
      ) : null}

      <div className="ss-guided-review__grid">
        {REVIEW_CARD_GROUPS.map((group, index) => {
          const cardRows = step5CardReviewRows(
            group.cardId,
            rowMap,
            props.form,
            { targetMode },
          );
          const Icon = group.Icon;
          return (
            <article
              key={group.titleKo}
              className="ss-guided-review__card"
              data-testid={`ss-guided-review-${group.titleKo}`}
              data-step5-card-icon={group.cardId}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <header className="ss-guided-review__head">
                <h3 className="ss-guided-review__title">
                  <Icon
                    className="ss-guided-review__title-icon"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                  {group.titleKo}
                </h3>
                <span
                  className="ss-guided-review__step-badge"
                  data-testid={`ss-guided-review-step-badge-${group.stepId}`}
                >
                  {guidedStepBadgeKo(group.stepId)}
                </span>
              </header>
              <div
                className="ss-guided-review__card-visual"
                data-testid={`ss-guided-review-primary-${group.cardId}`}
              >
                <Step5ReviewCardVisual
                  cardId={group.cardId}
                  form={props.form}
                  rowMap={rowMap}
                  targetMode={targetMode}
                />
              </div>
              <dl className="ss-guided-review__card-rows ss-guided-review__card-rows--sr">
                {cardRows.map((row) => (
                  <div
                    key={`${group.cardId}:${row.labelKo}`}
                    className="ss-guided-review__card-row"
                  >
                    <dt>{row.labelKo}</dt>
                    <dd>{row.valueKo}</dd>
                  </div>
                ))}
              </dl>
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

      {targetMode ? <Step5TargetKpiPanel form={props.form} /> : null}

      <section
        className="ss-guided-launch-summary ss-guided-launch-summary--compact ss-guided-launch-summary--visual"
        data-testid="ss-guided-launch-summary"
      >
        <h3 className="ss-guided-launch-summary__title">비용 · 실행 요약</h3>
        <p className="ss-guided-launch-summary__mode-line" data-testid="ss-guided-launch-compact">
          {[
            step5SearchObjectiveLabel(props.form),
            formatTimeframeCustomerKo(props.form.timeframe),
          ].join(" · ")}
        </p>
        <div className="ss-guided-launch-summary__cost-cards">
          <div className="ss-guided-launch-summary__cost-card">
            <span className="ss-guided-launch-summary__cost-label">수수료율</span>
            <span className="ss-guided-launch-summary__cost-raw" data-testid="ss-guided-review-fee">
              {fee.rawKo}
            </span>
            {fee.hintKo ? (
              <span className="ss-guided-launch-summary__cost-hint">≈ {fee.hintKo}</span>
            ) : null}
          </div>
          <div className="ss-guided-launch-summary__cost-card">
            <span className="ss-guided-launch-summary__cost-label">슬리피지율</span>
            <span
              className="ss-guided-launch-summary__cost-raw"
              data-testid="ss-guided-review-slippage"
            >
              {slippage.rawKo}
            </span>
            {slippage.hintKo ? (
              <span className="ss-guided-launch-summary__cost-hint">≈ {slippage.hintKo}</span>
            ) : null}
          </div>
        </div>
      </section>

      <details className="ss-guided-review__details" data-testid="ss-guided-review-details">
        <summary className="ss-guided-review__details-summary">상세 보기</summary>
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
          {searchName ? (
            <div className="ss-guided-review__row">
              <dt>탐색 이름</dt>
              <dd>{searchName}</dd>
            </div>
          ) : null}
          {preview.rows.map((row) => (
            <div key={row.labelKo} className="ss-guided-review__row">
              <dt>{row.labelKo === "타임프레임" ? "시간봉" : row.labelKo}</dt>
              <dd>
                {row.labelKo === "타임프레임"
                  ? formatTimeframeCustomerKo(props.form.timeframe)
                  : row.valueKo}
              </dd>
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
