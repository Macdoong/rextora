import {
  SEARCH_DEPTH_PROFILES,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { searchModeCustomerLabel } from "../customerDisplay";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";

export function step5SearchObjectiveLabel(
  form: StrategySearchOperatorFormState,
): string {
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  if (mode === "automatic") {
    return form.autoSearchObjective === "qualified_target"
      ? "목표 기준 자동 탐색"
      : "시간 기준 자동 탐색";
  }
  return searchModeCustomerLabel(mode);
}

export function step5ApplyDepthToRowMap(
  rowMap: Map<string, string>,
  form: StrategySearchOperatorFormState,
): Map<string, string> {
  const depth = SEARCH_DEPTH_PROFILES[form.depthProfile];
  const next = new Map(rowMap);
  if (depth) next.set("탐색 깊이", depth.labelKo);
  return next;
}

export type Step5ReviewCardRow = {
  labelKo: string;
  valueKo: string;
  testId?: string;
};

export type Step5ReviewCardId = "market" | "approach" | "strategy" | "validation";

function normalizeJitterValue(valueKo: string): string {
  return valueKo.replace(/^파라미터 재확인:\s*/, "");
}

function formatStrategyCount(valueKo: string): string {
  const n = valueKo.trim();
  if (!n || n === "—") return "—";
  return n.endsWith("개") ? n : `${n}개`;
}

export function step5CardReviewRows(
  cardId: Step5ReviewCardId,
  rowMap: Map<string, string>,
  form: StrategySearchOperatorFormState,
  options: { targetMode: boolean },
): Step5ReviewCardRow[] {
  const timeframeDisplay = formatTimeframeCustomerKo(form.timeframe);

  switch (cardId) {
    case "market":
      return [
        { labelKo: "대상", valueKo: rowMap.get("코인") ?? form.symbol ?? "—" },
        { labelKo: "시간봉", valueKo: timeframeDisplay, testId: "ss-step5-timeframe-display" },
        { labelKo: "분석 기간", valueKo: rowMap.get("분석 기간") ?? "—" },
      ];
    case "approach":
      return [
        {
          labelKo: "방식",
          valueKo: step5SearchObjectiveLabel(form),
        },
        {
          labelKo: "성향",
          valueKo: rowMap.get("탐색 프리셋") ?? "—",
        },
        { labelKo: "탐색 깊이", valueKo: rowMap.get("탐색 깊이") ?? "—" },
      ];
    case "strategy":
      return [
        { labelKo: "조합", valueKo: rowMap.get("선택 전략군") ?? "—" },
        { labelKo: "방향", valueKo: rowMap.get("탐색 방향") ?? "—" },
        {
          labelKo: "전략군 수",
          valueKo: formatStrategyCount(rowMap.get("전략군 수") ?? "—"),
          testId: "ss-step5-strategy-count",
        },
      ];
    case "validation": {
      if (options.targetMode) {
        return [
          {
            labelKo: "비용 검증",
            valueKo: normalizeJitterValue(rowMap.get("비용 검증") ?? "—"),
          },
          { labelKo: "레버리지", valueKo: rowMap.get("레버리지") ?? "—" },
          {
            labelKo: "파라미터 재확인",
            valueKo: normalizeJitterValue(
              rowMap.get("파라미터 재확인") ?? "—",
            ),
          },
        ];
      }
      return [
        {
          labelKo: "비용 검증",
          valueKo: rowMap.get("비용 검증") ?? "—",
        },
        { labelKo: "레버리지", valueKo: rowMap.get("레버리지") ?? "—" },
        {
          labelKo: "파라미터 재확인",
          valueKo: normalizeJitterValue(
            rowMap.get("파라미터 재확인") ?? "—",
          ),
        },
      ];
    }
    default:
      return [];
  }
}

export function step5CardPrimaryLines(
  cardId: Step5ReviewCardId,
  rowMap: Map<string, string>,
  form: StrategySearchOperatorFormState,
  options: { targetMode: boolean },
): string[] {
  const timeframeDisplay = formatTimeframeCustomerKo(form.timeframe);
  switch (cardId) {
    case "market":
      return [
        `${rowMap.get("코인") ?? form.symbol ?? "—"} · ${timeframeDisplay}`,
        rowMap.get("분석 기간") ?? "—",
      ];
    case "approach":
      return [step5SearchObjectiveLabel(form)];
    case "strategy":
      return [
        [
          rowMap.get("선택 전략군") ?? "—",
          rowMap.get("탐색 방향") ?? "—",
        ].join(" · "),
      ];
    case "validation": {
      const jitter = normalizeJitterValue(rowMap.get("파라미터 재확인") ?? "—");
      const leverage = rowMap.get("레버리지") ?? "—";
      if (options.targetMode) {
        return [`${leverage} · 파라미터 재확인 ${jitter}`];
      }
      const stress = rowMap.get("비용 검증") ?? "—";
      return [`${stress} · ${leverage} · 파라미터 재확인 ${jitter}`];
    }
    default:
      return [];
  }
}

export function step5CustomerTimeframeInRowMap(
  rowMap: Map<string, string>,
  form: StrategySearchOperatorFormState,
): Map<string, string> {
  const next = new Map(rowMap);
  next.set("타임프레임", formatTimeframeCustomerKo(form.timeframe));
  return next;
}
