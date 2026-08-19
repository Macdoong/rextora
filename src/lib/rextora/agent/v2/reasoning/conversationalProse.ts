/**
 * Natural Korean prose for operator-visible Agent responses.
 */

import type { ToolPlanItem } from "./reasoningTypes";
import type { ToolPlanExecutionResult } from "./reasoningExecution";
import { sanitizePrimaryUserText } from "./userVisibleSanitizer";

const PATTERN_KO: Record<string, string> = {
  order_block: "오더블럭",
  fair_value_gap: "가격 불균형",
  fvg: "가격 불균형",
  trendline: "추세선",
  support_resistance: "지지·저항",
  support: "지지",
  resistance: "저항",
  liquidity: "유동성",
  structure: "구조",
  swing: "스윙",
};

const TIMEFRAME_KO: Record<string, string> = {
  "15m": "15분",
  "1h": "1시간",
  "4h": "4시간",
  "1d": "일봉",
};

function patternIdsFromPlan(plan: ToolPlanItem[]): string[] {
  const create = plan.find((s) => s.toolId === "search.create");
  if (!create) return [];
  const body =
    (create.arguments.createBody as Record<string, unknown> | undefined) ??
    create.arguments;
  const op = body.operatorPlan as Record<string, unknown> | undefined;
  const ids =
    (op?.selectedSpaceIds as string[] | undefined) ??
    (body.patternSpaceIds as string[] | undefined) ??
    [];
  return ids.map(String);
}

export function patternsKo(ids: string[]): string {
  if (!ids.length) return "선택된 패턴";
  return ids.map((id) => PATTERN_KO[id] ?? id.replace(/_/g, " ")).join("·");
}

export function timeframeKo(tf: string | null | undefined): string {
  if (!tf) return "";
  return TIMEFRAME_KO[tf] ?? tf;
}

export function buildCancelReplacePlanProse(input: {
  symbol?: string | null;
  oldTimeframe?: string | null;
  newTimeframe?: string | null;
  oldPatterns?: string[];
  newPatterns?: string[];
}): { conclusionKo: string; explanationKo: string; recommendedActionKo: string } {
  const sym = input.symbol ?? "BTC";
  const oldTf = timeframeKo(input.oldTimeframe ?? "15m");
  const newTf = timeframeKo(input.newTimeframe ?? "1h");
  const oldP = patternsKo(input.oldPatterns ?? ["order_block", "fair_value_gap"]);
  const newP = patternsKo(input.newPatterns ?? ["trendline", "support_resistance"]);

  return {
    conclusionKo: sanitizePrimaryUserText(
      `현재 실행 중인 ${sym} ${oldTf} 탐색을 확인했습니다.`,
    ),
    explanationKo: sanitizePrimaryUserText(
      `기존 ${oldP} 조합과 겹치지 않도록 이번에는 ${newP} 조합으로 바꾸고, 시간봉도 ${newTf}으로 조정했습니다.\n\n승인하면 기존 탐색 1건을 취소한 뒤 새 설정으로 다시 시작합니다.`,
    ),
    recommendedActionKo: "기존 탐색 취소 후 새 탐색 시작",
  };
}

export function buildCancelReplaceExecutionProse(input: {
  symbol?: string | null;
  newTimeframe?: string | null;
  newPatterns?: string[];
}): { conclusionKo: string; explanationKo: string } {
  const sym = input.symbol ?? "BTC";
  const newTf = timeframeKo(input.newTimeframe ?? "1h");
  const newP = patternsKo(input.newPatterns ?? []);

  return {
    conclusionKo: sanitizePrimaryUserText(
      `기존 탐색을 취소하고 새 ${newTf} 탐색을 시작했습니다.`,
    ),
    explanationKo: sanitizePrimaryUserText(
      `${sym} 탐색은 ${newP} 조합을 사용합니다. 현재 연구가 진행 중이며, 완료 전까지 결과를 확정해서 말하지 않겠습니다.`,
    ),
  };
}

export function buildDifferentPatternProse(input: {
  symbol?: string | null;
  timeframe?: string | null;
  newPatterns?: string[];
}): { conclusionKo: string; explanationKo: string } {
  const sym = input.symbol ?? "BTC";
  const tf = timeframeKo(input.timeframe ?? "15m");
  const newP = patternsKo(input.newPatterns ?? []);

  return {
    conclusionKo: sanitizePrimaryUserText(
      `이전 설정과 다른 패턴으로 ${sym} ${tf} 탐색 계획을 준비했습니다.`,
    ),
    explanationKo: sanitizePrimaryUserText(
      `이번에는 ${newP} 조합을 사용합니다. 승인하면 새 탐색 작업을 생성하고 시작합니다.`,
    ),
  };
}

export function buildExecutionSummaryFromPlan(
  plan: ToolPlanItem[],
  exec: ToolPlanExecutionResult,
): string {
  const toolIds = plan.map((s) => s.toolId);
  const isCancelReplace =
    toolIds.includes("search.cancel") &&
    toolIds.includes("search.create") &&
    toolIds.includes("search.start");

  if (isCancelReplace && exec.ok) {
    const create = plan.find((s) => s.toolId === "search.create");
    const body =
      (create?.arguments.createBody as Record<string, unknown> | undefined) ??
      create?.arguments;
    const tf = typeof body?.timeframe === "string" ? body.timeframe : "1h";
    const patterns = patternIdsFromPlan(plan);
    const sym =
      Array.isArray(body?.symbols) && body.symbols[0]
        ? String(body.symbols[0]).replace("USDT", "")
        : "BTC";
    const prose = buildCancelReplaceExecutionProse({
      symbol: sym,
      newTimeframe: tf,
      newPatterns: patterns,
    });
    return `${prose.conclusionKo}\n\n${prose.explanationKo}`;
  }

  if (exec.ok && toolIds.includes("results.promote")) {
    return sanitizePrimaryUserText(
      "선택한 탐색 결과를 전략으로 승격했습니다. 같은 요청을 다시 승인해도 전략은 중복 생성되지 않습니다.",
    );
  }

  if (exec.jobId && exec.ok) {
    return sanitizePrimaryUserText(
      "탐색 작업을 시작했습니다. 현재 연구가 진행 중이며, 완료 전까지 결과를 확정해서 말하지 않겠습니다.",
    );
  }
  if (exec.runId && exec.ok) {
    return sanitizePrimaryUserText(
      "백테스트를 실행하고 결과를 저장했습니다. 저장된 지표는 아래에서 확인할 수 있습니다.",
    );
  }
  if (exec.ok && toolIds.includes("paper.approve_start")) {
    return sanitizePrimaryUserText("승인한 모의매매 세션을 시작했습니다. 실거래 주문이나 거래소 호출은 발생하지 않았습니다.");
  }
  if (exec.ok && toolIds.includes("paper.pause")) {
    return sanitizePrimaryUserText("모의매매 세션을 일시 정지했습니다.");
  }
  if (exec.ok && toolIds.includes("paper.resume")) {
    return sanitizePrimaryUserText("모의매매 세션을 재개했습니다. 실거래 주문이나 거래소 호출은 발생하지 않았습니다.");
  }
  if (exec.ok && toolIds.includes("paper.stop")) {
    return sanitizePrimaryUserText("모의매매 세션을 종료했습니다.");
  }
  if (exec.ok && toolIds.includes("strategy.rename")) return sanitizePrimaryUserText("전략 이름을 변경했습니다.");
  if (exec.ok && toolIds.includes("strategy.archive")) return sanitizePrimaryUserText("전략을 보관함으로 옮겼습니다.");
  if (exec.ok && toolIds.includes("strategy.restore")) return sanitizePrimaryUserText("보관한 전략을 복원했습니다.");
  if (exec.ok && toolIds.includes("strategy.delete")) return sanitizePrimaryUserText("의존성 검사를 통과한 전략을 삭제했습니다.");
  if (exec.sessionId && exec.ok) {
    return sanitizePrimaryUserText(
      "모의매매 세션을 준비했습니다. Paper 화면에서 별도 활성화 승인이 필요합니다.",
    );
  }

  return sanitizePrimaryUserText(exec.summaryKo);
}

export function extractPlanContext(plan: ToolPlanItem[]): {
  symbol: string | null;
  timeframe: string | null;
  patterns: string[];
} {
  const create = plan.find((s) => s.toolId === "search.create");
  if (!create) return { symbol: null, timeframe: null, patterns: [] };
  const body =
    (create.arguments.createBody as Record<string, unknown> | undefined) ??
    create.arguments;
  const symbols = body.symbols as string[] | undefined;
  return {
    symbol: symbols?.[0] ?? null,
    timeframe: typeof body.timeframe === "string" ? body.timeframe : null,
    patterns: patternIdsFromPlan(plan),
  };
}
