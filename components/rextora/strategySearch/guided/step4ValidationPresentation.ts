import { GUIDE_COPY } from "./strategySearchStepModel";

export const STEP4_JITTER_RECHECK_BRIEF_KO =
  "주변 설정에서도 결과가 크게 무너지지 않는지 다시 확인합니다." as const;

export const STEP4_BAND_LABELS = {
  evaluation: "A. 후보 평가",
  risk: "B. 위험 · 레버리지",
  cost: "C. 거래 비용",
} as const;

export function step4WorkspaceHeadCopy(automaticTargetMode: boolean): {
  title: string;
  description: string;
} {
  if (automaticTargetMode) {
    return {
      title: "검증 · 위험 기준",
      description:
        "2단계 목표 조건을 확인하고, 통과 후보의 비교 방식과 위험·비용 검증을 설정합니다.",
    };
  }
  return {
    title: "검증 · 위험 기준",
    description: "합격 기준·낙폭·비용 검증을 단계별로 조정합니다.",
  };
}

export function step4BandDescription(
  band: "evaluation" | "risk" | "cost",
  automaticTargetMode: boolean,
): string | undefined {
  if (band === "evaluation") {
    if (automaticTargetMode) {
      return "2단계 목표 조건은 그대로 사용하고, 통과 후보의 비교 기준과 파라미터 재확인을 설정합니다.";
    }
    return "합격 기준과 거래 수·수익률, 파라미터 재확인을 설정합니다.";
  }
  if (band === "risk") {
    if (automaticTargetMode) {
      return "레버리지 범위를 설정합니다. 최대 낙폭 목표는 2단계에서 설정한 조건을 그대로 사용합니다.";
    }
    return "레버리지와 최대 허용 낙폭을 설정합니다.";
  }
  if (band === "cost") {
    return "수수료·슬리피지와 비용 1.5배 추가 검증을 설정합니다.";
  }
  return undefined;
}

export function validationStepGuideCopy(automaticTargetMode: boolean) {
  const base = GUIDE_COPY.validation;
  if (!automaticTargetMode) return base;
  return {
    ...base,
    taskKo:
      "2단계 목표 조건을 확인하고, 통과 후보의 비교 방식과 위험·비용 검증을 설정합니다.",
  };
}
