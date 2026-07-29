/**
 * Agent Response Builder — assembles AgentResponse from intent + facts.
 * All interpretation strings are Korean.
 * Facts and interpretation are ALWAYS kept separate.
 */

import type {
  AgentAction,
  AgentIntent,
  AgentLifecycleContext,
  AgentResponse,
  AgentScope,
  FactItem,
  InterpretationSource,
  ProviderMeta,
} from "./types";
import { buildScopeFromContext } from "./agentDataFetcher";
import { filterSafeActions } from "./safetyGuard";

function factValue(facts: FactItem[], label: string): string | undefined {
  return facts.find((f) => f.labelKo === label)?.value;
}

// ─── Interpretation generators ────────────────────────────────────────────────

function buildSearchStatusInterpretation(facts: FactItem[]): string {
  const total = factValue(facts, "전체 탐색 작업");
  const running = factValue(facts, "실행 중");
  const completed = factValue(facts, "완료됨");
  const latestStatus = factValue(facts, "최근 작업 상태");
  const symbol = factValue(facts, "최근 작업 심볼");

  if (!total) {
    return "전략 탐색 작업 데이터를 찾을 수 없습니다. 탐색 작업이 아직 시작되지 않았을 수 있습니다.";
  }

  const runningNum = parseInt(running ?? "0", 10);
  const completedNum = parseInt(completed ?? "0", 10);

  let result = `현재까지 총 ${total} 탐색 작업이 기록되어 있습니다. `;

  if (runningNum > 0) {
    result += `${running} 작업이 지금도 실행 중입니다`;
    if (symbol) result += ` (${symbol})`;
    result += `. `;
  } else {
    result += `현재 실행 중인 작업은 없습니다. `;
  }

  if (completedNum > 0) {
    result += `완료된 ${completed} 작업의 결과는 탐색 결과 페이지에서 확인하실 수 있습니다.`;
  }

  if (latestStatus === "실패") {
    result += ` 가장 최근 작업은 실패 상태입니다. 오류 내용을 확인해 보세요.`;
  }

  return result;
}

function buildExplainStrategyInterpretation(facts: FactItem[]): string {
  const total = factValue(facts, "등록된 전략 수");
  const liveReady = factValue(facts, "실전 가능 후보");
  const safeStatus = factValue(facts, "SAFE 전략");
  const matched = factValue(facts, "매칭된 전략");
  const matchedStatus = factValue(facts, "전략 상태");
  const paperNames = factValue(facts, "모의매매 전략 이름");
  const paperCount = factValue(facts, "모의매매 가능 전략");

  if (matched) {
    return `"${matched}" 전략이 확인되었습니다. 현재 상태는 "${matchedStatus}"입니다. 백테스트 페이지에서 이 전략의 상세 성과를 확인하실 수 있습니다.`;
  }

  if (paperNames && !safeStatus) {
    return `모의매매 가능 전략은 ${paperCount ?? "확인된"}입니다: ${paperNames}. Paper 화면에서 승인 후 시작할 수 있습니다.`;
  }

  if (safeStatus) {
    return `SAFE 전략은 Rextora의 핵심 기준 전략으로, 항상 보호 상태로 유지됩니다. 수정되거나 삭제될 수 없습니다. 현재 총 ${total} 전략 중 ${liveReady}이 실전 가능 후보로 평가되어 있습니다.`;
  }

  return `총 ${total ?? "알 수 없음"} 개의 전략이 등록되어 있으며, ${liveReady ?? "0"}개가 실전 가능 후보로 분류되어 있습니다.`;
}

function buildBacktestSummaryInterpretation(facts: FactItem[]): string {
  const count = factValue(facts, "최근 백테스트 수");
  const totalReturn = factValue(facts, "총 수익률");
  const mdd = factValue(facts, "최대 낙폭(MDD)");
  const trades = factValue(facts, "거래 횟수");
  const profitFactor = factValue(facts, "손익비");
  const winRate = factValue(facts, "승률");
  const totalCost = factValue(facts, "총 거래 비용");
  const costPct = factValue(facts, "초기 자본 대비 비용");
  const grossPnl = factValue(facts, "비용 전 손익");
  const netPnl = factValue(facts, "비용 후 손익");
  const symbol = factValue(facts, "심볼");
  const noData = facts.find((f) => f.value === "없음" && f.labelKo === "저장된 백테스트");

  if (noData) {
    return "저장된 백테스트 결과가 없습니다. 백테스트 페이지에서 원하는 전략과 기간을 설정하고 실행해 보세요.";
  }

  let result = "";
  if (symbol) result += `${symbol} `;
  result += `최근 백테스트 결과`;
  if (count) result += ` (${count})`;
  result += `: `;

  const parts: string[] = [];
  if (totalReturn) parts.push(`총 수익률 ${totalReturn}`);
  if (mdd) parts.push(`MDD ${mdd}`);
  if (trades) parts.push(`${trades} 거래`);
  if (winRate) parts.push(`승률 ${winRate}`);
  if (profitFactor) parts.push(`손익비 ${profitFactor}`);
  if (totalCost) parts.push(`총 거래 비용 ${totalCost}`);

  if (parts.length > 0) {
    result += parts.join(", ") + ".";
  }

  const returnNum = totalReturn ? parseFloat(totalReturn) : null;
  if (returnNum !== null && !isNaN(returnNum)) {
    if (returnNum > 10) {
      result += " 수익률이 양호한 편이지만, MDD와 리스크 지표를 함께 검토하시기 바랍니다.";
    } else if (returnNum < 0) {
      result += " 손실 구간이 확인됩니다. 전략 파라미터 검토가 필요할 수 있습니다.";
    }
  }
  if (costPct) {
    result += ` 비용은 초기 자본의 ${costPct}입니다.`;
  }
  if (grossPnl && netPnl) {
    result += ` 저장된 결과의 비용 전 손익은 ${grossPnl}, 비용 후 손익은 ${netPnl}입니다.`;
  }

  return result;
}

function buildExplainRejectionInterpretation(facts: FactItem[]): string {
  const symbol = factValue(facts, "심볼");
  const mdd = factValue(facts, "최대 낙폭(MDD)");

  let result = "거부/차단의 원인은 일반적으로 다음 중 하나입니다: ";
  result += "비용 방어(Cost Guard) 임계값 초과, 최대 낙폭(MDD) 한도 초과, ";
  result += "리스크 한도 위반, 또는 전략 검증 실패입니다. ";

  if (symbol) {
    result += `${symbol}의 경우, `;
  }

  if (mdd) {
    result += `MDD ${mdd}가 기록되었습니다. `;
  }

  result += "백테스트 결과의 '거부 사유' 항목과 엘리지빌리티 실패 배너를 확인하세요.";

  return result;
}

function buildCompareStrategiesInterpretation(facts: FactItem[]): string {
  const canCompare = factValue(facts, "비교 가능");
  const symbolA = factValue(facts, "비교 심볼 A");
  const symbolB = factValue(facts, "비교 심볼 B");

  if (!canCompare || canCompare.startsWith("아니오")) {
    return (
      `심볼 비교를 완료할 수 없습니다. ${canCompare ?? "검증된 데이터가 부족합니다."} ` +
      `추정 수치를 만들지 않습니다. 해당 심볼로 백테스트를 먼저 실행한 뒤 다시 비교해 주세요.`
    );
  }

  const mddA = factValue(facts, `${symbolA} MDD`);
  const mddB = factValue(facts, `${symbolB} MDD`);
  const wrA = factValue(facts, `${symbolA} 승률`);
  const wrB = factValue(facts, `${symbolB} 승률`);
  const pfA = factValue(facts, `${symbolA} 손익비`);
  const pfB = factValue(facts, `${symbolB} 손익비`);
  const trA = factValue(facts, `${symbolA} 거래 수`);
  const trB = factValue(facts, `${symbolB} 거래 수`);
  const winner = factValue(facts, "지표 우위 심볼");
  const paperA = factValue(facts, `${symbolA} 모의매매 가능`);
  const paperB = factValue(facts, `${symbolB} 모의매매 가능`);

  let result =
    `${symbolA} vs ${symbolB} 최신 저장된 백테스트 비교: ` +
    `${symbolA}(MDD ${mddA ?? "—"}, 승률 ${wrA ?? "—"}, 손익비 ${pfA ?? "—"}, 거래 ${trA ?? "—"}) / ` +
    `${symbolB}(MDD ${mddB ?? "—"}, 승률 ${wrB ?? "—"}, 손익비 ${pfB ?? "—"}, 거래 ${trB ?? "—"}). `;

  if (winner && winner !== "동등") {
    result += `검증된 지표 기준 상대 우위는 ${winner}입니다. `;
  } else {
    result += `양 심볼 지표가 유사합니다. `;
  }

  result +=
    `모의매매 가능: ${symbolA}=${paperA ?? "확인 불가"}, ${symbolB}=${paperB ?? "확인 불가"}. ` +
    `최종 선택은 동일 기간·비용 가정으로 재검증한 뒤 승인하세요.`;

  return result;
}

function buildRiskSummaryInterpretation(facts: FactItem[]): string {
  const avgMdd = factValue(facts, "평균 MDD");
  const maxMdd = factValue(facts, "최대 MDD");
  const avgPf = factValue(facts, "평균 손익비");
  const avgWinRate = factValue(facts, "평균 승률");
  const avgReturn = factValue(facts, "평균 수익률");
  const count = factValue(facts, "분석 대상 백테스트");

  if (!avgMdd && !maxMdd) {
    return "현재 백테스트 기반 리스크 데이터를 계산할 수 없습니다. 백테스트를 먼저 실행해 보세요.";
  }

  let result = `저장된 ${count ?? "최근"} 백테스트를 기준으로 분석한 결과: `;
  const parts: string[] = [];
  if (avgMdd) parts.push(`평균 MDD ${avgMdd}`);
  if (maxMdd) parts.push(`최대 MDD ${maxMdd}`);
  if (avgPf) parts.push(`평균 손익비 ${avgPf}`);
  if (avgWinRate) parts.push(`평균 승률 ${avgWinRate}`);
  if (avgReturn) parts.push(`평균 수익률 ${avgReturn}`);
  result += parts.join(", ") + ". ";

  const pfNum = avgPf ? parseFloat(avgPf) : null;
  if (pfNum !== null) {
    if (pfNum < 1.2) {
      result += "손익비가 낮은 편입니다. 전략의 수익 대비 손실 비율을 개선할 필요가 있을 수 있습니다.";
    } else if (pfNum > 2.0) {
      result += "손익비가 양호합니다.";
    }
  }
  result +=
    " MDD의 정확한 원인은 선택한 거래와 낙폭 구간의 손실 연속성·비용·포지션 노출을 함께 확인해야 판단할 수 있습니다.";

  return result;
}

function buildMarketStatusInterpretation(): string {
  return (
    "실시간 시장 데이터는 현재 에이전트에서 직접 조회하지 않습니다. " +
    "정확한 시세와 시장 상황은 대시보드 또는 전략 탐색 페이지에서 확인하실 수 있습니다."
  );
}

function buildPaperStartInterpretation(facts: FactItem[]): string {
  const candidate = factValue(facts, "후보 전략");
  const eligible = factValue(facts, "후보 Paper 자격");
  const active = factValue(facts, "활성 Paper 세션");
  const relatedBt = factValue(facts, "관련 백테스트");

  let result =
    "에이전트는 모의매매를 자동 시작하지 않습니다. Paper Trading 화면에서 전략을 확인한 뒤 명시적으로 승인해야 합니다. ";

  if (candidate && candidate !== "없음") {
    result += `현재 후보 전략은 "${candidate}"`;
    if (eligible) result += ` (자격: ${eligible})`;
    result += `. `;
  } else {
    result += "현재 Paper 가능 전략이 확인되지 않았습니다. ";
  }

  if (relatedBt && relatedBt !== "없음") {
    result += `관련 백테스트 ${relatedBt}가 있습니다. `;
  }

  if (active && active !== "없음") {
    result += `이미 활성 Paper 세션(${active})이 있으니 새 시작 전 기존 세션을 점검하세요.`;
  } else {
    result += "활성 Paper 세션은 없습니다.";
  }

  return result;
}

function buildSearchFailureInterpretation(facts: FactItem[]): string {
  const status = factValue(facts, "작업 상태");
  const message = factValue(facts, "실패 메시지");
  const jobId = factValue(facts, "탐색 작업 ID");
  const rejected = factValue(facts, "거부 후보");
  const passed = factValue(facts, "통과 후보");
  const reasons = factValue(facts, "주요 거부 코드");
  const none = facts.find((f) => f.labelKo === "실패 탐색 작업" && f.value === "없음");

  if (none) {
    return "실패한 탐색 작업을 찾을 수 없습니다. 탐색 페이지에서 작업 목록을 확인해 주세요.";
  }

  let result = `탐색 작업 ${jobId ?? ""}의 상태은 "${status}"입니다. `;
  if (message) {
    result += `기록된 실패 메시지: ${message}. `;
  }
  if (passed || rejected) {
    result += `평가 요약 — 통과 ${passed ?? "—"}, 거부 ${rejected ?? "—"}. `;
  }
  if (reasons) {
    result += `주요 거부 코드: ${reasons}. `;
  }
  result +=
    "원인은 저장된 실패 메시지와 후보 거부 코드에만 근거합니다. 추정 원인을 추가하지 않습니다.";

  return result;
}

function buildRecommendNextInterpretation(facts: FactItem[]): string {
  const nextLabel = factValue(facts, "권장 다음 작업");
  const nextReason = factValue(facts, "권장 사유");
  const focus = factValue(facts, "현재 주목 전략");
  const route = factValue(facts, "현재 화면");

  let result = nextReason ?? "현재 라이프사이클 상태를 기준으로 다음 단계를 제안합니다.";
  if (nextLabel) {
    result += ` 권장 다음 작업은 단 하나: ${nextLabel}.`;
  }
  if (focus) {
    result += ` 현재 주목 전략/식별자: ${focus}.`;
  }
  if (route) {
    result += ` 현재 화면: ${route}.`;
  }
  return result;
}

function buildFirstRunInterpretation(facts: FactItem[]): string {
  const mode = factValue(facts, "최초 실행 모드") ?? "확인 중";
  const next = factValue(facts, "권장 다음 작업");
  const auto = factValue(facts, "데모 자동 생성");
  return [
    `검증된 최초 실행 상태: ${mode}.`,
    "Rextora는 AI Trading Employee이며, 데모는 예시일 뿐 실전 증거가 아닙니다.",
    "실전 주문은 실행되지 않으며 SAFE는 보호됩니다. 최종 승인자는 사용자입니다.",
    auto ? `데모 생성: ${auto}.` : "",
    next ? `권장 다음 작업은 단 하나: ${next}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDemoOverviewInterpretation(facts: FactItem[]): string {
  const mode = factValue(facts, "최초 실행 모드") ?? "확인 중";
  const next = factValue(facts, "권장 다음 작업");
  return [
    `데모 개요 — 현재 모드: ${mode}.`,
    "데모 데이터는 예시 워크스페이스이며 실전 성과·실전 주문이 아닙니다.",
    "에이전트는 데모를 자동 생성하지 않습니다. 대시보드에서 명시 확인이 필요합니다.",
    "Paper/Live는 자동 시작되지 않습니다.",
    next ? `권장 다음 작업은 단 하나: ${next}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUnknownInterpretation(): string {
  return [
    "질문을 이해하지 못했습니다. 다음과 같은 방식으로 질문해 보세요:",
    "• 탐색 상태 알려줘",
    "• 최근 백테스트 결과 보여줘",
    "• SAFE 전략 설명해줘",
    "• BTC와 ETH 전략 비교",
    "• Paper 시작해줘",
    "• 실패한 탐색 원인 설명해줘",
    "• 지금 뭘 해야 해",
    "• 데모 보여줘",
    "• 다음에 뭐 해야 해",
  ].join("\n");
}

export function buildRecommendedActionKo(
  intentType: string,
  facts: FactItem[],
): string {
  switch (intentType) {
    case "recommend_next":
    case "first_run_help":
    case "demo_overview":
      return (
        factValue(facts, "권장 다음 작업") ??
        "전략 탐색 결과를 검토하세요."
      );
    case "paper_start_request":
      return "모의매매 화면을 열고 승인 후 시작하세요.";
    case "search_failure_explanation":
      return "전략 탐색 페이지에서 실패 작업을 확인하세요.";
    case "compare_strategies": {
      const can = factValue(facts, "비교 가능");
      if (can?.startsWith("아니오")) {
        return "부족한 심볼의 백테스트를 먼저 실행하세요.";
      }
      return "비교 결과를 바탕으로 Results에서 추천 후보를 검토하세요.";
    }
    case "search_status":
      return "탐색 결과 페이지에서 진행 상태를 확인하세요.";
    case "backtest_summary":
    case "risk_summary":
      return "백테스트 페이지에서 증거를 상세 검토하세요.";
    case "explain_strategy":
      return "전략 목록에서 대상 전략을 확인하세요.";
    default:
      return "대시보드에서 현재 파이프라인 상태를 확인하세요.";
  }
}

// ─── Action builders ──────────────────────────────────────────────────────────

function singleAction(action: AgentAction): AgentAction[] {
  return [action];
}

function actionsForIntent(intentType: string, facts: FactItem[]): AgentAction[] {
  switch (intentType) {
    case "search_status":
      return singleAction({
        type: "view_results",
        labelKo: "탐색 결과 보기",
        descriptionKo: "전략 탐색 결과와 추천을 확인합니다.",
        href: "/results",
        requiresApproval: false,
      });
    case "search_failure_explanation":
      return singleAction({
        type: "open_search",
        labelKo: "탐색 화면 열기",
        descriptionKo: "실패 작업과 원인을 확인합니다.",
        href: "/strategy-search",
        requiresApproval: false,
      });
    case "explain_strategy":
      return singleAction({
        type: "view_strategy",
        labelKo: "전략 목록 보기",
        descriptionKo: "등록된 전략과 Paper 가능 여부를 확인합니다.",
        href: "/results",
        requiresApproval: false,
      });
    case "compare_strategies": {
      const can = factValue(facts, "비교 가능");
      if (can?.startsWith("아니오")) {
        return singleAction({
          type: "open_backtest",
          labelKo: "백테스트 열기",
          descriptionKo: "부족한 심볼의 검증 데이터를 확보합니다.",
          href: "/backtest",
          requiresApproval: true,
        });
      }
      return singleAction({
        type: "view_recommendation",
        labelKo: "추천 결과 보기",
        descriptionKo: "비교 결과를 바탕으로 추천 후보를 검토합니다.",
        href: "/results",
        requiresApproval: false,
      });
    }
    case "backtest_summary":
    case "explain_rejection":
    case "risk_summary":
      return singleAction({
        type: "open_backtest",
        labelKo: "백테스트 열기",
        descriptionKo: "저장된 실행과 차트 증거를 확인합니다.",
        href: "/backtest",
        requiresApproval: true,
      });
    case "paper_start_request": {
      const strategyId = factValue(facts, "후보 전략 ID");
      const href = strategyId
        ? `/paper-trading?strategyId=${encodeURIComponent(strategyId)}`
        : "/paper-trading";
      return singleAction({
        type: "open_paper",
        labelKo: "모의매매 열기",
        descriptionKo:
          "화면만 엽니다. Paper 세션 시작은 사용자가 승인해야 합니다. 에이전트는 실행하지 않습니다.",
        href,
        requiresApproval: true,
      });
    }
    case "recommend_next":
    case "first_run_help":
    case "demo_overview": {
      const href = factValue(facts, "권장 이동 경로") ?? "/dashboard";
      const label = factValue(facts, "권장 다음 작업") ?? "다음 단계 열기";
      const key = factValue(facts, "권장 작업 키") ?? "navigate";
      const secondaryLabel = factValue(facts, "보조 작업");
      const secondaryHref = factValue(facts, "보조 이동 경로");
      const type: AgentAction["type"] =
        key === "open_paper"
          ? "open_paper"
          : key === "open_backtest"
            ? "open_backtest"
            : key === "open_search"
              ? "open_search"
              : key === "view_recommendation" || key === "view_results"
                ? "view_results"
                : "navigate";
      const primary: AgentAction = {
        type,
        labelKo: label,
        descriptionKo: factValue(facts, "권장 사유"),
        href,
        requiresApproval:
          href.includes("/paper-trading") || href.includes("/backtest"),
      };
      if (
        secondaryLabel &&
        secondaryHref &&
        (intentType === "first_run_help" ||
          intentType === "demo_overview" ||
          factValue(facts, "최초 실행 모드") === "EMPTY" ||
          factValue(facts, "최초 실행 모드") === "DEMO_AVAILABLE")
      ) {
        return [
          primary,
          {
            type: "open_search",
            labelKo: secondaryLabel,
            descriptionKo: "가짜 데이터 없이 Strategy Search로 이동합니다.",
            href: secondaryHref,
            requiresApproval: false,
          },
        ];
      }
      return singleAction(primary);
    }
    default:
      return [];
  }
}

function resolveScope(
  intent: AgentIntent,
  facts: FactItem[],
  context?: AgentLifecycleContext | null,
): AgentScope {
  return buildScopeFromContext(context, {
    strategyId:
      factValue(facts, "후보 전략 ID") ??
      factValue(facts, "전략 ID") ??
      factValue(facts, "SAFE 전략 ID") ??
      null,
    runId: factValue(facts, "최근 실행 ID") ?? factValue(facts, "관련 백테스트") ?? null,
    jobId:
      factValue(facts, "탐색 작업 ID") ??
      factValue(facts, "최근 작업 ID") ??
      null,
    symbol:
      factValue(facts, "심볼") ??
      factValue(facts, "비교 심볼 A") ??
      factValue(facts, "최근 작업 심볼") ??
      null,
    timeframe: factValue(facts, "타임프레임") ?? null,
    paperSessionId: factValue(facts, "활성 Paper 세션") ?? null,
  });
}

// ─── Local fallback interpretation ───────────────────────────────────────────

export function buildLocalInterpretation(
  intent: AgentIntent,
  facts: FactItem[],
): string {
  switch (intent.type) {
    case "search_status":
      return buildSearchStatusInterpretation(facts);
    case "explain_strategy":
      return buildExplainStrategyInterpretation(facts);
    case "backtest_summary":
      return buildBacktestSummaryInterpretation(facts);
    case "explain_rejection":
      return buildExplainRejectionInterpretation(facts);
    case "compare_strategies":
      return buildCompareStrategiesInterpretation(facts);
    case "risk_summary":
      return buildRiskSummaryInterpretation(facts);
    case "market_status":
      return buildMarketStatusInterpretation();
    case "paper_start_request":
      return buildPaperStartInterpretation(facts);
    case "search_failure_explanation":
      return buildSearchFailureInterpretation(facts);
    case "recommend_next":
      return buildRecommendNextInterpretation(facts);
    case "first_run_help":
      return buildFirstRunInterpretation(facts);
    case "demo_overview":
      return buildDemoOverviewInterpretation(facts);
    default:
      return buildUnknownInterpretation();
  }
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildAgentResponse(
  intent: AgentIntent,
  facts: FactItem[],
  llm?: {
    interpretationKo: string;
    source: InterpretationSource;
    providerMeta?: ProviderMeta;
  },
  context?: AgentLifecycleContext | null,
): AgentResponse {
  const interpretationKo =
    llm?.interpretationKo ?? buildLocalInterpretation(intent, facts);
  const interpretationSource: InterpretationSource = llm?.source ?? "local";

  const rawActions = actionsForIntent(intent.type, facts);
  const actions = filterSafeActions(rawActions);

  return {
    intentType: intent.type,
    facts,
    interpretationKo,
    recommendedActionKo: buildRecommendedActionKo(intent.type, facts),
    interpretationSource,
    providerMeta: llm?.providerMeta,
    actions,
    scope: resolveScope(intent, facts, context),
    safetyBlocked: false,
    respondedAt: new Date().toISOString(),
  };
}
