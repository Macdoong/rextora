"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchOperatorFormState } from "./formDefaults";
import {
  BEGINNER_PRESET_MAP,
  HISTORICAL_PERIOD_PRESETS,
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  QUALIFICATION_PROFILES,
  SEARCH_DEPTH_PROFILES,
  datesForPeriodPreset,
  depthFieldDefaults,
  buildCatalogPatternBlocks,
  generateDefaultSearchName,
  qualificationFieldDefaults,
  type LeverageModeId,
  type DurationPresetId,
  type HistoricalPeriodPresetId,
  type MarketMode,
  type MddPresetId,
  type QualificationProfileId,
  type QualifiedTargetPreset,
  type ResearchBasisId,
  type SearchDepthProfileId,
  type TradingStyleId,
  SEARCHABLE_SPACE_OPTIONS,
} from "./formDefaults";
import type {
  PatternCombinationBlockConfig,
  PatternFamilyId,
} from "./types";
import { PATTERN_PARAMETER_CATALOG } from "@/src/lib/rextora/patternParameterCatalog";
import type { FormFieldError } from "./formValidation";
import { buildAppliedSettingsPreview, formatRuntimeKo } from "./formValidation";
import { SearchConfigManager } from "./SearchConfigManager";

/** Client-safe pattern capability matrix (mirrors patternSupportMatrix). */
const PATTERN_MATRIX = [
  {
    id: "order_block",
    labelKo: "Order Block",
    searchable: true,
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
    reasonKo:
      "엔진 경로는 구현됨. 폐기 가능 Search→Backtest 브라우저 증명 전까지 검증 필요.",
  },
  {
    id: "fvg",
    labelKo: "Fair Value Gap",
    searchable: true,
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
    reasonKo:
      "엔진 경로는 구현됨. 폐기 가능 Search→Backtest 브라우저 증명 전까지 검증 필요.",
  },
  {
    id: "trendline",
    labelKo: "Trendline",
    searchable: true,
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
    reasonKo:
      "엔진 경로는 구현됨. 폐기 가능 Search→Backtest 브라우저 증명 전까지 검증 필요.",
  },
  {
    id: "support_resistance",
    labelKo: "Support / Resistance",
    searchable: true,
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
    reasonKo:
      "엔진 경로는 구현됨. 폐기 가능 Search→Backtest 브라우저 증명 전까지 검증 필요.",
  },
  {
    id: "supply_demand",
    labelKo: "Supply / Demand",
    searchable: true,
    search: "verification_required",
    backtest: "verification_required",
    paper: "partial",
    live: "partial",
    reasonKo:
      "완료 봉 기반 Supply/Demand 감지 및 이벤트 시퀀스 경로가 구현됨. 브라우저 증명 전까지 검증 필요.",
  },
] as const;

function lifecycleLabel(
  level:
    | "supported"
    | "partial"
    | "unsupported"
    | "experimental"
    | "verification_required",
): string {
  if (level === "supported") return "검증 완료";
  if (level === "partial") return "부분 지원";
  if (level === "experimental") return "실험적";
  if (level === "verification_required") return "검증 필요";
  return "미지원";
}

const inputClass = "ss-input mt-1";
const gridClass = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

const RECOMMENDED_SYMBOL = "BTCUSDT";

const PATTERN_FAMILY_OPTIONS: Array<{ id: PatternFamilyId; label: string }> = [
  { id: "order_block", label: "Order Block" },
  { id: "fvg", label: "FVG" },
  { id: "trendline", label: "Trendline" },
  { id: "support_resistance", label: "Support / Resistance" },
  { id: "supply_demand", label: "Supply / Demand" },
];

const PATTERN_ROLE_OPTIONS: Array<{
  id: PatternCombinationBlockConfig["role"];
  label: string;
}> = [
  { id: "entry_zone", label: "진입 존" },
  { id: "trend_filter", label: "방향 필터" },
  { id: "confirmation", label: "확인" },
  { id: "invalidation", label: "무효화" },
  { id: "stop_placement", label: "손절 기준" },
  { id: "take_profit", label: "목표 기준" },
  { id: "exit_filter", label: "청산 필터" },
];

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

function SettingsSection(props: {
  id?: string;
  testId?: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { id, testId, title, description, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const syncFromHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [id]);

  if (defaultOpen && open) {
    return (
      <section
        id={id}
        data-testid={testId}
        className="ss-section-card scroll-mt-24 space-y-4"
        aria-labelledby={id ? `${id}-title` : undefined}
      >
        <div>
          <h3
            id={id ? `${id}-title` : undefined}
            className="ss-subsection-title text-base"
          >
            {title}
          </h3>
          {description ? (
            <p className="ss-helper mt-1">{description}</p>
          ) : null}
        </div>
        <div className={gridClass}>{children}</div>
      </section>
    );
  }
  return (
    <details
      id={id}
      data-testid={testId}
      className="ss-section-card scroll-mt-24"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <summary className="cursor-pointer select-none">
        <h3
          id={id ? `${id}-title` : undefined}
          className="ss-subsection-title inline text-base"
        >
          {title}
        </h3>
        {description ? (
          <span className="ss-helper ml-2">{description}</span>
        ) : null}
      </summary>
      <div className={`${gridClass} mt-4`}>{children}</div>
    </details>
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
  readOnly?: boolean;
  onChange: (next: StrategySearchOperatorFormState) => void;
  onSubmit: () => void;
  activeJobSummary?: {
    searchName: string;
    symbols: string[];
    timeframe: string;
    maxRuntimeMs: number | null;
    status?: string | null;
    expectedCompletionAtMs?: number | null;
    /** Server-built immutable summary (설정 당시 적용값). */
    appliedSummary?: {
      titleKo: string;
      subtitleKo: string;
      sections: Array<{
        id: string;
        titleKo: string;
        rows: Array<{ labelKo: string; valueKo: string }>;
      }>;
      developerPayload: Record<string, unknown>;
    } | null;
  } | null;
}) {
  const { form, errors, submitting, onChange, onSubmit } = props;
  const err = (field: string) => errors.find((e) => e.field === field)?.message;
  const locked = props.activeJobSummary != null || props.readOnly === true;

  if (locked && props.activeJobSummary) {
    const s = props.activeJobSummary;
    const runtimeLabel = formatRuntimeKo(s.maxRuntimeMs ?? null);
    const summary = s.appliedSummary;
    return (
      <section
        className="rextora-card space-y-3 p-4"
        data-testid="ss-create-form-readonly"
        aria-labelledby="ss-create-form-readonly-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="ss-create-form-readonly-title" className="ss-section-title">
              탐색 설정 (읽기 전용)
            </h2>
            <p className="rextora-helper mt-1">
              실행 중인 탐색의 기준 계획은 변경할 수 없습니다.
            </p>
          </div>
        </div>
        <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
          <div data-testid="ss-readonly-user-name">
            사용자 이름: {s.searchName}
          </div>
          <div data-testid="ss-readonly-config-summary">
            실제 설정:{" "}
            {summary?.sections
              ?.find((sec) => sec.titleKo.includes("패턴"))
              ?.rows?.map((r) => r.valueKo)
              .filter(Boolean)
              .slice(0, 3)
              .join(" · ") ||
              `${s.symbols.join(", ")} ${s.timeframe}`}
          </div>
          <div>심볼: {s.symbols.join(", ")}</div>
          <div>타임프레임: {s.timeframe}</div>
          <div>
            요청 시간: {runtimeLabel}
            {s.status != null &&
            !["completed", "cancelled", "failed", "paused"].includes(s.status) &&
            s.expectedCompletionAtMs != null
              ? ` · 예상 완료 ${new Date(s.expectedCompletionAtMs).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
              : ""}
          </div>
        </div>
        <details className="text-sm text-slate-300">
          <summary
            className="cursor-pointer select-none text-base font-medium text-slate-100"
            data-testid="ss-reopen-config"
          >
            설정 상세 보기
          </summary>
          <div className="mt-3 space-y-4" data-testid="ss-applied-search-summary">
            <p className="text-xs text-slate-400">
              {summary?.subtitleKo ??
                "설정 당시 적용값 — 이후 프리셋 변경과 무관합니다."}
            </p>
            {(summary?.sections ?? []).map((sec) => (
              <div key={sec.id} className="rounded-lg border border-slate-800 px-3 py-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {sec.titleKo}
                </h3>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  {sec.rows.map((row) => (
                    <div key={`${sec.id}-${row.labelKo}`}>
                      <dt className="text-xs text-slate-500">{row.labelKo}</dt>
                      <dd className="text-sm text-slate-200">{row.valueKo}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {!summary ? (
              <p className="text-xs text-slate-500">
                요약이 아직 로드되지 않았습니다. 잠시 후 다시 확인하세요.
              </p>
            ) : null}
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer" data-testid="ss-developer-info">
                Developer Details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all opacity-90">
                {JSON.stringify(
                  summary?.developerPayload ?? {
                    symbol: form.symbol,
                    timeframe: form.timeframe,
                    durationPreset: form.durationPreset,
                    depthProfile: form.depthProfile,
                    qualificationProfile: form.qualificationProfile,
                    marketMode: form.marketMode,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        </details>
      </section>
    );
  }

  function set<K extends keyof StrategySearchOperatorFormState>(
    key: K,
    value: StrategySearchOperatorFormState[K],
  ) {
    onChange({ ...form, [key]: value });
  }

  function setMany(patch: Partial<StrategySearchOperatorFormState>) {
    onChange({ ...form, ...patch });
  }

  function setCombinationFamilies(
    families: string[],
    template = form.patternCombinationTemplate,
  ) {
    const unique = [...new Set(families)].slice(0, 4);
    onChange({
      ...form,
      patternCombinationFamilies: unique,
      patternCombinationTemplate: template,
      patternCombinationBlocks: buildCatalogPatternBlocks(
        unique,
        template,
        form.patternCombinationBlocks,
      ),
      selectedSpaceIds: unique.length > 0 ? unique : form.selectedSpaceIds,
      autoStrategyCombo: unique.length > 0 ? false : form.autoStrategyCombo,
    });
  }

  function updatePatternBlock(
    blockId: string,
    patch: Partial<PatternCombinationBlockConfig>,
  ) {
    const blocks = (form.patternCombinationBlocks ?? []).map((block) =>
      block.id === blockId ? { ...block, ...patch } : block,
    );
    const families = blocks.map((block) => block.family);
    onChange({
      ...form,
      patternCombinationBlocks: blocks,
      patternCombinationFamilies: families,
      selectedSpaceIds: families,
      autoStrategyCombo: false,
    });
  }

  function updatePatternParam(
    blockId: string,
    key: string,
    value: string | number | boolean,
  ) {
    const block = (form.patternCombinationBlocks ?? []).find(
      (candidate) => candidate.id === blockId,
    );
    if (!block) return;
    updatePatternBlock(blockId, {
      params: { ...block.params, [key]: value },
    });
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

  function applyDepth(depthProfile: SearchDepthProfileId) {
    const d = depthFieldDefaults(depthProfile);
    onChange({
      ...form,
      depthProfile,
      ...d,
      maxRuntimeMinutesOverride: form.maxRuntimeMinutesOverride,
    });
  }

  function applyQualification(qualificationProfile: QualificationProfileId) {
    const q = qualificationFieldDefaults(qualificationProfile);
    onChange({
      ...form,
      qualificationProfile,
      ...q,
      maxMdd: form.maxMdd,
      mddPreset: form.mddPreset,
    });
  }

  const qualHint =
    form.qualificationProfile === "custom"
      ? "직접 합격 목표를 조정합니다."
      : QUALIFICATION_PROFILES[
          form.qualificationProfile as Exclude<QualificationProfileId, "custom">
        ].descriptionKo;

  const depthHint = SEARCH_DEPTH_PROFILES[form.depthProfile].descriptionKo;
  const depthProfile = SEARCH_DEPTH_PROFILES[form.depthProfile];
  const preview = buildAppliedSettingsPreview(form);
  const inputDisabled = locked;

  return (
    <section
      className="rextora-card space-y-6 p-5"
      data-testid="strategy-search-create"
      aria-labelledby="strategy-search-create-title"
    >
      <div>
        <h2 id="strategy-search-create-title" className="ss-section-title">
          탐색 목표 설정
        </h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          목표만 정하면 AI가 연구를 수행하고, 검증된 합격 전략만 보여줍니다.
        </p>
        <p className="mt-2">
          <Link
            href="#ss-section-engine"
            className="text-sm font-medium text-sky-300 underline-offset-2 hover:underline"
            data-testid="ss-advanced-settings-link"
          >
            고급 탐색 설정
          </Link>
        </p>
      </div>

      <SettingsSection
        id="ss-section-core"
        title="핵심 탐색 설정"
        description="시장·시간·탐색 방향을 정합니다."
      >
        <Field id="ss-search-name" label="탐색 이름">
          <input
            id="ss-search-name"
            data-testid="ss-search-name"
            className={inputClass}
            value={form.searchName}
            placeholder={generateDefaultSearchName(form.symbol, form.timeframe)}
            disabled={inputDisabled}
            onChange={(e) => set("searchName", e.target.value)}
          />
        </Field>

        <Field id="ss-market-mode" label="탐색 대상" error={err("symbol")}>
          <select
            id="ss-market-mode"
            data-testid="ss-market-mode"
            className={inputClass}
            value={form.marketMode}
            disabled={inputDisabled}
            onChange={(e) => applyMarketMode(e.target.value as MarketMode)}
          >
            <option value="recommended">추천 코인 자동 선택</option>
            <option value="manual">직접 선택</option>
          </select>
          <div
            className="mt-2 rounded-lg border-2 border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300"
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
              <div className="mt-1 text-slate-500" data-testid="ss-symbol-selection-reason">
                자동 선택 결과: {form.symbol || RECOMMENDED_SYMBOL}
                <br />
                선택 이유: 충분한 거래량 · 데이터 정상 · 변동성 기준 충족
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
              disabled={inputDisabled}
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

        <Field id="ss-timeframe" label="타임프레임" error={err("timeframe")}>
          <select
            id="ss-timeframe"
            data-testid="ss-timeframe"
            className={inputClass}
            value={form.timeframe}
            disabled={inputDisabled}
            onChange={(e) => applyTimeframe(e.target.value)}
          >
            {OPERATOR_SUPPORTED_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </Field>

        <div data-testid="ss-intensity">
          <Field
            id="ss-trading-style"
            label="초보자 프리셋"
            hint="선택한 프리셋의 핵심 기준이 아래에 표시됩니다."
          >
            <select
              id="ss-trading-style"
              data-testid="ss-goal"
              className={inputClass}
              value={form.tradingStyle}
              disabled={inputDisabled}
              onChange={(e) =>
                applyTradingStyle(e.target.value as TradingStyleId)
              }
            >
              <option value="stable">안전형</option>
              <option value="balanced">균형형</option>
              <option value="scalping">공격형</option>
            </select>
          </Field>
          <div
            className="mt-2 flex flex-wrap gap-1.5 md:col-span-2 xl:col-span-3"
            data-testid="ss-beginner-preset-criteria"
            aria-label="초보자 프리셋 기준"
          >
            {(form.tradingStyle === "scalping"
              ? BEGINNER_PRESET_MAP.aggressive
              : form.tradingStyle === "stable"
                ? BEGINNER_PRESET_MAP.safe
                : BEGINNER_PRESET_MAP.balanced
            ).criteriaChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-md border border-slate-600/80 bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-slate-200"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <Field id="ss-research-basis" label="탐색 기준">
          <select
            id="ss-research-basis"
            data-testid="ss-research-basis"
            className={inputClass}
            value={form.researchBasis}
            disabled={inputDisabled}
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

        <Field id="ss-depth" label="탐색 수준" hint={depthHint}>
          <select
            id="ss-depth"
            className={inputClass}
            value={form.depthProfile}
            disabled={inputDisabled}
            onChange={(e) => applyDepth(e.target.value as SearchDepthProfileId)}
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

        <Field id="ss-duration" label="탐색 시간">
          <select
            id="ss-duration"
            data-testid="ss-duration"
            className={inputClass}
            value={form.durationPreset}
            disabled={inputDisabled}
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
              disabled={inputDisabled}
              onChange={(e) =>
                set("maxRuntimeMinutesOverride", e.target.value)
              }
            />
          </Field>
        ) : null}
      </SettingsSection>

      <section
        id="ss-section-strategy-scope"
        className="ss-section-card scroll-mt-24 space-y-3"
        data-testid="ss-strategy-scope"
      >
        <h3 className="ss-subsection-title text-base">전략 범위</h3>
        <p className="ss-helper">
          SafeV44 탐색 공간만 자동 탐색에 사용할 수 있습니다. 자동 조합을 끄면
          개별 패밀리를 선택합니다.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={form.autoStrategyCombo}
            disabled={inputDisabled}
            onChange={(e) => set("autoStrategyCombo", e.target.checked)}
            data-testid="ss-auto-strategy-combo"
          />
          자동 조합 (깊이 프로필 기본 공간)
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={inputDisabled || form.autoStrategyCombo}
            onClick={() =>
              set(
                "selectedSpaceIds",
                SEARCHABLE_SPACE_OPTIONS.map((s) => s.id),
              )
            }
            data-testid="ss-spaces-select-all"
          >
            전체 선택
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={inputDisabled || form.autoStrategyCombo}
            onClick={() => set("selectedSpaceIds", [])}
            data-testid="ss-spaces-clear-all"
          >
            전체 해제
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SEARCHABLE_SPACE_OPTIONS.map((space) => (
            <label
              key={space.id}
              className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                disabled={inputDisabled || form.autoStrategyCombo}
                checked={form.selectedSpaceIds.includes(space.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...new Set([...form.selectedSpaceIds, space.id])]
                    : form.selectedSpaceIds.filter((id) => id !== space.id);
                  set("selectedSpaceIds", next);
                }}
                data-testid={`ss-space-${space.id}`}
              />
              {space.labelKo}
            </label>
          ))}
        </div>
      </section>

      <section
        id="ss-section-patterns"
        className="ss-section-card scroll-mt-24 space-y-3"
        data-testid="ss-pattern-search"
      >
        <h3 className="ss-subsection-title text-base">패턴 탐색</h3>
        <p className="text-xs text-slate-500">
          패턴 · 탐색 · 백테스트 · 모의매매 · 실전 검증 지원 현황입니다. 지원되는
          패턴을 탐색에 포함할 수 있습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-2 pr-2 font-medium">패턴</th>
                <th className="py-2 pr-2 font-medium">탐색</th>
                <th className="py-2 pr-2 font-medium">백테스트</th>
                <th className="py-2 pr-2 font-medium">모의매매</th>
                <th className="py-2 pr-2 font-medium">실전 검증</th>
                <th className="py-2 font-medium">선택</th>
              </tr>
            </thead>
            <tbody>
              {PATTERN_MATRIX.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-800/80 align-top"
                  data-testid={`ss-pattern-${p.id}`}
                >
                  <td className="py-2 pr-2">
                    <div className="font-medium text-slate-200">{p.labelKo}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {p.reasonKo}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {lifecycleLabel(p.search)}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {lifecycleLabel(p.backtest)}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {lifecycleLabel(p.paper)}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {lifecycleLabel(p.live)}
                  </td>
                  <td className="py-2">
                    {p.searchable ? (
                      <label className="flex items-center gap-2 text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.selectedSpaceIds.includes(p.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [
                                  ...new Set([
                                    ...form.selectedSpaceIds,
                                    p.id,
                                  ]),
                                ]
                              : form.selectedSpaceIds.filter(
                                  (id) => id !== p.id,
                                );
                            set("selectedSpaceIds", next);
                          }}
                          data-testid={`ss-pattern-toggle-${p.id}`}
                        />
                        포함
                      </label>
                    ) : (
                      <label className="flex items-center gap-2 text-slate-500">
                        <input
                          type="checkbox"
                          disabled
                          checked={false}
                          readOnly
                        />
                        선택 불가
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3" data-testid="ss-pattern-config-levels">
          <h4 className="text-sm font-medium text-slate-200">
            패턴 설정 수준
          </h4>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["automatic", "자동 추천"],
                ["basic", "기본 조정"],
                ["expert", "전문가 범위"],
              ] as const
            ).map(([id, label]) => (
              <label
                key={id}
                className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
              >
                <input
                  type="radio"
                  name="ss-pattern-config-level"
                  checked={form.patternConfigLevel === id}
                  disabled={inputDisabled}
                  onChange={() => set("patternConfigLevel", id)}
                  data-testid={`ss-pattern-level-${id}`}
                />
                {label}
              </label>
            ))}
          </div>
          {form.patternConfigLevel === "automatic" ? (
            <p className="text-xs text-slate-500">
              검증된 기본 범위로 패턴 후보를 생성합니다.
            </p>
          ) : null}
          {form.patternConfigLevel === "basic" ||
          form.patternConfigLevel === "expert" ? (
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="ss-pattern-basic-knobs"
            >
              <Field id="ss-pattern-direction" label="방향">
                <select
                  id="ss-pattern-direction"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternDirection}
                  onChange={(e) =>
                    set(
                      "patternDirection",
                      e.target.value as "both" | "long" | "short",
                    )
                  }
                >
                  <option value="both">롱·숏</option>
                  <option value="long">롱만</option>
                  <option value="short">숏만</option>
                </select>
              </Field>
              <Field id="ss-pattern-retest" label="재방문/리테스트">
                <select
                  id="ss-pattern-retest"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternRetestMode}
                  onChange={(e) =>
                    set(
                      "patternRetestMode",
                      e.target.value as "required" | "optional" | "disabled",
                    )
                  }
                >
                  <option value="required">필수</option>
                  <option value="optional">선택</option>
                  <option value="disabled">사용 안 함</option>
                </select>
              </Field>
              <Field id="ss-pattern-confirm" label="확인 강도">
                <select
                  id="ss-pattern-confirm"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternConfirmStrength}
                  onChange={(e) =>
                    set(
                      "patternConfirmStrength",
                      e.target.value as "standard" | "strict",
                    )
                  }
                >
                  <option value="standard">표준</option>
                  <option value="strict">엄격</option>
                </select>
              </Field>
              <Field
                id="ss-pattern-confirm-mode"
                label="종가 확인"
                hint="평가기가 실제로 사용하는 확인 모드입니다."
              >
                <select
                  id="ss-pattern-confirm-mode"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternConfirmationMode}
                  onChange={(e) => {
                    const mode = e.target.value as
                      | "none"
                      | "single_close"
                      | "consecutive_closes"
                      | "threshold_count";
                    onChange({
                      ...form,
                      patternConfirmationMode: mode,
                      patternConfirmClose:
                        mode === "none" ? "disabled" : "required",
                    });
                  }}
                  data-testid="ss-pattern-confirm-mode"
                >
                  <option value="none">확인 없음</option>
                  <option value="single_close">1개 종가 확인</option>
                  <option value="consecutive_closes">연속 N개 확인</option>
                  <option value="threshold_count">기간 내 N개 확인</option>
                </select>
              </Field>
              {form.patternConfirmationMode === "consecutive_closes" ||
              form.patternConfirmationMode === "threshold_count" ? (
                <>
                  <Field id="ss-pattern-confirm-count" label="확인 봉 수(N)">
                    <input
                      id="ss-pattern-confirm-count"
                      className={inputClass}
                      disabled={inputDisabled}
                      type="number"
                      min={1}
                      max={8}
                      value={form.patternConfirmationCandleCount}
                      onChange={(e) =>
                        set("patternConfirmationCandleCount", e.target.value)
                      }
                      data-testid="ss-pattern-confirm-count"
                    />
                  </Field>
                  {form.patternConfigLevel === "expert" ? (
                    <Field
                      id="ss-pattern-confirm-window"
                      label="확인 허용 창(봉)"
                      hint="N개 확인을 모을 수 있는 최대 봉 수입니다."
                    >
                      <input
                        id="ss-pattern-confirm-window"
                        className={inputClass}
                        disabled={inputDisabled}
                        type="number"
                        min={1}
                        max={24}
                        value={form.patternConfirmationWindow}
                        onChange={(e) =>
                          set("patternConfirmationWindow", e.target.value)
                        }
                        data-testid="ss-pattern-confirm-window"
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}
              <Field id="ss-pattern-expiry" label="유효 기간(봉)">
                <input
                  id="ss-pattern-expiry"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternExpiryBars}
                  onChange={(e) => set("patternExpiryBars", e.target.value)}
                />
              </Field>
              <Field id="ss-pattern-risk" label="위험 스타일">
                <select
                  id="ss-pattern-risk"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternRiskStyle}
                  onChange={(e) =>
                    set(
                      "patternRiskStyle",
                      e.target.value as
                        | "conservative"
                        | "balanced"
                        | "aggressive",
                    )
                  }
                >
                  <option value="conservative">보수</option>
                  <option value="balanced">균형</option>
                  <option value="aggressive">공격</option>
                </select>
              </Field>
              <Field
                id="ss-pattern-strength"
                label="패턴 강도"
                hint="zoneLookback · 터치 수 · FVG minGap 기본값을 조정합니다."
              >
                <select
                  id="ss-pattern-strength"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternStrength}
                  onChange={(e) =>
                    set(
                      "patternStrength",
                      e.target.value as "loose" | "standard" | "strict",
                    )
                  }
                  data-testid="ss-pattern-strength"
                >
                  <option value="loose">느슨</option>
                  <option value="standard">표준</option>
                  <option value="strict">엄격</option>
                </select>
              </Field>
              <Field
                id="ss-pattern-sr-sensitivity"
                label="지지/저항·추세선 민감도"
                hint="tolerancePct · zoneWidthPct가 있는 공간에만 적용됩니다."
              >
                <select
                  id="ss-pattern-sr-sensitivity"
                  className={inputClass}
                  disabled={inputDisabled}
                  value={form.patternSrSensitivity}
                  onChange={(e) =>
                    set(
                      "patternSrSensitivity",
                      e.target.value as "tight" | "standard" | "loose",
                    )
                  }
                  data-testid="ss-pattern-sr-sensitivity"
                >
                  <option value="tight">타이트</option>
                  <option value="standard">표준</option>
                  <option value="loose">느슨</option>
                </select>
              </Field>
            </div>
          ) : null}
          {form.patternConfigLevel === "expert" ? (
            <details
              className="text-xs text-slate-400"
              data-testid="ss-pattern-expert-ranges"
            >
              <summary className="cursor-pointer select-none text-slate-300">
                기술 범위 (min/default/max)
              </summary>
              <p className="mt-2">
                전문가 범위는 선택된 패턴 Search space의 정규화 파라미터 범위를
                그대로 사용합니다. 원시 범위는 탐색 계획에 저장됩니다.
              </p>
            </details>
          ) : null}
        </div>

        <div
          className="space-y-3 rounded-lg border border-slate-800/80 p-3"
          data-testid="ss-pattern-combination-builder"
        >
          <h4 className="text-sm font-medium text-slate-200">
            전략 조합 빌더
          </h4>
          <p className="text-xs text-slate-500">
            여러 패턴을 하나의 전략(eventSequence) 안에서 AND / OR / SEQUENCE로
            결합합니다. 선택한 값은 불변 Search 계획에 저장됩니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["single", "단일 패턴"],
                ["confluence", "패턴 중첩"],
                ["breakout_retest", "돌파 후 재진입"],
                ["ordered_sequence", "추세 확인"],
                ["zone_confluence", "자동 조합"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={inputDisabled}
                className={
                  "rounded-lg border px-3 py-1.5 text-xs " +
                  (form.patternCombinationTemplate === id
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-100"
                    : "border-slate-700 text-slate-300")
                }
                data-testid={`ss-combo-preset-${id}`}
                onClick={() => {
                  const defaults: Record<string, string[]> = {
                    single: ["order_block"],
                    confluence: ["order_block", "fvg"],
                    breakout_retest: ["trendline", "support_resistance"],
                    ordered_sequence: ["order_block", "fvg"],
                    zone_confluence: [
                      "order_block",
                      "fvg",
                      "support_resistance",
                    ],
                  };
                  const families = defaults[id] ?? ["order_block"];
                  const op =
                    id === "ordered_sequence" || id === "breakout_retest"
                      ? "sequence"
                      : "and";
                  onChange({
                    ...form,
                    patternCombinationTemplate: id,
                    patternCombinationOperator: op,
                    patternCombinationFamilies: families,
                    patternCombinationBlocks: buildCatalogPatternBlocks(
                      families,
                      id,
                      form.patternCombinationBlocks,
                    ),
                    selectedSpaceIds: families,
                    autoStrategyCombo: false,
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="ss-combo-operator" label="논리 관계">
              <select
                id="ss-combo-operator"
                className={inputClass}
                disabled={inputDisabled}
                value={form.patternCombinationOperator}
                data-testid="ss-combo-operator"
                onChange={(e) =>
                  set(
                    "patternCombinationOperator",
                    e.target
                      .value as StrategySearchOperatorFormState["patternCombinationOperator"],
                  )
                }
              >
                <option value="and">AND (모두 충족)</option>
                <option value="or">OR (하나 이상)</option>
                <option value="sequence">SEQUENCE (순서)</option>
                <option value="weighted_score">WEIGHTED SCORE (가중 점수)</option>
                <option value="priority">PRIORITY (우선순위)</option>
              </select>
            </Field>
            <Field id="ss-combo-template" label="템플릿">
              <select
                id="ss-combo-template"
                className={inputClass}
                disabled={inputDisabled}
                value={form.patternCombinationTemplate}
                data-testid="ss-combo-template"
                onChange={(e) =>
                  set(
                    "patternCombinationTemplate",
                    e.target.value as StrategySearchOperatorFormState["patternCombinationTemplate"],
                  )
                }
              >
                <option value="single">단일 패턴</option>
                <option value="confluence">패턴 중첩</option>
                <option value="entry_confirmation">진입 + 확인</option>
                <option value="ordered_sequence">순서 시퀀스</option>
                <option value="breakout_retest">돌파 후 재진입</option>
                <option value="zone_confluence">존 중첩</option>
                <option value="invalidation_composite">복합 무효화</option>
              </select>
            </Field>
            <Field id="ss-combo-failure-policy" label="실패 정책">
              <select
                id="ss-combo-failure-policy"
                className={inputClass}
                disabled={inputDisabled}
                value={form.patternCombinationFailurePolicy}
                data-testid="ss-combo-failure-policy"
                onChange={(e) =>
                  set(
                    "patternCombinationFailurePolicy",
                    e.target
                      .value as StrategySearchOperatorFormState["patternCombinationFailurePolicy"],
                  )
                }
              >
                <option value="any">ANY — 하나라도 실패하면 전체 조건 탈락</option>
                <option value="all">ALL — 모든 실패 조건이 발생해야 탈락</option>
                <option value="majority">MAJORITY — 과반 실패 시 탈락</option>
              </select>
              <p
                className="mt-1 text-xs text-slate-400"
                data-testid="ss-combo-failure-policy-help"
              >
                {form.patternCombinationFailurePolicy === "all"
                  ? "ALL: 모든 실패 조건이 발생해야 탈락"
                  : form.patternCombinationFailurePolicy === "majority"
                    ? "MAJORITY: 과반수 블록이 실패하면 탈락"
                    : "ANY: 하나라도 실패하면 전체 조건 탈락"}
              </p>
            </Field>
            {form.patternCombinationOperator === "weighted_score" ? (
              <Field
                id="ss-combo-weighted-threshold"
                label="가중 점수 임계값"
                error={err("patternCombinationWeightedThreshold")}
              >
                <input
                  id="ss-combo-weighted-threshold"
                  className={inputClass}
                  type="number"
                  min={0.01}
                  step={0.01}
                  disabled={inputDisabled}
                  value={form.patternCombinationWeightedThreshold}
                  data-testid="ss-combo-weighted-threshold"
                  onChange={(e) =>
                    set("patternCombinationWeightedThreshold", e.target.value)
                  }
                />
              </Field>
            ) : null}
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-400">
              패턴 블록 (최대 4 · 첫 번째가 진입 존)
            </div>
            <div className="flex flex-wrap gap-2">
              {PATTERN_FAMILY_OPTIONS.map(({ id, label }) => {
                const checked =
                  form.patternCombinationFamilies.includes(id);
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
                  >
                    <input
                      type="checkbox"
                      disabled={inputDisabled}
                      checked={checked}
                      data-testid={`ss-combo-family-${id}`}
                      onChange={(e) => {
                        let next = e.target.checked
                          ? [
                              ...new Set([
                                ...form.patternCombinationFamilies,
                                id,
                              ]),
                            ]
                          : form.patternCombinationFamilies.filter(
                              (f) => f !== id,
                            );
                        next = next.slice(0, 4);
                        const template =
                          next.length <= 1
                            ? "single"
                            : form.patternCombinationTemplate === "single"
                              ? "confluence"
                              : form.patternCombinationTemplate;
                        setCombinationFamilies(next, template);
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            {form.patternCombinationFamilies.length > 0 ? (
              <p
                className="mt-2 text-xs text-slate-400"
                data-testid="ss-combo-summary"
              >
                조합:{" "}
                {form.patternCombinationFamilies
                  .map((f) =>
                    f === "order_block"
                      ? "OB"
                      : f === "fvg"
                        ? "FVG"
                        : f === "trendline"
                          ? "TL"
                          : "SR",
                  )
                  .join(
                    form.patternCombinationOperator === "and"
                      ? " AND "
                      : form.patternCombinationOperator === "or"
                        ? " OR "
                        : " → ",
                  )}
              </p>
            ) : null}
          </div>
          {(form.patternCombinationBlocks ?? []).length > 0 ? (
            <div
              className="space-y-3"
              data-testid="ss-pattern-block-editors"
            >
              {(form.patternCombinationBlocks ?? [])
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((block) => (
                  <details
                    key={block.id}
                    open={form.patternConfigLevel !== "automatic"}
                    className="rounded-lg border border-slate-700 bg-slate-950/40 p-3"
                    data-testid={`ss-pattern-block-${block.id}`}
                  >
                    <summary className="cursor-pointer text-sm font-medium text-slate-100">
                      블록 {block.order + 1} ·{" "}
                      {PATTERN_FAMILY_OPTIONS.find((f) => f.id === block.family)
                        ?.label ?? block.family}
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field id={`${block.id}-family`} label="패턴 패밀리">
                        <select
                          id={`${block.id}-family`}
                          className={inputClass}
                          value={block.family}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-family-${block.order}`}
                          onChange={(e) => {
                            const family = e.target.value as PatternFamilyId;
                            const catalogParams = Object.fromEntries(
                              PATTERN_PARAMETER_CATALOG[family].map((entry) => [
                                entry.key,
                                entry.default,
                              ]),
                            );
                            updatePatternBlock(block.id, {
                              id: `${family}_${block.order}`,
                              family,
                              params: catalogParams,
                            });
                          }}
                        >
                          {PATTERN_FAMILY_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id={`${block.id}-role`} label="정규 역할">
                        <select
                          id={`${block.id}-role`}
                          className={inputClass}
                          value={block.role}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-role-${block.order}`}
                          onChange={(e) =>
                            updatePatternBlock(block.id, {
                              role: e.target
                                .value as PatternCombinationBlockConfig["role"],
                            })
                          }
                        >
                          {PATTERN_ROLE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id={`${block.id}-order`} label="실행 순서">
                        <input
                          id={`${block.id}-order`}
                          className={inputClass}
                          type="number"
                          min={0}
                          step={1}
                          value={block.order}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-order-${block.order}`}
                          onChange={(e) =>
                            updatePatternBlock(block.id, {
                              order: Math.trunc(Number(e.target.value)),
                            })
                          }
                        />
                      </Field>
                      <Field id={`${block.id}-weight`} label="가중치">
                        <input
                          id={`${block.id}-weight`}
                          className={inputClass}
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          value={block.weight}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-weight-${block.order}`}
                          onChange={(e) =>
                            updatePatternBlock(block.id, {
                              weight: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field id={`${block.id}-priority`} label="우선순위">
                        <input
                          id={`${block.id}-priority`}
                          className={inputClass}
                          type="number"
                          min={0}
                          step={1}
                          value={block.priority}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-priority-${block.order}`}
                          onChange={(e) =>
                            updatePatternBlock(block.id, {
                              priority: Math.trunc(Number(e.target.value)),
                            })
                          }
                        />
                      </Field>
                      <label className="ss-field-label flex items-center gap-2 self-end py-2">
                        <input
                          type="checkbox"
                          checked={block.required}
                          disabled={inputDisabled}
                          data-testid={`ss-pattern-block-required-${block.order}`}
                          onChange={(e) =>
                            updatePatternBlock(block.id, {
                              required: e.target.checked,
                            })
                          }
                        />
                        필수 블록
                      </label>
                    </div>
                    {form.patternConfigLevel !== "automatic" ? (
                      <div
                        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        data-testid={`ss-pattern-block-params-${block.order}`}
                      >
                        {PATTERN_PARAMETER_CATALOG[block.family].map((entry) => {
                          const id = `${block.id}-${entry.key}`;
                          const value =
                            block.params[entry.key] ?? entry.default;
                          const hint =
                            form.patternConfigLevel === "expert"
                              ? `min ${String(entry.min)} · default ${String(entry.default)} · max ${String(entry.max)}${entry.step != null ? ` · step ${entry.step}` : ""}`
                              : entry.explanationLabel;
                          return (
                            <Field
                              key={entry.key}
                              id={id}
                              label={entry.labelKo}
                              hint={hint}
                              error={err(
                                `patternBlock.${block.id}.${entry.key}`,
                              )}
                            >
                              {entry.type === "enum" ? (
                                <select
                                  id={id}
                                  className={inputClass}
                                  value={String(value)}
                                  disabled={inputDisabled}
                                  data-testid={`ss-pattern-param-${block.order}-${entry.key}`}
                                  onChange={(e) =>
                                    updatePatternParam(
                                      block.id,
                                      entry.key,
                                      e.target.value,
                                    )
                                  }
                                >
                                  {entry.allowedEnumValues?.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : entry.type === "bool" ? (
                                <select
                                  id={id}
                                  className={inputClass}
                                  value={String(Boolean(value))}
                                  disabled={inputDisabled}
                                  data-testid={`ss-pattern-param-${block.order}-${entry.key}`}
                                  onChange={(e) =>
                                    updatePatternParam(
                                      block.id,
                                      entry.key,
                                      e.target.value === "true",
                                    )
                                  }
                                >
                                  <option value="true">사용</option>
                                  <option value="false">사용 안 함</option>
                                </select>
                              ) : (
                                <input
                                  id={id}
                                  className={inputClass}
                                  type="number"
                                  min={
                                    typeof entry.min === "number"
                                      ? entry.min
                                      : undefined
                                  }
                                  max={
                                    typeof entry.max === "number"
                                      ? entry.max
                                      : undefined
                                  }
                                  step={entry.step ?? "any"}
                                  value={Number(value)}
                                  disabled={inputDisabled}
                                  data-testid={`ss-pattern-param-${block.order}-${entry.key}`}
                                  onChange={(e) =>
                                    updatePatternParam(
                                      block.id,
                                      entry.key,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              )}
                            </Field>
                          );
                        })}
                      </div>
                    ) : null}
                  </details>
                ))}
            </div>
          ) : null}
        </div>
      </section>

      <SettingsSection
        id="ss-section-data"
        title="데이터 및 기간 (상세)"
        description="백테스트에 사용할 과거 데이터 구간입니다."
        defaultOpen={false}
      >
        <Field id="ss-period" label="분석 기간" error={err("dataRef")}>
          <select
            id="ss-period"
            data-testid="ss-period"
            className={inputClass}
            value={form.periodPreset}
            disabled={inputDisabled}
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

        <Field id="ss-available-from" label="시작일" error={err("dataRef")}>
          <input
            id="ss-available-from"
            data-testid="ss-available-from"
            className={inputClass}
            type="date"
            value={form.availableFromDate}
            disabled={inputDisabled}
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
            disabled={inputDisabled}
            onChange={(e) => {
              onChange({
                ...form,
                availableToDate: e.target.value,
                periodPreset: "custom",
              });
            }}
          />
        </Field>
      </SettingsSection>

      <SettingsSection
        id="ss-section-risk"
        title="위험 및 레버리지"
        description="합격 낙폭 기준과 레버리지 모드를 설정합니다."
      >
        <Field id="ss-leverage-mode" label="레버리지">
          <select
            id="ss-leverage-mode"
            data-testid="ss-leverage-mode"
            className={inputClass}
            value={form.leverageMode}
            disabled={inputDisabled}
            onChange={(e) =>
              set("leverageMode", e.target.value as LeverageModeId)
            }
          >
            <option value="automatic">자동 추천</option>
            <option value="fixed">고정</option>
            <option value="range">범위 탐색</option>
            <option value="disabled">사용 안 함</option>
          </select>
        </Field>
        <p
          className="text-xs text-amber-200/90 sm:col-span-2 xl:col-span-3"
          data-testid="ss-leverage-warning"
        >
          레버리지는 수익과 손실을 동시에 확대합니다.
        </p>
        {form.leverageMode === "fixed" ? (
          <Field id="ss-leverage-fixed" label="고정 배율">
            <input
              id="ss-leverage-fixed"
              data-testid="ss-leverage-fixed"
              className={inputClass}
              type="number"
              min={1}
              max={20}
              step={1}
              value={form.leverageFixed}
              disabled={inputDisabled}
              onChange={(e) => set("leverageFixed", e.target.value)}
            />
          </Field>
        ) : null}
        {form.leverageMode === "range" || form.leverageMode === "automatic" ? (
          <>
            <Field id="ss-leverage-min" label="최소 배율">
              <input
                id="ss-leverage-min"
                data-testid="ss-leverage-min"
                className={inputClass}
                type="number"
                min={1}
                max={20}
                value={form.leverageMin}
                disabled={inputDisabled}
                onChange={(e) => set("leverageMin", e.target.value)}
              />
            </Field>
            <Field id="ss-leverage-max" label="최대 배율">
              <input
                id="ss-leverage-max"
                data-testid="ss-leverage-max"
                className={inputClass}
                type="number"
                min={1}
                max={20}
                value={form.leverageMax}
                disabled={inputDisabled}
                onChange={(e) => set("leverageMax", e.target.value)}
              />
            </Field>
          </>
        ) : null}
        {form.leverageMode === "disabled" ? (
          <p className="text-sm text-slate-400 sm:col-span-2">
            레버리지 사용 안 함 — 모든 후보를 1x로 고정합니다.
          </p>
        ) : null}
        <Field id="ss-max-mdd" label="최대 허용 낙폭" error={err("maxMdd")}>
          <select
            id="ss-max-mdd"
            data-testid="ss-max-mdd"
            className={inputClass}
            value={form.mddPreset}
            disabled={inputDisabled}
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
              disabled={inputDisabled}
              onChange={(e) => set("maxMdd", e.target.value)}
            />
          </Field>
        ) : null}

        <Field id="ss-min-trades" label="최소 거래 수" error={err("minTradeCount")}>
          <input
            id="ss-min-trades"
            data-testid="ss-min-trades"
            className={inputClass}
            type="number"
            value={form.minTradeCount}
            disabled={inputDisabled}
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
            disabled={inputDisabled}
            onChange={(e) => set("minTotalReturn", e.target.value)}
          />
        </Field>

        <Field id="ss-fee" label="수수료" error={err("feeRate")}>
          <input
            id="ss-fee"
            data-testid="ss-fee"
            className={inputClass}
            type="number"
            step="0.0001"
            value={form.feeRate}
            disabled={inputDisabled}
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
            disabled={inputDisabled}
            onChange={(e) => set("slippageRate", e.target.value)}
          />
        </Field>

        <label className="ss-field-label flex items-center gap-2.5 self-end">
          <input
            data-testid="ss-stress-enabled"
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={form.stressEnabled}
            disabled={inputDisabled}
            onChange={(e) => set("stressEnabled", e.target.checked)}
          />
          비용 검증 (보수적 수수료·슬리피지)
        </label>
      </SettingsSection>

      <SettingsSection
        id="ss-section-validation"
        title="검증 강도"
        description="합격 기준 프로필과 안정성 검증을 조정합니다."
      >
        <Field id="ss-qualification" label="합격 기준" hint={qualHint}>
          <select
            id="ss-qualification"
            className={inputClass}
            value={form.qualificationProfile}
            disabled={inputDisabled}
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

        <label className="ss-field-label flex items-center gap-2.5 self-end">
          <input
            data-testid="ss-jitter-enabled"
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={form.jitterEnabled}
            disabled={inputDisabled}
            onChange={(e) => set("jitterEnabled", e.target.checked)}
          />
          안정성 검증 (파라미터 변동)
        </label>
      </SettingsSection>

      <SettingsSection
        id="ss-section-execution"
        title="실행 및 자원 제한"
        description="탐색 엔진 자원·오류 한도 (고급)."
        defaultOpen={false}
        testId="ss-section-execution"
      >
        <p
          className="rounded-lg border-2 border-slate-700/80 bg-slate-950/50 px-3 py-2 text-xs text-slate-400 md:col-span-2 xl:col-span-3"
          data-testid="ss-deadline-completion-note"
        >
          정상 종료는 설정한 탐색 시간이 끝나는 시점입니다. 합격 최소 확보
          기준·탐색 전략 한도는 안전 제한이며 종료 목표가 아닙니다.
        </p>

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
            disabled={inputDisabled}
            onChange={(e) =>
              set("qualifiedTargetPreset", e.target.value as QualifiedTargetPreset)
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
              disabled={inputDisabled}
              onChange={(e) => set("qualifiedTargetCustom", e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          id="ss-max-runtime"
          label="탐색 시간 고급 재정의 (분)"
          error={err("maxRuntime")}
          hint="기본 ‘탐색 시간’과 동일한 마감 값입니다."
        >
          <input
            id="ss-max-runtime"
            data-testid="ss-max-runtime"
            className={inputClass}
            type="number"
            min={1}
            value={form.maxRuntimeMinutesOverride}
            disabled={inputDisabled}
            onChange={(e) => {
              onChange({
                ...form,
                maxRuntimeMinutesOverride: e.target.value,
                durationPreset: "custom",
              });
            }}
          />
        </Field>
      </SettingsSection>

      <SettingsSection
        id="ss-section-engine"
        testId="ss-section-engine"
        title="엔진 임계값 · 개발자 정보"
        description="시드·세대·후보 풀·오류 서명 등 내부 엔진 설정입니다."
        defaultOpen={false}
      >
        <Field id="ss-seed" label="시드" error={err("seed")}>
          <input
            id="ss-seed"
            data-testid="ss-seed"
            className={inputClass}
            type="number"
            value={form.seed}
            disabled={inputDisabled}
            onChange={(e) => set("seed", e.target.value)}
          />
        </Field>

        <Field
          id="ss-candidate-budget"
          label="후보 풀 (초기 평가 묶음)"
          error={err("candidateBudget")}
          hint={`비우면 수준 기본값 (${depthProfile.candidateBudget}) · 정상 종료 조건 아님`}
        >
          <input
            id="ss-candidate-budget"
            data-testid="ss-max-search"
            className={inputClass}
            type="number"
            min={1}
            value={form.candidateBudgetOverride}
            placeholder={String(depthProfile.candidateBudget)}
            disabled={inputDisabled}
            onChange={(e) => set("candidateBudgetOverride", e.target.value)}
          />
        </Field>

        <Field
          id="ss-stage-batch"
          label="세대당 생성 수"
          hint="탐색 수준에서 자동 결정됩니다."
        >
          <input
            id="ss-stage-batch"
            data-testid="ss-stage-batch"
            className={inputClass}
            type="number"
            value={depthProfile.stageBatchSize}
            readOnly
            disabled
          />
        </Field>

        <Field
          id="ss-error-warning-rate"
          label="오류 경고 비율"
          hint="이 비율을 초과하면 경고가 표시됩니다."
        >
          <input
            id="ss-error-warning-rate"
            data-testid="ss-error-warning-rate"
            className={inputClass}
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={form.errorWarningRate}
            disabled={inputDisabled}
            onChange={(e) => set("errorWarningRate", e.target.value)}
          />
        </Field>

        <Field
          id="ss-error-auto-pause-rate"
          label="오류 자동 일시정지 비율"
          hint="이 비율을 초과했을 때만 탐색이 자동으로 일시정지됩니다."
        >
          <input
            id="ss-error-auto-pause-rate"
            data-testid="ss-error-auto-pause-rate"
            className={inputClass}
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={form.errorAutoPauseRate}
            disabled={inputDisabled}
            onChange={(e) => set("errorAutoPauseRate", e.target.value)}
          />
        </Field>

        <Field
          id="ss-repeated-signature-threshold"
          label="반복 오류 서명 임계값"
          hint="동일 오류 서명이 이 횟수를 초과하면 자동 일시정지가 적용됩니다."
        >
          <input
            id="ss-repeated-signature-threshold"
            data-testid="ss-repeated-signature-threshold"
            className={inputClass}
            type="number"
            min={1}
            value={form.repeatedSignatureThreshold}
            disabled={inputDisabled}
            onChange={(e) => set("repeatedSignatureThreshold", e.target.value)}
          />
        </Field>
      </SettingsSection>

      <SettingsSection
        id="ss-section-expert"
        testId="ss-section-expert"
        title="전문가 조건"
        description="승률·연구 점수 하한 (선택)"
        defaultOpen={false}
      >
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
            disabled={inputDisabled}
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
            disabled={inputDisabled}
            onChange={(e) => set("minScore", e.target.value)}
          />
        </Field>
      </SettingsSection>

      <section
        id="ss-section-preview"
        className="ss-section-card scroll-mt-24"
        aria-labelledby="ss-applied-settings-preview-title"
      >
        <h3 id="ss-applied-settings-preview-title" className="ss-subsection-title text-base">
          적용 설정 요약
        </h3>
        <div
          className="mt-3 rounded-lg border-2 border-slate-700 bg-slate-900/40 px-3 py-2.5 text-sm"
          data-testid="ss-applied-settings-preview"
        >
          <div className="mb-3 space-y-1 border-b border-slate-700 pb-2">
            <p data-testid="ss-preview-user-name">
              <span className="text-slate-400">사용자 이름: </span>
              <span className="font-medium text-slate-100">
                {form.searchName.trim() || "—"}
              </span>
            </p>
            <p data-testid="ss-preview-config-summary">
              <span className="text-slate-400">실제 설정: </span>
              <span className="font-medium text-slate-100">
                {[
                  form.patternCombinationFamilies.length > 1
                    ? form.patternCombinationFamilies
                        .map((f) =>
                          f === "order_block"
                            ? "OB"
                            : f === "fvg"
                              ? "FVG"
                              : f === "trendline"
                                ? "TL"
                                : f === "support_resistance"
                                  ? "SR"
                                  : f === "supply_demand"
                                    ? "SD"
                                    : f,
                        )
                        .join(" + ")
                    : null,
                  form.patternCombinationFamilies.length > 1
                    ? form.patternCombinationOperator.toUpperCase()
                    : null,
                  form.patternCombinationFamilies.length > 1
                    ? form.patternCombinationTemplate === "confluence"
                      ? "Pattern Confluence"
                      : form.patternCombinationTemplate
                    : null,
                  `${form.symbol || "BTCUSDT"} ${form.timeframe || "15m"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {preview.rows.map((row) => (
              <div key={row.labelKo} className="space-y-0.5">
                <div className="flex gap-2 text-slate-300">
                  <dt className="text-slate-400">{row.labelKo}</dt>
                  <dd className="font-medium text-slate-100">{row.valueKo}</dd>
                </div>
                {row.hintKo ? (
                  <p className="text-xs text-slate-500">{row.hintKo}</p>
                ) : null}
              </div>
            ))}
          </dl>
          <div
            className={
              preview.summary.status === "ok"
                ? "mt-3 text-emerald-200"
                : preview.summary.status === "auto_correctable"
                  ? "mt-3 text-amber-200"
                  : "mt-3 text-red-200"
            }
            data-testid="ss-config-validation-status"
          >
            {preview.summary.labelKo}
          </div>
        </div>
      </section>

      <section
        id="ss-section-config"
        className="ss-section-card scroll-mt-24 space-y-3"
        aria-labelledby="ss-config-manager-title"
      >
        <h3 id="ss-config-manager-title" className="ss-subsection-title text-base">
          설정 저장 및 관리
        </h3>
        <SearchConfigManager
          form={form}
          readOnly={inputDisabled}
          onChange={onChange}
        />
      </section>

      <input
        data-testid="ss-run-until-qualified"
        type="checkbox"
        className="sr-only"
        checked
        readOnly
        tabIndex={-1}
        aria-hidden
      />

      <div
        className="rounded-lg border-2 border-slate-700 bg-slate-900/40 px-3 py-2.5 text-sm"
        data-testid="ss-config-validation-summary"
      >
        <div className="font-semibold text-slate-100">탐색 설정 확인</div>
        <div
          className={
            preview.summary.status === "ok"
              ? "mt-1 text-emerald-200"
              : preview.summary.status === "auto_correctable"
                ? "mt-1 text-amber-200"
                : "mt-1 text-red-200"
          }
        >
          {preview.summary.labelKo}
        </div>
      </div>

      {errors.length > 0 ? (
        <div
          className="rounded-lg border-2 border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
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
          disabled={submitting || inputDisabled}
          onClick={onSubmit}
        >
          {submitting ? "시작 중…" : "탐색 시작"}
        </Button>
      </div>
    </section>
  );
}
