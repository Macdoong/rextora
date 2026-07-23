"use client";

import { Button } from "@/components/ui/primitives";
import type { StrategySearchOperatorFormState } from "./formDefaults";
import {
  HISTORICAL_PERIOD_PRESETS,
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  QUALIFICATION_PROFILES,
  SEARCH_DEPTH_PROFILES,
  datesForPeriodPreset,
  depthFieldDefaults,
  generateDefaultSearchName,
  qualificationFieldDefaults,
  type HistoricalPeriodPresetId,
  type QualificationProfileId,
  type QualifiedTargetPreset,
  type SearchDepthProfileId,
} from "./formDefaults";
import type { FormFieldError } from "./formValidation";

const inputClass = "ss-input mt-1";

function Field({
  id,
  label,
  error,
  children,
  hint,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="ss-field-label mb-1 block">{label}</span>
      {children}
      {hint ? <span className="ss-helper mt-1 block">{hint}</span> : null}
      {error ? (
        <span className="mt-1 block text-xs text-red-300" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function AdvancedGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ss-advanced-group space-y-3">
      <h4 className="ss-subsection-title">{title}</h4>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

function isGeneratedName(name: string, symbol: string, timeframe: string): boolean {
  return (
    !name.trim() ||
    name === generateDefaultSearchName(symbol, timeframe) ||
    /^[A-Z0-9]+ \S+ 탐색$/.test(name.trim())
  );
}

export function JobCreateForm(props: {
  form: StrategySearchOperatorFormState;
  errors: FormFieldError[];
  submitting: boolean;
  onChange: (next: StrategySearchOperatorFormState) => void;
  onSubmit: () => void;
}) {
  const { form, errors, submitting, onChange, onSubmit } = props;
  const err = (field: string) => errors.find((e) => e.field === field)?.message;

  function set<K extends keyof StrategySearchOperatorFormState>(
    key: K,
    value: StrategySearchOperatorFormState[K],
  ) {
    onChange({ ...form, [key]: value });
  }

  function applySymbol(symbol: string) {
    const nextName = isGeneratedName(form.searchName, form.symbol, form.timeframe)
      ? generateDefaultSearchName(symbol, form.timeframe)
      : form.searchName;
    onChange({ ...form, symbol, searchName: nextName });
  }

  function applyTimeframe(timeframe: string) {
    const nextName = isGeneratedName(form.searchName, form.symbol, form.timeframe)
      ? generateDefaultSearchName(form.symbol, timeframe)
      : form.searchName;
    onChange({ ...form, timeframe, searchName: nextName });
  }

  function applyPeriod(preset: HistoricalPeriodPresetId) {
    if (preset === "custom") {
      onChange({ ...form, periodPreset: "custom" });
      return;
    }
    const dates = datesForPeriodPreset(preset);
    onChange({
      ...form,
      periodPreset: preset,
      availableFromDate: dates.from,
      availableToDate: dates.to,
    });
  }

  function applyDepth(depthProfile: SearchDepthProfileId) {
    const d = depthFieldDefaults(depthProfile);
    onChange({
      ...form,
      depthProfile,
      ...d,
    });
  }

  function applyQualification(qualificationProfile: QualificationProfileId) {
    const q = qualificationFieldDefaults(qualificationProfile);
    onChange({
      ...form,
      qualificationProfile,
      ...q,
    });
  }

  const qualHint =
    form.qualificationProfile === "custom"
      ? "직접 합격 목표를 조정합니다."
      : QUALIFICATION_PROFILES[
          form.qualificationProfile as Exclude<QualificationProfileId, "custom">
        ].descriptionKo;

  const depthHint = SEARCH_DEPTH_PROFILES[form.depthProfile].descriptionKo;

  return (
    <section
      className="rextora-card space-y-5 p-5"
      data-testid="strategy-search-create"
      aria-labelledby="strategy-search-create-title"
    >
      <div>
        <h2 id="strategy-search-create-title" className="ss-section-title">
          탐색 목표 설정
        </h2>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          목표만 정하면 AI가 연구를 수행하고, 검증된 합격 전략만 보여줍니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field id="ss-search-name" label="탐색 이름">
          <input
            id="ss-search-name"
            data-testid="ss-search-name"
            className={inputClass}
            value={form.searchName}
            placeholder={generateDefaultSearchName(form.symbol, form.timeframe)}
            onChange={(e) => set("searchName", e.target.value)}
          />
        </Field>

        <Field id="ss-symbol" label="마켓" error={err("symbol")}>
          <select
            id="ss-symbol"
            data-testid="ss-symbols"
            className={inputClass}
            value={form.symbol}
            onChange={(e) => applySymbol(e.target.value)}
          >
            {OPERATOR_SUPPORTED_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ss-timeframe" label="타임프레임" error={err("timeframe")}>
          <select
            id="ss-timeframe"
            data-testid="ss-timeframe"
            className={inputClass}
            value={form.timeframe}
            onChange={(e) => applyTimeframe(e.target.value)}
          >
            {OPERATOR_SUPPORTED_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ss-period" label="분석 기간" error={err("dataRef")}>
          <select
            id="ss-period"
            data-testid="ss-period"
            className={inputClass}
            value={form.periodPreset}
            onChange={(e) =>
              applyPeriod(e.target.value as HistoricalPeriodPresetId)
            }
          >
            <option value="short">{HISTORICAL_PERIOD_PRESETS.short.labelKo}</option>
            <option value="standard">
              {HISTORICAL_PERIOD_PRESETS.standard.labelKo}
            </option>
            <option value="long">{HISTORICAL_PERIOD_PRESETS.long.labelKo}</option>
            <option value="custom">직접 지정 (고급 설정)</option>
          </select>
        </Field>

        <Field id="ss-depth" label="탐색 수준" hint={depthHint}>
          <select
            id="ss-depth"
            data-testid="ss-intensity"
            className={inputClass}
            value={form.depthProfile}
            onChange={(e) =>
              applyDepth(e.target.value as SearchDepthProfileId)
            }
          >
            {(Object.keys(SEARCH_DEPTH_PROFILES) as SearchDepthProfileId[]).map(
              (id) => (
                <option key={id} value={id}>
                  {SEARCH_DEPTH_PROFILES[id].labelKo}
                </option>
              ),
            )}
          </select>
        </Field>

        <Field id="ss-qualification" label="합격 기준" hint={qualHint}>
          <select
            id="ss-qualification"
            data-testid="ss-goal"
            className={inputClass}
            value={form.qualificationProfile}
            onChange={(e) =>
              applyQualification(e.target.value as QualificationProfileId)
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
        </Field>

        <Field
          id="ss-qualified-target"
          label="필요한 합격 전략 수"
          error={err("qualifiedTarget")}
        >
          <select
            id="ss-qualified-target"
            data-testid="ss-qualified-target"
            className={inputClass}
            value={form.qualifiedTargetPreset}
            onChange={(e) =>
              set(
                "qualifiedTargetPreset",
                e.target.value as QualifiedTargetPreset,
              )
            }
          >
            <option value="1">1개</option>
            <option value="3">3개</option>
            <option value="5">5개</option>
            <option value="custom">직접 입력</option>
          </select>
        </Field>

        {form.qualifiedTargetPreset === "custom" ? (
          <Field id="ss-qualified-custom" label="합격 목표 (직접)">
            <input
              id="ss-qualified-custom"
              data-testid="ss-qualified-custom"
              className={inputClass}
              type="number"
              min={1}
              max={50}
              value={form.qualifiedTargetCustom}
              onChange={(e) => set("qualifiedTargetCustom", e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          id="ss-min-trades"
          label="최소 거래 수"
          error={err("minTradeCount")}
        >
          <input
            id="ss-min-trades"
            data-testid="ss-min-trades"
            className={inputClass}
            type="number"
            value={form.minTradeCount}
            onChange={(e) => set("minTradeCount", e.target.value)}
          />
        </Field>

        <Field
          id="ss-min-return"
          label="최소 수익률(%)"
          error={err("minTotalReturn")}
          hint="비우면 제한 없음 · 예: 10 = 10%"
        >
          <input
            id="ss-min-return"
            data-testid="ss-target-return"
            className={inputClass}
            type="number"
            step="0.01"
            value={form.minTotalReturn}
            onChange={(e) => set("minTotalReturn", e.target.value)}
          />
        </Field>

        <Field
          id="ss-max-mdd"
          label="최대 낙폭(%)"
          error={err("maxMdd")}
          hint="예: 15 = 15%"
        >
          <input
            id="ss-max-mdd"
            data-testid="ss-max-mdd"
            className={inputClass}
            type="number"
            step="0.01"
            value={form.maxMdd}
            onChange={(e) => set("maxMdd", e.target.value)}
          />
        </Field>
      </div>

      <input
        data-testid="ss-run-until-qualified"
        type="checkbox"
        className="sr-only"
        checked
        readOnly
        tabIndex={-1}
        aria-hidden
      />

      <details
        className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4"
        open={form.showAdvanced}
        onToggle={(e) =>
          set("showAdvanced", (e.target as HTMLDetailsElement).open)
        }
      >
        <summary
          className="ss-subsection-title cursor-pointer"
          data-testid="ss-advanced-toggle"
        >
          고급 설정
        </summary>
        <div className="mt-4 space-y-5">
          <AdvancedGroup title="데이터">
            <Field id="ss-available-from" label="시작일" error={err("dataRef")}>
              <input
                id="ss-available-from"
                data-testid="ss-available-from"
                className={inputClass}
                type="date"
                value={form.availableFromDate}
                onChange={(e) => {
                  onChange({
                    ...form,
                    availableFromDate: e.target.value,
                    periodPreset: "custom",
                  });
                }}
              />
            </Field>
            <Field id="ss-available-to" label="종료일">
              <input
                id="ss-available-to"
                data-testid="ss-available-to"
                className={inputClass}
                type="date"
                value={form.availableToDate}
                onChange={(e) => {
                  onChange({
                    ...form,
                    availableToDate: e.target.value,
                    periodPreset: "custom",
                  });
                }}
              />
            </Field>
            <Field id="ss-seed" label="시드" error={err("seed")}>
              <input
                id="ss-seed"
                data-testid="ss-seed"
                className={inputClass}
                type="number"
                value={form.seed}
                onChange={(e) => set("seed", e.target.value)}
              />
            </Field>
          </AdvancedGroup>

          <AdvancedGroup title="실행 제한">
            <Field
              id="ss-candidate-budget"
              label="최대 후보 예산"
              error={err("candidateBudget")}
              hint={`비우면 수준 기본값 (${SEARCH_DEPTH_PROFILES[form.depthProfile].candidateBudget})`}
            >
              <input
                id="ss-candidate-budget"
                data-testid="ss-max-search"
                className={inputClass}
                type="number"
                min={1}
                value={form.candidateBudgetOverride}
                placeholder={String(
                  SEARCH_DEPTH_PROFILES[form.depthProfile].candidateBudget,
                )}
                onChange={(e) => set("candidateBudgetOverride", e.target.value)}
              />
            </Field>
            <Field
              id="ss-max-runtime"
              label="최대 실행 시간 (분)"
              error={err("maxRuntime")}
              hint={
                SEARCH_DEPTH_PROFILES[form.depthProfile].maxRuntimeMs == null
                  ? "비우면 제한 없음"
                  : `비우면 수준 기본 ${Math.round((SEARCH_DEPTH_PROFILES[form.depthProfile].maxRuntimeMs ?? 0) / 60000)}분`
              }
            >
              <input
                id="ss-max-runtime"
                data-testid="ss-max-runtime"
                className={inputClass}
                type="number"
                min={1}
                value={form.maxRuntimeMinutesOverride}
                onChange={(e) =>
                  set("maxRuntimeMinutesOverride", e.target.value)
                }
              />
            </Field>
          </AdvancedGroup>

          <AdvancedGroup title="비용 검증">
            <Field id="ss-fee" label="수수료" error={err("feeRate")}>
              <input
                id="ss-fee"
                data-testid="ss-fee"
                className={inputClass}
                type="number"
                step="0.0001"
                value={form.feeRate}
                onChange={(e) => set("feeRate", e.target.value)}
              />
            </Field>
            <Field id="ss-slippage" label="슬리피지" error={err("slippageRate")}>
              <input
                id="ss-slippage"
                data-testid="ss-slippage"
                className={inputClass}
                type="number"
                step="0.0001"
                value={form.slippageRate}
                onChange={(e) => set("slippageRate", e.target.value)}
              />
            </Field>
            <label className="ss-field-label flex items-center gap-2.5 self-end">
              <input
                data-testid="ss-stress-enabled"
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={form.stressEnabled}
                onChange={(e) => set("stressEnabled", e.target.checked)}
              />
              비용 검증 사용
            </label>
          </AdvancedGroup>

          <AdvancedGroup title="안정성 검증">
            <label className="ss-field-label flex items-center gap-2.5 self-end">
              <input
                data-testid="ss-jitter-enabled"
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={form.jitterEnabled}
                onChange={(e) => set("jitterEnabled", e.target.checked)}
              />
              안정성 검증 사용
            </label>
          </AdvancedGroup>

          <AdvancedGroup title="전문가 조건">
            <Field
              id="ss-min-winrate"
              label="최소 승률(%)"
              error={err("minWinRate")}
              hint="비우면 제한 없음 · 예: 45 = 45%"
            >
              <input
                id="ss-min-winrate"
                data-testid="ss-min-winrate"
                className={inputClass}
                type="number"
                step="0.01"
                value={form.minWinRate}
                onChange={(e) => set("minWinRate", e.target.value)}
              />
            </Field>
            <Field
              id="ss-min-score"
              label="최소 연구 점수"
              error={err("minScore")}
              hint="비우면 제한 없음"
            >
              <input
                id="ss-min-score"
                data-testid="ss-min-score"
                className={inputClass}
                type="number"
                step="0.01"
                value={form.minScore}
                onChange={(e) => set("minScore", e.target.value)}
              />
            </Field>
          </AdvancedGroup>
        </div>
      </details>

      {errors.length > 0 ? (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          role="alert"
          data-testid="ss-form-errors"
        >
          입력 오류 {errors.length}건 — 제출이 차단되었습니다.
        </div>
      ) : null}

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          className="ss-btn-primary"
          data-testid="ss-create-submit"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? "시작 중…" : "탐색 시작"}
        </Button>
      </div>
    </section>
  );
}
