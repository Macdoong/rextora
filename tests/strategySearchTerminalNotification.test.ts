import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALLOWED_TELEGRAM_EVENTS,
} from "../src/lib/rextora/telegramNotifier";
import { buildOperatorActionQueue } from "../src/lib/rextora/ui/operatorActionQueue";
import {
  buildSearchTerminalNotification,
  observeSearchTerminalJobs,
  resetSearchTerminalNotificationObserverForTests,
  searchTerminalDeepLink,
  searchTerminalDedupeKey,
} from "../src/lib/rextora/strategySearch/searchTerminalNotification";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

beforeEach(() => {
  resetSearchTerminalNotificationObserverForTests();
});

afterEach(() => {
  resetSearchTerminalNotificationObserverForTests();
});

describe("Strategy Search terminal customer notifications", () => {
  it("A: newly completed job emits one notification", () => {
    expect(observeSearchTerminalJobs([])).toEqual([]);
    const emitted = observeSearchTerminalJobs([
      {
        id: "search_done_a",
        status: "completed",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        qualifiedCount: 730,
        statistics: { passed: 1141 },
      },
    ]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.dedupeKey).toBe(
      searchTerminalDedupeKey("search_done_a", "completed"),
    );
    expect(emitted[0]?.title).toBe("전략 탐색이 완료되었습니다.");
  });

  it("B: repeated observation of the same completed job does not duplicate", () => {
    observeSearchTerminalJobs([]);
    const job = { id: "search_done_b", status: "completed" as const };
    expect(observeSearchTerminalJobs([job])).toHaveLength(1);
    expect(observeSearchTerminalJobs([job])).toEqual([]);
    expect(observeSearchTerminalJobs([job])).toEqual([]);
  });

  it("C: newly failed job emits one notification", () => {
    observeSearchTerminalJobs([]);
    const emitted = observeSearchTerminalJobs([
      { id: "search_fail_c", status: "failed", symbols: ["ETHUSDT"], timeframe: "1h" },
    ]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.dedupeKey).toBe(
      searchTerminalDedupeKey("search_fail_c", "failed"),
    );
    expect(emitted[0]?.title).toBe("전략 탐색을 완료하지 못했습니다.");
  });

  it("D: repeated observation of the same failed job does not duplicate", () => {
    observeSearchTerminalJobs([]);
    const job = { id: "search_fail_d", status: "failed" as const };
    expect(observeSearchTerminalJobs([job])).toHaveLength(1);
    expect(observeSearchTerminalJobs([job])).toEqual([]);
  });

  it("E: running/paused/interrupted nonterminal states do not notify", () => {
    observeSearchTerminalJobs([]);
    const emitted = observeSearchTerminalJobs([
      { id: "r", status: "running" },
      { id: "p", status: "paused" },
      { id: "i", status: "interrupted" },
      { id: "q", status: "queued" },
    ]);
    expect(emitted).toEqual([]);
    expect(buildSearchTerminalNotification({ id: "r", status: "running" })).toBeNull();
  });

  it("F: cancel_requested/cancelling do not notify", () => {
    observeSearchTerminalJobs([]);
    expect(
      observeSearchTerminalJobs([
        { id: "cr", status: "cancel_requested" },
        { id: "cg", status: "cancelling" },
        { id: "pr", status: "pause_requested" },
      ]),
    ).toEqual([]);
  });

  it("G: cancelled does not emit a customer notification", () => {
    observeSearchTerminalJobs([]);
    expect(
      observeSearchTerminalJobs([{ id: "cx", status: "cancelled" }]),
    ).toEqual([]);
    expect(buildSearchTerminalNotification({ id: "cx", status: "cancelled" })).toBeNull();
  });

  it("H: completion notification contains customer-safe fields only", () => {
    const notice = buildSearchTerminalNotification({
      id: "search_secret_h",
      status: "completed",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      qualifiedCount: 730,
      statistics: { passed: 1141 },
      failureMessage: "Error: lease expired at jobRunner.ts:12",
    });
    expect(notice).not.toBeNull();
    const text = `${notice!.title}\n${notice!.description}`;
    expect(text).toContain("BTCUSDT · 15분");
    expect(text).toContain("통과 후보 1,141개");
    expect(text).toContain("최종 적격 730개");
    expect(text).not.toContain("search_secret_h");
    expect(text).not.toContain("lease");
    expect(text).not.toContain("jobRunner");
    expect(text).not.toContain("iteration");
    expect(text).not.toContain("generation");
    expect(text).not.toContain("paramsHash");
  });

  it("I: failure notification contains no raw internal error/debug payload", () => {
    const notice = buildSearchTerminalNotification({
      id: "search_fail_i",
      status: "failed",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      failureMessage:
        "Error: ENOENT at C:\\\\Rextora\\\\src\\\\jobRunner.ts:88 stack lease=abc",
    });
    expect(notice).not.toBeNull();
    const text = `${notice!.title}\n${notice!.description}`;
    expect(text).toContain("탐색 결과 화면에서 상태를 확인해 주세요.");
    expect(text).not.toContain("ENOENT");
    expect(text).not.toContain("jobRunner");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("lease");
    expect(text).not.toContain("search_fail_i");
  });

  it("J/K: completed and failed deep links restore the correct job", () => {
    const done = buildSearchTerminalNotification({
      id: "job_done_jk",
      status: "completed",
    });
    const fail = buildSearchTerminalNotification({
      id: "job_fail_jk",
      status: "failed",
    });
    expect(done?.targetRoute).toBe(searchTerminalDeepLink("job_done_jk"));
    expect(fail?.targetRoute).toBe(searchTerminalDeepLink("job_fail_jk"));
    expect(done?.targetRoute).toBe("/results?jobId=job_done_jk");
    expect(fail?.targetRoute).toBe("/results?jobId=job_fail_jk");
    const results = read("components/rextora/results/ResultsWorkbench.tsx");
    expect(results).toContain('searchParams.get("jobId")');
    expect(results).toContain("jobIdFromUrl");
  });

  it("L: application startup does not replay historical terminal jobs", () => {
    const historical = [
      { id: "old_1", status: "completed" as const },
      { id: "old_2", status: "failed" as const },
      { id: "old_3", status: "completed" as const },
    ];
    expect(observeSearchTerminalJobs(historical)).toEqual([]);
    expect(observeSearchTerminalJobs(historical)).toEqual([]);
  });

  it("M: two different completed jobs produce two independent notifications", () => {
    observeSearchTerminalJobs([]);
    const emitted = observeSearchTerminalJobs([
      { id: "job_m1", status: "completed" },
      { id: "job_m2", status: "completed" },
    ]);
    expect(emitted).toHaveLength(2);
    expect(emitted.map((item) => item.dedupeKey).sort()).toEqual([
      searchTerminalDedupeKey("job_m1", "completed"),
      searchTerminalDedupeKey("job_m2", "completed"),
    ]);
    expect(emitted[0]?.targetRoute).not.toBe(emitted[1]?.targetRoute);
  });

  it("queue surfaces every terminal job, not only completedRecent", () => {
    const items = buildOperatorActionQueue({
      completedRecent: { id: "newer", status: "completed" },
      terminalResearch: [
        { id: "older", status: "completed", symbols: ["BTCUSDT"], timeframe: "15m" },
        { id: "newer", status: "completed", symbols: ["ETHUSDT"], timeframe: "1h" },
        { id: "fail_x", status: "failed", symbols: ["XRPUSDT"], timeframe: "5m" },
      ],
    });
    const research = items.filter((item) => item.source === "research");
    expect(research.map((item) => item.id).sort()).toEqual([
      searchTerminalDedupeKey("fail_x", "failed"),
      searchTerminalDedupeKey("newer", "completed"),
      searchTerminalDedupeKey("older", "completed"),
    ]);
    expect(research.find((item) => item.id.includes("older"))?.targetRoute).toBe(
      "/results?jobId=older",
    );
    expect(research.find((item) => item.id.includes("fail_x"))?.actionLabel).toBe(
      "상태 확인",
    );
  });

  it("N: search runner contains no notification-delivery coupling", () => {
    const runner = read("src/lib/rextora/strategySearch/jobRunner.ts");
    const orchestrator = read(
      "src/lib/rextora/strategySearch/searchOrchestrator.ts",
    );
    const store = read("src/lib/rextora/strategySearch/jobStore.ts");
    expect(runner).not.toContain("searchTerminalNotification");
    expect(runner).not.toContain("observeSearchTerminalJobs");
    expect(runner).not.toContain("sendTelegramMessage");
    expect(orchestrator).not.toContain("searchTerminalNotification");
    expect(orchestrator).not.toContain("observeSearchTerminalJobs");
    expect(store).not.toContain("searchTerminalNotification");
    expect(store).not.toContain("sendTelegramMessage");
  });

  it("O: Strategy Search engine/ranking modules are not imported by the notifier", () => {
    const notifier = read(
      "src/lib/rextora/strategySearch/searchTerminalNotification.ts",
    );
    expect(notifier).not.toContain("candidateEvaluator");
    expect(notifier).not.toContain("candidateGenerator");
    expect(notifier).not.toContain("researchRanking");
    expect(notifier).not.toMatch(/from "\.\.\/results\/recommendation"/);
  });

  it("P: trading Telegram allowlist is unchanged and search events stay off", () => {
    expect(ALLOWED_TELEGRAM_EVENTS.has("paper_start")).toBe(true);
    expect(ALLOWED_TELEGRAM_EVENTS.has("trade_entry")).toBe(true);
    expect(ALLOWED_TELEGRAM_EVENTS.has("search.completed")).toBe(false);
    expect(ALLOWED_TELEGRAM_EVENTS.has("search.failed")).toBe(false);
    expect(ALLOWED_TELEGRAM_EVENTS.has("search.cancelled")).toBe(false);
    const telegram = read("src/lib/rextora/telegramNotifier.ts");
    expect(telegram).not.toContain("search.completed");
    expect(telegram).not.toContain("search_completed");
  });
});
