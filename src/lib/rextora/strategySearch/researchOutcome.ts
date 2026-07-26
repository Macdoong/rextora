/**
 * Canonical user-facing Research outcome from persisted status + completionReason.
 * Does not mutate raw job status.
 */

export type ResearchOutcomeId =
  | "normal_completed"
  | "user_stopped"
  | "paused"
  | "partial_results"
  | "failed"
  | "cancelled";

export interface ResearchOutcomeInput {
  status: string;
  completionReason?: string | null;
  terminationReason?: string | null;
  preservedResultCount?: number | null;
  qualifiedCount?: number | null;
  outcomePresentation?: string | null;
}

export interface ResearchOutcomeView {
  id: ResearchOutcomeId;
  titleKo: string;
  detailKo: string;
  usable: boolean;
  /** Never use “탐색 완료” for paused/cancel/partial. */
  isPresentedAsCompleted: boolean;
}

function preservedCount(input: ResearchOutcomeInput): number {
  const n = input.preservedResultCount ?? input.qualifiedCount ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * Derive beginner-facing outcome. Raw status/completionReason stay unchanged.
 */
export function resolveResearchOutcome(
  input: ResearchOutcomeInput,
): ResearchOutcomeView {
  const status = input.status;
  const reason = input.completionReason ?? null;
  const term = input.terminationReason ?? null;
  const preserved = preservedCount(input);

  // 1. Deadline completion is normal completion.
  if (reason === "DEADLINE_REACHED" || term === "DEADLINE_REACHED") {
    return {
      id: "normal_completed",
      titleKo: "AI 연구 완료",
      detailKo: "설정한 탐색 시간이 끝나 결과가 확정됐습니다.",
      usable: preserved > 0,
      isPresentedAsCompleted: true,
    };
  }

  // 2. Explicit user stop with preserved results.
  if (reason === "USER_STOPPED" || reason === "USER_CANCELLED") {
    return {
      id: "user_stopped",
      titleKo: "사용자 중지",
      detailKo:
        preserved > 0
          ? "사용자 중지 · 결과 보존"
          : "사용자가 탐색을 중지했습니다.",
      usable: preserved > 0,
      isPresentedAsCompleted: false,
    };
  }

  // 3. Cancel path with preserved trials (takes precedence over PAUSED plan label).
  if (
    status === "cancel_requested" ||
    status === "cancelling" ||
    status === "cancelled"
  ) {
    if (status === "cancel_requested") {
      return {
        id: "user_stopped",
        titleKo: "중지 요청 중",
        detailKo: "중지 요청이 접수되었습니다.",
        usable: preserved > 0,
        isPresentedAsCompleted: false,
      };
    }
    if (status === "cancelling") {
      return {
        id: "user_stopped",
        titleKo: "결과 정리 중",
        detailKo: "중지 후 결과를 정리하는 중입니다.",
        usable: preserved > 0,
        isPresentedAsCompleted: false,
      };
    }
    if (preserved > 0) {
      return {
        id: "user_stopped",
        titleKo: "사용자 중지",
        detailKo: "결과가 안전하게 보존되었습니다.",
        usable: true,
        isPresentedAsCompleted: false,
      };
    }
    return {
      id: "cancelled",
      titleKo: "사용자 중지",
      detailKo: "탐색이 중지됐으며 사용할 합격 결과가 없습니다.",
      usable: false,
      isPresentedAsCompleted: false,
    };
  }

  // 4. Paused campaign.
  if (
    status === "paused" ||
    status === "pause_requested" ||
    reason === "PAUSED"
  ) {
    return {
      id: "paused",
      titleKo: "일시정지",
      detailKo: "탐색이 일시정지됐습니다. 보존된 결과는 계속 사용할 수 있습니다.",
      usable: preserved > 0,
      isPresentedAsCompleted: false,
    };
  }

  // 5. Failed with/without preserved results.
  if (status === "failed") {
    if (preserved > 0 || input.outcomePresentation === "partial_completed") {
      return {
        id: "partial_results",
        titleKo: "부분 결과",
        detailKo: "오류 발생 전 결과 보존",
        usable: true,
        isPresentedAsCompleted: false,
      };
    }
    return {
      id: "failed",
      titleKo: "실패",
      detailKo: "탐색이 실패했으며 사용할 합격 결과가 없습니다.",
      usable: false,
      isPresentedAsCompleted: false,
    };
  }

  // 6. Completed without special reason.
  if (status === "completed") {
    return {
      id: "normal_completed",
      titleKo: "AI 연구 완료",
      detailKo: "탐색이 정상적으로 완료됐습니다.",
      usable: preserved > 0,
      isPresentedAsCompleted: true,
    };
  }

  return {
    id: "partial_results",
    titleKo: "부분 결과",
    detailKo: "현재까지 생성된 결과입니다.",
    usable: preserved > 0,
    isPresentedAsCompleted: false,
  };
}
