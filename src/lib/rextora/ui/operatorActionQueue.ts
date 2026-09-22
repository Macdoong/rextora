/**
 * Read-model aggregator for operator tasks.
 * Converts existing Research / Paper / Risk / Live / Approval states into
 * presentation items. Does not mutate state or invent unsupported actions.
 */

import { paperOperatorStatusLabel } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import type { PaperOperatorUiStatus } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import {
  buildSearchTerminalNotification,
  toOperatorTerminalResearch,
  type SearchTerminalJobView,
} from "@/src/lib/rextora/strategySearch/searchTerminalNotification";
import {
  OPERATOR_ACTION_GROUP,
  OPERATOR_EMPTY,
} from "./operatorTerminology";

export type OperatorActionSeverity = "critical" | "action" | "warning" | "info";

export type OperatorActionSource =
  | "research"
  | "backtest"
  | "paper"
  | "risk"
  | "live_gate"
  | "approval"
  | "agent";

export type OperatorActionItem = {
  id: string;
  severity: OperatorActionSeverity;
  title: string;
  description: string;
  targetRoute?: string;
  actionLabel?: string;
  source: OperatorActionSource;
};

export type OperatorActionGroupId = keyof typeof OPERATOR_ACTION_GROUP;

export type OperatorActionGroup = {
  id: OperatorActionGroupId;
  label: string;
  items: OperatorActionItem[];
};

const SEVERITY_RANK: Record<OperatorActionSeverity, number> = {
  critical: 0,
  action: 1,
  warning: 2,
  info: 3,
};

const PAPER_ACTION_STATUSES = new Set<string>([
  "pending_approval",
  "risk_halted",
  "failed",
  "paused",
  "error",
]);

export type OperatorActionQueueInput = {
  emergencyActive?: boolean;
  liveAllowed?: boolean;
  canStartLive?: boolean;
  liveBlockReason?: string | null;
  attentionResearch?: ReadonlyArray<{
    id: string;
    status: string;
    searchName?: string | null;
  }>;
  completedRecent?: {
    id: string;
    status: string;
    searchName?: string | null;
  } | null;
  /** Completed/failed research jobs to surface (not latest-only). */
  terminalResearch?: readonly SearchTerminalJobView[];
  paperSessionStatus?: string | null;
  pendingApproval?: boolean;
  agentPendingSummary?: string | null;
};

function researchName(job: { id: string; searchName?: string | null }): string {
  return job.searchName?.trim() || job.id;
}

function isPaperUiStatus(value: string): value is PaperOperatorUiStatus {
  return [
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
  ].includes(value);
}

export function buildOperatorActionQueue(
  input: OperatorActionQueueInput,
): OperatorActionItem[] {
  const items: OperatorActionItem[] = [];

  if (input.emergencyActive) {
    items.push({
      id: "risk-emergency",
      severity: "critical",
      title: "긴급 정지가 활성입니다",
      description: "수동 해제 전까지 신규 실전 진입이 차단됩니다.",
      targetRoute: "/risk",
      source: "risk",
    });
  }

  if (input.paperSessionStatus && PAPER_ACTION_STATUSES.has(input.paperSessionStatus)) {
    const label = isPaperUiStatus(input.paperSessionStatus)
      ? paperOperatorStatusLabel(input.paperSessionStatus)
      : input.paperSessionStatus;
    items.push({
      id: `paper-${input.paperSessionStatus}`,
      severity:
        input.paperSessionStatus === "risk_halted" ||
        input.paperSessionStatus === "failed" ||
        input.paperSessionStatus === "error"
          ? "critical"
          : "action",
      title: `모의매매 ${label}`,
      description: "모의매매 화면에서 세션 상태를 확인하세요.",
      targetRoute: "/paper-trading",
      source: "paper",
    });
  }

  if (input.pendingApproval) {
    items.push({
      id: "approval-pending",
      severity: "action",
      title: "승인 대기 항목이 있습니다",
      description: "실전 진입 화면에서 승인 상태를 확인하세요.",
      targetRoute: "/live-trading",
      source: "approval",
    });
  } else if (
    input.agentPendingSummary &&
    input.agentPendingSummary.trim()
  ) {
    items.push({
      id: "agent-approval-pending",
      severity: "info",
      title: "AI 제안 승인 대기",
      description: input.agentPendingSummary.trim(),
      source: "agent",
    });
  }

  for (const job of input.attentionResearch ?? []) {
    if (job.status === "paused") {
      items.push({
        id: `research-paused-${job.id}`,
        severity: "action",
        title: `일시정지된 탐색: ${researchName(job)}`,
        description: "재개 또는 중지는 전략 탐색 화면에서 결정합니다.",
        targetRoute: `/strategy-search?jobId=${encodeURIComponent(job.id)}`,
        source: "research",
      });
      continue;
    }
    if (job.status === "interrupted") {
      items.push({
        id: `research-interrupted-${job.id}`,
        severity: "action",
        title: `중단된 탐색: ${researchName(job)}`,
        description: "복구 여부는 전략 탐색 화면에서 확인합니다.",
        targetRoute: `/strategy-search?jobId=${encodeURIComponent(job.id)}`,
        source: "research",
      });
      continue;
    }
    items.push({
      id: `research-stopping-${job.id}`,
      severity: "warning",
      title: `중지 중인 탐색: ${researchName(job)}`,
      description: "연구를 멈추는 중입니다. 일반 실행 상태가 아닙니다.",
      targetRoute: `/strategy-search?jobId=${encodeURIComponent(job.id)}`,
      source: "research",
    });
  }

  const terminalJobs =
    input.terminalResearch && input.terminalResearch.length > 0
      ? toOperatorTerminalResearch(input.terminalResearch)
      : input.completedRecent
        ? toOperatorTerminalResearch([input.completedRecent])
        : [];

  for (const job of terminalJobs) {
    const notice = buildSearchTerminalNotification(job);
    if (!notice) continue;
    items.push({
      id: notice.dedupeKey,
      severity: notice.status === "failed" ? "warning" : "info",
      title: notice.title,
      description: notice.description,
      targetRoute: notice.targetRoute,
      actionLabel: notice.actionLabel,
      source: "research",
    });
  }

  if (!input.canStartLive && input.liveBlockReason) {
    const approvalRelated =
      input.liveBlockReason.includes("승인") ||
      input.liveBlockReason.toLowerCase().includes("approval");
    items.push({
      id: "live-block",
      severity: approvalRelated ? "action" : "warning",
      title: `실전 차단: ${input.liveBlockReason}`,
      description: "실전 게이트·승인·위험 조건을 충족해야 합니다.",
      targetRoute: "/live-trading",
      source: approvalRelated ? "approval" : "live_gate",
    });
  }

  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

export function groupOperatorActions(
  items: readonly OperatorActionItem[],
): OperatorActionGroup[] {
  const buckets: Record<OperatorActionGroupId, OperatorActionItem[]> = {
    immediate: [],
    approval: [],
    validation: [],
    reference: [],
  };

  for (const item of items) {
    const paperApproval =
      item.source === "paper" && item.id.includes("pending_approval");
    if (item.severity === "critical") {
      buckets.immediate.push(item);
    } else if (item.source === "approval" || paperApproval) {
      buckets.approval.push(item);
    } else if (item.severity === "action") {
      buckets.immediate.push(item);
    } else if (item.severity === "warning") {
      buckets.validation.push(item);
    } else {
      buckets.reference.push(item);
    }
  }

  return (Object.keys(OPERATOR_ACTION_GROUP) as OperatorActionGroupId[])
    .map((id) => ({
      id,
      label: OPERATOR_ACTION_GROUP[id],
      items: buckets[id],
    }))
    .filter((group) => group.items.length > 0);
}

export function operatorActionQueueEmptyCopy(): {
  message: string;
  hint: string;
} {
  return {
    message: OPERATOR_EMPTY.actions,
    hint: OPERATOR_EMPTY.actionsHint,
  };
}
