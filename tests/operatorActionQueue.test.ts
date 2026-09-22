import { describe, expect, it } from "vitest";
import {
  buildOperatorActionQueue,
  groupOperatorActions,
} from "../src/lib/rextora/ui/operatorActionQueue";
import { buildOperatorPipeline } from "../src/lib/rextora/ui/operatorPipeline";
import { OPERATOR_PIPELINE, OPERATOR_STATUS } from "../src/lib/rextora/ui/operatorTerminology";

describe("operator action queue", () => {
  it("5-6. groups priority and does not fabricate actions", () => {
    const empty = buildOperatorActionQueue({});
    expect(empty).toEqual([]);

    const items = buildOperatorActionQueue({
      emergencyActive: true,
      liveBlockReason: "승인 필요",
      canStartLive: false,
      attentionResearch: [{ id: "job-1", status: "paused", searchName: "BTC 탐색" }],
      completedRecent: { id: "job-2", status: "completed", searchName: "완료 탐색" },
      paperSessionStatus: "risk_halted",
    });
    expect(items.some((item) => item.id === "invented")).toBe(false);
    expect(items[0]?.severity).toBe("critical");
    const groups = groupOperatorActions(items);
    expect(groups[0]?.id).toBe("immediate");
    expect(groups.map((g) => g.label)).toEqual(
      groups.map((g) =>
        g.id === "immediate"
          ? "즉시 확인"
          : g.id === "approval"
            ? "승인 필요"
            : g.id === "validation"
              ? "검증 필요"
              : "참고",
      ),
    );
  });

  it("does not invent a backtest action without source", () => {
    const items = buildOperatorActionQueue({
      attentionResearch: [],
      paperSessionStatus: null,
    });
    expect(items.some((item) => item.source === "backtest")).toBe(false);
  });

  it("surfaces multiple terminal research jobs independently", () => {
    const items = buildOperatorActionQueue({
      completedRecent: { id: "latest", status: "completed" },
      terminalResearch: [
        { id: "latest", status: "completed" },
        { id: "older", status: "failed" },
      ],
    });
    const research = items.filter((item) => item.source === "research");
    expect(research).toHaveLength(2);
    expect(research.some((item) => item.targetRoute === "/results?jobId=older")).toBe(
      true,
    );
    expect(research.some((item) => item.targetRoute === "/results?jobId=latest")).toBe(
      true,
    );
  });
});

describe("operator pipeline", () => {
  it("4. Korean labels and no fabricated backtest completion", () => {
    const steps = buildOperatorPipeline({
      researchLabel: "대기",
      researchHref: "/strategy-search",
      completedRecent: undefined,
      paperName: null,
      paperSessionStatus: null,
      liveAllowed: false,
      canStartLive: false,
      liveBlockReason: "실전 기능 비활성",
      emergencyActive: false,
    });
    expect(steps.map((s) => s.label)).toEqual([
      OPERATOR_PIPELINE.research,
      OPERATOR_PIPELINE.strategy,
      OPERATOR_PIPELINE.backtest,
      OPERATOR_PIPELINE.paper,
      OPERATOR_PIPELINE.approval,
      OPERATOR_PIPELINE.live,
    ]);
    expect(steps.find((s) => s.id === "backtest")?.status).toBe(OPERATOR_STATUS.waiting);
    expect(steps.find((s) => s.id === "backtest")?.tone).toBe("waiting");
    expect(steps.find((s) => s.id === "live")?.status).toBe(OPERATOR_STATUS.blocked);
    expect(steps.find((s) => s.id === "strategy")?.status).toBe(OPERATOR_STATUS.waiting);
  });

  it("marks strategy completed only from completed research", () => {
    const steps = buildOperatorPipeline({
      researchLabel: "대기",
      researchHref: "/strategy-search",
      completedRecent: { id: "done", status: "completed" },
      paperName: null,
      paperSessionStatus: null,
      liveAllowed: false,
    });
    expect(steps.find((s) => s.id === "strategy")?.status).toBe(OPERATOR_STATUS.completed);
  });
});
