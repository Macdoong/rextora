"use client";

import type { ReactNode } from "react";
import {
  QUALIFICATION_PROFILES,
  type LeverageModeId,
  type MddPresetId,
  type QualificationProfileId,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import { fieldOriginLabel } from "../customerDisplay";
import { StrategySearchFieldHelp } from "./StrategySearchFieldHelp";
import { qualifiedTargetComparisonProfileLabel } from "./qualifiedTargetComparisonProfileDisplay";
import {
  STEP4_BAND_LABELS,
  STEP4_JITTER_RECHECK_BRIEF_KO,
  step4BandDescription,
  step4WorkspaceHeadCopy,
} from "./step4ValidationPresentation";
import { GuidedValidationTargetKpis } from "./GuidedValidationTargetKpis";
import { Step4LeverageRangeVisual } from "../visual/Step4LeverageRangeVisual";
import { formatDecimalRateAsPercentHint } from "./formatDecimalRateHint";
import {
  COST_STRESS_HELP,
  COST_STRESS_LABEL,
} from "../visual/searchVisualCopy";

const gridClass = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

function ValidationField(props: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  helpFieldId?: string;
  origin?: "editable" | "auto" | "preset" | "readonly";
  children: ReactNode;
}) {
  const originText = fieldOriginLabel(props.origin ?? "editable");
  return (
    <label
      className={
        "ss-field block" +
        (props.origin === "editable" || !props.origin
          ? " ss-field--editable"
          : " ss-field--readonly")
      }
      htmlFor={props.id}
      data-field-origin={props.origin ?? "editable"}
    >
      <span className="ss-field-label mb-1 flex items-center gap-2">
        {props.label}
        {props.helpFieldId ? (
          <StrategySearchFieldHelp fieldId={props.helpFieldId} />
        ) : null}
        {originText ? (
          <em className="ss-field-origin">{originText}</em>
        ) : null}
      </span>
      {props.children}
      {props.hint ? (
        <span className="ss-helper mt-1 block">{props.hint}</span>
      ) : null}
      {props.error ? (
        <span className="mt-1 block text-xs text-red-300" role="alert">
          {props.error}
        </span>
      ) : null}
    </label>
  );
}

function ValidationBand(props: {
  band: "evaluation" | "risk" | "cost";
  enterIndex: number;
  sectionId: string;
  srTitle: string;
  automaticTargetMode: boolean;
  children: ReactNode;
}) {
  const description = step4BandDescription(props.band, props.automaticTargetMode);
  return (
    <div
      className="ss-step4-band ss-step4-enter"
      data-band={props.band}
      style={{ ["--ss-step4-enter-i" as string]: props.enterIndex }}
    >
      <header className="ss-step4-band__head">
        <p
          className="ss-guided-validation-band__title"
          data-band={props.band}
        >
          {STEP4_BAND_LABELS[props.band]}
        </p>
        {description ? (
          <p className="ss-step4-band__desc">{description}</p>
        ) : null}
      </header>
      <section
        id={props.sectionId}
        className="ss-section-card ss-step4-band__body scroll-mt-24 space-y-4"
        aria-labelledby={`${props.sectionId}-sr-title`}
      >
        <h3 id={`${props.sectionId}-sr-title`} className="sr-only">
          {props.srTitle}
        </h3>
        <div className={gridClass}>{props.children}</div>
      </section>
    </div>
  );
}

export function GuidedValidationStep(props: {
  form: StrategySearchOperatorFormState;
  automaticTargetMode: boolean;
  inputDisabled: boolean;
  inputClass: string;
  err: (field: string) => string | undefined;
  set: <K extends keyof StrategySearchOperatorFormState>(
    key: K,
    value: StrategySearchOperatorFormState[K],
  ) => void;
  applyQualification: (profile: QualificationProfileId) => void;
  applyMddPreset: (preset: MddPresetId) => void;
  onEditStep2: () => void;
}) {
  const head = step4WorkspaceHeadCopy(props.automaticTargetMode);
  const feeHint = formatDecimalRateAsPercentHint(props.form.feeRate);
  const slipHint = formatDecimalRateAsPercentHint(props.form.slippageRate);

  return (
    <div
      className="ss-adv-section ss-adv-group ss-guided-validation-layout ss-step4-workspace"
      data-adv-group="criteria"
      data-testid="ss-step4-workspace"
    >
      <header className="ss-adv-section__head ss-step4-enter" style={{ ["--ss-step4-enter-i" as string]: 0 }}>
        <span className="ss-adv-section__icon" aria-hidden="true">
          ▣
        </span>
        <div>
          <h3 className="ss-adv-section__title">{head.title}</h3>
          <p className="ss-adv-section__desc">{head.description}</p>
        </div>
      </header>

      {props.automaticTargetMode ? (
        <GuidedValidationTargetKpis
          form={props.form}
          onEditStep={props.onEditStep2}
        />
      ) : null}

      <ValidationBand
        band="evaluation"
        enterIndex={1}
        sectionId="ss-section-validation"
        srTitle="후보 평가"
        automaticTargetMode={props.automaticTargetMode}
      >
        {props.automaticTargetMode ? (
          <div className="ss-step4-setting-cards md:col-span-2 xl:col-span-3">
            <div className="ss-step4-setting-card">
              <ValidationField
                id="ss-comparison-profile"
                label="후보 비교 기준"
                helpFieldId="candidateComparisonProfile"
                hint="합격 여부는 2단계에서 설정한 목표 조건으로 판단하며, 이 설정은 목표 조건 자체를 변경하지 않습니다."
              >
                <select
                  id="ss-comparison-profile"
                  data-testid="ss-comparison-profile"
                  className={props.inputClass}
                  value={props.form.qualificationProfile}
                  disabled={props.inputDisabled}
                  onChange={(e) =>
                    props.set(
                      "qualificationProfile",
                      e.target.value as QualificationProfileId,
                    )
                  }
                >
                  <option value="conservative">
                    {QUALIFICATION_PROFILES.conservative.labelKo}
                  </option>
                  <option value="balanced">
                    {QUALIFICATION_PROFILES.balanced.labelKo}
                  </option>
                  <option value="aggressive">
                    {QUALIFICATION_PROFILES.aggressive.labelKo}
                  </option>
                  <option value="custom">
                    {qualifiedTargetComparisonProfileLabel("custom")}
                  </option>
                </select>
              </ValidationField>
            </div>
            <div
              className="ss-step4-setting-card ss-step4-setting-card--toggle ss-step4-setting-card--jitter"
              data-state={props.form.jitterEnabled ? "enabled" : "disabled"}
            >
              <label className="ss-step4-setting-card__toggle ss-field-label flex items-center gap-2.5">
                <input
                  data-testid="ss-jitter-enabled"
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={props.form.jitterEnabled}
                  disabled={props.inputDisabled}
                  onChange={(e) =>
                    props.set("jitterEnabled", e.target.checked)
                  }
                />
                <span className="ss-step4-setting-card__toggle-label">
                  파라미터를 조금 바꿔 다시 확인
                </span>
                <StrategySearchFieldHelp fieldId="jitterEnabled" />
              </label>
              <p
                className="ss-step4-setting-card__toggle-brief"
                data-testid="ss-jitter-recheck-brief"
              >
                {STEP4_JITTER_RECHECK_BRIEF_KO}
              </p>
              <p className="ss-step4-setting-card__toggle-meta">
                {props.form.jitterEnabled ? "사용" : "사용 안 함"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <ValidationField
              id="ss-qualification"
              label="합격 기준"
              helpFieldId="qualificationProfile"
              hint="최대 낙폭 한도는 아래에서 별도로 설정합니다."
            >
              <select
                id="ss-qualification"
                className={props.inputClass}
                value={props.form.qualificationProfile}
                disabled={props.inputDisabled}
                onChange={(e) =>
                  props.applyQualification(
                    e.target.value as QualificationProfileId,
                  )
                }
              >
                <option value="conservative">
                  {QUALIFICATION_PROFILES.conservative.labelKo}
                </option>
                <option value="balanced">
                  {QUALIFICATION_PROFILES.balanced.labelKo}
                </option>
                <option value="aggressive">
                  {QUALIFICATION_PROFILES.aggressive.labelKo}
                </option>
                <option value="custom">직접 설정</option>
              </select>
            </ValidationField>
            <ValidationField
              id="ss-min-trades"
              label="최소 거래 수"
              error={props.err("minTradeCount")}
            >
              <input
                id="ss-min-trades"
                data-testid="ss-min-trades"
                className={`${props.inputClass} ss-guided-field-primary`}
                type="number"
                value={props.form.minTradeCount}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("minTradeCount", e.target.value)}
              />
            </ValidationField>
            <ValidationField
              id="ss-min-return"
              label="최소 수익률(%)"
              error={props.err("minTotalReturn")}
              hint="비우면 제한 없음 · 예: 10 = 10%"
            >
              <input
                id="ss-min-return"
                data-testid="ss-target-return"
                className={`${props.inputClass} ss-guided-field-primary`}
                type="number"
                step="0.01"
                value={props.form.minTotalReturn}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("minTotalReturn", e.target.value)}
              />
            </ValidationField>
            <div
              className="ss-step4-setting-card ss-step4-setting-card--toggle ss-step4-setting-card--jitter md:col-span-2 xl:col-span-1"
              data-state={props.form.jitterEnabled ? "enabled" : "disabled"}
            >
              <label className="ss-step4-setting-card__toggle ss-field-label flex items-center gap-2.5">
                <input
                  data-testid="ss-jitter-enabled"
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={props.form.jitterEnabled}
                  disabled={props.inputDisabled}
                  onChange={(e) =>
                    props.set("jitterEnabled", e.target.checked)
                  }
                />
                <span className="ss-step4-setting-card__toggle-label">
                  파라미터를 조금 바꿔 다시 확인
                </span>
                <StrategySearchFieldHelp fieldId="jitterEnabled" />
              </label>
              <p
                className="ss-step4-setting-card__toggle-brief"
                data-testid="ss-jitter-recheck-brief"
              >
                {STEP4_JITTER_RECHECK_BRIEF_KO}
              </p>
              <p className="ss-step4-setting-card__toggle-meta">
                {props.form.jitterEnabled ? "사용" : "사용 안 함"}
              </p>
            </div>
          </>
        )}
      </ValidationBand>

      <ValidationBand
        band="risk"
        enterIndex={2}
        sectionId="ss-section-risk"
        srTitle="위험 · 레버리지"
        automaticTargetMode={props.automaticTargetMode}
      >
        <ValidationField
          id="ss-leverage-mode"
          label="레버리지"
          helpFieldId="leverageMode"
          origin="editable"
        >
          <select
            id="ss-leverage-mode"
            data-testid="ss-leverage-mode"
            className={props.inputClass}
            value={props.form.leverageMode}
            disabled={props.inputDisabled}
            onChange={(e) =>
              props.set("leverageMode", e.target.value as LeverageModeId)
            }
          >
            <option value="automatic">자동 추천</option>
            <option value="fixed">고정</option>
            <option value="range">범위 탐색</option>
            <option value="disabled">사용 안 함</option>
          </select>
        </ValidationField>
        {props.form.leverageMode === "fixed" ? (
          <ValidationField id="ss-leverage-fixed" label="고정 배율">
            <input
              id="ss-leverage-fixed"
              data-testid="ss-leverage-fixed"
              className={props.inputClass}
              type="number"
              min={1}
              max={20}
              step={1}
              value={props.form.leverageFixed}
              disabled={props.inputDisabled}
              onChange={(e) => props.set("leverageFixed", e.target.value)}
            />
          </ValidationField>
        ) : null}
        {props.form.leverageMode === "range" ||
        props.form.leverageMode === "automatic" ? (
          <div
            className="ss-step4-leverage-minmax-row sm:col-span-2 xl:col-span-3"
            data-testid="ss-step4-leverage-minmax-row"
          >
            <ValidationField id="ss-leverage-min" label="최소 배율">
              <input
                id="ss-leverage-min"
                data-testid="ss-leverage-min"
                className={props.inputClass}
                type="number"
                min={1}
                max={20}
                value={props.form.leverageMin}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("leverageMin", e.target.value)}
              />
            </ValidationField>
            <ValidationField id="ss-leverage-max" label="최대 배율">
              <input
                id="ss-leverage-max"
                data-testid="ss-leverage-max"
                className={props.inputClass}
                type="number"
                min={1}
                max={20}
                value={props.form.leverageMax}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("leverageMax", e.target.value)}
              />
            </ValidationField>
          </div>
        ) : null}
        {props.form.leverageMode === "disabled" ? (
          <p className="text-sm text-slate-400 sm:col-span-2 xl:col-span-3">
            레버리지 사용 안 함 — 모든 후보를 1x로 고정합니다.
          </p>
        ) : null}
        <div className="ss-step4-leverage-stack sm:col-span-2 xl:col-span-3">
          <Step4LeverageRangeVisual
            leverageMode={props.form.leverageMode}
            leverageFixed={props.form.leverageFixed}
            leverageMin={props.form.leverageMin}
            leverageMax={props.form.leverageMax}
          />
          <p
            className="ss-guided-notice ss-guided-notice--compact"
            data-testid="ss-leverage-warning"
            role="note"
          >
            레버리지는 수익과 손실을 동시에 확대합니다.
          </p>
        </div>
        {props.automaticTargetMode ? null : (
          <>
            <ValidationField
              id="ss-max-mdd"
              label="최대 허용 낙폭"
              error={props.err("maxMdd")}
              origin={
                props.form.mddPreset === "custom" ? "editable" : "preset"
              }
            >
              <select
                id="ss-max-mdd"
                data-testid="ss-max-mdd"
                className={props.inputClass}
                value={props.form.mddPreset}
                disabled={props.inputDisabled}
                onChange={(e) =>
                  props.applyMddPreset(e.target.value as MddPresetId)
                }
              >
                <option value="10">10%</option>
                <option value="15">15%</option>
                <option value="20">20%</option>
                <option value="25">25%</option>
                <option value="custom">직접 설정</option>
              </select>
            </ValidationField>
            {props.form.mddPreset === "custom" ? (
              <ValidationField
                id="ss-max-mdd-custom"
                label="최대 낙폭(%)"
                error={props.err("maxMdd")}
                hint="예: 15 = 15%"
              >
                <input
                  id="ss-max-mdd-custom"
                  data-testid="ss-max-mdd-custom"
                  className={props.inputClass}
                  type="number"
                  step="0.01"
                  value={props.form.maxMdd}
                  disabled={props.inputDisabled}
                  onChange={(e) => props.set("maxMdd", e.target.value)}
                />
              </ValidationField>
            ) : null}
          </>
        )}
      </ValidationBand>

      <ValidationBand
        band="cost"
        enterIndex={3}
        sectionId="ss-section-cost-guided"
        srTitle="거래 비용"
        automaticTargetMode={props.automaticTargetMode}
      >
        <div className="ss-step4-cost-group md:col-span-2 xl:col-span-3">
          <div className="ss-step4-cost-group__rates">
            <ValidationField
              id="ss-fee"
              label="수수료율"
              helpFieldId="feeRate"
              error={props.err("feeRate")}
            >
              <input
                id="ss-fee"
                data-testid="ss-fee"
                className={props.inputClass}
                type="number"
                step="0.0001"
                value={props.form.feeRate}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("feeRate", e.target.value)}
              />
              {feeHint ? (
                <span className="ss-step4-rate-hint">≈ {feeHint}</span>
              ) : null}
            </ValidationField>
            <ValidationField
              id="ss-slippage"
              label="슬리피지율"
              helpFieldId="slippageRate"
              error={props.err("slippageRate")}
            >
              <input
                id="ss-slippage"
                data-testid="ss-slippage"
                className={props.inputClass}
                type="number"
                step="0.0001"
                value={props.form.slippageRate}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("slippageRate", e.target.value)}
              />
              {slipHint ? (
                <span className="ss-step4-rate-hint">≈ {slipHint}</span>
              ) : null}
            </ValidationField>
          </div>
          <div
            className="ss-step4-setting-card ss-step4-setting-card--toggle ss-step4-cost-stress"
            data-state={props.form.stressEnabled ? "enabled" : "disabled"}
          >
            <label className="ss-step4-setting-card__toggle ss-field-label flex items-center gap-2.5">
              <input
                data-testid="ss-stress-enabled"
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={props.form.stressEnabled}
                disabled={props.inputDisabled}
                onChange={(e) => props.set("stressEnabled", e.target.checked)}
              />
              <span className="ss-step4-setting-card__toggle-label">
                {COST_STRESS_LABEL}
              </span>
              <StrategySearchFieldHelp fieldId="stressEnabled" />
            </label>
            <p className="ss-helper ss-step4-cost-stress__help">{COST_STRESS_HELP}</p>
          </div>
        </div>
      </ValidationBand>
    </div>
  );
}
