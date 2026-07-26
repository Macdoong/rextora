import { describe, expect, it } from "vitest";
import {
  completionReasonLabelKo,
  historyStatusLabelKo,
  isEarlyFinishReason,
  pipelineStageLabelKo,
  pipelineStageUiStatus,
  researchStatusLabelKo,
} from "../components/rextora/strategySearch/formatters";

describe("strategy search progress / status UX labels", () => {
  it("treats qualified-target completion as early finish", () => {
    expect(isEarlyFinishReason("QUALIFIED_TARGET_REACHED")).toBe(true);
    expect(researchStatusLabelKo("completed", {
      completionReason: "QUALIFIED_TARGET_REACHED",
    })).toBe("조기 완료");
    expect(completionReasonLabelKo("QUALIFIED_TARGET_REACHED")).toBe(
      "합격 목표 달성",
    );
    expect(historyStatusLabelKo("completed", {
      completionReason: "QUALIFIED_TARGET_REACHED",
    })).toBe("조기 종료");
  });

  it("keeps full completion distinct from early finish", () => {
    expect(researchStatusLabelKo("completed", {
      completionReason: "MAX_CANDIDATE_BUDGET",
    })).toBe("완료");
    expect(historyStatusLabelKo("completed", {
      completionReason: "SEARCH_SPACE_EXHAUSTED",
    })).toBe("정상 완료");
  });

  it("history statuses stay within operator vocabulary", () => {
    expect(historyStatusLabelKo("running")).toBe("연구 중");
    expect(historyStatusLabelKo("paused")).toBe("일시정지");
    expect(historyStatusLabelKo("cancel_requested")).toBe("중지 요청 중");
    expect(historyStatusLabelKo("cancelling")).toBe("결과 정리 중");
    expect(historyStatusLabelKo("cancelled")).toBe("사용자 중지");
    expect(historyStatusLabelKo("cancelled")).toBe("사용자 중지");
    expect(historyStatusLabelKo("failed")).toBe("실패");
    expect(historyStatusLabelKo("completed")).toBe("정상 완료");
  });

  it("marks remaining pipeline stages as skipped when goal already reached", () => {
    const ui = pipelineStageUiStatus({
      stageStatus: "pending",
      jobStatus: "completed",
      completionReason: "QUALIFIED_TARGET_REACHED",
      stageIndex: 3,
      activeIndex: 0,
    });
    expect(ui).toBe("skipped");
    expect(pipelineStageLabelKo(ui, { earlyGoal: true })).toBe(
      "건너뜀 (목표 이미 달성)",
    );
  });

  it("keeps active stage running while job is researching", () => {
    expect(
      pipelineStageUiStatus({
        stageStatus: "active",
        jobStatus: "running",
        stageIndex: 1,
        activeIndex: 1,
      }),
    ).toBe("running");
  });
});
