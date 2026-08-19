import { describe, expect, it } from "vitest";
import {
  containsForbiddenPrimaryText,
  sanitizePrimaryUserText,
} from "../src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

describe("userVisibleSanitizer", () => {
  it("strips forbidden parameter syntax from primary text", () => {
    const raw =
      "ETHUSDT 15m · patterns=Order Block + Fair Value Gap · patternConfigLevel=basic · leverageMode=automatic";
    const out = sanitizePrimaryUserText(raw);
    expect(out).not.toMatch(/patternConfigLevel/i);
    expect(out).not.toMatch(/patterns\s*=/i);
    expect(out).not.toMatch(/leverageMode/i);
    expect(containsForbiddenPrimaryText(out)).toEqual([]);
  });

  it("strips bare camelCase config keys without equals", () => {
    const out = sanitizePrimaryUserText(
      "아래의 대체 패턴 제안 중 하나를 선택하고, patternConfigLevel(기본/상세)과 탐색 생성 승인 여부를 회신하세요.",
    );
    expect(out).not.toMatch(/patternConfigLevel/i);
    expect(out).toMatch(/패턴 설정 수준/);
    expect(containsForbiddenPrimaryText(out)).toEqual([]);
  });

  it("strips tool ids and request hashes", () => {
    const out = sanitizePrimaryUserText(
      "search.create then search.start requestHash=abc123 symbol=BTCUSDT timeframe=1h",
    );
    expect(out).not.toMatch(/search\./i);
    expect(out).not.toMatch(/requestHash/i);
    expect(out).not.toMatch(/symbol\s*=/i);
    expect(out).not.toMatch(/timeframe\s*=/i);
  });

  it("removes section label prefixes", () => {
    const out = sanitizePrimaryUserText(
      "현재 상황 · 탐색 중\n\n검증된 API/저장소 결과입니다.",
    );
    expect(out).not.toContain("현재 상황");
    expect(out).not.toMatch(/검증된 API\/저장소/i);
  });

  const responsePathMatrix = [
    ["provider response", "BTCUSDT 15m Order Block + FVG · status: running"],
    ["deterministic fallback", "ETHUSDT 1h · pending_approval"],
    ["tool execution summary", "search.start jobId=search_12345678 running"],
    ["approval result", "approve_pending requestHash=abc queued"],
    ["search monitoring", "search.status status: running"],
    ["backtest summary", "backtest.run runId=bt_abcdef_123 completed"],
    ["paper preparation", "paper.prepare pending_approval exchangeCalled=false"],
    ["error and retry response", "failurePolicy=retry_once status: failed"],
  ] as const;

  it.each(responsePathMatrix)(
    "sanitizes forbidden tokens for the %s path",
    (_path, raw) => {
      const out = sanitizePrimaryUserText(raw);
      expect(containsForbiddenPrimaryText(out)).toEqual([]);
      expect(out).not.toMatch(
        /(?:patternConfigLevel|patternSelectionMode|selectedSpaceIds|combinationOperator|failurePolicy|requestHash|idempotencyKey|pending_approval|\bqueued\b|\brunning\b|search\.|backtest\.|paper\.|jobId|runId|exchangeCalled)/i,
      );
    },
  );

  it("translates common market and lifecycle values into natural Korean", () => {
    const out = sanitizePrimaryUserText(
      "BTCUSDT 15m Order Block + FVG 상태는 pending_approval 이후 running 입니다.",
    );
    expect(out).toContain("비트코인");
    expect(out).toContain("15분봉");
    expect(out).toContain("오더블럭");
    expect(out).toContain("가격 불균형");
    expect(out).toContain("최종 승인 대기");
    expect(out).toContain("진행 중");
  });

  it.each([
    ["paper_active", "모의매매 진행 중"],
    ["paper_ready", "모의매매 준비"],
    ["search_running", "탐색 진행 중"],
    ["backtest_review", "백테스트 검토"],
    ["Paper approval state", "모의매매 승인 상태"],
    ["Paper approval pending", "모의매매 승인 대기"],
  ])("maps visible lifecycle value %s", (raw, expected) => {
    const out = sanitizePrimaryUserText(raw);
    expect(out).toBe(expected);
    expect(containsForbiddenPrimaryText(out)).toEqual([]);
  });
});
