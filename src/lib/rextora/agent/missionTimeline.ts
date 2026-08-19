/**
 * Mission timeline for the AI Trading Employee workspace.
 * Pure / deterministic — never executes engines or invents progress.
 */

import type { ConversationEntityMemory } from "./conversationContext";
import type { ProposedAction } from "./proposedAction";
import type { AgentPlanDraft } from "./planDrafts";
import type { ResearchWorkspaceSummary } from "./researchWorkspace";
import {
  LIFECYCLE_LABEL_KO,
  LIFECYCLE_NEXT_MILESTONE_KO,
  type PipelineLifecycleStage,
} from "./lifecycleStage";
import type { ConversationWorkingState } from "./conversationState";

export type MissionItemStatus =
  | "completed"
  | "pending"
  | "awaiting_approval"
  | "blocked"
  | "next";

export interface MissionTimelineItem {
  id: string;
  labelKo: string;
  status: MissionItemStatus;
  detailKo?: string;
  href?: string;
}

export interface MissionTimeline {
  currentObjectiveKo: string;
  completed: MissionTimelineItem[];
  pending: MissionTimelineItem[];
  pendingApprovals: MissionTimelineItem[];
  nextRecommendation: MissionTimelineItem | null;
  lifecycleStage: PipelineLifecycleStage | null;
  lifecycleLabelKo: string;
  blockersKo: string[];
  whyRecommendedKo: string | null;
  whyRejectedKo: string | null;
  whyWaitingKo: string | null;
  progressPct: number;
  updatedAt: string;
}

const STAGE_ORDER: PipelineLifecycleStage[] = [
  "empty",
  "demo",
  "search_needed",
  "search_running",
  "search_failed",
  "results_review",
  "backtest_needed",
  "backtest_review",
  "paper_ready",
  "paper_active",
  "live_review",
];

function stageIndex(stage: PipelineLifecycleStage | null | undefined): number {
  if (!stage || stage === "unknown") return 0;
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

function progressForStage(stage: PipelineLifecycleStage | null): number {
  if (!stage || stage === "unknown") return 5;
  if (stage === "empty" || stage === "demo") return 8;
  const idx = stageIndex(stage);
  return Math.min(95, Math.round(((idx + 1) / STAGE_ORDER.length) * 100));
}

function completedForStage(stage: PipelineLifecycleStage | null): MissionTimelineItem[] {
  const items: MissionTimelineItem[] = [];
  const idx = stageIndex(stage);
  if (idx >= stageIndex("results_review")) {
    items.push({
      id: "done-search",
      labelKo: "전략 탐색 검토",
      status: "completed",
      href: "/strategy-search",
    });
  }
  if (idx >= stageIndex("backtest_review")) {
    items.push({
      id: "done-results",
      labelKo: "탐색 결과 검토",
      status: "completed",
      href: "/results",
    });
  }
  if (idx >= stageIndex("paper_ready")) {
    items.push({
      id: "done-backtest",
      labelKo: "백테스트 증거 확보",
      status: "completed",
      href: "/backtest",
    });
  }
  if (idx >= stageIndex("paper_active") || stage === "live_review") {
    items.push({
      id: "done-paper",
      labelKo: "모의매매 준비/진행",
      status: "completed",
      href: "/paper-trading",
    });
  }
  return items;
}

function pendingForStage(stage: PipelineLifecycleStage | null): MissionTimelineItem[] {
  if (!stage || stage === "unknown") {
    return [
      {
        id: "pending-orient",
        labelKo: "현재 연구 상태 확인",
        status: "pending",
        href: "/dashboard",
      },
    ];
  }
  const next = LIFECYCLE_NEXT_MILESTONE_KO[stage];
  return [
    {
      id: `pending-${stage}`,
      labelKo: next,
      status: "pending",
      detailKo: LIFECYCLE_LABEL_KO[stage],
    },
  ];
}

export function buildMissionTimeline(input: {
  entities?: ConversationEntityMemory | null;
  workspace?: ResearchWorkspaceSummary | null;
  workingState?: ConversationWorkingState | null;
  pendingAction?: ProposedAction | null;
  pendingPlan?: AgentPlanDraft | null;
}): MissionTimeline {
  const entities = input.entities ?? null;
  const workspace = input.workspace ?? null;
  const working = input.workingState ?? null;
  const pendingAction =
    input.pendingAction ??
    entities?.pendingProposedAction ??
    null;
  const pendingPlan = input.pendingPlan ?? entities?.pendingPlan ?? null;
  const stage =
    working?.lifecycleStage ??
    workspace?.stage ??
    entities?.pipelineStage ??
    null;

  const currentObjectiveKo =
    working?.currentObjectiveKo ??
    entities?.pinnedObjectiveKo ??
    (stage ? `현재 목표: ${LIFECYCLE_NEXT_MILESTONE_KO[stage]}` : null) ??
    workspace?.nextMilestoneKo ??
    "현재 연구 상태를 확인하고 다음 단계를 준비합니다.";

  const completed = completedForStage(stage);
  const pending = pendingForStage(stage);

  const pendingApprovals: MissionTimelineItem[] = [];
  if (pendingAction && !pendingAction.blockedReason) {
    pendingApprovals.push({
      id: pendingAction.actionId,
      labelKo: pendingAction.summary,
      status: "awaiting_approval",
      detailKo:
        "승인하면 관련 화면만 열립니다. Search/Backtest/Paper/Live는 자동 실행되지 않습니다.",
      href: pendingAction.targetRoute,
    });
  } else if (pendingPlan?.requiresApproval) {
    pendingApprovals.push({
      id: `plan-${pendingPlan.kind}`,
      labelKo: pendingPlan.titleKo,
      status: "awaiting_approval",
      detailKo: pendingPlan.summaryKo,
      href: pendingPlan.openRoute,
    });
  }

  const nextRecommendation: MissionTimelineItem | null = pendingApprovals[0]
    ? {
        ...pendingApprovals[0],
        status: "next",
        id: `next-${pendingApprovals[0].id}`,
      }
    : pending[0]
      ? { ...pending[0], status: "next", id: `next-${pending[0].id}` }
      : {
          id: "next-recommend",
          labelKo: workspace?.nextMilestoneKo ?? "다음 권장 확인",
          status: "next",
          href: "/dashboard",
        };

  const blockersKo: string[] = [];
  if (workspace?.blockedActionsKo) {
    blockersKo.push(workspace.blockedActionsKo);
  } else {
    blockersKo.push("실전 주문 · SAFE 수정 · 자동 실행");
  }
  if (pendingAction?.blockedReason) {
    blockersKo.push(pendingAction.blockedReason);
  }
  if (stage === "search_failed") {
    blockersKo.push("실패 탐색 — 원인 확인 후 재실행 필요");
  }

  const whyRecommendedKo =
    entities?.previousReason ??
    entities?.previousRecommendation ??
    (stage
      ? `검증된 라이프사이클 상태(${LIFECYCLE_LABEL_KO[stage]})에 따른 다음 단계입니다.`
      : null);

  const whyRejectedKo = pendingAction?.blockedReason
    ? pendingAction.blockedReason
    : stage === "search_failed"
      ? "최근 탐색이 실패해 다음 단계 진행이 보류되었습니다."
      : null;

  const whyWaitingKo =
    pendingApprovals.length > 0
      ? "계획이 준비되었고 사용자 승인을 기다리는 중입니다. 엔진은 자동으로 시작되지 않습니다."
      : stage === "search_running"
        ? "탐색이 실행 중이라 완료를 기다리는 중입니다."
        : stage === "paper_active"
          ? "모의매매가 진행 중이라 성과 점검을 기다리는 중입니다."
          : null;

  return {
    currentObjectiveKo,
    completed,
    pending,
    pendingApprovals,
    nextRecommendation,
    lifecycleStage: stage,
    lifecycleLabelKo: stage ? LIFECYCLE_LABEL_KO[stage] : "상태 확인 중",
    blockersKo,
    whyRecommendedKo,
    whyRejectedKo,
    whyWaitingKo,
    progressPct: progressForStage(stage),
    updatedAt: new Date().toISOString(),
  };
}

export function emptyMissionTimeline(): MissionTimeline {
  return {
    currentObjectiveKo: "현재 연구 상태를 확인하세요.",
    completed: [],
    pending: [
      {
        id: "pending-orient",
        labelKo: "현재 연구 상태 확인",
        status: "pending",
        href: "/dashboard",
      },
    ],
    pendingApprovals: [],
    nextRecommendation: {
      id: "next-orient",
      labelKo: "연구 현황 확인",
      status: "next",
      href: "/dashboard",
    },
    lifecycleStage: null,
    lifecycleLabelKo: "상태 확인 중",
    blockersKo: ["실전 주문 · SAFE 수정 · 자동 실행"],
    whyRecommendedKo: null,
    whyRejectedKo: null,
    whyWaitingKo: null,
    progressPct: 5,
    // Stable bootstrap value: this snapshot is rendered on both server and
    // client before persisted state is hydrated.
    updatedAt: new Date(0).toISOString(),
  };
}
