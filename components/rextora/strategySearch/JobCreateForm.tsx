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
  type DurationPresetId,
  type HistoricalPeriodPresetId,
  type MarketMode,
  type MddPresetId,
  type QualificationProfileId,
  type QualifiedTargetPreset,
  type ResearchBasisId,
  type SearchDepthProfileId,
  type TradingStyleId,
  BEGINNER_PRESET_MAP,
} from "./formDefaults";
import type { FormFieldError } from "./formValidation";
import { summarizeStrategySearchConfig } from "./formValidation";

const inputClass = "ss-input mt-1";

const RECOMMENDED_SYMBOL = "BTCUSDT";

const DURATION_PRESET_MINUTES: Record<
  Exclude<DurationPresetId, "custom">,
  string
> = {
  "60": "60",
  "180": "180",
  "360": "360",
  "720": "720",
  "1440": "1440",
};

const TRADING_STYLE_MAP: Record<
  TradingStyleId,
  { qualification: Exclude<QualificationProfileId, "custom">; depth: SearchDepthProfileId }
> = {
  scalping: { qualification: "aggressive", depth: "fast" },
  balanced: { qualification: "balanced", depth: "standard" },
  stable: { qualification: "conservative", depth: "deep" },
};

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

  function applyMarketMode(marketMode: MarketMode) {
    if (marketMode === "recommended") {
      const nextName = isGeneratedName(form.searchName, form.symbol, form.timeframe)
        ? generateDefaultSearchName(RECOMMENDED_SYMBOL, form.timeframe)
        : form.searchName;
      onChange({
        ...form,
        marketMode,
        symbol: RECOMMENDED_SYMBOL,
        searchName: nextName,
      });
      return;
    }
    onChange({ ...form, marketMode });
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
      // Primary duration budget wins over depth-profile runtime defaults.
      maxRuntimeMinutesOverride: form.maxRuntimeMinutesOverride,
    });
  }

  function applyQualification(qualificationProfile: QualificationProfileId) {
    const q = qualificationFieldDefaults(qualificationProfile);
    onChange({
      ...form,
      qualificationProfile,
      ...q,
      // Primary MDD control wins over qualification-profile defaults.
      maxMdd: form.maxMdd,
      mddPreset: form.mddPreset,
    });
  }

  function applyDurationPreset(durationPreset: DurationPresetId) {
    if (durationPreset === "custom") {
      onChange({ ...form, durationPreset: "custom" });
      return;
    }
    onChange({
      ...form,
      durationPreset,
      maxRuntimeMinutesOverride: DURATION_PRESET_MINUTES[durationPreset],
    });
  }

  function applyTradingStyle(tradingStyle: TradingStyleId) {
    const mapped = TRADING_STYLE_MAP[tradingStyle];
    const q = qualificationFieldDefaults(mapped.qualification);
    const d = depthFieldDefaults(mapped.depth);
    onChange({
      ...form,
      tradingStyle,
      qualificationProfile: mapped.qualification,
      depthProfile: mapped.depth,
      ...q,
      ...d,
      // Keep primary MDD + duration selections.
      maxMdd: form.maxMdd,
      mddPreset: form.mddPreset,
      maxRuntimeMinutesOverride: form.maxRuntimeMinutesOverride,
      durationPreset: form.durationPreset,
    });
  }

  function applyMddPreset(mddPreset: MddPresetId) {
    if (mddPreset === "custom") {
      onChange({ ...form, mddPreset: "custom" });
      return;
    }
    onChange({
      ...form,
      mddPreset,
      maxMdd: mddPreset,
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
        <Field id="ss-market-mode" label="탐색 대상" error={err("symbol")}>
          <select
            id="ss-market-mode"
            data-testid="ss-market-mode"
            className={inputClass}
            value={form.marketMode}
            onChange={(e) => applyMarketMode(e.target.value as MarketMode)}
          >
            <option value="recommended">추천 코인 자동 선택</option>
            <option value="manual">직접 선택</option>
          </select>
          <div
            className="mt-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300"
            data-testid="ss-symbol-selection-summary"
          >
            <div>
              탐색 대상 설정:{" "}
              {form.marketMode === "recommended"
                ? "추천 코인 자동 선택"
                : "직접 선택"}
            </div>
            <div className="mt-1 font-medium text-slate-100">
              실제 선택 결과: {form.symbol || RECOMMENDED_SYMBOL}
            </div>
            {form.marketMode === "recommended" ? (
              <div className="mt-1 text-slate-500">
                자동 선택 근거: 유동성·데이터 가용성 기준 기본 추천 심볼
              </div>
            ) : null}
          </div>
        </Field>

        {form.marketMode === "manual" ? (
          <Field id="ss-symbol" label="코인" error={err("symbol")}>
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
        ) : (
          <input
            data-testid="ss-symbols"
            type="hidden"
            value={form.symbol}
            readOnly
          />
        )}

        <Field id="ss-duration" label="탐색 시간">
          <select
            id="ss-duration"
            data-testid="ss-duration"
            className={inputClass}
            value={form.durationPreset}
            onChange={(e) =>
              applyDurationPreset(e.target.value as DurationPresetId)
            }
          >
            <option value="60">1시간</option>
            <option value="180">3시간</option>
            <option value="360">6시간</option>
            <option value="720">12시간</option>
            <option value="1440">24시간</option>
            <option value="custom">직접 설정</option>
          </select>
        </Field>

        {form.durationPreset === "custom" ? (
          <Field
            id="ss-max-runtime-primary"
            label="최대 실행 시간 (분)"
            error={err("maxRuntime")}
          >
            <input
              id="ss-max-runtime-primary"
              data-testid="ss-max-runtime-primary"
              className={inputClass}
              type="number"
              min={1}
              value={form.maxRuntimeMinutesOverride}
              onChange={(e) =>
                set("maxRuntimeMinutesOverride", e.target.value)
              }
            />
          </Field>
        ) : null}

        <div data-testid="ss-intensity">
          <Field
            id="ss-trading-style"
            label="초보자 프리셋"
            hint={
              form.tradingStyle === "scalping"
                ? BEGINNER_PRESET_MAP.aggressive.criteriaKo.join(" · ")
                : form.tradingStyle === "stable"
                  ? BEGINNER_PRESET_MAP.safe.criteriaKo.join(" · ")
                  : BEGINNER_PRESET_MAP.balanced.criteriaKo.join(" · ")
            }
          >
            <select
              id="ss-trading-style"
              data-testid="ss-goal"
              className={inputClass}
              value={form.tradingStyle}
              onChange={(e) =>
                applyTradingStyle(e.target.value as TradingStyleId)
              }
            >
              <option value="stable">안전형</option>
              <option value="balanced">균형형</option>
              <option value="scalping">공격형</option>
            </select>
          </Field>
          <ul
            className="mt-2 space-y-1 text-xs text-slate-400"
            data-testid="ss-beginner-preset-criteria"
          >
            {(form.tradingStyle === "scalping"
              ? BEGINNER_PRESET_MAP.aggressive
              : form.tradingStyle === "stable"
                ? BEGINNER_PRESET_MAP.safe
                : BEGINNER_PRESET_MAP.balanced
            ).criteriaKo.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>

        <Field id="ss-max-mdd" label="최대 허용 낙폭" error={err("maxMdd")}>
          <select
            id="ss-max-mdd"
            data-testid="ss-max-mdd"
            className={inputClass}
            value={form.mddPreset}
            onChange={(e) => applyMddPreset(e.target.value as MddPresetId)}
          >
            <option value="10">10%</option>
            <option value="15">15%</option>
            <option value="20">20%</option>
            <option value="25">25%</option>
            <option value="custom">직접 설정</option>
          </select>
        </Field>

        {form.mddPreset === "custom" ? (
          <Field
            id="ss-max-mdd-custom"
            label="최대 낙폭(%)"
            error={err("maxMdd")}
            hint="예: 15 = 15%"
          >
            <input
              id="ss-max-mdd-custom"
              data-testid="ss-max-mdd-custom"
              className={inputClass}
              type="number"
              step="0.01"
              value={form.maxMdd}
              onChange={(e) => set("maxMdd", e.target.value)}
            />
          </Field>
        ) : null}

        <Field id="ss-research-basis" label="탐색 기준">
          <select
            id="ss-research-basis"
            data-testid="ss-research-basis"
            className={inputClass}
            value={form.researchBasis}
            onChange={(e) =>
              set("researchBasis", e.target.value as ResearchBasisId)
            }
          >
            <option value="fresh">완전 신규 탐색</option>
            <option value="improve_best">현재 최고 전략 개선</option>
            <option value="backtest_supplement">백테스트 결과 보완</option>
            <option value="paper_supplement">모의매매 결과 보완</option>
            <option value="live_supplement">실전매매 결과 보완</option>
          </select>
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
          {/*
            stopWhenQualifiedTarget is Expert Mode only (see ExpertModeCard / expert tools).
            Standard lifecycle always continues until DEADLINE_REACHED.
          */}
          <p
            className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2 text-xs text-slate-400"
            data-testid="ss-deadline-completion-note"
          >
            정상 종료 조건은 설정된 탐색 시간 마감(DEADLINE_REACHED)입니다. 합격
            최소 확보 기준·후보 예산은 종료 목표가 아닙니다.
          </p>

          <AdvancedGroup title="기본">
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
                <option value="custom">직접 지정</option>
              </select>
            </Field>

            <Field id="ss-depth" label="탐색 수준" hint={depthHint}>
              <select
                id="ss-depth"
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
              label="목표 합격 전략 수 (진행 지표)"
              error={err("qualifiedTarget")}
              hint="기본값은 시간 예산까지 계속 탐색합니다. 첫 합격에서 멈추지 않습니다."
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
          </AdvancedGroup>

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
              label="탐색 시간 고급 재정의 (분)"
              error={err("maxRuntime")}
              hint="위 ‘탐색 시간’과 동일한 마감 값입니다. 변경하면 기본 탐색 시간도 같이 맞춰집니다."
            >
              <input
                id="ss-max-runtime"
                data-testid="ss-max-runtime"
                className={inputClass}
                type="number"
                min={1}
                value={form.maxRuntimeMinutesOverride}
                onChange={(e) => {
                  onChange({
                    ...form,
                    maxRuntimeMinutesOverride: e.target.value,
                    durationPreset: "custom",
                  });
                }}
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

      {(() => {
        const summary = summarizeStrategySearchConfig(form);
        return (
          <div
            className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm"
            data-testid="ss-config-validation-summary"
          >
            <div className="font-semibold text-slate-100">탐색 설정 확인</div>
            <div
              className={
                summary.status === "ok"
                  ? "mt-1 text-emerald-200"
                  : summary.status === "auto_correctable"
                    ? "mt-1 text-amber-200"
                    : "mt-1 text-red-200"
              }
              data-testid="ss-config-validation-status"
            >
              {summary.labelKo}
            </div>
          </div>
        );
      })()}

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
