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
import {
  buildDecisionContext,
  type DecisionContext,
} from "./decisionContext";
import {
  emptyEntityMemory,
  mergeEntityMemory,
  stripInternalIdsFromProse,
  type ConversationEntityMemory,
} from "./conversationContext";
import {
  proposedActionToCardAction,
  proposedFromAgentAction,
  type ProposedAction,
} from "./proposedAction";
import type { AgentPlanDraft } from "./planDrafts";
import {
  inferLifecycleStage,
  lifecycleObjectiveKo,
  type PipelineLifecycleStage,
} from "./lifecycleStage";
import type { ResearchWorkspaceSummary } from "./researchWorkspace";
import {
  advanceConversationState,
  type ConversationWorkingState,
} from "./conversationState";
import type { AgentGoal } from "./goalDetector";
import { buildMissionTimeline } from "./missionTimeline";

function factValue(facts: FactItem[], label: string): string | undefined {
  return facts.find((f) => f.labelKo === label)?.value;
}

/** ID-like fact values must never persist Korean/English absence sentinels. */
function factIdValue(facts: FactItem[], label: string): string | null {
  const value = factValue(facts, label)?.trim();
  if (!value) return null;
  if (
    value === "없음" ||
    value === "null" ||
    value === "undefined" ||
    value === "None" ||
    value === "-"
  ) {
    return null;
  }
  return value;
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
    "• 지금 뭘 해야 해",
    "• 새로운 전략 탐색해",
    "• 최근 백테스트 결과 보여줘",
    "• SAFE 전략 설명해줘",
    "• BTC와 ETH 중 뭐가 더 좋아",
    "• Paper 시작해줘",
  ].join("\n");
}

function buildFollowUpWhyInterpretation(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): string {
  return buildDecisionContext("follow_up_why", facts, entities).explanationKo;
}

function buildApprovePendingInterpretation(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): string {
  return buildDecisionContext("approve_pending", facts, entities).explanationKo;
}

function buildPrepareSearchPlanInterpretation(facts: FactItem[]): string {
  return buildDecisionContext("prepare_search_plan", facts).explanationKo;
}

function followUpsForIntent(intentType: string): string[] {
  switch (intentType) {
    case "first_run_help":
    case "recommend_next":
    case "workspace_status":
    case "continue_session":
      return ["왜 추천했어?", "왜 기다리는 거야?", "그럼 진행해"];
    case "prepare_search_plan":
    case "prepare_backtest_plan":
    case "prepare_paper_plan":
      return ["왜 추천했어?", "지금 승인하면?", "취소"];
    case "compare_strategies":
      return ["왜 추천했어?", "백테스트 열어줘", "그럼 진행해"];
    case "paper_start_request":
      return ["왜 추천했어?", "진행해", "왜 기다리는 거야?"];
    case "paper_status":
      return ["모의매매와 백테스트 차이는?", "현재 승인 대기는?", "위험은 뭐야?"];
    case "approve_pending":
      return ["이어서 하자", "다음 단계는?"];
    case "explain_approval":
    case "explain_waiting":
      return ["그럼 진행해", "취소", "왜 추천했어?"];
    case "explain_rejection":
      return ["다음 단계는?", "다른 후보 보여줘", "왜?"];
    case "cancel_pending":
      return ["이어서 하자", "탐색 계획 준비해", "연구 현황 알려줘"];
    case "research_workspace":
      return ["이어서 하자", "왜 추천했어?", "왜 기다리는 거야?"];
    default:
      return ["이어서 하자", "왜 추천했어?", "그럼 진행해"];
  }
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
    case "paper_status":
      return "모의매매 화면에서 저장된 상태를 확인하세요.";
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
    case "prepare_search_plan":
      return "탐색 계획 검토";
    case "prepare_backtest_plan":
      return "백테스트 계획 검토";
    case "prepare_paper_plan":
      return "모의매매 계획 검토";
    case "research_workspace":
      return factValue(facts, "권장 다음 작업") ?? "연구 현황 다음 단계";
    case "workspace_status":
      return "대시보드에서 현재 상태를 확인하세요.";
    case "follow_up_why":
      return factValue(facts, "권장 다음 작업") ?? "직전 권장을 유지하세요.";
    case "approve_pending":
      return (
        factValue(facts, "결과 참조") ??
        factValue(facts, "실행 상태") ??
        "승인된 명령을 처리했습니다."
      );
    case "explain_approval":
      return factValue(facts, "권장 다음 작업") ?? "계획 검토";
    case "cancel_pending":
      return "원하는 다음 작업을 말씀해 주세요.";
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
        requiresApproval: false,
      });
    case "paper_status":
      return singleAction({
        type: "open_paper",
        labelKo: "모의매매 상태 보기",
        descriptionKo: "저장된 모의매매 세션 상태를 확인합니다.",
        href: "/paper-trading",
        requiresApproval: false,
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
    case "demo_overview":
    case "continue_session":
    case "follow_up_why":
    case "explain_waiting": {
      const href = factValue(facts, "권장 이동 경로") ?? "/dashboard";
      const label = factValue(facts, "권장 다음 작업") ?? "다음 단계 열기";
      const key = factValue(facts, "권장 작업 키") ?? "navigate";
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
      return singleAction({
        type,
        labelKo: label,
        descriptionKo: factValue(facts, "권장 사유"),
        href,
        requiresApproval:
          href.includes("/paper-trading") || href.includes("/backtest"),
      });
    }
    case "prepare_search_plan":
      return singleAction({
        type: "open_search",
        labelKo: "계획 검토",
        descriptionKo:
          "탐색 계획 초안을 엽니다. 에이전트는 탐색을 자동 시작하지 않습니다.",
        href: factValue(facts, "권장 이동 경로") ?? "/strategy-search",
        requiresApproval: true,
      });
    case "prepare_backtest_plan":
      return singleAction({
        type: "open_backtest",
        labelKo: "백테스트 계획 검토",
        descriptionKo:
          "백테스트 화면을 엽니다. 에이전트는 자동 실행하지 않습니다.",
        href: factValue(facts, "권장 이동 경로") ?? "/backtest",
        requiresApproval: true,
      });
    case "prepare_paper_plan":
      return singleAction({
        type: "open_paper",
        labelKo: "모의매매 계획 검토",
        descriptionKo:
          "모의매매 화면을 엽니다. 세션 시작은 사용자가 승인합니다.",
        href: factValue(facts, "권장 이동 경로") ?? "/paper-trading",
        requiresApproval: true,
      });
    case "research_workspace": {
      const href = factValue(facts, "권장 이동 경로") ?? "/dashboard";
      return singleAction({
        type: "navigate",
        labelKo: factValue(facts, "권장 다음 작업") ?? "다음 단계 열기",
        descriptionKo: factValue(facts, "권장 사유"),
        href,
        requiresApproval:
          href.includes("/paper-trading") || href.includes("/backtest"),
      });
    }
    case "cancel_pending":
      return [];
    case "explain_approval": {
      const href = factValue(facts, "권장 이동 경로");
      if (!href) return [];
      return singleAction({
        type: "navigate",
        labelKo: factValue(facts, "권장 다음 작업") ?? "계획 검토",
        descriptionKo:
          "화면만 열립니다. 엔진은 자동 실행되지 않습니다.",
        href,
        requiresApproval: true,
      });
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
      factIdValue(facts, "후보 전략 ID") ??
      factIdValue(facts, "전략 ID") ??
      factIdValue(facts, "SAFE 전략 ID") ??
      null,
    runId:
      factIdValue(facts, "최근 실행 ID") ??
      factIdValue(facts, "관련 백테스트") ??
      null,
    jobId:
      factIdValue(facts, "작업 ID") ??
      factIdValue(facts, "탐색 작업 ID") ??
      factIdValue(facts, "최근 작업 ID") ??
      null,
    symbol:
      factIdValue(facts, "심볼") ??
      factIdValue(facts, "비교 심볼 A") ??
      factIdValue(facts, "최근 작업 심볼") ??
      null,
    timeframe: factIdValue(facts, "타임프레임"),
    paperSessionId: factIdValue(facts, "활성 Paper 세션"),
  });
}

// ─── Local fallback interpretation ───────────────────────────────────────────

export function buildLocalInterpretation(
  intent: AgentIntent,
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
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
    case "paper_status":
    case "paper_start_request":
      return buildPaperStartInterpretation(facts);
    case "search_failure_explanation":
      return buildSearchFailureInterpretation(facts);
    case "workspace_status":
    case "recommend_next":
      return buildRecommendNextInterpretation(facts);
    case "first_run_help":
      return buildFirstRunInterpretation(facts);
    case "demo_overview":
      return buildDemoOverviewInterpretation(facts);
    case "follow_up_why":
      return buildFollowUpWhyInterpretation(facts, entities);
    case "explain_approval":
      return buildDecisionContext("explain_approval", facts, entities)
        .explanationKo;
    case "explain_waiting":
      return buildDecisionContext("explain_waiting", facts, entities)
        .explanationKo;
    case "continue_session":
      return buildDecisionContext("continue_session", facts, entities)
        .explanationKo;
    case "approve_pending":
      return buildApprovePendingInterpretation(facts, entities);
    case "cancel_pending":
      return entities?.pendingPlan || entities?.pendingProposedAction
        ? "대기 중이던 계획을 취소했습니다. 엔진은 시작되지 않았습니다."
        : "취소할 대기 계획이 없습니다.";
    case "prepare_search_plan":
      return buildPrepareSearchPlanInterpretation(facts);
    case "prepare_backtest_plan":
      return "백테스트 계획 초안을 준비했습니다. 자동 실행하지 않습니다.";
    case "prepare_paper_plan":
      return buildPaperStartInterpretation(facts);
    case "research_workspace":
      return buildRecommendNextInterpretation(facts);
    default:
      return buildUnknownInterpretation();
  }
}

function primaryActionOnly(actions: AgentAction[]): AgentAction[] {
  return actions.slice(0, 1);
}

function resolveProposedAction(
  intentType: string,
  actions: AgentAction[],
  scope: AgentScope,
  decision: DecisionContext,
  explicit?: ProposedAction | null,
): ProposedAction | null {
  if (explicit) return explicit;
  if (intentType === "approve_pending") return null;
  if (intentType === "explain_approval") return explicit ?? null;
  const primary = actions[0];
  if (!primary) return null;
  return proposedFromAgentAction(primary, scope, {
    recommendedActionKo: decision.recommendedActionKo,
  });
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
  options?: {
    entities?: ConversationEntityMemory | null;
    explicitProposedAction?: ProposedAction | null;
    explicitPlan?: AgentPlanDraft | null;
    workspace?: ResearchWorkspaceSummary | null;
    safetyBlocked?: boolean;
    safetyReasonKo?: string;
    goal?: AgentGoal | null;
    priorWorkingState?: ConversationWorkingState | null;
    decisionOverride?: Partial<DecisionContext> | null;
  },
): AgentResponse {
  const entities = options?.entities ?? emptyEntityMemory();
  const decision = {
    ...buildDecisionContext(intent.type, facts, entities),
    ...(options?.decisionOverride ?? {}),
  };

  const interpretationSource: InterpretationSource = llm?.source ?? "local";

  const conclusionKo = stripInternalIdsFromProse(decision.conclusionKo);
  const explanationKo = stripInternalIdsFromProse(decision.explanationKo);
  const interpretationKo = stripInternalIdsFromProse(
    `${conclusionKo}\n\n${explanationKo}`,
  );

  // Prefer decision prose; keep LLM text only when it doesn't inject IDs
  // and local decision already carries the judgment structure.
  const llmClean = llm?.interpretationKo
    ? stripInternalIdsFromProse(llm.interpretationKo)
    : null;
  const finalInterpretation =
    llmClean && llmClean.length > 20 && interpretationSource === "llm"
      ? `${conclusionKo}\n\n${explanationKo}`
      : interpretationKo;

  const planIntent =
    intent.type === "prepare_search_plan" ||
    intent.type === "prepare_backtest_plan" ||
    intent.type === "prepare_paper_plan" ||
    intent.type === "research_workspace";

  let rawActions =
    (intent.type === "approve_pending" ||
      intent.type === "follow_up_why" ||
      intent.type === "explain_approval" ||
      intent.type === "explain_waiting" ||
      intent.type === "continue_session") &&
    entities.pendingProposedAction
      ? [proposedActionToCardAction(entities.pendingProposedAction)]
      : planIntent && options?.explicitProposedAction
        ? [proposedActionToCardAction(options.explicitProposedAction)]
        : actionsForIntent(intent.type, facts);

  if (options?.safetyBlocked || intent.type === "cancel_pending") {
    rawActions = [];
  }

  const actions = primaryActionOnly(filterSafeActions(rawActions));
  const scope = resolveScope(intent, facts, context);
  const preserveConversationEntity = [
    "continue_session",
    "approve_pending",
    "search_status",
    "workspace_status",
    "search_pause_request",
    "search_resume_request",
    "paper_start_request",
    "paper_pause_request",
    "paper_resume_request",
    "paper_stop_request",
  ].includes(intent.type);
  const explicitProposed =
    options && "explicitProposedAction" in options
      ? (options.explicitProposedAction ?? null)
      : intent.type === "approve_pending" ||
          intent.type === "follow_up_why" ||
          intent.type === "explain_approval" ||
          intent.type === "explain_waiting" ||
          intent.type === "continue_session"
        ? entities.pendingProposedAction
        : null;
  const proposedAction =
    options?.safetyBlocked || intent.type === "cancel_pending"
      ? null
      : resolveProposedAction(
          intent.type,
          actions,
          scope,
          decision,
          explicitProposed,
        );

  // Prefer explicitPlan when provided (including null after typed-command execute).
  const plan: AgentPlanDraft | null =
    options?.safetyBlocked || intent.type === "cancel_pending"
      ? null
      : options && "explicitPlan" in options
        ? (options.explicitPlan ?? null)
        : (entities.pendingPlan ?? null);

  const lifecycleStage: PipelineLifecycleStage =
    options?.workspace?.stage ?? inferLifecycleStage(facts);
  const pinnedObjectiveKo =
    options?.workspace?.nextMilestoneKo ??
    lifecycleObjectiveKo(lifecycleStage);

  const nextPending =
    intent.type === "cancel_pending" || intent.type === "approve_pending"
      ? null
      : proposedAction;
  const nextPlan =
    options?.safetyBlocked || intent.type === "cancel_pending"
      ? null
      : planIntent
        ? plan
        : intent.type === "approve_pending"
          ? plan
          : plan ?? entities.pendingPlan;

  const entityMemory = mergeEntityMemory(entities, context, {
    strategyId: preserveConversationEntity
      ? entities.strategyId ?? scope.strategyId
      : scope.strategyId ?? entities.strategyId,
    strategyLabel: entities.strategyLabel,
    jobId: preserveConversationEntity
      ? entities.jobId ?? scope.jobId
      : scope.jobId ?? entities.jobId,
    runId: scope.runId ?? entities.runId,
    symbol: scope.symbol ?? entities.symbol,
    timeframe: scope.timeframe ?? entities.timeframe,
    paperSessionId: preserveConversationEntity
      ? entities.paperSessionId ?? scope.paperSessionId
      : scope.paperSessionId ?? entities.paperSessionId,
    lifecycleStage: lifecycleStage,
    previousRecommendation: decision.recommendedActionKo,
    previousConclusion: conclusionKo,
    previousReason: explanationKo,
    pendingProposedAction: nextPending,
    pendingPlan: nextPlan,
    pinnedObjectiveKo,
    pipelineStage: lifecycleStage,
  });

  // Ensure empty evidence has an explicit operator-facing note
  const factsOut =
    facts.length === 0
      ? [
          {
            labelKo: "검증된 증거",
            value: "검증된 증거가 없습니다.",
            source: "system_status" as const,
            fetchedAt: new Date().toISOString(),
          },
        ]
      : facts;

  const goal = options?.goal ?? null;
  const conversationState = advanceConversationState({
    prior: options?.priorWorkingState,
    goal: goal ?? "recommend_next",
    lifecycleStage,
    entities: entityMemory,
    plan: nextPlan,
    proposedAction: nextPending,
    objectiveKo: pinnedObjectiveKo,
    conclusionKo,
    explanationKo,
    recommendationKo: decision.recommendedActionKo,
  });

  const missionTimeline = buildMissionTimeline({
    entities: entityMemory,
    workspace: options?.workspace ?? null,
    workingState: conversationState,
    pendingAction: nextPending,
    pendingPlan: nextPlan,
  });

  return {
    intentType: intent.type,
    conclusionKo,
    explanationKo,
    facts: factsOut,
    interpretationKo: finalInterpretation,
    recommendedActionKo: stripInternalIdsFromProse(decision.recommendedActionKo),
    interpretationSource,
    providerMeta: llm?.providerMeta,
    actions,
    proposedAction,
    plan: nextPlan,
    decision: {
      situationKo: decision.situationKo,
      meaningKo: decision.meaningKo,
      whyMattersKo: decision.whyMattersKo,
      recommendedActionKo: decision.recommendedActionKo,
      whyBetterThanAlternativesKo: decision.whyBetterThanAlternativesKo,
      uncertaintyKo: decision.uncertaintyKo,
      conclusionKo: decision.conclusionKo,
      explanationKo: decision.explanationKo,
      evidenceKeys: decision.evidenceKeys,
    },
    lifecycleStage,
    pinnedObjectiveKo,
    workspace: options?.workspace ?? null,
    entityMemory,
    scope,
    safetyBlocked: options?.safetyBlocked === true,
    safetyReasonKo: options?.safetyReasonKo,
    respondedAt: new Date().toISOString(),
    followUpSuggestions: followUpsForIntent(intent.type),
    conversationState,
    goal,
    missionTimeline,
  };
}

export { buildDecisionContext };
