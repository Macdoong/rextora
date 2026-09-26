"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button,
  StickyActionBar,
} from "@/components/ui/primitives";
import { AdvancedLevelSelector } from "./visual/AdvancedLevelSelector";
import { isStrategySearchDeveloperDiagnosticsVisible } from "./completionCustomerView";
import type { StrategySearchOperatorFormState } from "./formDefaults";
import {
  BEGINNER_PRESET_MAP,
  QUALIFICATION_PROFILES,
  SEARCH_DEPTH_PROFILES,
  TRADING_STYLE_MAP,
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
import {
  ORDER_BLOCK_ZONE_BASIS_LABEL_KO,
  ORDER_BLOCK_ZONE_BASIS_VALUES,
  resolveOrderBlockZoneBasis,
  type OrderBlockZoneBasis,
} from "@/src/lib/rextora/strategy/conditions/orderBlockZoneBasis";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import type { FormFieldError } from "./formValidation";
import {
  buildAppliedSettingsPreview,
  formatRuntimeKo,
  launchIdleCopy,
} from "./formValidation";
import {
  formatCustomerSearchValue,
  fieldOriginLabel,
} from "./customerDisplay";
import { SearchConfigManager } from "./SearchConfigManager";
import { GuidedApproachEssentials, GuidedDurationControl } from "./guided/GuidedApproachEssentials";
import { GuidedAutomaticSearchObjective } from "./guided/GuidedAutomaticSearchObjective";
import { GuidedAutomaticObjectivePanel } from "./guided/GuidedAutomaticObjectivePanel";
import { automaticAnalysisSummaryLine, GuidedAutomaticTimeBudget } from "./guided/GuidedAutomaticTimeBudget";
import { GuidedQualificationTargets } from "./guided/GuidedQualificationTargets";
import { GuidedDisclosure } from "./guided/GuidedDisclosure";
import { GuidedStrategyScopeSummary } from "./guided/GuidedStrategyScopeSummary";
import {
  showGuidedPatternDetailDisclosure,
  showGuidedValidationAdvancedBand,
} from "./guided/strategySearchGuidedVisibility";
import { GuidedMobileScopeSummary } from "./guided/GuidedMobileScopeSummary";
import { GuidedSectionCoach } from "./guided/GuidedSectionCoach";
import { GuidedStepMount } from "./guided/GuidedStepMount";
import {
  guidedControlClass,
  guidedNumberClass,
  guidedSelectClass,
} from "./guided/guidedFieldClass";
import { StrategySearchFieldHelp } from "./guided/StrategySearchFieldHelp";
import { StrategySearchFinalReview } from "./guided/StrategySearchFinalReview";
import { StrategySearchGuidedSetup } from "./guided/StrategySearchGuidedSetup";
import { useStrategySearchGuidedSetup } from "./guided/useStrategySearchGuidedSetup";
import { StrategySearchVisualBuilder } from "./visual/StrategySearchVisualBuilder";
import {
  COST_STRESS_HELP,
  COST_STRESS_LABEL,
  mergeDirectVisualSpaceIds,
  visibleDirectLayerIds,
  visualSpaceIdsForDirectMode,
} from "./visual/searchVisualCopy";
import {
  formatElapsedCompact,
  formatLiveCount,
  liveEvaluatedCount,
  provenSearchStageLabel,
  resolveLaunchPanelState,
  type SearchScopeProgress,
} from "./visual/searchScopeVisual";
import { searchCancellationPendingCopy } from "./formatters";

/** Client-safe pattern capability matrix (mirrors patternSupportMatrix). */
const PATTERN_MATRIX = [
  {
    id: "order_block",
    labelKo: "오더블럭",
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
    labelKo: "FVG",
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
    labelKo: "추세선",
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
    labelKo: "지지·저항",
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
    labelKo: "공급·수요",
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

const inputClass = guidedControlClass;
const selectClass = guidedSelectClass;
const gridClass = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

const RECOMMENDED_SYMBOL = "BTCUSDT";

const PATTERN_FAMILY_OPTIONS: Array<{ id: PatternFamilyId; label: string }> = [
  { id: "order_block", label: "오더블럭" },
  { id: "fvg", label: "FVG" },
  { id: "trendline", label: "추세선" },
  { id: "support_resistance", label: "지지·저항" },
  { id: "supply_demand", label: "공급·수요" },
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

function Field({
  id,
  label,
  error,
  children,
  hint,
  helpFieldId,
  origin = "editable",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  helpFieldId?: string;
  origin?: "editable" | "auto" | "preset" | "readonly";
  children: React.ReactNode;
}) {
  const originText = fieldOriginLabel(origin);
  return (
    <label
      className={
        "ss-field block" +
        (origin === "editable" ? " ss-field--editable" : " ss-field--readonly")
      }
      htmlFor={id}
      data-field-origin={origin}
    >
      <span className="ss-field-label mb-1 flex items-center gap-2">
        {label}
        {helpFieldId ? (
          <StrategySearchFieldHelp fieldId={helpFieldId} />
        ) : null}
        {originText ? (
          <em className="ss-field-origin">{originText}</em>
        ) : null}
      </span>
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
  searchProgress?: SearchScopeProgress | null;
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
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (
        hash === "#ss-section-engine" ||
        hash === "#ss-section-core" ||
        hash === "#ss-section-expert"
      ) {
        setDetailsOpen(true);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

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
            {isStrategySearchDeveloperDiagnosticsVisible() ? (
            <details className="text-xs text-slate-500 ss-developer-diagnostics">
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
            ) : null}
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
      patternConfigLevel:
        unique.length > 0 && form.patternConfigLevel === "automatic"
          ? "basic"
          : form.patternConfigLevel,
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
      patternConfigLevel:
        form.patternConfigLevel === "automatic"
          ? "basic"
          : form.patternConfigLevel,
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

  function movePatternBlock(blockId: string, direction: -1 | 1) {
    const sorted = [...(form.patternCombinationBlocks ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    const index = sorted.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sorted.length) return;
    const currentOrder = sorted[index].order;
    sorted[index] = { ...sorted[index], order: sorted[target].order };
    sorted[target] = { ...sorted[target], order: currentOrder };
    onChange({
      ...form,
      patternCombinationBlocks: sorted,
      patternCombinationFamilies: sorted
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((block) => block.family),
    });
  }

  function applySymbol(symbol: string) {
    const nextName = isGeneratedName(form.searchName, form.symbol, form.timeframe)
      ? generateDefaultSearchName(symbol, form.timeframe)
      : form.searchName;
    onChange({
      ...form,
      symbol,
      searchName: nextName,
      marketMode: "manual",
    });
  }

  function applySearchMode(mode: "automatic" | "direct") {
    if (mode === "automatic") {
      onChange({
        ...form,
        autoStrategyCombo: true,
      });
      return;
    }
    onChange({
      ...form,
      autoStrategyCombo: false,
      patternConfigLevel:
        form.patternConfigLevel === "automatic"
          ? "basic"
          : form.patternConfigLevel,
      selectedSpaceIds: visualSpaceIdsForDirectMode(form.selectedSpaceIds),
    });
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
  const resolvedSelectionMode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  const automaticTargetMode =
    resolvedSelectionMode === "automatic" &&
    form.autoSearchObjective === "qualified_target";
  const showPatternDetailDisclosure = showGuidedPatternDetailDisclosure({
    selectionMode: resolvedSelectionMode,
    patternConfigLevel: form.patternConfigLevel,
  });
  const showValidationAdvancedBand = showGuidedValidationAdvancedBand({
    selectionMode: resolvedSelectionMode,
    patternConfigLevel: form.patternConfigLevel,
  });
  const patternDefaultsNotice =
    resolvedSelectionMode === "automatic" &&
    form.patternConfigLevel === "automatic";
  const selectionLocked =
    inputDisabled || resolvedSelectionMode === "automatic";
  const familyLabel = (family: string) =>
    PATTERN_FAMILY_OPTIONS.find((option) => option.id === family)?.label ?? family;
  const combinationJoiner =
    form.patternCombinationOperator === "and"
      ? " + "
      : form.patternCombinationOperator === "or"
        ? " 또는 "
        : " → ";
  const combinationSentence =
    (form.patternCombinationBlocks ?? []).length > 0
      ? [...(form.patternCombinationBlocks ?? [])]
          .sort((a, b) => a.order - b.order)
          .map((block) => `${familyLabel(block.family)} ${PATTERN_ROLE_OPTIONS.find((role) => role.id === block.role)?.label ?? block.role}`)
          .join(combinationJoiner)
      : form.autoStrategyCombo
        ? "추천 패턴을 자동으로 조합"
        : form.selectedSpaceIds.map(familyLabel).join(combinationJoiner);
  const idleLaunch = launchIdleCopy(preview.summary);
  const spaceSelectionBlocked = idleLaunch.startDisabled;
  const launchState = resolveLaunchPanelState(props.searchProgress);
  const runningFamily = provenSearchStageLabel(props.searchProgress);
  const runningEvaluated = formatLiveCount(
    liveEvaluatedCount(props.searchProgress),
  );
  const runningQualified = formatLiveCount(
    props.searchProgress?.qualifiedCount ?? null,
  );
  const runningElapsed = formatElapsedCompact(props.searchProgress?.elapsedMs);
  const guided = useStrategySearchGuidedSetup(form);
  const guidedStep = guided.currentStepId;
  const [stepValidationAdvancedOpen, setStepValidationAdvancedOpen] =
    useState(false);

  useEffect(() => {
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";
    if (
      hash === "#ss-section-engine" ||
      hash === "#ss-section-core" ||
      hash === "#ss-section-expert"
    ) {
      setDetailsOpen(true);
      return;
    }
    setDetailsOpen(guided.currentStepId === "validation");
  }, [guided.currentStepId]);

  const visualBuilderProps = {
    form,
    automatic: resolvedSelectionMode === "automatic",
    disabled: inputDisabled,
    symbolError: err("symbol"),
    timeframeError: err("timeframe"),
    periodError: err("dataRef"),
    progress: props.searchProgress,
    onSelectAutomatic: () => applySearchMode("automatic"),
    onSelectDirect: () => applySearchMode("direct"),
    onSymbol: applySymbol,
    onTimeframe: applyTimeframe,
    onPeriod: applyPeriod,
    onTradingStyle: applyTradingStyle,
    onDirection: (value: "both" | "long" | "short") =>
      set("patternDirection", value),
    onToggleLayer: (id: string, next: boolean) => {
      const visual = visibleDirectLayerIds(form.selectedSpaceIds);
      const nextVisual = next
        ? [...new Set([...visual, id])]
        : visual.filter((spaceId) => spaceId !== id);
      set(
        "selectedSpaceIds",
        mergeDirectVisualSpaceIds(form.selectedSpaceIds, nextVisual),
      );
    },
    onCustomPeriodFrom: (value: string) => {
      onChange({
        ...form,
        availableFromDate: value,
        periodPreset: "custom",
      });
    },
    onCustomPeriodTo: (value: string) => {
      onChange({
        ...form,
        availableToDate: value,
        periodPreset: "custom",
      });
    },
  };

  const guidedFooter = (
    <div className="ss-guided-footer-actions">
      {guided.canGoPrevious ? (
        <Button
          type="button"
          variant="outline"
          className="ss-guided-footer-back"
          data-testid="ss-guided-prev"
          onClick={() => guided.goPrevious()}
        >
          이전
        </Button>
      ) : null}
      {!guided.isReviewStep ? (
        <Button
          type="button"
          className="ss-btn-primary ss-guided-next-btn"
          data-testid="ss-guided-next"
          onClick={() => guided.goNext()}
        >
          다음 단계
          <ChevronRight
            className="ss-guided-next-btn__icon"
            aria-hidden="true"
            strokeWidth={2.25}
          />
        </Button>
      ) : null}
    </div>
  );

  return (
    <section
      className="rextora-card space-y-6 p-5 ss-guided-setup"
      data-testid="strategy-search-create"
      data-config-level={form.patternConfigLevel}
      data-selection-mode={resolvedSelectionMode}
      data-guided-step-id={guided.currentStepId}
      aria-labelledby="ss-guided-heading-market"
    >
      <StrategySearchGuidedSetup
        guided={guided}
        allErrors={errors}
        footer={guidedFooter}
      >
        <GuidedStepMount active={guided.isStepActive("market")} stepId="market">
          <StrategySearchVisualBuilder
            {...visualBuilderProps}
            panels={{ mode: false, market: true, workspace: false }}
          />
          <div className="ss-guided-field-secondary">
            <Field id="ss-search-name" label="탐색 이름">
              <input
                id="ss-search-name"
                data-testid="ss-search-name"
                className={inputClass}
                type="text"
                autoComplete="off"
                value={form.searchName}
                placeholder={generateDefaultSearchName(form.symbol, form.timeframe)}
                disabled={inputDisabled}
                onChange={(e) => set("searchName", e.target.value)}
              />
            </Field>
          </div>
        </GuidedStepMount>

        <GuidedStepMount active={guided.isStepActive("approach")} stepId="approach">
          <StrategySearchVisualBuilder
            {...visualBuilderProps}
            panels={{
              mode: true,
              modeOutcome: resolvedSelectionMode !== "automatic",
              market: false,
              workspace: false,
              workspaceControls: false,
              scopeMap: false,
            }}
          />
          {resolvedSelectionMode === "automatic" ? (
            <>
              <GuidedAutomaticSearchObjective
                value={form.autoSearchObjective}
                disabled={inputDisabled}
                onChange={(next) => set("autoSearchObjective", next)}
              />
              {automaticTargetMode ? (
                <GuidedAutomaticObjectivePanel
                  objective="qualified_target"
                  testId="ss-guided-auto-target"
                  compactGuidanceTestId="ss-auto-target-notice"
                  analysisLine={
                    <p
                      className="ss-guided-auto-time-budget__analysis-line"
                      data-testid="ss-auto-analysis-summary-compact"
                    >
                      <span className="ss-guided-auto-time-budget__analysis-label">
                        분석 조건
                      </span>
                      {automaticAnalysisSummaryLine(form)}
                    </p>
                  }
                >
                  <GuidedQualificationTargets
                    variant="edit"
                    form={form}
                    disabled={inputDisabled}
                    minReturnError={err("minTotalReturn")}
                    maxMddError={err("maxMdd")}
                    minTradeError={err("minTradeCount")}
                    minWinRateError={err("minWinRate")}
                    minScoreError={err("minScore")}
                    onMinReturn={(value) => set("minTotalReturn", value)}
                    onMddPreset={applyMddPreset}
                    onMaxMdd={(value) => set("maxMdd", value)}
                    onMinTrades={(value) => set("minTradeCount", value)}
                    onMinWinRate={(value) => set("minWinRate", value)}
                    onMinScore={(value) => set("minScore", value)}
                  />
                  <GuidedDurationControl
                    durationPreset={form.durationPreset}
                    maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
                    maxRuntimeError={err("maxRuntime")}
                    disabled={inputDisabled}
                    onDurationPreset={applyDurationPreset}
                    onMaxRuntime={(value) => set("maxRuntimeMinutesOverride", value)}
                    prominent
                    suppressPresetNote
                    label="최대 탐색 시간"
                  />
                </GuidedAutomaticObjectivePanel>
              ) : (
                <GuidedAutomaticTimeBudget
                  symbol={form.symbol}
                  timeframe={form.timeframe}
                  periodPreset={form.periodPreset}
                  durationPreset={form.durationPreset}
                  maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
                  maxRuntimeError={err("maxRuntime")}
                  disabled={inputDisabled}
                  onDurationPreset={applyDurationPreset}
                  onMaxRuntime={(value) => set("maxRuntimeMinutesOverride", value)}
                />
              )}
            </>
          ) : (
            <GuidedApproachEssentials
              depthProfile={form.depthProfile}
              depthHint={depthHint}
              durationPreset={form.durationPreset}
              maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
              maxRuntimeError={err("maxRuntime")}
              disabled={inputDisabled}
              onDepth={applyDepth}
              onDurationPreset={applyDurationPreset}
              onMaxRuntime={(value) => set("maxRuntimeMinutesOverride", value)}
            />
          )}
          <GuidedDisclosure
            title={
              resolvedSelectionMode === "automatic" ? "고급 설정" : "추가 탐색 설정"
            }
            summaryMeta={
              resolvedSelectionMode === "automatic"
                ? "탐색 수준 · 프리셋 · 기준"
                : "프리셋 · 기준 · 설정 수준"
            }
            defaultOpen={false}
            testId="ss-guided-step2-deep"
          >
            {resolvedSelectionMode === "automatic" ? (
              <GuidedApproachEssentials
                layout="depthOnly"
                depthProfile={form.depthProfile}
                depthHint={depthHint}
                durationPreset={form.durationPreset}
                maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
                maxRuntimeError={err("maxRuntime")}
                disabled={inputDisabled}
                onDepth={applyDepth}
                onDurationPreset={applyDurationPreset}
                onMaxRuntime={(value) => set("maxRuntimeMinutesOverride", value)}
              />
            ) : null}
            <div className="ss-adv-section ss-adv-group" data-adv-group="method">
              <header className="ss-adv-section__head">
                <span className="ss-adv-section__icon" aria-hidden="true">
                  ⚙
                </span>
                <div>
                  <h3 className="ss-adv-section__title">설정 수준</h3>
                  <p className="ss-adv-section__desc">
                    화면에 보이는 설정의 깊이를 정합니다. 탐색 방식(자동 탐색 /
                    직접 선택)과는 다릅니다.
                  </p>
                </div>
              </header>
              <AdvancedLevelSelector
                value={form.patternConfigLevel}
                disabled={inputDisabled}
                onChange={(value) => set("patternConfigLevel", value)}
              />
            </div>

            {form.patternConfigLevel === "automatic" ? (
              <section
                className="ss-section-card space-y-2"
                data-testid="ss-automatic-summary"
                data-field-origin="auto"
              >
                <h3 className="ss-subsection-title">
                  추천 전략 구성
                  <em className="ss-field-origin">자동 적용</em>
                </h3>
                <p className="text-sm text-slate-200">{combinationSentence}</p>
                <p className="ss-helper">
                  선택한 프리셋에 맞춰 패턴 조합·위험 기준·비용 검증을 자동
                  적용합니다.
                </p>
              </section>
            ) : null}

            <div className="ss-adv-section ss-adv-group" data-adv-group="approach-extra">
              <div data-testid="ss-intensity">
                <Field
                  id="ss-trading-style"
                  label="탐색 프리셋"
                  helpFieldId="tradingStyle"
                  hint="선택한 프리셋의 핵심 기준이 아래에 표시됩니다."
                >
                  <select
                    id="ss-trading-style"
                    data-testid="ss-goal"
                    className={selectClass}
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
                  className="mt-2 flex flex-wrap gap-1.5"
                  data-testid="ss-beginner-preset-criteria"
                  aria-label="탐색 프리셋 기준"
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

              <Field
                id="ss-research-basis"
                label="탐색 기준"
                helpFieldId="researchBasis"
              >
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
            </div>
          </GuidedDisclosure>
        </GuidedStepMount>

        <GuidedStepMount active={guided.isStepActive("strategy")} stepId="strategy">
          <div className="ss-guided-scope-summary-desktop">
            <GuidedStrategyScopeSummary
              form={form}
              selectionMode={resolvedSelectionMode}
              combinationSentence={combinationSentence}
              patternDefaultsNotice={patternDefaultsNotice}
            />
          </div>
          <GuidedMobileScopeSummary
            form={form}
            selectionMode={resolvedSelectionMode}
            combinationSentence={combinationSentence}
          />
          <GuidedDisclosure
            title="범위 지도 · 워크스페이스"
            summaryMeta="전략군 · 탐색 지도 · 조합 패널"
            defaultOpen={false}
            testId="ss-guided-step3-workspace-deep"
          >
            <StrategySearchVisualBuilder
              {...visualBuilderProps}
              panels={{
                mode: false,
                market: false,
                workspaceControls: true,
                scopeMap: true,
              }}
            />
          </GuidedDisclosure>

      <section
        id="ss-section-strategy-scope"
        className="ss-section-card ss-guided-hide-duplicate scroll-mt-24 space-y-3"
        data-testid="ss-strategy-scope"
      >
        <h3 className="ss-subsection-title text-base">패턴 · 조합 조건</h3>
        <p className="ss-helper">
          기술 전략 탐색 공간을 사용합니다. 탐색 범위 직접 선택에서는 개별
          전략군을 고릅니다.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={resolvedSelectionMode === "automatic"}
            disabled={inputDisabled}
            onChange={(e) =>
              applySearchMode(e.target.checked ? "automatic" : "direct")
            }
            data-testid="ss-auto-strategy-combo"
          />
          자동 조합 (깊이 프로필 기본 공간)
        </label>
        {resolvedSelectionMode === "automatic" ? (
          <p
            className="ss-guided-notice ss-guided-notice--info px-3 py-2 text-xs"
            data-testid="ss-auto-selection-notice"
          >
            시스템 관리 모드입니다. 수동 패밀리·패턴 포함 선택은 적용되지
            않으며, 깊이 프로필이 탐색 공간을 결정합니다.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectionLocked}
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
            disabled={selectionLocked}
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
                disabled={selectionLocked}
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
              {resolvedSelectionMode === "automatic" ? (
                <span className="text-[10px] text-slate-500">시스템 관리</span>
              ) : null}
            </label>
          ))}
        </div>
      </section>

      {showPatternDetailDisclosure ? (
      <GuidedDisclosure
        title="패턴 세부 설정"
        summaryMeta={
          form.patternConfigLevel === "automatic"
            ? "기본값 사용"
            : `${form.patternConfigLevel === "expert" ? "전문가" : "기본"} 수준`
        }
        defaultOpen={false}
        testId="ss-guided-step3-deep"
        coach={
          <GuidedSectionCoach
            taskKo="필요할 때만 패턴 포함·세부 파라미터를 조정합니다."
            recommendKo="처음에는 기본값을 유지해도 됩니다."
            defaultOkKo="자동·기본 수준에서는 대부분 기본값으로 충분합니다."
            testId="ss-guided-step3-coach"
          />
        }
      >
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
        {resolvedSelectionMode === "automatic" ? (
          <p
            className="ss-guided-notice ss-guided-notice--info px-3 py-2 text-xs"
            data-testid="ss-pattern-matrix-system-managed"
          >
            패턴 포함 선택은 시스템 관리입니다. 자동 탐색일 때 수동 포함 토글은
            비활성화되며 요청에 포함되지 않습니다.
          </p>
        ) : null}
        <div className="ss-pattern-table-wrap overflow-x-auto">
          <table className="ss-pattern-table text-left text-xs">
            <thead>
              <tr>
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
                  className="align-top"
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
                          disabled={selectionLocked}
                          checked={
                            resolvedSelectionMode === "automatic"
                              ? false
                              : form.selectedSpaceIds.includes(p.id)
                          }
                          onChange={(e) => {
                            if (resolvedSelectionMode === "automatic") {
                              return;
                            }
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
                        {resolvedSelectionMode === "automatic"
                          ? "시스템 관리"
                          : "포함"}
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
                ["automatic", "자동 추천", "검증된 기본 범위"],
                ["basic", "기본 조정", "핵심 패턴 값"],
                ["expert", "전문가 범위", "전체 패턴 범위"],
              ] as const
            ).map(([id, label, hint]) => (
              <label
                key={id}
                className={
                  "ss-choice-tile" +
                  (form.patternConfigLevel === id ? " is-selected" : "")
                }
              >
                <input
                  type="radio"
                  name="ss-pattern-config-level"
                  checked={form.patternConfigLevel === id}
                  disabled={inputDisabled}
                  onChange={() => set("patternConfigLevel", id)}
                  data-testid={`ss-pattern-level-${id}`}
                />
                <strong>{label}</strong>
                <span>{hint}</span>
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
                hint="분석 범위 · 터치 수 · FVG 최소 간격을 조정합니다."
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
                hint="가격 허용 범위 · 영역 너비가 있는 전략군에만 적용됩니다."
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
          className="ss-adv-subgroup space-y-3 p-3"
          data-testid="ss-pattern-combination-builder"
        >
          <h4 className="text-sm font-medium text-slate-200">
            전략 조합 빌더
          </h4>
          <p className="text-xs text-slate-500">
            여러 패턴을 하나의 전략 안에서 함께 맞거나, 하나만 맞아도 되거나,
            정해진 순서로 나타나게 결합합니다.
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
                disabled={selectionLocked}
                className={
                  "ss-choice-tile" +
                  (form.patternCombinationTemplate === id ? " is-selected" : "")
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
                    patternConfigLevel:
                      form.patternConfigLevel === "automatic"
                        ? "basic"
                        : form.patternConfigLevel,
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
            <Field
              id="ss-combo-failure-policy"
              label="실패 정책"
              helpFieldId="comboFailurePolicy"
            >
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
                  ? "ALL: 모든 실패 조건이 발생해야 탈락 (canonical failurePolicy=all)"
                  : form.patternCombinationFailurePolicy === "majority"
                    ? "MAJORITY: 과반수 블록이 실패하면 탈락 (canonical failurePolicy=majority — any로 축소되지 않음)"
                    : "ANY: 하나라도 실패하면 전체 조건 탈락 (canonical failurePolicy=any)"}
              </p>
            </Field>
            {form.patternCombinationOperator === "weighted_score" ? (
              <Field
                id="ss-combo-weighted-threshold"
                label="가중 점수 임계값"
                helpFieldId="patternCombinationWeightedThreshold"
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
                      disabled={selectionLocked}
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
              <div
                className="mt-3 rounded-lg border border-sky-500/20 bg-sky-950/20 p-3"
                data-testid="ss-combo-summary"
              >
                <p className="text-sm font-semibold text-sky-100">
                  {combinationSentence}
                </p>
                <p className="ss-helper mt-1">
                  {form.patternCombinationOperator === "and"
                    ? "AND: 선택한 모든 패턴이 충족되어야 합니다."
                    : form.patternCombinationOperator === "or"
                      ? "OR: 선택한 패턴 중 하나 이상이 충족되면 됩니다."
                      : form.patternCombinationOperator === "sequence"
                        ? "SEQUENCE: 표시된 순서와 허용 시간 안에서 패턴이 이어져야 합니다."
                        : form.patternCombinationOperator === "weighted_score"
                          ? "가중 점수: 각 패턴의 점수 합이 기준을 넘어야 합니다."
                          : "우선순위: 높은 우선순위 패턴부터 평가합니다."}
                </p>
              </div>
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
                    open={false}
                    className="ss-guided-strategy-block rounded-lg border border-slate-700 bg-slate-950/40 p-3"
                    data-testid={`ss-pattern-block-${block.id}`}
                  >
                    <summary className="ss-guided-strategy-block__summary flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-100">
                      <span>
                        {PATTERN_FAMILY_OPTIONS.find((f) => f.id === block.family)
                          ?.label ?? block.family}{" "}
                        · {block.required ? "선택됨" : "선택"}
                      </span>
                      <span className="ss-guided-strategy-block__affordance" aria-hidden>
                        세부 조정 ▾
                      </span>
                      <span className="sr-only">
                        {block.order + 1}.{" "}
                        {PATTERN_ROLE_OPTIONS.find((role) => role.id === block.role)?.label}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="min-h-9 rounded-md border border-slate-700 px-2 text-xs text-slate-300 disabled:opacity-30"
                          disabled={inputDisabled || block.order === 0}
                          onClick={(event) => {
                            event.preventDefault();
                            movePatternBlock(block.id, -1);
                          }}
                          aria-label={`${familyLabel(block.family)} 앞으로 이동`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="min-h-9 rounded-md border border-slate-700 px-2 text-xs text-slate-300 disabled:opacity-30"
                          disabled={
                            inputDisabled ||
                            block.order === (form.patternCombinationBlocks?.length ?? 1) - 1
                          }
                          onClick={(event) => {
                            event.preventDefault();
                            movePatternBlock(block.id, 1);
                          }}
                          aria-label={`${familyLabel(block.family)} 뒤로 이동`}
                        >
                          ↓
                        </button>
                      </span>
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
                      <div data-testid={`ss-pattern-block-order-${block.order}`}>
                        <span className="ss-field-label mb-1 block">실행 순서</span>
                        <div className="ss-input flex items-center">
                          {block.order + 1}번째 · 카드의 ↑ ↓ 버튼으로 변경
                        </div>
                      </div>
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
                    {form.patternConfigLevel === "expert" ? (
                      <div
                        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        data-testid={`ss-pattern-block-params-${block.order}`}
                      >
                        {PATTERN_PARAMETER_CATALOG[block.family].map((entry) => {
                          const resolvedZoneBasis =
                            block.family === "order_block"
                              ? resolveOrderBlockZoneBasis(block.params)
                              : null;
                          if (
                            entry.key === "wickExtensionPct" &&
                            resolvedZoneBasis !== "BODY_PLUS_WICK_PERCENT"
                          ) {
                            return null;
                          }
                          const id = `${block.id}-${entry.key}`;
                          const value =
                            entry.key === "zoneBasis" && block.family === "order_block"
                              ? resolvedZoneBasis ?? entry.default
                              : (block.params[entry.key] ?? entry.default);
                          const hint =
                            form.patternConfigLevel === "expert"
                              ? `min ${String(entry.min)} · default ${String(entry.default)} · max ${String(entry.max)}${entry.step != null ? ` · step ${entry.step}` : ""}`
                              : entry.explanationLabel;
                          const helpFieldId =
                            entry.key === "zoneBasis" &&
                            block.family === "order_block"
                              ? "orderBlockZoneBasis"
                              : undefined;
                          return (
                            <Field
                              key={entry.key}
                              id={id}
                              label={entry.labelKo}
                              helpFieldId={helpFieldId}
                              hint={hint}
                              error={err(
                                `patternBlock.${block.id}.${entry.key}`,
                              )}
                            >
                              {entry.key === "zoneBasis" &&
                              form.patternConfigLevel === "expert" &&
                              block.family === "order_block" ? (
                                <div
                                  className="space-y-1"
                                  data-testid={`ss-pattern-param-${block.order}-${entry.key}`}
                                >
                                  {ORDER_BLOCK_ZONE_BASIS_VALUES.map((option) => (
                                    <label
                                      key={option}
                                      className="flex items-center gap-2 text-sm text-slate-200"
                                    >
                                      <input
                                        type="radio"
                                        name={id}
                                        value={option}
                                        checked={String(value) === option}
                                        disabled={inputDisabled}
                                        onChange={() =>
                                          updatePatternParam(
                                            block.id,
                                            entry.key,
                                            option as OrderBlockZoneBasis,
                                          )
                                        }
                                      />
                                      {ORDER_BLOCK_ZONE_BASIS_LABEL_KO[option]}
                                    </label>
                                  ))}
                                </div>
                              ) : entry.type === "enum" ? (
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
      </GuidedDisclosure>
      ) : null}
        </GuidedStepMount>

      {guided.isStepActive("validation") ? (
      <section
        className="ss-advanced-disclosure ss-legacy-details ss-guided-advanced-host"
        data-testid="ss-legacy-details"
        data-open={detailsOpen ? "true" : "false"}
      >
        <button
          type="button"
          className="ss-advanced-trigger ss-guided-hide-trigger"
          data-testid="ss-advanced-trigger"
          aria-expanded={detailsOpen}
          aria-controls="ss-advanced-body"
          onClick={() => setDetailsOpen((open) => !open)}
          hidden
          tabIndex={-1}
          aria-hidden="true"
        />
        <div
          id="ss-advanced-body"
          className={"ss-advanced-body" + (detailsOpen ? " is-open" : "")}
          hidden={!detailsOpen}
        >
          <div className="ss-advanced-body__inner">
      <div
        className="ss-adv-section ss-adv-group ss-guided-validation-layout"
        data-adv-group="criteria"
      >
        <header className="ss-adv-section__head">
          <span className="ss-adv-section__icon" aria-hidden="true">▣</span>
          <div>
            <h3 className="ss-adv-section__title">검증 · 위험 기준</h3>
            <p className="ss-adv-section__desc">
              합격 기준·낙폭·비용 검증을 단계별로 조정합니다.
            </p>
          </div>
        </header>
      {automaticTargetMode ? (
        <GuidedQualificationTargets
          variant="summary"
          form={form}
          onMinReturn={() => {}}
          onMddPreset={() => {}}
          onMaxMdd={() => {}}
          onMinTrades={() => {}}
          onMinWinRate={() => {}}
          onMinScore={() => {}}
          onEditStep={() => guided.goToStep("approach")}
        />
      ) : null}
      <p className="ss-guided-validation-band__title" data-band="evaluation">
        A. 평가 기준
      </p>
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

        {automaticTargetMode ? null : (
        <Field id="ss-min-trades" label="최소 거래 수" error={err("minTradeCount")}>
          <input
            id="ss-min-trades"
            data-testid="ss-min-trades"
            className={`${inputClass} ss-guided-field-primary`}
            type="number"
            value={form.minTradeCount}
            disabled={inputDisabled}
            onChange={(e) => set("minTradeCount", e.target.value)}
          />
        </Field>
        )}

        {automaticTargetMode ? null : (
        <Field
          id="ss-min-return"
          label="최소 수익률(%)"
          error={err("minTotalReturn")}
          hint="비우면 제한 없음 · 예: 10 = 10%"
        >
          <input
            id="ss-min-return"
            data-testid="ss-target-return"
            className={`${inputClass} ss-guided-field-primary`}
            type="number"
            step="0.01"
            value={form.minTotalReturn}
            disabled={inputDisabled}
            onChange={(e) => set("minTotalReturn", e.target.value)}
          />
        </Field>
        )}

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
          <StrategySearchFieldHelp fieldId="jitterEnabled" />
        </label>
      </SettingsSection>

      <p className="ss-guided-validation-band__title" data-band="risk">
        B. 위험 조건
      </p>
      <SettingsSection
        id="ss-section-risk"
        title="위험 및 레버리지"
        description="합격 낙폭 기준과 레버리지 모드를 설정합니다."
      >
        <Field
          id="ss-leverage-mode"
          label="레버리지"
          helpFieldId="leverageMode"
          origin="editable"
        >
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
          className="ss-guided-notice ss-guided-notice--compact sm:col-span-2 xl:col-span-3"
          data-testid="ss-leverage-warning"
          role="note"
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
        {automaticTargetMode ? null : (
        <>
        <Field
          id="ss-max-mdd"
          label="최대 허용 낙폭"
          error={err("maxMdd")}
          origin={form.mddPreset === "custom" ? "editable" : "preset"}
        >
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
        </>
        )}
      </SettingsSection>

      <p className="ss-guided-validation-band__title" data-band="cost">
        C. 비용 조건
      </p>
      <SettingsSection
        id="ss-section-cost-guided"
        title="비용 · 스트레스 검증"
        description="수수료·슬리피지와 보수적 비용 재검증을 설정합니다."
      >
        <Field
          id="ss-fee"
          label="수수료"
          helpFieldId="feeRate"
          error={err("feeRate")}
        >
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

        <Field
          id="ss-slippage"
          label="슬리피지"
          helpFieldId="slippageRate"
          error={err("slippageRate")}
        >
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
          {COST_STRESS_LABEL}
          <StrategySearchFieldHelp fieldId="stressEnabled" />
        </label>
        <p className="ss-helper md:col-span-2 xl:col-span-3">
          {COST_STRESS_HELP}
        </p>
      </SettingsSection>
      </div>

      {showValidationAdvancedBand ? (
      <>
      <p className="ss-guided-validation-band__title ss-guided-validation-band__title--advanced" data-band="advanced">
        D. 고급 검증
      </p>
      <button
        type="button"
        className="ss-guided-validation-advanced-trigger"
        data-testid="ss-validation-advanced-trigger"
        aria-expanded={stepValidationAdvancedOpen}
        onClick={() => setStepValidationAdvancedOpen((open) => !open)}
      >
        {stepValidationAdvancedOpen ? "고급 설정 접기 ▴" : "고급 설정 ▾"}
        <span className="ss-guided-validation-advanced-trigger__meta">
          실행 한도 · 전문 임계값 · 시드
        </span>
      </button>

      <div
        className="ss-guided-validation-advanced-body"
        data-testid="ss-validation-advanced-body"
        hidden={!stepValidationAdvancedOpen}
      >
      <div className="ss-adv-section ss-adv-group" data-adv-group="combo">
        <header className="ss-adv-section__head">
          <span className="ss-adv-section__icon" aria-hidden="true">⚠</span>
          <div>
            <h3 className="ss-adv-section__title">위험 · 비용 조건</h3>
            <p className="ss-adv-section__desc">
              탐색 시간·오류 한도와 전문 기준을 정합니다.
            </p>
          </div>
        </header>
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
          label="목표 합격 후보 (진행 지표)"
          error={err("qualifiedTarget")}
          hint="진행 상황을 확인하기 위한 목표이며 자동 종료 조건이 아닙니다."
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
        title="전문 설정"
        description="초기 평가 규모와 오류 한도를 조정합니다."
        defaultOpen={false}
      >
        {isStrategySearchDeveloperDiagnosticsVisible() ? (
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
        ) : null}

        <Field
          id="ss-candidate-budget"
          label="초기 평가 묶음"
          helpFieldId="candidateBudgetOverride"
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

        {isStrategySearchDeveloperDiagnosticsVisible() ? (
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
        ) : null}

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
          label="같은 오류 반복 한도"
          hint="같은 오류가 이 횟수를 초과하면 자동 일시정지가 적용됩니다."
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
        {automaticTargetMode ? null : (
        <>
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
        </>
        )}
      </SettingsSection>
      </div>
      </div>
      </>
      ) : null}
          </div>
        </div>
      </section>
      ) : null}

      <GuidedStepMount active={guided.isStepActive("review")} stepId="review">
      <StrategySearchFinalReview
        form={form}
        onEditStep={(stepId) => guided.goToStep(stepId)}
      />
      <section
        id="ss-section-config"
        className="ss-section-card ss-config-entry scroll-mt-24 space-y-3"
        aria-labelledby="ss-config-manager-title"
        data-testid="ss-config-entry"
      >
        <h3 id="ss-config-manager-title" className="ss-subsection-title text-base">
          설정 저장 및 관리
        </h3>
        <SearchConfigManager
          form={form}
          readOnly={inputDisabled}
          onChange={onChange}
          onConfigLoaded={(next) => guided.recalculateFromLoadedForm(next)}
        />
      </section>

      <div
        className="ss-adv-section ss-adv-group ss-applied-summary ss-guided-legacy-preview"
        data-adv-group="summary"
        id="ss-section-preview"
        aria-labelledby="ss-applied-settings-preview-title"
      >
        <header className="ss-adv-section__head">
          <span className="ss-adv-section__icon" aria-hidden="true">☰</span>
          <div>
            <h3 id="ss-applied-settings-preview-title" className="ss-adv-section__title">
              현재 적용 설정
              <em className="ss-field-origin">읽기 전용</em>
            </h3>
            <p className="ss-adv-section__desc">읽기 전용 요약입니다. 값은 변경되지 않습니다.</p>
          </div>
        </header>
        <div
          className="ss-readonly-summary mt-3 text-sm"
          data-testid="ss-applied-settings-preview"
        >
          <div className="mb-3 space-y-1 border-b border-[var(--v3-border-soft)] pb-2">
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
                        .map((family) => formatCustomerSearchValue(family))
                        .join(" + ")
                    : null,
                  form.patternCombinationFamilies.length > 1
                    ? formatCustomerSearchValue(form.patternCombinationOperator)
                    : null,
                  form.patternCombinationFamilies.length > 1
                    ? formatCustomerSearchValue(form.patternCombinationTemplate)
                    : null,
                  `${form.symbol || "BTCUSDT"} ${form.timeframe || "15m"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
          </div>
          <dl className="ss-applied-primary grid gap-2 sm:grid-cols-2">
            {preview.rows.map((row) => (
              <div key={row.labelKo} className="space-y-0.5" data-field-origin={row.origin ?? "readonly"}>
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
          {preview.detailRows.length > 0 ? (
            <details className="ss-applied-details mt-3" data-testid="ss-applied-settings-details">
              <summary>세부 설정 보기</summary>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {preview.detailRows.map((row) => (
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
            </details>
          ) : null}
          {preview.summary.status !== "ok" ? (
            <div
              className={
                preview.summary.status === "auto_correctable"
                  ? "mt-3 text-amber-200"
                  : "mt-3 text-red-200"
              }
              data-testid="ss-config-validation-status"
            >
              {preview.summary.labelKo}
            </div>
          ) : null}
        </div>
      </div>
      </GuidedStepMount>
      </StrategySearchGuidedSetup>

      <input
        data-testid="ss-run-until-qualified"
        type="checkbox"
        className="sr-only"
        checked
        readOnly
        tabIndex={-1}
        aria-hidden
      />

      {guided.isReviewStep ? (
      <div
        className={
          "ss-config-status-chip" +
          (preview.summary.status === "ok"
            ? " ss-config-status-chip--ok"
            : preview.summary.status === "auto_correctable"
              ? " ss-config-status-chip--warn"
              : " ss-config-status-chip--bad")
        }
        data-testid="ss-config-validation-summary"
      >
        {preview.summary.status === "ok"
          ? "✓ 설정 확인 완료"
          : preview.summary.labelKo}
      </div>
      ) : null}

      {guided.isReviewStep && errors.length > 0 ? (
        <div
          className="rounded-lg border-2 border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
          role="alert"
          data-testid="ss-form-errors"
        >
          입력 오류 {errors.length}건 — 제출이 차단되었습니다.
        </div>
      ) : null}

      {guided.isReviewStep ? (
      <StickyActionBar className="ss-launch-bar">
        <div
          className={
            "ss-launch-panel" +
            (spaceSelectionBlocked ? " ss-launch-panel--blocked" : "")
          }
          data-testid="ss-launch-panel"
          data-contrast="readable"
          data-launch-state={launchState}
          data-launch-blocked={spaceSelectionBlocked ? "true" : "false"}
        >
          {launchState === "ready" ? (
            spaceSelectionBlocked ? (
            <>
              <p
                className="ss-launch-blocked"
                data-testid="ss-launch-blocked-title"
              >
                {idleLaunch.titleKo}
              </p>
              {idleLaunch.detailKo ? (
                <p
                  className="ss-launch-blocked-detail"
                  data-testid="ss-launch-blocked-detail"
                >
                  {idleLaunch.detailKo}
                </p>
              ) : null}
            </>
            ) : (
            <>
              <p className="ss-launch-ready">
                <svg
                  className="ss-launch-icon"
                  viewBox="0 0 20 20"
                  width="18"
                  height="18"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M4.5 10.4 8.2 14 15.6 5.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                탐색 준비 완료
              </p>
              <ul className="ss-launch-facts">
                <li>
                  <svg
                    className="ss-launch-icon"
                    viewBox="0 0 20 20"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="6.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M10 6.6v3.7l2.6 1.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="ss-launch-fact__label">예상 최대 시간</span>
                  <strong
                    className="ss-launch-fact__value"
                    data-testid="ss-launch-runtime"
                  >
                    {formatRuntimeKo(
                      Number(form.maxRuntimeMinutesOverride) * 60_000,
                    )}
                  </strong>
                </li>
                <li>
                  <svg
                    className="ss-launch-icon"
                    viewBox="0 0 20 20"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle cx="5" cy="10" r="1.6" fill="currentColor" />
                    <circle cx="15" cy="5.5" r="1.6" fill="currentColor" />
                    <circle cx="15" cy="14.5" r="1.6" fill="currentColor" />
                    <path
                      d="M6.6 10H12M12 10l2.2-3.4M12 10l2.2 3.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="ss-launch-fact__label">탐색 방식</span>
                  <strong
                    className="ss-launch-fact__value"
                    data-testid="ss-launch-method"
                  >
                    {combinationSentence || "추천 패턴을 자동으로 조합"}
                  </strong>
                </li>
              </ul>
            </>
            )
          ) : (
            <>
              <p
                className={
                  launchState === "paused"
                    ? "ss-launch-paused"
                    : "ss-launch-running"
                }
              >
                <span className="ss-launch-live-dot" aria-hidden="true" />
                {launchState === "paused"
                  ? "탐색 일시정지"
                  : launchState === "stopping"
                    ? searchCancellationPendingCopy(
                        props.searchProgress?.status,
                      ) ?? "중지 요청 중"
                    : "탐색 실행 중"}
              </p>
              <ul className="ss-launch-facts ss-launch-facts--live">
                {runningFamily ? (
                  <li>
                    <span className="ss-launch-fact__label">
                      현재 탐색 전략군
                    </span>
                    <strong
                      className="ss-launch-fact__value"
                      data-testid="ss-launch-family"
                    >
                      {runningFamily}
                    </strong>
                  </li>
                ) : null}
                {runningEvaluated != null ? (
                  <li>
                    <span className="ss-launch-fact__label">평가 완료</span>
                    <strong
                      className="ss-launch-fact__value ss-live-count"
                      data-testid="ss-launch-evaluated"
                    >
                      {runningEvaluated}
                    </strong>
                  </li>
                ) : null}
                {runningQualified != null ? (
                  <li>
                    <span className="ss-launch-fact__label">통과 후보</span>
                    <strong
                      className="ss-launch-fact__value ss-live-count"
                      data-testid="ss-launch-qualified"
                    >
                      {runningQualified}
                    </strong>
                  </li>
                ) : null}
                {runningElapsed != null ? (
                  <li>
                    <span className="ss-launch-fact__label">경과 시간</span>
                    <strong
                      className="ss-launch-fact__value ss-live-count"
                      data-testid="ss-launch-elapsed"
                    >
                      {runningElapsed}
                    </strong>
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </div>
        {launchState === "ready" ? (
        <Button
          type="button"
          size="lg"
          className="ss-btn-primary"
          data-testid="ss-create-submit"
          disabled={submitting || inputDisabled || spaceSelectionBlocked}
          onClick={() => {
            if (spaceSelectionBlocked) return;
            onSubmit();
          }}
        >
          {submitting ? "시작 중…" : "탐색 시작"}
        </Button>
        ) : null}
      </StickyActionBar>
      ) : null}
    </section>
  );
}
