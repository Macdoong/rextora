/**
 * Human-readable Search configuration summary from the immutable job plan/config.
 * Never invents fields that were not applied at create time.
 */

import { getSearchJob, type StrategySearchStoreOptions } from "./jobStore";
import { getSearchPlan } from "./searchPlan";
import { getJobExecutionProfile } from "./jobExecutionProfile";
import {
  PATTERN_SEARCH_SUPPORT,
  SEARCHABLE_STRATEGY_FAMILIES,
} from "./patternSupportMatrix";
import { PATTERN_SEARCH_SPACE_IDS } from "./patternSearchSpaces";

export type LeverageModeId =
  | "automatic"
  | "fixed"
  | "range"
  | "disabled";

export interface AppliedSearchSummarySection {
  id: string;
  titleKo: string;
  rows: Array<{ labelKo: string; valueKo: string }>;
}

export interface AppliedSearchSummaryView {
  jobId: string;
  titleKo: string;
  subtitleKo: string;
  sections: AppliedSearchSummarySection[];
  /** Raw developer payload — Expert only. */
  developerPayload: Record<string, unknown>;
}

function leverageLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "automatic":
      return "자동 추천";
    case "fixed":
      return "고정";
    case "range":
      return "범위 탐색";
    case "disabled":
      return "사용 안 함 (1x)";
    default:
      return "엔진 기본 (SafeV44 파라미터)";
  }
}

function formatDateMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("ko-KR");
}

function formatRatioPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(Math.abs(v) * 100).toFixed(2)}%`;
}

/**
 * Build summary from persisted job + plan only (설정 당시 적용값).
 */
export function buildPersistedSearchSummary(
  jobId: string,
  options?: StrategySearchStoreOptions,
): AppliedSearchSummaryView | null {
  const job = getSearchJob(jobId, options);
  if (!job) return null;
  const plan = getSearchPlan(jobId, options);
  const exec = (() => {
    try {
      return getJobExecutionProfile(jobId, options);
    } catch {
      return null;
    }
  })();

  const spaceIds = plan?.spaces.map((s) => s.id) ?? [];
  const familyLabels = spaceIds
    .map(
      (id) =>
        SEARCHABLE_STRATEGY_FAMILIES.find((f) => f.searchSpaceId === id)
          ?.labelKo ?? id,
    )
    .join(", ");

  const unsupportedPatterns = (() => {
    const selected = spaceIds.filter((id) =>
      (PATTERN_SEARCH_SPACE_IDS as readonly string[]).includes(id),
    );
    if (selected.length === 0) return "선택 없음";
    return selected
      .map((id) => {
        const entry = PATTERN_SEARCH_SUPPORT.find((p) => p.searchSpaceId === id);
        const status =
          entry?.search === "verification_required"
            ? "검증 필요"
            : entry?.searchable
              ? "탐색 포함"
              : "미지원";
        return `${entry?.labelKo ?? id}: ${status}`;
      })
      .join(" · ");
  })();

  const levMode =
    (plan as { leverageMode?: string } | null)?.leverageMode ?? null;
  const levFixed =
    (plan as { leverageFixed?: number } | null)?.leverageFixed ?? null;
  const levMin = (plan as { leverageMin?: number } | null)?.leverageMin ?? null;
  const levMax = (plan as { leverageMax?: number } | null)?.leverageMax ?? null;

  const patternLevel = plan?.patternConfigLevel ?? "automatic";
  const patternDirectionLabel = (dir: string | null | undefined): string => {
    switch (dir) {
      case "long":
        return "롱";
      case "short":
        return "숏";
      case "both":
        return "롱·숏";
      default:
        return "—";
    }
  };
  const patternRetestLabel = (mode: string | null | undefined): string =>
    mode === "optional"
      ? "선택적 재테스트"
      : mode === "disabled"
        ? "재테스트 사용 안 함"
        : mode === "required"
          ? "재테스트 필수"
          : "—";
  const patternConfirmLabel = (mode: string | null | undefined): string =>
    mode === "strict" ? "엄격" : mode === "standard" ? "표준" : "—";
  const patternConfirmCloseLabel = (mode: string | null | undefined): string =>
    mode === "disabled" ? "확인 종가 사용 안 함" : mode === "required" ? "확인 종가 필수" : "—";
  const patternStrengthLabel = (mode: string | null | undefined): string => {
    switch (mode) {
      case "loose":
        return "느슨";
      case "strict":
        return "엄격";
      case "standard":
        return "표준";
      default:
        return "—";
    }
  };
  const patternSrSensLabel = (mode: string | null | undefined): string => {
    switch (mode) {
      case "tight":
        return "타이트";
      case "loose":
        return "느슨";
      case "standard":
        return "표준";
      default:
        return "—";
    }
  };
  const patternRiskLabel = (style: string | null | undefined): string => {
    switch (style) {
      case "conservative":
        return "보수형";
      case "aggressive":
        return "공격형";
      case "balanced":
        return "균형형";
      default:
        return "—";
    }
  };
  const patternLevelLabel = (level: string): string => {
    switch (level) {
      case "basic":
        return "기본";
      case "expert":
        return "전문가";
      default:
        return "자동";
    }
  };

  const windows = job.config.evaluationWindows ?? [];
  const firstWin = windows[0];
  const lastWin = windows[windows.length - 1] ?? firstWin;

  const thresholds = exec?.passPolicy?.thresholds ?? job.config.passCriteria;

  const sections: AppliedSearchSummarySection[] = [
    {
      id: "target",
      titleKo: "탐색 대상",
      rows: [
        {
          labelKo: "시장 모드",
          valueKo:
            plan?.symbolSelection?.mode === "manual"
              ? "수동 선택"
              : plan?.symbolSelection?.mode === "recommended"
                ? "추천 심볼"
                : "설정 당시 심볼",
        },
        {
          labelKo: "심볼",
          valueKo: job.config.symbols.join(", ") || "—",
        },
        {
          labelKo: "선택 이유",
          valueKo: plan?.symbolSelection?.reasonKo ?? "—",
        },
        { labelKo: "타임프레임", valueKo: job.config.timeframe },
      ],
    },
    {
      id: "period",
      titleKo: "탐색 기간",
      rows: [
        {
          labelKo: "분석 구간 시작",
          valueKo: firstWin
            ? formatDateMs(firstWin.fromOpenTime)
            : "—",
        },
        {
          labelKo: "분석 구간 종료",
          valueKo: lastWin ? formatDateMs(lastWin.toOpenTime) : "—",
        },
        {
          labelKo: "요청 연구 시간",
          valueKo:
            plan?.maxRuntimeMs != null
              ? `${Math.round(plan.maxRuntimeMs / 60_000)}분`
              : "제한 없음",
        },
      ],
    },
    {
      id: "strategy_scope",
      titleKo: "전략 범위",
      rows: [
        {
          labelKo: "활성 전략 패밀리",
          valueKo: familyLabels || "깊이 프로필 기본 공간",
        },
        {
          labelKo: "롱/숏",
          valueKo: "SafeV44 파라미터 기준 (양방향 가능)",
        },
        {
          labelKo: "패턴 유형 (OB/FVG/추세선/지지저항)",
          valueKo: unsupportedPatterns,
        },
        {
          labelKo: "지표·거래량 확인",
          valueKo: "SafeV44 내장 규칙 사용",
        },
      ],
    },
    {
      id: "risk",
      titleKo: "위험 설정",
      rows: [
        {
          labelKo: "최대 낙폭 기준",
          valueKo: formatRatioPct(
            (thresholds as { maxMdd?: number } | undefined)?.maxMdd ?? null,
          ),
        },
        {
          labelKo: "레버리지 모드",
          valueKo: leverageLabel(levMode),
        },
        {
          labelKo: "레버리지 값",
          valueKo:
            levMode === "fixed" && levFixed != null
              ? `${levFixed}x`
              : levMode === "range" && levMin != null && levMax != null
                ? `${levMin}x ~ ${levMax}x`
                : levMode === "disabled"
                  ? "1x"
                  : "엔진 기본 범위",
        },
        {
          labelKo: "포지션 사이징",
          valueKo: "SafeV44 size/risk 파라미터",
        },
      ],
    },
    {
      id: "validation",
      titleKo: "검증 설정",
      rows: [
        {
          labelKo: "최소 거래",
          valueKo: String(
            (thresholds as { minTradeCount?: number } | undefined)
              ?.minTradeCount ?? "—",
          ),
        },
        {
          labelKo: "최소 수익",
          valueKo: formatRatioPct(
            (thresholds as { minTotalReturn?: number } | undefined)
              ?.minTotalReturn ?? null,
          ),
        },
        {
          labelKo: "수수료",
          valueKo:
            exec?.baseCostConfig?.feeRate != null
              ? formatRatioPct(exec.baseCostConfig.feeRate)
              : "—",
        },
        {
          labelKo: "슬리피지",
          valueKo:
            exec?.baseCostConfig?.slippageRate != null
              ? formatRatioPct(exec.baseCostConfig.slippageRate)
              : "—",
        },
        {
          labelKo: "비용 스트레스",
          valueKo:
            (exec?.costStressScenarios?.length ?? 0) > 0 ||
            job.config.costStress?.enabled
              ? "사용"
              : "미사용",
        },
        {
          labelKo: "거래 안정성(지터)",
          valueKo:
            exec?.jitterConfig?.enabled || job.config.jitter?.enabled
              ? "사용"
              : "미사용",
        },
        {
          labelKo: "합격 프로필",
          valueKo: plan?.qualificationProfile ?? "—",
        },
      ],
    },
    {
      id: "engine",
      titleKo: "탐색 엔진",
      rows: [
        {
          labelKo: "단계 묶음",
          valueKo: String(plan?.stageBatchSize ?? "—"),
        },
        {
          labelKo: "후보 예산",
          valueKo: String(plan?.candidateBudget ?? "—"),
        },
        {
          labelKo: "최소 확보 합격",
          valueKo: String(plan?.qualifiedTarget ?? "—"),
        },
        { labelKo: "시드", valueKo: String(job.config.seed) },
        {
          labelKo: "깊이 프로필",
          valueKo: plan?.depthProfile ?? "—",
        },
        {
          labelKo: "탐색 이름",
          valueKo: plan?.searchName ?? job.config.strategyTemplateId,
        },
      ],
    },
  ];

  if (patternLevel === "basic" || patternLevel === "expert") {
    const comboSpec = plan?.patternCombinationSpec ?? null;
    const failurePolicy =
      plan?.patternCombinationFailurePolicy ??
      comboSpec?.failurePolicy ??
      plan?.patternCombinationInvalidationMode ??
      null;
    const operator =
      plan?.patternCombinationOperator ?? comboSpec?.operator ?? null;
    const families =
      comboSpec?.blocks.map((b) => b.family).join(" → ") ??
      plan?.patternCombinationFamilies?.join(", ") ??
      null;
    const blocksSummary = comboSpec
      ? comboSpec.blocks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(
            (b) =>
              `${b.family}(${b.role}${b.required ? ",필수" : ",선택"}·w${b.weight}·p${b.priority})`,
          )
          .join(" · ")
      : "—";
    sections.push({
      id: "pattern_config",
      titleKo: "패턴 탐색 설정",
      rows: [
        {
          labelKo: "설정 수준",
          valueKo: patternLevelLabel(patternLevel),
        },
        {
          labelKo: "선택 모드",
          valueKo:
            plan?.patternSelectionMode === "manual"
              ? "수동 선택"
              : plan?.patternSelectionMode === "automatic"
                ? "자동 (시스템 관리)"
                : "—",
        },
        {
          labelKo: "방향",
          valueKo: patternDirectionLabel(plan?.patternDirection),
        },
        {
          labelKo: "재테스트",
          valueKo: patternRetestLabel(plan?.patternRetestMode),
        },
        {
          labelKo: "확인 강도",
          valueKo: patternConfirmLabel(plan?.patternConfirmStrength),
        },
        {
          labelKo: "확인 종가",
          valueKo: patternConfirmCloseLabel(plan?.patternConfirmClose),
        },
        {
          labelKo: "만료 봉 수",
          valueKo:
            plan?.patternExpiryBars != null
              ? `${plan.patternExpiryBars}봉`
              : "—",
        },
        {
          labelKo: "위험 스타일",
          valueKo: patternRiskLabel(plan?.patternRiskStyle),
        },
        {
          labelKo: "패턴 강도",
          valueKo: patternStrengthLabel(plan?.patternStrength),
        },
        {
          labelKo: "지지/저항·추세선 민감도",
          valueKo: patternSrSensLabel(plan?.patternSrSensitivity),
        },
        {
          labelKo: "조합 연산자",
          valueKo: operator ? String(operator).toUpperCase() : "—",
        },
        {
          labelKo: "실패 정책",
          valueKo:
            failurePolicy === "majority"
              ? "MAJORITY (과반 실패)"
              : failurePolicy === "all"
                ? "ALL (전부 실패)"
                : failurePolicy === "any"
                  ? "ANY (하나라도 실패)"
                  : "—",
        },
        {
          labelKo: "적용 패턴 패밀리",
          valueKo: families || "—",
        },
        {
          labelKo: "블록 (역할·필수·가중·우선)",
          valueKo: blocksSummary,
        },
      ],
    });
  }

  return {
    jobId,
    titleKo: "설정 당시 적용값",
    subtitleKo:
      "이후 프리셋 변경과 무관하게, 이 탐색 시작 시 저장된 설정입니다.",
    sections,
    developerPayload: {
      jobId,
      status: job.status,
      symbols: job.config.symbols,
      timeframe: job.config.timeframe,
      seed: job.config.seed,
      depthProfile: plan?.depthProfile ?? null,
      qualificationProfile: plan?.qualificationProfile ?? null,
      spaceIds,
      leverageMode: levMode,
      leverageFixed: levFixed,
      leverageMin: levMin,
      leverageMax: levMax,
      maxRuntimeMs: plan?.maxRuntimeMs ?? null,
      candidateBudget: plan?.candidateBudget ?? null,
      qualifiedTarget: plan?.qualifiedTarget ?? null,
      patternSelectionMode: plan?.patternSelectionMode ?? null,
      patternConfigLevel: plan?.patternConfigLevel ?? null,
      patternDirection: plan?.patternDirection ?? null,
      patternRetestMode: plan?.patternRetestMode ?? null,
      patternConfirmStrength: plan?.patternConfirmStrength ?? null,
      patternConfirmClose: plan?.patternConfirmClose ?? null,
      patternExpiryBars: plan?.patternExpiryBars ?? null,
      patternRiskStyle: plan?.patternRiskStyle ?? null,
      patternStrength: plan?.patternStrength ?? null,
      patternSrSensitivity: plan?.patternSrSensitivity ?? null,
      patternCombinationOperator: plan?.patternCombinationOperator ?? null,
      patternCombinationFailurePolicy:
        plan?.patternCombinationFailurePolicy ?? null,
      patternCombinationInvalidationMode:
        plan?.patternCombinationInvalidationMode ?? null,
      patternCombinationFamilies: plan?.patternCombinationFamilies ?? null,
      patternCombinationSpec: plan?.patternCombinationSpec ?? null,
    },
  };
}
