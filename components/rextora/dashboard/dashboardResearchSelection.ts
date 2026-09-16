/**
 * Dashboard-only Research selection. Does not change API list semantics
 * or canonical lifecycle transitions.
 */
import type { StrategySearchJobStatus } from "@/components/rextora/strategySearch/types";
import { researchStatusLabelKo } from "@/components/rextora/strategySearch/formatters";

export type DashboardPrimaryAction = {
  href: string;
  label: string;
  description: string;
};

export type DashboardReviewItem = {
  what: string;
  why: string;
  href: string;
  actionLabel: string;
};

/** Fields the Dashboard selector reads from StrategySearchJobSummary. */
export type DashboardResearchCandidate = {
  id: string;
  status: string;
  executionActive?: boolean;
  searchName?: string | null;
};

export type DashboardResearchSelection<
  T extends DashboardResearchCandidate = DashboardResearchCandidate,
> = {
  executingResearch: T | undefined;
  pendingResearch: T | undefined;
  /** All attention jobs in API list order. */
  attentionResearch: T[];
  allAttentionResearch: T[];
  /** Priority-sorted, capped subset for Dashboard rendering. */
  visibleAttentionResearch: T[];
  attentionTotal: number;
  attentionHiddenCount: number;
  /** Card/context job: executing first, else pending. Never attention-only. */
  currentResearch: T | undefined;
};

/** Dashboard list window. Uses the existing API max; does not change the API default. */
export const DASHBOARD_RESEARCH_LIST_LIMIT = 100;

/**
 * Compact Dashboard/Research preview lists already show 3 items
 * (Results recs/top10, SearchStatusCard live top10, Agent blockers).
 * Attention cards are similarly multi-line, so 3 is the density match.
 * DashboardPanels recent trades use 5, but those rows are single-line.
 */
export const DASHBOARD_ATTENTION_VISIBLE_CAP = 3;

const TERMINAL = new Set(["completed", "cancelled", "failed"]);
const STOPPING = new Set(["cancel_requested", "cancelling"]);
const INACTIVE_ATTENTION = new Set(["paused", "interrupted"]);

function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}

function isWorkerOwned(job: DashboardResearchCandidate): boolean {
  return job.executionActive === true;
}

/**
 * EXECUTING_NOW for Dashboard copy. Worker-owned queued status is treated as
 * a legitimate summary lag. Stopping / paused / interrupted are never executing.
 */
export function isDashboardExecutingResearch(
  job: DashboardResearchCandidate,
): boolean {
  if (isTerminalStatus(job.status)) return false;
  if (job.status === "running" || job.status === "pause_requested") return true;
  if (STOPPING.has(job.status) || INACTIVE_ATTENTION.has(job.status)) {
    return false;
  }
  return isWorkerOwned(job);
}

export function isDashboardPendingResearch(
  job: DashboardResearchCandidate,
): boolean {
  return job.status === "queued" && !isDashboardExecutingResearch(job);
}

export function isDashboardAttentionResearch(
  job: DashboardResearchCandidate,
): boolean {
  if (isDashboardExecutingResearch(job) || isDashboardPendingResearch(job)) {
    return false;
  }
  return INACTIVE_ATTENTION.has(job.status) || STOPPING.has(job.status);
}

function firstByListOrder<T extends DashboardResearchCandidate>(
  jobs: readonly T[],
  pred: (job: T) => boolean,
): T | undefined {
  return jobs.find(pred);
}

function attentionClassRank(status: string): number {
  if (status === "cancel_requested" || status === "cancelling") return 0;
  if (status === "interrupted") return 1;
  if (status === "paused") return 2;
  return 3;
}

/** Stable: class first, then original API list order. */
export function prioritizeDashboardAttention<
  T extends DashboardResearchCandidate,
>(jobs: readonly T[]): T[] {
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => {
      const rank = attentionClassRank(a.job.status) - attentionClassRank(b.job.status);
      if (rank !== 0) return rank;
      return a.index - b.index;
    })
    .map((row) => row.job);
}

export function dashboardAttentionTitle(attentionTotal: number): string {
  if (attentionTotal > 0) return `확인이 필요한 항목 ${attentionTotal}건`;
  return "확인이 필요한 항목";
}

export const RESEARCH_RECOVERY_HREF = "/strategy-search#ss-recovery";

export function dashboardAttentionHiddenCopy(hiddenCount: number): string | null {
  if (hiddenCount <= 0) return null;
  return `외 ${hiddenCount}건`;
}

export function dashboardRecoveryViewAllLabel(): string {
  return "전체 복구 항목 보기";
}

export function selectDashboardResearch<
  T extends DashboardResearchCandidate,
>(jobs: readonly T[]): DashboardResearchSelection<T> {
  const running = firstByListOrder(
    jobs,
    (j) => j.status === "running" && isDashboardExecutingResearch(j),
  );
  const pauseRequested = firstByListOrder(
    jobs,
    (j) => j.status === "pause_requested" && isDashboardExecutingResearch(j),
  );
  const workerLag = firstByListOrder(jobs, (j) => {
    if (j.status === "running" || j.status === "pause_requested") return false;
    return isDashboardExecutingResearch(j);
  });
  const executingResearch = running ?? pauseRequested ?? workerLag;
  const pendingResearch = firstByListOrder(jobs, isDashboardPendingResearch);
  const attentionResearch = jobs.filter(isDashboardAttentionResearch);
  const ranked = prioritizeDashboardAttention(attentionResearch);
  const visibleAttentionResearch = ranked.slice(
    0,
    DASHBOARD_ATTENTION_VISIBLE_CAP,
  );
  return {
    executingResearch,
    pendingResearch,
    attentionResearch,
    allAttentionResearch: attentionResearch,
    visibleAttentionResearch,
    attentionTotal: attentionResearch.length,
    attentionHiddenCount: Math.max(
      0,
      attentionResearch.length - DASHBOARD_ATTENTION_VISIBLE_CAP,
    ),
    currentResearch: executingResearch ?? pendingResearch,
  };
}

export function researchJobHref(jobId: string): string {
  return `/strategy-search?jobId=${encodeURIComponent(jobId)}`;
}

export function dashboardResearchDisplayName(
  job: DashboardResearchCandidate,
): string {
  return job.searchName || "탐색";
}

export function dashboardResearchBadgeLabel(
  job: DashboardResearchCandidate,
): string {
  return researchStatusLabelKo(job.status as StrategySearchJobStatus, {
    executionActive: job.executionActive,
  });
}

export function dashboardResearchActivityTitle(
  job: DashboardResearchCandidate | undefined,
): string {
  if (!job) return "현재 연구";
  if (isDashboardPendingResearch(job)) return "대기 중인 연구";
  if (job.status === "pause_requested") return "일시정지 요청 중";
  return "현재 연구";
}

export function dashboardResearchLifecycleLabel(
  selection: DashboardResearchSelection,
): string {
  const executing = selection.executingResearch;
  if (executing) {
    if (executing.status === "pause_requested") return "일시정지 요청";
    return "진행 중";
  }
  if (selection.pendingResearch) return "대기";
  const attention = selection.visibleAttentionResearch[0];
  if (attention) {
    if (attention.status === "paused") return "일시정지";
    if (attention.status === "interrupted") return "실행 중단";
    if (attention.status === "cancel_requested") return "중지 요청 중";
    if (attention.status === "cancelling") return "결과 정리 중";
  }
  return "대기";
}

export function dashboardResearchLifecycleHref(
  selection: DashboardResearchSelection,
): string {
  const job =
    selection.currentResearch ?? selection.visibleAttentionResearch[0] ?? null;
  return job ? researchJobHref(job.id) : "/strategy-search";
}

export function dashboardResearchBriefingSituation(
  selection: DashboardResearchSelection,
): string {
  const executing = selection.executingResearch;
  if (executing) {
    const name = dashboardResearchDisplayName(executing);
    if (executing.status === "pause_requested") {
      return `연구 일시정지 요청 중 · ${name}`;
    }
    return `연구 진행 중 · ${name}`;
  }
  if (selection.pendingResearch) {
    return `연구 대기 중 · ${dashboardResearchDisplayName(selection.pendingResearch)}`;
  }
  const attention = selection.visibleAttentionResearch[0];
  if (attention) {
    return `확인 필요 · ${dashboardResearchDisplayName(attention)}`;
  }
  return "대기 중 · 새 연구 또는 결과 검토";
}

export function shouldFetchDashboardGenerationHint(
  selection: DashboardResearchSelection,
): boolean {
  return selection.executingResearch != null;
}

export function buildDashboardPrimaryAction(
  selection: DashboardResearchSelection,
  completedRecent?: { id: string; status: string } | undefined,
): DashboardPrimaryAction {
  const executing = selection.executingResearch;
  if (executing) {
    if (executing.status === "pause_requested") {
      return {
        href: researchJobHref(executing.id),
        label: "일시정지 요청 중 탐색 보기",
        description: "일시정지가 요청된 연구 세션으로 이동합니다.",
      };
    }
    return {
      href: researchJobHref(executing.id),
      label: "진행 중인 탐색 보기",
      description: "현재 실행 중인 연구 세션으로 이동합니다.",
    };
  }
  if (selection.pendingResearch) {
    return {
      href: researchJobHref(selection.pendingResearch.id),
      label: "대기 중인 탐색 보기",
      description: "준비된 연구 세션을 확인합니다.",
    };
  }
  const attention = selection.visibleAttentionResearch[0];
  if (attention) {
    if (attention.status === "paused") {
      return {
        href: researchJobHref(attention.id),
        label: "일시정지된 탐색 확인",
        description: "일시정지된 연구를 확인합니다. 재개는 탐색 화면에서 합니다.",
      };
    }
    if (attention.status === "interrupted") {
      return {
        href: researchJobHref(attention.id),
        label: "중단된 탐색 확인",
        description: "중단된 연구를 확인합니다. 복구는 탐색 화면에서 합니다.",
      };
    }
    return {
      href: researchJobHref(attention.id),
      label: "중지 중인 탐색 확인",
      description: "중지가 처리 중인 연구 세션을 확인합니다.",
    };
  }
  if (completedRecent?.status === "completed") {
    return {
      href: `/results?jobId=${encodeURIComponent(completedRecent.id)}`,
      label: "완료된 결과 검토",
      description: "최근 완료된 탐색 결과를 검토합니다.",
    };
  }
  return {
    href: "/strategy-search",
    label: "새 탐색 시작",
    description: "새로운 전략 탐색을 시작합니다.",
  };
}

export function buildDashboardAttentionItems(
  attentionResearch: readonly DashboardResearchCandidate[],
): DashboardReviewItem[] {
  return attentionResearch.map((job) => {
    const name = dashboardResearchDisplayName(job);
    const href = researchJobHref(job.id);
    if (job.status === "paused") {
      return {
        what: `일시정지된 탐색: ${name}`,
        why: "실행 중이 아닙니다. 재개 또는 중지는 탐색 화면에서 결정합니다.",
        href,
        actionLabel: "탐색 확인",
      };
    }
    if (job.status === "interrupted") {
      return {
        what: `중단된 탐색: ${name}`,
        why: "복구·재개 검토가 필요합니다. 실행 중이 아닙니다.",
        href,
        actionLabel: "탐색 확인",
      };
    }
    return {
      what: `중지 중인 탐색: ${name}`,
      why: "연구를 멈추는 중입니다. 일반 실행 상태가 아닙니다.",
      href,
      actionLabel: "탐색 확인",
    };
  });
}

export function copyImpliesExecuting(text: string): boolean {
  return (
    text.includes("진행 중") ||
    text.includes("실행 중") ||
    text.includes("현재 실행 중") ||
    text.includes("진행 중인 탐색")
  );
}
