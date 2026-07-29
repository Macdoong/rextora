/**
 * AI Agent Intent Parser — unit tests.
 * Verifies Korean + English query classification without any I/O.
 */
import { describe, expect, it } from "vitest";
import {
  extractCompareSymbols,
  parseIntent,
} from "../src/lib/rextora/agent/intentParser";

describe("agentIntentParser", () => {
  it("detects search_status from Korean query", () => {
    expect(parseIntent("탐색 상태 알려줘").type).toBe("search_status");
    expect(parseIntent("현재 연구 어디까지 됐어").type).toBe("search_status");
    expect(parseIntent("전략 탐색 진행됐나").type).toBe("search_status");
  });

  it("detects search_status from English query", () => {
    expect(parseIntent("what is the search status").type).toBe("search_status");
    expect(parseIntent("strategy search progress").type).toBe("search_status");
  });

  it("detects explain_strategy", () => {
    expect(parseIntent("SAFE 전략 설명해줘").type).toBe("explain_strategy");
    expect(parseIntent("이 전략 어떻게 작동해").type).toBe("explain_strategy");
    expect(parseIntent("order block 전략 뭐야").type).toBe("explain_strategy");
  });

  it("detects backtest_summary", () => {
    expect(parseIntent("최근 백테스트 결과 보여줘").type).toBe("backtest_summary");
    expect(parseIntent("BTC 백테스트 어떻게 됐어").type).toBe("backtest_summary");
    expect(parseIntent("backtest summary").type).toBe("backtest_summary");
  });

  it("extracts symbol from backtest query", () => {
    const intent = parseIntent("ETH 백테스트 결과 어떻게 됐어");
    expect(intent.type).toBe("backtest_summary");
    expect(intent.params.symbol).toBe("ETH");
  });

  it("detects explain_rejection", () => {
    expect(parseIntent("왜 거부됐어").type).toBe("explain_rejection");
    expect(parseIntent("SAFE가 왜 차단했어").type).toBe("explain_rejection");
    expect(parseIntent("why was this rejected").type).toBe("explain_rejection");
  });

  it("detects compare_strategies and extracts two symbols", () => {
    const intent = parseIntent("BTC와 ETH 전략을 비교해줘");
    expect(intent.type).toBe("compare_strategies");
    expect(intent.params.symbolA).toBe("BTC");
    expect(intent.params.symbolB).toBe("ETH");
  });

  it("extractCompareSymbols keeps unique order", () => {
    expect(extractCompareSymbols("ETH BTC ETH")).toEqual({
      symbolA: "ETH",
      symbol: "ETH",
      symbolB: "BTC",
    });
  });

  it("detects risk_summary", () => {
    expect(parseIntent("리스크 현황 어때").type).toBe("risk_summary");
    expect(parseIntent("MDD 현재 얼마야").type).toBe("risk_summary");
    expect(parseIntent("왜 MDD 높아?").type).toBe("risk_summary");
    expect(parseIntent("손익비 알려줘").type).toBe("risk_summary");
  });

  it("detects market_status", () => {
    expect(parseIntent("시장 상황 어때").type).toBe("market_status");
    expect(parseIntent("지금 BTC 괜찮아").type).toBe("market_status");
  });

  it("routes required operator prompts to evidence-backed intents", () => {
    expect(parseIntent("현재 탐색 상태 알려줘").type).toBe("search_status");
    expect(parseIntent("이 전략의 MDD가 높은 이유는?").type).toBe("risk_summary");
    expect(parseIntent("비용이 수익에 얼마나 영향을 줬어?").type).toBe(
      "backtest_summary",
    );
    expect(parseIntent("모의매매 가능한 전략 보여줘").type).toBe(
      "explain_strategy",
    );
  });

  it("detects paper_start_request without executing", () => {
    expect(parseIntent("Paper 시작해줘").type).toBe("paper_start_request");
    expect(parseIntent("모의매매 시작").type).toBe("paper_start_request");
    expect(parseIntent("이 전략을 Paper로 시작해줘").type).toBe(
      "paper_start_request",
    );
    expect(parseIntent("paper 실행").type).toBe("paper_start_request");
  });

  it("detects search_failure_explanation", () => {
    expect(parseIntent("실패한 탐색 원인을 설명해줘").type).toBe(
      "search_failure_explanation",
    );
    expect(parseIntent("왜 탐색이 실패했어").type).toBe(
      "search_failure_explanation",
    );
  });

  it("detects recommend_next including best-strategy prompts", () => {
    expect(parseIntent("다음에 뭐 해야 해").type).toBe("recommend_next");
    expect(parseIntent("다음에 뭘 해야 하지?").type).toBe("recommend_next");
    expect(parseIntent("추천해줘").type).toBe("recommend_next");
    expect(parseIntent("현재 가장 좋은 전략은?").type).toBe("recommend_next");
    expect(parseIntent("왜 이 전략을 추천했어?").type).toBe("recommend_next");
  });

  it("detects first_run_help and demo_overview", () => {
    expect(parseIntent("지금 뭘 해야 해?").type).toBe("first_run_help");
    expect(parseIntent("결과가 왜 없어?").type).toBe("first_run_help");
    expect(parseIntent("처음에는 어떻게 시작해?").type).toBe("first_run_help");
    expect(parseIntent("데모 보여줘").type).toBe("demo_overview");
    expect(parseIntent("demo overview").type).toBe("demo_overview");
  });

  it("blocks write intents first", () => {
    expect(parseIntent("지금 BTC 매수해줘").type).toBe("execute_trade");
    expect(parseIntent("SAFE 전략 수정해줘").type).toBe("modify_safe");
    expect(parseIntent("실전 매매 시작해줘").type).toBe("start_live");
  });

  it("falls back to unknown for unrecognised queries", () => {
    expect(parseIntent("안녕하세요").type).toBe("unknown");
    expect(parseIntent("hello world").type).toBe("unknown");
    expect(parseIntent("").type).toBe("unknown");
  });

  it("confidence is positive for recognised intents and 0 for unknown", () => {
    expect(parseIntent("탐색 상태 알려줘").confidence).toBeGreaterThan(0);
    expect(parseIntent("unknown gibberish xyz").confidence).toBe(0);
  });

  it("preserves rawQuery", () => {
    const q = "  탐색 상태 알려줘  ";
    expect(parseIntent(q).rawQuery).toBe("탐색 상태 알려줘");
  });
});
