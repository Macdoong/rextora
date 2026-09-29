import type { LucideIcon } from "lucide-react";
import {
  Layers,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Target,
} from "lucide-react";
import { buildAppliedSettingsPreview } from "../formValidation";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { durationPresetLabelKo } from "./GuidedApproachEssentials";
import { qualifiedTargetComparisonProfileLabel } from "./qualifiedTargetComparisonProfileDisplay";
import {
  step5ApplyDepthToRowMap,
  step5CardReviewRows,
  step5CustomerTimeframeInRowMap,
  step5SearchObjectiveLabel,
} from "./step5ReviewPresentation";

export type Step5LaunchFlowNodeId =
  | "market"
  | "search"
  | "strategy"
  | "validation"
  | "ready";

export type Step5LaunchFlowNode = {
  id: Step5LaunchFlowNodeId;
  titleKo: string;
  primaryKo: string;
  secondaryKo?: string;
  Icon: LucideIcon;
  valueTestId?: string;
  secondaryTestId?: string;
};

export function buildStep5LaunchRowMap(form: StrategySearchOperatorFormState) {
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
  return {
    rowMap: step5CustomerTimeframeInRowMap(
      step5ApplyDepthToRowMap(rowMap, form),
      form,
    ),
    targetMode,
  };
}

function strategyCountLabel(form: StrategySearchOperatorFormState, rowMap: Map<string, string>) {
  const raw = rowMap.get("전략군 수") ?? "—";
  return raw.endsWith("개") ? raw : `${raw}개`;
}

export function buildStep5LaunchFlowNodes(
  form: StrategySearchOperatorFormState,
  options: { combinationSentence: string },
): Step5LaunchFlowNode[] {
  const { rowMap, targetMode } = buildStep5LaunchRowMap(form);
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  const validationRows = step5CardReviewRows("validation", rowMap, form, { targetMode });
  const combo =
    rowMap.get("선택 전략군") ?? options.combinationSentence ?? "—";
  const direction = rowMap.get("탐색 방향") ?? "—";
  const leverage = rowMap.get("레버리지") ?? "—";
  const stress = rowMap.get("비용 검증") ?? "—";

  const searchSecondary =
    mode === "automatic"
      ? `최대 ${durationPresetLabelKo(form.durationPreset, form.maxRuntimeMinutesOverride)}`
      : undefined;

  const validationPrimary = targetMode
    ? `목표 조건 · ${stress}`
    : `${leverage} · ${stress}`;
  const validationSecondary = targetMode
    ? `${rowMap.get("후보 비교 기준") ?? "—"} · ${leverage}`
    : validationRows.find((r) => r.labelKo === "파라미터 재확인")?.valueKo;

  return [
    {
      id: "market",
      titleKo: "분석 대상",
      primaryKo: `${form.symbol || rowMap.get("코인") || "—"} · ${formatTimeframeCustomerKo(form.timeframe)}`,
      secondaryKo: rowMap.get("분석 기간") ?? undefined,
      Icon: Target,
    },
    {
      id: "search",
      titleKo: "탐색 방식",
      primaryKo: step5SearchObjectiveLabel(form),
      secondaryKo: searchSecondary,
      Icon: Settings2,
      valueTestId: "ss-launch-method",
      secondaryTestId: "ss-launch-runtime",
    },
    {
      id: "strategy",
      titleKo: "전략 구성",
      primaryKo: `${strategyCountLabel(form, rowMap)} · ${combo}`,
      secondaryKo: direction !== "—" ? direction : undefined,
      Icon: Layers,
      valueTestId: "ss-launch-strategy-composition",
    },
    {
      id: "validation",
      titleKo: "검증 · 위험",
      primaryKo: validationPrimary,
      secondaryKo: validationSecondary,
      Icon: ShieldCheck,
    },
    {
      id: "ready",
      titleKo: "실행",
      primaryKo: "준비 완료",
      secondaryKo: undefined,
      Icon: SearchCheck,
    },
  ];
}
