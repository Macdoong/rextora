/**
 * P2-C: queued Research-list/API presentation must not mean executing.
 * Isolated fixtures — no production strategy-search store.
 */
import { describe, expect, it } from "vitest";
import {
  historyStatusLabelKo,
  researchStatusLabelKo,
} from "../components/rextora/strategySearch/formatters";
import type { StrategySearchJobStatus } from "../components/rextora/strategySearch/types";
import { presentStrategySearchOutcome } from "../src/lib/rextora/strategySearch/jobApiService";
import {
  buildDashboardPrimaryAction,
  copyImpliesExecuting,
  dashboardResearchBadgeLabel,
  dashboardResearchLifecycleLabel,
  selectDashboardResearch,
} from "../components/rextora/dashboard/dashboardResearchSelection";

const OTHER_STATES: StrategySearchJobStatus[] = [
  "running",
  "pause_requested",
  "paused",
  "interrupted",
  "completed",
  "failed",
  "cancelled",
  "cancel_requested",
  "cancelling",
];

const HISTORY_LABEL: Record<Exclude<StrategySearchJobStatus, "queued">, string> =
  {
    running: "연구 중",
    pause_requested: "연구 중",
    paused: "일시정지",
    interrupted: "실행 중단",
    completed: "정상 완료",
    failed: "실패",
    cancelled: "사용자 중지",
    cancel_requested: "중지 요청 중",
    cancelling: "결과 정리 중",
  };

const OUTCOME: Record<
  Exclude<StrategySearchJobStatus, "queued">,
  ReturnType<typeof presentStrategySearchOutcome>
> = {
  running: "running",
  pause_requested: "running",
  paused: "user_stopped",
  interrupted: "interrupted",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  cancel_requested: "cancelled",
  cancelling: null,
};

describe("Research queued presentation semantics (P2-C)", () => {
  it("1. queued is not outcomePresentation running", () => {
    expect(presentStrategySearchOutcome({ status: "queued" })).not.toBe(
      "running",
    );
  });

  it("2. queued history label is not 연구 중", () => {
    expect(historyStatusLabelKo("queued")).not.toBe("연구 중");
  });

  it("3. queued displays existing pending/ready Korean terminology", () => {
    expect(presentStrategySearchOutcome({ status: "queued" })).toBe("queued");
    expect(historyStatusLabelKo("queued")).toBe("준비");
    expect(researchStatusLabelKo("queued")).toBe("준비");
  });

  it("4. running still displays running semantics", () => {
    expect(presentStrategySearchOutcome({ status: "running" })).toBe("running");
    expect(historyStatusLabelKo("running")).toBe("연구 중");
    expect(researchStatusLabelKo("running")).toBe("연구 중");
  });

  it("5. pause_requested unchanged", () => {
    expect(presentStrategySearchOutcome({ status: "pause_requested" })).toBe(
      "running",
    );
    expect(historyStatusLabelKo("pause_requested")).toBe("연구 중");
    expect(researchStatusLabelKo("pause_requested")).toBe("연구 중");
  });

  it("6. paused unchanged", () => {
    expect(presentStrategySearchOutcome({ status: "paused" })).toBe(
      "user_stopped",
    );
    expect(historyStatusLabelKo("paused")).toBe("일시정지");
  });

  it("7. interrupted unchanged", () => {
    expect(presentStrategySearchOutcome({ status: "interrupted" })).toBe(
      "interrupted",
    );
    expect(historyStatusLabelKo("interrupted")).toBe("실행 중단");
  });

  it("8. terminal statuses unchanged", () => {
    expect(presentStrategySearchOutcome({ status: "completed" })).toBe(
      "completed",
    );
    expect(presentStrategySearchOutcome({ status: "cancelled" })).toBe(
      "cancelled",
    );
    expect(presentStrategySearchOutcome({ status: "failed" })).toBe("failed");
    expect(
      presentStrategySearchOutcome({
        status: "failed",
        preservedCandidateCount: 2,
      }),
    ).toBe("partial_completed");
    expect(historyStatusLabelKo("completed")).toBe("정상 완료");
    expect(historyStatusLabelKo("cancelled")).toBe("사용자 중지");
    expect(historyStatusLabelKo("failed")).toBe("실패");
  });

  it("9. Research detail queued 준비 remains consistent", () => {
    expect(researchStatusLabelKo("queued")).toBe("준비");
    expect(researchStatusLabelKo("queued", { executionActive: false })).toBe(
      "준비",
    );
    expect(historyStatusLabelKo("queued")).toBe(
      researchStatusLabelKo("queued"),
    );
  });

  it("10. Dashboard P2-B queued/pending behavior unchanged", () => {
    const selected = selectDashboardResearch([
      { id: "q", status: "queued" },
      { id: "r", status: "running" },
      { id: "p", status: "paused" },
      { id: "i", status: "interrupted" },
    ]);
    expect(selected.executingResearch?.id).toBe("r");
    expect(selected.pendingResearch?.id).toBe("q");
    expect(selected.attentionResearch.map((j) => j.id)).toEqual(["p", "i"]);
    const queuedOnly = selectDashboardResearch([{ id: "q", status: "queued" }]);
    expect(queuedOnly.executingResearch).toBeUndefined();
    expect(queuedOnly.pendingResearch?.id).toBe("q");
    expect(dashboardResearchLifecycleLabel(queuedOnly)).toBe("대기");
    expect(dashboardResearchBadgeLabel(queuedOnly.pendingResearch!)).toBe(
      "준비",
    );
    expect(copyImpliesExecuting(buildDashboardPrimaryAction(queuedOnly).label)).toBe(
      false,
    );
  });

  it("non-queued history and outcome mappings stay intact", () => {
    for (const status of OTHER_STATES) {
      expect(historyStatusLabelKo(status)).toBe(HISTORY_LABEL[status]);
      expect(presentStrategySearchOutcome({ status })).toBe(OUTCOME[status]);
    }
  });
});
