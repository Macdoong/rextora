/**
 * Pipeline lifecycle stage for the AI Trading Employee control plane.
 * Derived only from verified facts — never invents progress.
 */

import type { FactItem } from "./types";

export type PipelineLifecycleStage =
  | "empty"
  | "demo"
  | "search_needed"
  | "search_running"
  | "search_failed"
  | "results_review"
  | "backtest_needed"
  | "backtest_review"
  | "paper_ready"
  | "paper_active"
  | "live_review"
  | "unknown";

export const LIFECYCLE_LABEL_KO: Record<PipelineLifecycleStage, string> = {
  empty: "데이터 없음",
  demo: "데모 확인",
  search_needed: "탐색 필요",
  search_running: "탐색 진행 중",
  search_failed: "탐색 실패 검토",
  results_review: "결과 검토",
  backtest_needed: "백테스트 필요",
  backtest_review: "백테스트 검토",
  paper_ready: "모의매매 준비",
  paper_active: "모의매매 진행 중",
  live_review: "실전 승인 검토",
  unknown: "상태 확인 중",
};

export const LIFECYCLE_NEXT_MILESTONE_KO: Record<PipelineLifecycleStage, string> = {
  empty: "데모 확인 또는 첫 탐색 계획",
  demo: "실제 탐색 계획 준비",
  search_needed: "탐색 계획 승인",
  search_running: "탐색 완료 대기",
  search_failed: "실패 원인 확인",
  results_review: "추천 후보 검토",
  backtest_needed: "백테스트 계획 승인",
  backtest_review: "백테스트 증거 검토",
  paper_ready: "모의매매 승인",
  paper_active: "모의매매 성과 점검",
  live_review: "실전 승인 게이트 검토",
  unknown: "현재 연구 상태 확인",
};

function fv(facts: FactItem[], label: string): string | undefined {
  return facts.find((f) => f.labelKo === label)?.value;
}

function parseCount(raw?: string): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Infer pipeline stage strictly from verified FactItem values. */
export function inferLifecycleStage(facts: FactItem[]): PipelineLifecycleStage {
  const mode = fv(facts, "최초 실행 모드");
  if (mode === "EMPTY") return "empty";
  if (mode === "DEMO_AVAILABLE" || mode === "DEMO_ACTIVE") return "demo";

  const running = parseCount(fv(facts, "실행 중"));
  const failed = parseCount(fv(facts, "실패"));
  const completed = parseCount(fv(facts, "완료됨"));
  const btNum = parseCount(fv(facts, "최근 백테스트 수"));
  const paperNum = parseCount(fv(facts, "모의매매 가능 전략"));
  const activePaper = fv(facts, "활성 Paper 세션");
  const hasActivePaper = Boolean(activePaper && activePaper !== "없음");
  const liveReady = fv(facts, "실전 가능 후보");
  const liveReadyNum = parseCount(liveReady);

  if (running > 0) return "search_running";
  if (failed > 0 && completed === 0) return "search_failed";
  if (hasActivePaper) return "paper_active";
  if (liveReadyNum > 0 && btNum > 0 && paperNum > 0) return "live_review";
  if (btNum > 0 && paperNum > 0) return "paper_ready";
  if (btNum > 0) return "backtest_review";
  if (completed > 0 && btNum === 0) return "results_review";
  if (completed === 0 && running === 0) return "search_needed";
  if (completed > 0) return "backtest_needed";
  return "unknown";
}

export function lifecycleObjectiveKo(stage: PipelineLifecycleStage): string {
  return `현재 목표: ${LIFECYCLE_NEXT_MILESTONE_KO[stage]}`;
}
