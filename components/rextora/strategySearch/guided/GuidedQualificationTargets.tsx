"use client";

import type { MddPresetId, StrategySearchOperatorFormState } from "../formDefaults";
import { guidedNumberClass, guidedSelectClass } from "./guidedFieldClass";
import { StrategySearchFieldHelp } from "./StrategySearchFieldHelp";

function formatTargetSummaryPercent(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}%` : "—";
}

function formatTargetSummaryTradeCount(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}회` : "—";
}

/** Customer-facing target threshold lines (Step 4/5 summaries; not input suffixes). */
export function qualificationTargetSummaryLines(
  form: Pick<
    StrategySearchOperatorFormState,
    "minTotalReturn" | "maxMdd" | "minTradeCount" | "minWinRate" | "minScore"
  >,
): string[] {
  const lines = [
    `수익률 ≥ ${formatTargetSummaryPercent(form.minTotalReturn)}`,
    `최대 낙폭 ≤ ${formatTargetSummaryPercent(form.maxMdd)}`,
    `최소 거래수 ≥ ${formatTargetSummaryTradeCount(form.minTradeCount)}`,
  ];
  if (form.minWinRate.trim()) {
    lines.push(`승률 ≥ ${formatTargetSummaryPercent(form.minWinRate)}`);
  }
  if (form.minScore.trim()) {
    lines.push(`점수 ≥ ${form.minScore.trim()}`);
  }
  return lines;
}

export function GuidedQualificationTargets(props: {
  variant: "edit" | "summary";
  form: StrategySearchOperatorFormState;
  disabled?: boolean;
  minReturnError?: string;
  maxMddError?: string;
  minTradeError?: string;
  minWinRateError?: string;
  minScoreError?: string;
  onMinReturn: (value: string) => void;
  onMddPreset: (preset: MddPresetId) => void;
  onMaxMdd: (value: string) => void;
  onMinTrades: (value: string) => void;
  onMinWinRate: (value: string) => void;
  onMinScore: (value: string) => void;
  onEditStep?: () => void;
}) {
  if (props.variant === "summary") {
    return (
      <section
        className="ss-guided-target-summary"
        data-testid="ss-guided-target-summary"
        aria-label="목표 조건"
      >
        <h3 className="ss-guided-target-summary__title">목표 조건</h3>
        <ul className="ss-guided-target-summary__list">
          {qualificationTargetSummaryLines(props.form).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {props.onEditStep ? (
          <button
            type="button"
            className="ss-guided-target-summary__edit"
            data-testid="ss-guided-target-edit-step2"
            onClick={props.onEditStep}
          >
            2단계에서 수정
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="ss-guided-qualification-targets ss-guided-qualification-targets--edit"
      data-testid="ss-guided-qualification-targets"
      aria-label="목표 조건"
    >
      <h3 className="ss-guided-qualification-targets__title">목표 조건</h3>
      <div className="ss-guided-qualification-targets__grid ss-guided-qualification-targets__grid--required">
        <div className="ss-guided-target-field-row">
          <label className="ss-guided-target-field-row__label" htmlFor="ss-min-return">
            최소 수익률
            <StrategySearchFieldHelp fieldId="minTotalReturn" />
          </label>
          <div className="ss-guided-target-field-row__control">
            <input
              id="ss-min-return"
              data-testid="ss-target-return"
              className={guidedNumberClass}
              type="number"
              step="0.01"
              value={props.form.minTotalReturn}
              disabled={props.disabled}
              onChange={(e) => props.onMinReturn(e.target.value)}
            />
            <span className="ss-guided-target-field-row__unit" aria-hidden>
              %
            </span>
          </div>
          {props.minReturnError ? (
            <span className="ss-guided-target-field-row__error" role="alert">
              {props.minReturnError}
            </span>
          ) : null}
        </div>
        <div className="ss-guided-target-field-row">
          <label className="ss-guided-target-field-row__label" htmlFor="ss-max-mdd">
            최대 낙폭
            <StrategySearchFieldHelp fieldId="maxMdd" />
          </label>
          <div className="ss-guided-target-field-row__control">
            <select
              id="ss-max-mdd"
              data-testid="ss-max-mdd"
              className={guidedSelectClass}
              value={props.form.mddPreset}
              disabled={props.disabled}
              onChange={(e) => props.onMddPreset(e.target.value as MddPresetId)}
            >
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="custom">직접 설정</option>
            </select>
            {props.form.mddPreset !== "custom" ? (
              <span className="ss-guided-target-field-row__unit" aria-hidden>
                %
              </span>
            ) : null}
          </div>
        </div>
        {props.form.mddPreset === "custom" ? (
          <div className="ss-guided-target-field-row">
            <label
              className="ss-guided-target-field-row__label"
              htmlFor="ss-max-mdd-custom"
            >
              낙폭 직접 입력
            </label>
            <div className="ss-guided-target-field-row__control">
              <input
                id="ss-max-mdd-custom"
                data-testid="ss-max-mdd-custom"
                className={guidedNumberClass}
                type="number"
                step="0.01"
                value={props.form.maxMdd}
                disabled={props.disabled}
                onChange={(e) => props.onMaxMdd(e.target.value)}
              />
              <span className="ss-guided-target-field-row__unit" aria-hidden>
                %
              </span>
            </div>
            {props.maxMddError ? (
              <span className="ss-guided-target-field-row__error" role="alert">
                {props.maxMddError}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="ss-guided-target-field-row">
          <label className="ss-guided-target-field-row__label" htmlFor="ss-min-trades">
            최소 거래수
            <StrategySearchFieldHelp fieldId="minTradeCount" />
          </label>
          <div className="ss-guided-target-field-row__control">
            <input
              id="ss-min-trades"
              data-testid="ss-min-trades"
              className={guidedNumberClass}
              type="number"
              value={props.form.minTradeCount}
              disabled={props.disabled}
              onChange={(e) => props.onMinTrades(e.target.value)}
            />
            <span className="ss-guided-target-field-row__unit" aria-hidden>
              회
            </span>
          </div>
          {props.minTradeError ? (
            <span className="ss-guided-target-field-row__error" role="alert">
              {props.minTradeError}
            </span>
          ) : null}
        </div>
      </div>
      <details
        className="ss-guided-target-optional ss-guided-target-optional--discoverable"
        data-testid="ss-guided-target-optional"
      >
        <summary className="ss-guided-target-optional__summary">
          <span className="ss-guided-target-optional__head">
            <span className="ss-guided-target-optional__title">추가 조건</span>
            <span className="ss-guided-target-optional__meta">승률 · 점수 설정</span>
          </span>
          <span className="ss-guided-target-optional__chevron" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="ss-guided-qualification-targets__grid ss-guided-qualification-targets__grid--optional">
          <div className="ss-guided-target-field-row">
            <label
              className="ss-guided-target-field-row__label"
              htmlFor="ss-min-winrate"
            >
              최소 승률
              <StrategySearchFieldHelp fieldId="minWinRate" />
            </label>
            <div className="ss-guided-target-field-row__control">
              <input
                id="ss-min-winrate"
                data-testid="ss-min-winrate"
                className={guidedNumberClass}
                type="number"
                step="0.01"
                value={props.form.minWinRate}
                disabled={props.disabled}
                onChange={(e) => props.onMinWinRate(e.target.value)}
              />
              <span className="ss-guided-target-field-row__unit" aria-hidden>
                %
              </span>
            </div>
            {props.minWinRateError ? (
              <span className="ss-guided-target-field-row__error" role="alert">
                {props.minWinRateError}
              </span>
            ) : null}
          </div>
          <label className="ss-guided-field" htmlFor="ss-min-score">
            <span className="ss-field-label mb-1 block">
              최소 점수
              <StrategySearchFieldHelp fieldId="minScore" />
            </span>
            <input
              id="ss-min-score"
              data-testid="ss-min-score"
              className={guidedNumberClass}
              type="number"
              step="0.01"
              value={props.form.minScore}
              disabled={props.disabled}
              onChange={(e) => props.onMinScore(e.target.value)}
            />
            {props.minScoreError ? (
              <span className="mt-1 block text-xs text-red-300" role="alert">
                {props.minScoreError}
              </span>
            ) : null}
          </label>
        </div>
      </details>
    </section>
  );
}
