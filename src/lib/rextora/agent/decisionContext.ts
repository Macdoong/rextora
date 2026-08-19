/**
 * Deterministic decision context built ONLY from verified FactItem values.
 * LLM may interpret this context — never invent decision inputs.
 */

import type { AgentIntentType, FactItem } from "./types";
import type { ConversationEntityMemory } from "./conversationContext";
import { stripInternalIdsFromProse } from "./conversationContext";

export interface DecisionContext {
  intentType: AgentIntentType;
  situationKo: string;
  meaningKo: string;
  whyMattersKo: string;
  recommendedActionKo: string;
  whyBetterThanAlternativesKo: string;
  uncertaintyKo: string | null;
  conclusionKo: string;
  explanationKo: string;
  evidenceKeys: string[];
}

function fv(facts: FactItem[], label: string): string | undefined {
  return facts.find((f) => f.labelKo === label)?.value;
}

function hasIncompleteEvidence(facts: FactItem[]): string | null {
  const missing = facts.find(
    (f) =>
      f.value === "없음" ||
      f.value.startsWith("아니오") ||
      f.labelKo.includes("부족"),
  );
  if (!missing) return null;
  return `${missing.labelKo}: ${missing.value}`;
}

export function buildDecisionContext(
  intentType: AgentIntentType,
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const uncertainty = hasIncompleteEvidence(facts);

  switch (intentType) {
    case "first_run_help":
    case "recommend_next":
    case "workspace_status":
    case "research_workspace":
      return buildRecommendDecision(intentType, facts, entities);
    case "research_analysis": {
      const summary = fv(facts, "연구 분석") ?? "저장된 연구 증거가 부족합니다.";
      const reason = fv(facts, "연구 근거") ?? "실제 저장 결과만 사용했습니다.";
      return {
        intentType,
        situationKo: "연구 증거 분석",
        meaningKo: summary,
        whyMattersKo: "완료된 결과 전에는 개선이나 성과를 확정하지 않습니다.",
        recommendedActionKo: fv(facts, "권장 다음 작업") ?? "누락된 연구 증거를 먼저 보완하세요.",
        whyBetterThanAlternativesKo: "저장된 증거에 연결된 결정만 허용합니다.",
        uncertaintyKo: uncertainty,
        conclusionKo: summary,
        explanationKo: reason,
        evidenceKeys: facts.map((fact) => fact.labelKo),
      };
    }
    case "memory_recall": {
      const recalled = facts.filter((fact) => fact.labelKo === "검증된 기억");
      const summary = recalled.length > 0
        ? recalled.map((fact) => fact.value).join(" ")
        : "아직 실제 결과에 연결된 장기 기억이 없습니다.";
      return {
        intentType,
        situationKo: "검증된 장기 기억 확인",
        meaningKo: summary,
        whyMattersKo: "승인과 실제 종료 결과에 연결된 기록만 회상합니다.",
        recommendedActionKo: "필요하면 연결된 증거를 확인하세요.",
        whyBetterThanAlternativesKo: "대화 추측 대신 서버의 검증 기록을 사용합니다.",
        uncertaintyKo: recalled.length > 0 ? null : "검증된 기억 없음",
        conclusionKo: summary,
        explanationKo: "각 기억은 실제 계획·작업·결과 식별자를 증거로 연결합니다.",
        evidenceKeys: facts.map((fact) => fact.labelKo),
      };
    }
    case "compare_strategies":
      return buildCompareDecision(facts);
    case "paper_status":
    case "paper_start_request":
    case "prepare_paper_plan":
      return buildPaperDecision(facts);
    case "prepare_search_plan":
      return buildSearchPlanDecision(facts);
    case "prepare_backtest_plan":
      return buildBacktestPlanDecision(facts, entities);
    case "follow_up_why":
      return buildWhyDecision(facts, entities);
    case "explain_approval":
      return buildExplainApprovalDecision(facts, entities);
    case "explain_waiting":
      return buildExplainWaitingDecision(facts, entities);
    case "continue_session":
      return buildContinueSessionDecision(facts, entities);
    case "explain_rejection":
      return buildExplainRejectionDecision(facts, entities);
    case "approve_pending":
      return buildApproveDecision(facts, entities);
    case "cancel_pending":
      return buildCancelDecision(entities);
    case "search_status":
      return buildSearchStatusDecision(facts);
    case "backtest_summary":
    case "risk_summary":
      return buildBacktestDecision(facts);
    case "execute_trade":
    case "modify_safe":
    case "start_live":
      return {
        intentType,
        situationKo: "요청이 안전 정책에 의해 차단되었습니다.",
        meaningKo: "에이전트는 실행·수정 권한이 없습니다.",
        whyMattersKo: "승인 게이트와 보호 규칙을 우회하면 안 됩니다.",
        recommendedActionKo: "승인 게이트가 있는 화면에서 직접 진행하세요.",
        whyBetterThanAlternativesKo:
          "대화형 실행은 실수·무단 주문을 만들 수 있습니다.",
        uncertaintyKo: null,
        conclusionKo: "이 요청은 실행할 수 없습니다.",
        explanationKo:
          "안전 정책상 에이전트는 실전 주문·SAFE 수정·라이브 시작을 수행하지 않습니다.",
        evidenceKeys: ["safety"],
      };
    default:
      return buildGenericDecision(intentType, facts, uncertainty);
  }
}

function buildRecommendDecision(
  intentType: AgentIntentType,
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const next = fv(facts, "권장 다음 작업") ?? "현재 파이프라인 상태를 확인하세요.";
  const reason =
    fv(facts, "권장 사유") ??
    "저장된 라이프사이클 상태 기준으로 가장 안전한 다음 단계입니다.";
  const mode = fv(facts, "최초 실행 모드");
  const completed = fv(facts, "완료됨");
  const running = fv(facts, "실행 중");
  const top =
    fv(facts, "현재 주목 전략") ??
    fv(facts, "SAFE 전략") ??
    entities?.strategyLabel ??
    null;
  const activePaper = fv(facts, "활성 Paper 세션");
  const unreviewed = fv(facts, "미검토 후보") ?? fv(facts, "통과 후보");

  const completedNum = Number.parseInt((completed ?? "0").replace(/[^\d]/g, ""), 10) || 0;
  const runningNum = Number.parseInt((running ?? "0").replace(/[^\d]/g, ""), 10) || 0;

  let conclusion = stripInternalIdsFromProse(
    `현재 연구를 확인했습니다. 권장 다음 단계는 ${next}입니다.`,
  );
  const lines: string[] = [];
  if (mode === "EMPTY" || mode === "DEMO_AVAILABLE") {
    lines.push("오늘 완료된 탐색이 없습니다.");
    lines.push("검증된 전략·백테스트 데이터가 아직 없습니다.");
  } else {
    if (runningNum > 0) {
      lines.push(`실행 중인 탐색이 ${running} 있습니다.`);
    } else if (completedNum === 0) {
      lines.push("오늘 완료된 탐색이 확인되지 않았습니다.");
    } else {
      lines.push(`완료된 탐색이 ${completed} 있습니다.`);
    }
    if (top && top !== "없음") {
      lines.push(`최근 검증·주목 전략은 ${top}입니다.`);
    }
    if (activePaper && activePaper !== "없음") {
      lines.push("모의매매 세션이 활성 상태입니다.");
    } else {
      lines.push("활성 모의매매 세션은 없습니다.");
    }
  }
  lines.push(stripInternalIdsFromProse(reason));
  if (next.includes("탐색") || next.includes("계획")) {
    lines.push("탐색 계획을 준비해 드릴까요?");
  }

  let explanation = lines.join("\n");

  if (mode === "EMPTY") {
    conclusion = "현재 연구를 확인했습니다. 데이터가 없어 데모 확인 또는 첫 탐색이 필요합니다.";
    explanation =
      "검증된 전략·탐색·백테스트가 아직 없습니다.\n데모로 흐름을 보거나 실제 탐색 계획을 준비하는 것이 맞습니다.\n탐색 계획을 준비해 드릴까요?";
  } else if (completedNum > 0 && !next.includes("모의")) {
    conclusion =
      "현재 연구를 확인했습니다. 새 탐색보다 기존 결과 검토가 우선입니다.";
    explanation =
      reason && reason !== "저장된 라이프사이클 상태 기준으로 가장 안전한 다음 단계입니다."
        ? `${lines.slice(0, -1).join("\n")}\n${reason}`
        : unreviewed && unreviewed !== "없음"
          ? `완료된 탐색 결과가 있고, 아직 검증·검토가 끝나지 않은 후보가 남아 있습니다.\n지금은 결과 검토가 먼저입니다.`
          : explanation;
  } else if (entities?.pendingProposedAction) {
    conclusion = `이어서 ${entities.pendingProposedAction.summary}를 진행하는 것이 좋습니다.`;
    explanation =
      entities.previousReason ?? entities.pendingProposedAction.reason;
  }

  return {
    intentType,
    situationKo: mode ? `최초 실행 모드 ${mode}` : "라이프사이클 권장 상태",
    meaningKo: conclusion,
    whyMattersKo: explanation,
    recommendedActionKo: next,
    whyBetterThanAlternativesKo:
      "근거 없는 새 탐색·중복 Paper 세션보다, 이미 있는 증거를 먼저 쓰는 편이 안전합니다.",
    uncertaintyKo: hasIncompleteEvidence(facts),
    conclusionKo: conclusion,
    explanationKo: explanation,
    evidenceKeys: ["권장 다음 작업", "권장 사유", "최초 실행 모드", "완료됨"],
  };
}

function buildBacktestPlanDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const strategy =
    fv(facts, "현재 주목 전략") ??
    fv(facts, "매칭된 전략") ??
    entities?.strategyLabel ??
    "선택 전략";
  const symbol = fv(facts, "심볼") ?? entities?.symbol ?? "BTCUSDT";
  return {
    intentType: "prepare_backtest_plan",
    situationKo: "백테스트 계획 초안",
    meaningKo: `${strategy} 백테스트 계획을 준비했습니다.`,
    whyMattersKo: "에이전트는 백테스트를 자동 실행하지 않습니다.",
    recommendedActionKo: "백테스트 계획 검토",
    whyBetterThanAlternativesKo:
      "즉시 실행보다 계획 검토 후 기존 백테스트 화면에서 승인하는 편이 안전합니다.",
    uncertaintyKo: null,
    conclusionKo: `${strategy} · ${symbol} 백테스트 계획을 준비했습니다. 아직 실행되지 않았습니다.`,
    explanationKo:
      "심볼·전략 범위만 초안으로 잡았습니다. 승인 후 백테스트 화면에서 직접 실행하세요.",
    evidenceKeys: ["심볼", "현재 주목 전략", "전략 ID"],
  };
}

function buildExplainApprovalDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const pending = entities?.pendingProposedAction;
  const planTitle =
    entities?.pendingPlan?.titleKo ??
    fv(facts, "계획 종류") ??
    pending?.summary ??
    null;
  const route =
    pending?.targetRoute ??
    fv(facts, "권장 이동 경로") ??
    entities?.pendingPlan?.reviewRoute ??
    null;

  if (!pending && !entities?.pendingPlan) {
    return {
      intentType: "explain_approval",
      situationKo: "대기 중인 승인 없음",
      meaningKo: "지금 승인할 제안이 없습니다.",
      whyMattersKo: "승인 전에는 엔진이 시작되지 않습니다.",
      recommendedActionKo: "원하는 다음 작업을 말씀해 주세요.",
      whyBetterThanAlternativesKo: "없는 승인을 가장하지 않습니다.",
      uncertaintyKo: null,
      conclusionKo:
        "현재 승인 대기 중인 계획이 없습니다. 탐색·백테스트·모의매매 계획을 먼저 준비할 수 있습니다.",
      explanationKo:
        "승인하면 화면만 열리며 Search/Backtest/Paper/Live 엔진은 자동 실행되지 않습니다.",
      evidenceKeys: ["대기 제안"],
    };
  }

  const whatHappens = [
    "대화에서 승인하면 관련 화면으로 이동합니다.",
    "엔진(탐색·백테스트·모의매매·실전)은 자동으로 시작되지 않습니다.",
    "실제 시작·실행은 해당 화면의 승인 게이트에서 사용자가 직접 결정합니다.",
    route ? `이동 경로: ${route.startsWith("/") ? "전문가 화면" : route}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    intentType: "explain_approval",
    situationKo: planTitle
      ? `승인 대기: ${planTitle}`
      : "승인 대기 중인 제안이 있습니다.",
    meaningKo: "승인은 화면 이동·검토 권한이지 엔진 실행이 아닙니다.",
    whyMattersKo:
      "실수로 자동 실행되는 것을 막기 위해 승인과 실행을 분리했습니다.",
    recommendedActionKo: pending?.summary ?? "계획 검토",
    whyBetterThanAlternativesKo:
      "대화에서 바로 실행하는 것보다 화면 게이트를 거치는 편이 안전합니다.",
    uncertaintyKo: null,
    conclusionKo: planTitle
      ? `「${planTitle}」을 승인하면 관련 화면이 열립니다. 아직 실행되지 않습니다.`
      : "승인하면 관련 화면이 열립니다. 엔진은 자동 시작되지 않습니다.",
    explanationKo: whatHappens,
    evidenceKeys: ["대기 제안", "권장 이동 경로", "실행 여부"],
  };
}

function buildCancelDecision(
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const had = Boolean(entities?.pendingProposedAction || entities?.pendingPlan);
  return {
    intentType: "cancel_pending",
    situationKo: had ? "대기 계획 취소" : "취소할 계획 없음",
    meaningKo: had
      ? "대기 중이던 계획·제안을 취소했습니다."
      : "취소할 대기 계획이 없습니다.",
    whyMattersKo: "엔진은 시작되지 않았으며, 초안만 제거됩니다.",
    recommendedActionKo: "원하는 다음 작업을 말씀해 주세요.",
    whyBetterThanAlternativesKo: "없는 실행을 강제하지 않습니다.",
    uncertaintyKo: null,
    conclusionKo: had
      ? "계획을 취소했습니다. 아무 엔진도 실행되지 않았습니다."
      : "취소할 대기 계획이 없습니다.",
    explanationKo: "원하시면 새 탐색·백테스트·모의매매 계획을 다시 준비해 드리겠습니다.",
    evidenceKeys: [],
  };
}

function buildCompareDecision(facts: FactItem[]): DecisionContext {
  const can = fv(facts, "비교 가능");
  const a = fv(facts, "비교 심볼 A");
  const b = fv(facts, "비교 심볼 B");
  if (!can || can.startsWith("아니오")) {
    const missing = can ?? "검증된 데이터가 부족합니다.";
    return {
      intentType: "compare_strategies",
      situationKo: "심볼 비교 불가",
      meaningKo: "한쪽 검증 데이터가 없어 공정 비교를 할 수 없습니다.",
      whyMattersKo: "추정 수치로 순위를 매기면 잘못된 결정을 유도합니다.",
      recommendedActionKo: "부족한 심볼의 백테스트를 먼저 실행하세요.",
      whyBetterThanAlternativesKo:
        "불완전 비교보다 누락된 검증을 채우는 것이 올바른 다음 단계입니다.",
      uncertaintyKo: missing,
      conclusionKo: `${a ?? "한 심볼"}과 ${b ?? "다른 심볼"}을 지금은 비교할 수 없습니다.`,
      explanationKo: `${missing} 추정 성과를 만들지 않습니다.`,
      evidenceKeys: ["비교 가능", "비교 심볼 A", "비교 심볼 B"],
    };
  }
  const winner = fv(facts, "지표 우위 심볼");
  return {
    intentType: "compare_strategies",
    situationKo: `${a} vs ${b}`,
    meaningKo: winner
      ? `검증된 지표 기준 상대 우위는 ${winner}입니다.`
      : "양 심볼 지표가 유사합니다.",
    whyMattersKo: "동일 기간·비용 가정의 저장된 백테스트만 사용했습니다.",
    recommendedActionKo: "Results에서 추천 후보를 검토하세요.",
    whyBetterThanAlternativesKo:
      "즉시 Paper/Live로 가기보다 비교 근거를 다시 확인하는 편이 안전합니다.",
    uncertaintyKo: null,
    conclusionKo: winner
      ? `검증 데이터 기준으로는 ${winner} 쪽이 상대적으로 낫습니다.`
      : `${a}와 ${b}의 검증 지표가 비슷합니다.`,
    explanationKo: `저장된 최신 백테스트만 비교했습니다. 최종 선택은 동일 조건 재검증 후 승인하세요.`,
    evidenceKeys: ["비교 가능", "지표 우위 심볼"],
  };
}

function buildPaperDecision(facts: FactItem[]): DecisionContext {
  const candidate = fv(facts, "후보 전략");
  const eligible = fv(facts, "후보 Paper 자격");
  const active = fv(facts, "활성 Paper 세션");
  const pending = fv(facts, "대기 중 Paper 세션") ?? fv(facts, "Paper 세션 상태");

  if (pending && /pending|승인|대기/i.test(pending)) {
    return {
      intentType: "paper_start_request",
      situationKo: "Paper 승인 대기",
      meaningKo: "이미 승인 대기 세션이 있습니다.",
      whyMattersKo: "새 세션을 또 만들면 상태가 혼란해집니다.",
      recommendedActionKo: "기존 Paper 세션을 검토하고 승인하세요.",
      whyBetterThanAlternativesKo:
        "중복 세션 생성보다 대기 중인 승인 게이트를 처리하는 것이 맞습니다.",
      uncertaintyKo: null,
      conclusionKo: "새 세션을 만들지 말고, 대기 중인 Paper 승인을 먼저 확인하세요.",
      explanationKo: `세션 상태: ${pending}. 에이전트는 Paper를 자동 시작하지 않습니다.`,
      evidenceKeys: ["대기 중 Paper 세션", "Paper 세션 상태"],
    };
  }

  const blocked =
    eligible &&
    (eligible.includes("불가") ||
      eligible.includes("차단") ||
      eligible.startsWith("아니오"));

  return {
    intentType: "paper_start_request",
    situationKo: candidate ? `후보 ${candidate}` : "Paper 후보 없음",
    meaningKo: blocked
      ? `Paper 자격이 통과하지 못했습니다: ${eligible}`
      : "Paper는 승인 후에만 시작할 수 있습니다.",
    whyMattersKo: "모의매매도 명시 승인 게이트를 통과해야 합니다.",
    recommendedActionKo: "모의매매 화면을 열고 승인하세요.",
    whyBetterThanAlternativesKo:
      "에이전트 자동 시작은 금지되어 있으며, 화면에서 직접 승인하는 경로만 허용됩니다.",
    uncertaintyKo: !candidate || candidate === "없음" ? "Paper 가능 전략 없음" : null,
    conclusionKo: blocked
      ? `이 전략은 Paper로 바로 돌릴 수 없습니다. 실패 게이트: ${eligible}.`
      : candidate && candidate !== "없음"
        ? `"${candidate}"를 Paper로 검토할 준비가 되었습니다. 에이전트는 자동 시작하지 않습니다.`
        : "Paper 가능 전략이 확인되지 않았습니다. 에이전트는 자동 시작하지 않습니다.",
    explanationKo:
      active && active !== "없음"
        ? `이미 활성 Paper 세션이 있습니다. 새 시작 전 기존 세션을 점검하세요. 화면만 열리며 승인 후 시작합니다.`
        : "화면만 열리며, 세션 시작은 사용자가 승인해야 합니다. 자동 시작하지 않습니다.",
    evidenceKeys: ["후보 전략", "후보 Paper 자격", "활성 Paper 세션"],
  };
}

function buildSearchPlanDecision(facts: FactItem[]): DecisionContext {
  const symbol = fv(facts, "초안 심볼") ?? "BTCUSDT";
  const tf = fv(facts, "초안 타임프레임") ?? "15m";
  const patterns = fv(facts, "초안 패턴") ?? "Order Block + FVG";
  const why = fv(facts, "초안 사유") ?? "지원되는 기본 탐색 스키마입니다.";
  return {
    intentType: "prepare_search_plan",
    situationKo: "탐색 계획 초안",
    meaningKo: `${symbol} ${tf} 탐색 계획을 준비할 수 있습니다.`,
    whyMattersKo: why,
    recommendedActionKo: "탐색 계획 검토",
    whyBetterThanAlternativesKo:
      "즉시 실행보다 검증된 스키마로 계획을 먼저 확인하는 편이 안전합니다.",
    uncertaintyKo: fv(facts, "데이터 공백") ?? null,
    conclusionKo: `${symbol} ${tf} · ${patterns} 설정으로 탐색 계획을 준비하는 것을 권장합니다.`,
    explanationKo: why,
    evidenceKeys: ["초안 심볼", "초안 타임프레임", "초안 패턴", "초안 사유"],
  };
}

function buildWhyDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const reason =
    entities?.previousReason ??
    fv(facts, "권장 사유") ??
    "직전 권장은 검증된 저장 데이터에 기반합니다.";
  const conclusion =
    entities?.previousConclusion ??
    fv(facts, "권장 다음 작업") ??
    "직전 권장을 유지합니다.";
  const cleanConclusion = stripInternalIdsFromProse(
    conclusion.replace(/\.+$/, ""),
  );
  const cleanReason = stripInternalIdsFromProse(reason.replace(/\.+$/, ""));
  return {
    intentType: "follow_up_why",
    situationKo: "직전 권장 사유 설명",
    meaningKo: cleanConclusion,
    whyMattersKo: cleanReason,
    recommendedActionKo:
      entities?.pendingProposedAction?.summary ??
      fv(facts, "권장 다음 작업") ??
      "직전 권장 화면으로 이동",
    whyBetterThanAlternativesKo:
      "같은 근거로 권장을 유지하는 것이 일관된 의사결정입니다.",
    uncertaintyKo: null,
    conclusionKo: `추천 이유: ${cleanReason}`,
    explanationKo: `이전 결론: ${cleanConclusion}. 검증된 데이터만으로 권장했습니다.`,
    evidenceKeys: ["권장 사유", "권장 다음 작업"],
  };
}

function buildExplainWaitingDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const pending = entities?.pendingProposedAction ?? entities?.pendingPlan;
  if (pending) {
    const summary =
      "summary" in pending
        ? pending.summary
        : "titleKo" in pending
          ? pending.titleKo
          : "대기 중인 계획";
    return {
      intentType: "explain_waiting",
      situationKo: `승인 대기: ${summary}`,
      meaningKo: "계획이 준비되었고 사용자 승인을 기다리는 중입니다.",
      whyMattersKo:
        "승인 전에는 Search·Backtest·Paper·Live 엔진이 시작되지 않습니다.",
      recommendedActionKo: "계획 검토 후 승인하거나 취소하세요.",
      whyBetterThanAlternativesKo:
        "자동 실행 대신 승인 게이트를 유지하는 것이 안전합니다.",
      uncertaintyKo: null,
      conclusionKo: `「${summary}」을 기다리는 이유: 사용자 승인 전까지 엔진을 시작하지 않기 때문입니다.`,
      explanationKo:
        "대화에서 승인해 화면을 열어도 엔진은 자동 실행되지 않습니다. 실제 시작은 해당 화면의 승인 게이트에서 결정합니다.",
      evidenceKeys: ["pending_action"],
    };
  }
  const next = fv(facts, "권장 다음 작업") ?? "현재 연구 상태 확인";
  return {
    intentType: "explain_waiting",
    situationKo: "다음 단계 대기",
    meaningKo: "아직 승인할 계획이 없거나 선행 작업이 필요합니다.",
    whyMattersKo: fv(facts, "권장 사유") ?? "검증된 증거가 쌓일 때까지 대기합니다.",
    recommendedActionKo: next,
    whyBetterThanAlternativesKo: "근거 없이 다음 단계를 건너뛰지 않습니다.",
    uncertaintyKo: null,
    conclusionKo: `기다리는 이유: ${fv(facts, "권장 사유") ?? "검증된 다음 단계가 아직 준비되지 않았습니다."}`,
    explanationKo: `권장 다음 작업은 ${next}입니다. 엔진은 자동으로 시작되지 않습니다.`,
    evidenceKeys: ["권장 다음 작업", "권장 사유"],
  };
}

function buildContinueSessionDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const pending = entities?.pendingProposedAction;
  if (pending) {
    return {
      intentType: "continue_session",
      situationKo: "이전 작업 이어서 진행",
      meaningKo: `중단했던 「${pending.summary}」이 아직 승인 대기입니다.`,
      whyMattersKo: pending.reason,
      recommendedActionKo: pending.summary,
      whyBetterThanAlternativesKo:
        "새 작업을 만들기보다 대기 중인 계획을 먼저 정리하는 것이 좋습니다.",
      uncertaintyKo: null,
      conclusionKo: `이어서 「${pending.summary}」을 검토하세요. 엔진은 자동 실행되지 않습니다.`,
      explanationKo:
        "이전 대화의 승인 대기 항목을 복원했습니다. 승인하면 관련 화면만 열립니다.",
      evidenceKeys: ["pending_action"],
    };
  }
  const next = fv(facts, "권장 다음 작업") ?? entities?.previousRecommendation ?? "연구 현황 확인";
  const reason =
    fv(facts, "권장 사유") ??
    entities?.previousReason ??
    "검증된 라이프사이클 상태에 따라 다음 단계를 이어갑니다.";
  return {
    intentType: "continue_session",
    situationKo: "멈춘 지점에서 재개",
    meaningKo: stripInternalIdsFromProse(String(next)),
    whyMattersKo: stripInternalIdsFromProse(String(reason)),
    recommendedActionKo: String(next),
    whyBetterThanAlternativesKo:
      "세션 메모리를 사용해 같은 미션을 이어가는 것이 일관됩니다.",
    uncertaintyKo: null,
    conclusionKo: `이어서 ${stripInternalIdsFromProse(String(next))}을(를) 진행하는 것이 좋습니다.`,
    explanationKo: stripInternalIdsFromProse(String(reason)),
    evidenceKeys: ["권장 다음 작업", "권장 사유"],
  };
}

function buildExplainRejectionDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const rejected =
    fv(facts, "거부 사유") ??
    fv(facts, "탈락 사유") ??
    fv(facts, "실패 사유") ??
    entities?.pendingProposedAction?.blockedReason ??
    null;
  const strategy =
    fv(facts, "매칭된 전략") ??
    entities?.strategyLabel ??
    fv(facts, "전략 ID") ??
    "후보";
  if (rejected) {
    return {
      intentType: "explain_rejection",
      situationKo: "거부·탈락 사유",
      meaningKo: stripInternalIdsFromProse(rejected),
      whyMattersKo: "검증 규칙을 통과하지 못한 후보는 진행하지 않습니다.",
      recommendedActionKo:
        fv(facts, "권장 다음 작업") ?? "다른 후보를 검토하거나 탐색을 준비하세요.",
      whyBetterThanAlternativesKo:
        "약한 후보를 강제로 진행하는 것보다 근거 있는 대안이 안전합니다.",
      uncertaintyKo: null,
      conclusionKo: `거부 이유: ${stripInternalIdsFromProse(rejected)}`,
      explanationKo: `${stripInternalIdsFromProse(String(strategy))} 후보는 검증된 저장 데이터 기준으로 진행하지 않습니다.`,
      evidenceKeys: ["거부 사유", "탈락 사유", "실패 사유"],
    };
  }
  return {
    intentType: "explain_rejection",
    situationKo: "거부 사유 확인",
    meaningKo: "명시된 거부 사유가 저장소에 없습니다.",
    whyMattersKo: "근거 없는 추측으로 탈락을 설명하지 않습니다.",
    recommendedActionKo: "백테스트·결과 화면에서 검증 증거를 확인하세요.",
    whyBetterThanAlternativesKo: "증거가 없으면 보류하는 것이 맞습니다.",
    uncertaintyKo: "rejection reason missing",
    conclusionKo: "거부 사유를 검증된 데이터에서 찾지 못했습니다.",
    explanationKo: "백테스트 또는 탐색 결과 화면에서 탈락·실패 기록을 확인하세요.",
    evidenceKeys: [],
  };
}

function buildApproveDecision(
  facts: FactItem[],
  entities?: ConversationEntityMemory | null,
): DecisionContext {
  const pending = entities?.pendingProposedAction;
  if (!pending) {
    return {
      intentType: "approve_pending",
      situationKo: "대기 중인 제안 없음",
      meaningKo: "승인할 제안 작업이 없습니다.",
      whyMattersKo: "만료되었거나 아직 제안되지 않았습니다.",
      recommendedActionKo: "원하는 작업을 다시 말씀해 주세요.",
      whyBetterThanAlternativesKo: "없는 작업을 실행하지 않습니다.",
      uncertaintyKo: "pending action missing",
      conclusionKo: "진행할 대기 작업이 없습니다. 다시 요청해 주세요.",
      explanationKo: "제안된 작업이 없거나 만료되었습니다.",
      evidenceKeys: [],
    };
  }
  if (pending.blockedReason || pending.riskLevel === "blocked") {
    return {
      intentType: "approve_pending",
      situationKo: "제안 차단",
      meaningKo: pending.blockedReason ?? "이 제안은 실행할 수 없습니다.",
      whyMattersKo: "안전 게이트가 차단했습니다.",
      recommendedActionKo: "다른 읽기 전용 작업을 선택하세요.",
      whyBetterThanAlternativesKo: "차단된 실행을 우회하지 않습니다.",
      uncertaintyKo: null,
      conclusionKo: "이 제안은 승인해도 실행되지 않습니다.",
      explanationKo: pending.blockedReason ?? "차단됨",
      evidenceKeys: [],
    };
  }
  return {
    intentType: "approve_pending",
    situationKo: pending.summary,
    meaningKo: "대화 승인을 확인했습니다. 화면만 엽니다.",
    whyMattersKo: pending.reason,
    recommendedActionKo: pending.summary,
    whyBetterThanAlternativesKo:
      "엔진 자동 실행 없이, 기존 딥링크로 검증된 화면만 엽니다.",
    uncertaintyKo: null,
    conclusionKo: `「${pending.summary}」을 진행합니다. 화면만 열리며 엔진은 자동 실행되지 않습니다.`,
    explanationKo: pending.reason,
    evidenceKeys: ["pending_action"],
  };
}

function buildSearchStatusDecision(facts: FactItem[]): DecisionContext {
  const completed = fv(facts, "완료됨");
  const running = fv(facts, "실행 중");
  const runningNum = Number.parseInt(running ?? "0", 10);
  if (runningNum > 0) {
    return {
      intentType: "search_status",
      situationKo: "탐색 실행 중",
      meaningKo: "진행 중인 탐색이 있습니다.",
      whyMattersKo: "완료 전 새 탐색을 겹치면 리소스가 분산됩니다.",
      recommendedActionKo: "탐색 상태·결과를 확인하세요.",
      whyBetterThanAlternativesKo: "실행 중 작업을 먼저 관찰하는 것이 좋습니다.",
      uncertaintyKo: null,
      conclusionKo: "지금 실행 중인 탐색을 먼저 확인하세요.",
      explanationKo: `${running} 작업이 실행 중입니다.`,
      evidenceKeys: ["실행 중", "완료됨"],
    };
  }
  return {
    intentType: "search_status",
    situationKo: "탐색 상태",
    meaningKo: completed ? `완료된 탐색 ${completed}` : "탐색 기록 확인",
    whyMattersKo: "결과 검토가 다음 의사결정의 입력입니다.",
    recommendedActionKo: "탐색 결과 페이지에서 확인하세요.",
    whyBetterThanAlternativesKo: "상태만 보고 새 탐색을 바로 열지 않습니다.",
    uncertaintyKo: null,
    conclusionKo: "탐색 결과를 열어 현재 상태를 확인하는 것이 좋습니다.",
    explanationKo: `완료 ${completed ?? "0"}, 실행 중 ${running ?? "0"}.`,
    evidenceKeys: ["전체 탐색 작업", "완료됨", "실행 중"],
  };
}

function buildBacktestDecision(facts: FactItem[]): DecisionContext {
  const noData = facts.find(
    (f) => f.value === "없음" && f.labelKo === "저장된 백테스트",
  );
  if (noData) {
    return {
      intentType: "backtest_summary",
      situationKo: "백테스트 없음",
      meaningKo: "저장된 백테스트가 없습니다.",
      whyMattersKo: "성과 주장 전에 검증 실행이 필요합니다.",
      recommendedActionKo: "백테스트 페이지에서 실행하세요.",
      whyBetterThanAlternativesKo: "추정 성과를 말하지 않습니다.",
      uncertaintyKo: "백테스트 없음",
      conclusionKo: "아직 검토할 백테스트가 없습니다.",
      explanationKo: "백테스트를 먼저 실행한 뒤 다시 물어봐 주세요.",
      evidenceKeys: ["저장된 백테스트"],
    };
  }
  const totalReturn = fv(facts, "총 수익률");
  return {
    intentType: "backtest_summary",
    situationKo: "백테스트 요약",
    meaningKo: totalReturn
      ? `최근 저장된 총 수익률 ${totalReturn}`
      : "저장된 백테스트가 있습니다.",
    whyMattersKo: "의사결정은 저장된 실행 증거에만 근거해야 합니다.",
    recommendedActionKo: "백테스트 페이지에서 증거를 상세 검토하세요.",
    whyBetterThanAlternativesKo: "요약만으로 Paper/Live로 가지 않습니다.",
    uncertaintyKo: null,
    conclusionKo: "저장된 백테스트 증거를 먼저 상세 검토하세요.",
    explanationKo: totalReturn
      ? `총 수익률 ${totalReturn}. MDD·거래 수와 함께 확인하세요.`
      : "상세 지표는 백테스트 화면에서 확인하세요.",
    evidenceKeys: ["총 수익률", "최대 낙폭(MDD)", "거래 횟수"],
  };
}

function buildGenericDecision(
  intentType: AgentIntentType,
  facts: FactItem[],
  uncertainty: string | null,
): DecisionContext {
  const next = fv(facts, "권장 다음 작업") ?? "대시보드에서 상태를 확인하세요.";
  return {
    intentType,
    situationKo: intentType,
    meaningKo: "검증된 저장 데이터를 바탕으로 안내합니다.",
    whyMattersKo: "추정 없이 실제 데이터만 사용합니다.",
    recommendedActionKo: next,
    whyBetterThanAlternativesKo: "근거 없는 실행보다 확인이 우선입니다.",
    uncertaintyKo: uncertainty,
    conclusionKo: stripInternalIdsFromProse(next),
    explanationKo: uncertainty
      ? `일부 증거가 불완전합니다 (${uncertainty}).`
      : "검증된 사실만 반영했습니다.",
    evidenceKeys: facts.slice(0, 6).map((f) => f.labelKo),
  };
}
