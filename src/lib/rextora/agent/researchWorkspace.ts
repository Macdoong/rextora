/**
 * Research workspace summary — verified store snapshot for the Agent panel.
 * Read-only; never starts jobs or invents metrics.
 */

import type { FactItem } from "./types";
import {
  inferLifecycleStage,
  LIFECYCLE_LABEL_KO,
  LIFECYCLE_NEXT_MILESTONE_KO,
  type PipelineLifecycleStage,
} from "./lifecycleStage";
import {
  fetchBacktestFacts,
  fetchPaperStartFacts,
  fetchSearchStatusFacts,
  fetchStrategyFacts,
  fetchFirstRunFacts,
} from "./agentDataFetcher";
import type { AgentLifecycleContext } from "./types";
import type { ConversationEntityMemory } from "./conversationContext";
import { buildResearchSummaryDraft, type AgentPlanDraft } from "./planDrafts";

export interface ResearchWorkspaceSummary {
  stage: PipelineLifecycleStage;
  stageLabelKo: string;
  currentResearchKo: string;
  jobsKo: string;
  topStrategyKo: string;
  riskKo: string;
  openApprovalsKo: string;
  blockedActionsKo: string;
  nextMilestoneKo: string;
  evidenceAvailable: boolean;
  evidenceNoteKo: string;
  fetchedAt: string;
  plan: AgentPlanDraft;
}

function fv(facts: FactItem[], label: string): string | undefined {
  return facts.find((f) => f.labelKo === label)?.value;
}

export async function buildResearchWorkspaceSummary(input?: {
  context?: AgentLifecycleContext | null;
  entities?: ConversationEntityMemory | null;
}): Promise<ResearchWorkspaceSummary> {
  const context = input?.context ?? null;
  const entities = input?.entities ?? null;

  let searchFacts: FactItem[] = [];
  let stratFacts: FactItem[] = [];
  let btFacts: FactItem[] = [];
  let paperFacts: FactItem[] = [];
  let firstRunFacts: FactItem[] = [];

  try {
    [searchFacts, stratFacts, btFacts, paperFacts, firstRunFacts] =
      await Promise.all([
        fetchSearchStatusFacts(),
        fetchStrategyFacts(),
        fetchBacktestFacts(),
        fetchPaperStartFacts(context),
        fetchFirstRunFacts(),
      ]);
  } catch {
    // keep empty — evidence unavailable
  }

  const merged = [
    ...firstRunFacts,
    ...searchFacts,
    ...stratFacts,
    ...btFacts,
    ...paperFacts,
  ];
  const stage = inferLifecycleStage(merged);
  const total = fv(searchFacts, "전체 탐색 작업") ?? "0개";
  const completed = fv(searchFacts, "완료됨") ?? "0개";
  const running = fv(searchFacts, "실행 중") ?? "0개";
  const topStrategy =
    entities?.strategyLabel ??
    fv(btFacts, "전략 ID") ??
    fv(stratFacts, "모의매매 전략 이름") ??
    fv(stratFacts, "SAFE 전략") ??
    null;
  const mdd = fv(btFacts, "최대 낙폭(MDD)");
  const totalReturn = fv(btFacts, "총 수익률");
  const riskKo =
    mdd || totalReturn
      ? `수익률 ${totalReturn ?? "—"} · MDD ${mdd ?? "—"}`
      : "검증된 리스크 요약 없음";
  const openApprovals =
    entities?.pendingProposedAction?.summary ??
    (stage === "paper_ready" || stage === "live_review"
      ? "승인 대기 가능"
      : "없음");
  const evidenceAvailable = merged.length > 0;
  const plan = buildResearchSummaryDraft({
    stage,
    jobsTotal: total,
    jobsCompleted: completed,
    jobsRunning: running,
    topStrategy,
    riskNote: riskKo,
    openApprovals,
    blockedActions: "실전 주문 · SAFE 수정 · 자동 실행",
  });

  return {
    stage,
    stageLabelKo: LIFECYCLE_LABEL_KO[stage],
    currentResearchKo: LIFECYCLE_LABEL_KO[stage],
    jobsKo: `전체 ${total} · 완료 ${completed} · 실행 중 ${running}`,
    topStrategyKo: topStrategy ?? "검증된 주목 전략 없음",
    riskKo,
    openApprovalsKo: openApprovals,
    blockedActionsKo: "실전 주문 · SAFE 수정 · 자동 실행",
    nextMilestoneKo: LIFECYCLE_NEXT_MILESTONE_KO[stage],
    evidenceAvailable,
    evidenceNoteKo: evidenceAvailable
      ? "저장된 전략·탐색·백테스트·세션 데이터 기준"
      : "검증된 증거가 없습니다.",
    fetchedAt: new Date().toISOString(),
    plan,
  };
}
