import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSearchCancellationPending,
  searchCancellationPendingCopy,
  searchCancellationPhaseCopy,
} from "../components/rextora/strategySearch/formatters";
import { visibleJobLifecycleActions } from "../components/rextora/strategySearch/jobActionVisibility";

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "components", "rextora", "strategySearch");

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search cancellation UX and safe latency", () => {
  it("renders canonical transitional copy without faking cancelled", () => {
    expect(searchCancellationPhaseCopy("cancel_requested")).toBe("중지 요청 중");
    expect(searchCancellationPhaseCopy("cancelling")).toBe(
      "안전하게 탐색을 종료하고 있습니다.",
    );
    expect(searchCancellationPhaseCopy("cancelled")).toBe(
      "탐색이 중지되었습니다.",
    );
    expect(searchCancellationPhaseCopy("running")).toBeNull();
    const controls = readUi("ExecutionControls.tsx");
    expect(controls).toContain("searchCancellationPendingCopy");
    expect(controls).toContain("isSearchCancellationPending");
    expect(isSearchCancellationPending("cancelled")).toBe(false);
    expect(searchCancellationPendingCopy("cancelled")).toBeNull();
    expect(controls).toContain("disabled={pending || cancelling}");
    expect(controls).not.toContain("결과 정리 중…");
    const status = readUi("SearchStatusCard.tsx");
    expect(status).toContain('job.status === "cancel_requested"');
    expect(status).toContain('job.status === "cancelling"');
    expect(
      visibleJobLifecycleActions({
        status: "cancel_requested",
        hasSelection: true,
      }),
    ).toEqual(["cancel"]);
    expect(
      visibleJobLifecycleActions({
        status: "cancelling",
        hasSelection: true,
      }),
    ).toEqual(["cancel"]);
  });

  it("polls faster only during cancel_requested / cancelling", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("const DETAIL_POLL_MS = 2000");
    expect(workbench).toContain("const DETAIL_POLL_CANCEL_MS = 400");
    expect(workbench).toContain('detail?.status === "cancel_requested"');
    expect(workbench).toContain('detail?.status === "cancelling"');
    expect(workbench).toContain(
      "cancelTransition ? DETAIL_POLL_CANCEL_MS : DETAIL_POLL_MS",
    );
    expect(workbench).toContain("searchCancellationPendingCopy(next.status)");
  });

  it("runner checks cancellation at the loop boundary before the next evaluation", () => {
    const runner = readSrc("src/lib/rextora/strategySearch/jobRunner.ts");
    const loopStart = runner.indexOf("while (true)");
    const cancelCheck = runner.indexOf(
      "isEvaluationCancellationStatus(job.status)",
      loopStart,
    );
    const evaluateCall = runner.indexOf(
      "evaluation = await evaluate({",
      loopStart,
    );
    const postEvaluateCheck = runner.indexOf(
      "await throwIfEvaluationCancelled(shouldCancel)",
      evaluateCall,
    );
    expect(loopStart).toBeGreaterThan(-1);
    expect(cancelCheck).toBeGreaterThan(loopStart);
    expect(evaluateCall).toBeGreaterThan(cancelCheck);
    expect(postEvaluateCheck).toBeGreaterThan(evaluateCall);
    expect(runner).toContain(
      "await new Promise<void>((resolve) => setImmediate(resolve))",
    );
    expect(runner).not.toContain("AbortController");
  });
});
