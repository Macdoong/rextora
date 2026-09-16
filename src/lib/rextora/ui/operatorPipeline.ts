/**
 * Operator Center pipeline presentation.
 * Source-backed stage states only — never fabricates completion.
 */

import { paperOperatorStatusLabel } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import type { PaperOperatorUiStatus } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import { OPERATOR_PIPELINE, OPERATOR_STATUS } from "./operatorTerminology";

export type OperatorPipelineTone =
  | "completed"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "needs_review";

export type OperatorPipelineStep = {
  id: string;
  label: string;
  status: string;
  tone: OperatorPipelineTone;
  href: string;
  testId?: string;
};

export type OperatorPipelineInput = {
  researchLabel: string;
  researchHref: string;
  completedRecent?: { id: string; status: string } | undefined;
  paperName: string | null;
  paperSessionStatus: string | null;
  liveAllowed?: boolean;
  canStartLive?: boolean;
  liveBlockReason?: string | null;
  emergencyActive?: boolean;
};

function paperStatusLabel(status: string | null): string | null {
  if (!status) return null;
  const known: PaperOperatorUiStatus[] = [
    "pending_approval",
    "ready",
    "active",
    "paused",
    "risk_halted",
    "stopped",
    "failed",
    "idle",
    "starting",
    "stopping",
    "error",
  ];
  if (known.includes(status as PaperOperatorUiStatus)) {
    return paperOperatorStatusLabel(status as PaperOperatorUiStatus);
  }
  return status;
}

function researchTone(label: string): OperatorPipelineTone {
  if (label === "진행 중" || label === "일시정지 요청" || label === "중지 요청 중") {
    return "in_progress";
  }
  if (label === "일시정지" || label === "실행 중단" || label === "결과 정리 중") {
    return "needs_review";
  }
  return "waiting";
}

export function buildOperatorPipeline(
  input: OperatorPipelineInput,
): OperatorPipelineStep[] {
  const strategyCompleted = input.completedRecent?.status === "completed";
  const paperLabel = paperStatusLabel(input.paperSessionStatus);
  const paperActive =
    input.paperSessionStatus === "active" ||
    input.paperSessionStatus === "starting";
  const paperNeedsReview =
    input.paperSessionStatus === "paused" ||
    input.paperSessionStatus === "pending_approval" ||
    input.paperSessionStatus === "risk_halted" ||
    input.paperSessionStatus === "failed" ||
    input.paperSessionStatus === "error";

  const liveBlocked =
    Boolean(input.emergencyActive) ||
    input.liveAllowed === false ||
    Boolean(input.liveBlockReason);

  const approvalStatus = input.canStartLive
    ? OPERATOR_STATUS.completed
    : input.liveBlockReason
      ? OPERATOR_STATUS.blocked
      : OPERATOR_STATUS.waiting;

  return [
    {
      id: "research",
      label: OPERATOR_PIPELINE.research,
      status: input.researchLabel,
      tone: researchTone(input.researchLabel),
      href: input.researchHref,
      testId: "dash-research-summary",
    },
    {
      id: "strategy",
      label: OPERATOR_PIPELINE.strategy,
      status: strategyCompleted
        ? OPERATOR_STATUS.completed
        : input.completedRecent?.status === "failed"
          ? OPERATOR_STATUS.needsReview
          : OPERATOR_STATUS.waiting,
      tone: strategyCompleted
        ? "completed"
        : input.completedRecent?.status === "failed"
          ? "needs_review"
          : "waiting",
      href: input.completedRecent
        ? `/results?jobId=${encodeURIComponent(input.completedRecent.id)}`
        : "/results",
    },
    {
      id: "backtest",
      label: OPERATOR_PIPELINE.backtest,
      status: OPERATOR_STATUS.waiting,
      tone: "waiting",
      href: "/backtest",
      testId: "dash-open-backtest",
    },
    {
      id: "paper",
      label: OPERATOR_PIPELINE.paper,
      status: paperLabel
        ? paperLabel
        : input.paperName
          ? "세션 있음"
          : OPERATOR_STATUS.waiting,
      tone: paperActive
        ? "in_progress"
        : paperNeedsReview
          ? "needs_review"
          : "waiting",
      href: "/paper-trading",
    },
    {
      id: "approval",
      label: OPERATOR_PIPELINE.approval,
      status: approvalStatus,
      tone: input.canStartLive
        ? "completed"
        : liveBlocked
          ? "blocked"
          : "waiting",
      href: "/live-trading",
    },
    {
      id: "live",
      label: OPERATOR_PIPELINE.live,
      status:
        input.liveAllowed === true
          ? OPERATOR_STATUS.liveReady
          : OPERATOR_STATUS.blocked,
      tone: input.liveAllowed === true ? "waiting" : "blocked",
      href: "/live-trading",
    },
  ];
}
