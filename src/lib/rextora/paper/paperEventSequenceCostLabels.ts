/**
 * Operator-facing Paper Event-Sequence cost-model labels.
 * Client-safe: no Node/fs imports.
 */

export const PAPER_ES_COST_LABEL_CANONICAL = "패턴 비용 모델 · 현재";
export const PAPER_ES_COST_LABEL_LEGACY = "패턴 비용 모델 · 기존";
export const PAPER_ES_COST_LABEL_UNRESOLVED = "패턴 비용 모델 확인 필요";

export const EXECUTION_PROVENANCE_LABEL_STAMPED = "실행 증빙 완료";
export const EXECUTION_PROVENANCE_LABEL_RECONSTRUCTED =
  "기존 기록 · 실행 증빙 복원";
export const EXECUTION_PROVENANCE_LABEL_UNRESOLVED = "실행 모델 확인 필요";
export const PAPER_ES_LIFECYCLE_LABEL = "패턴 청산 · 이벤트 시퀀스";
export const PAPER_ES_HOLD_LABEL = "보유 봉";

export type PaperEventSequenceCostModelStatus =
  | "not_applicable"
  | "canonical"
  | "legacy"
  | "unresolved";

export function paperEventSequenceCostModelOperatorLabel(
  status: PaperEventSequenceCostModelStatus | null | undefined,
): string {
  if (status === "canonical") return PAPER_ES_COST_LABEL_CANONICAL;
  if (status === "legacy") return PAPER_ES_COST_LABEL_LEGACY;
  if (status === "unresolved") return PAPER_ES_COST_LABEL_UNRESOLVED;
  return "";
}

export function executionProvenanceStatusOperatorLabel(
  status: "stamped" | "reconstructed" | "unresolved" | null | undefined,
): string {
  if (status === "stamped") return EXECUTION_PROVENANCE_LABEL_STAMPED;
  if (status === "reconstructed") return EXECUTION_PROVENANCE_LABEL_RECONSTRUCTED;
  if (status === "unresolved") return EXECUTION_PROVENANCE_LABEL_UNRESOLVED;
  return "";
}
