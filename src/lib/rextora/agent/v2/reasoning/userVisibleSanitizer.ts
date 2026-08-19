/**
 * Central boundary for operator-visible Agent prose.
 * Technical values belong in collapsed evidence / dev details only.
 */

const INTERNAL_ERROR_KO: Record<string, string> = {
  STRATEGY_DEPENDENCIES_REQUIRE_DETACH:
    "이 전략은 다른 기록에서 사용 중이므로 연결 관계를 먼저 해제해야 삭제할 수 있습니다.",
  STRATEGY_DELETE_BLOCKED:
    "이 전략은 보호되어 있어 지금 삭제할 수 없습니다.",
  ITERATION_REQUIRED: "삭제 또는 승격을 진행하려면 대상 후보를 먼저 지정해 주세요.",
  STRATEGY_NOT_FOUND: "요청하신 전략을 찾을 수 없습니다.",
};

const GOAL_KO: Record<string, string> = {
  prepare_search: "탐색 준비",
  prepare_backtest: "백테스트 준비",
  prepare_paper: "모의매매 준비",
  recommend_next: "다음 단계 안내",
  explain_why: "근거 설명",
  explain_approval: "승인 설명",
  explain_waiting: "대기 사유 설명",
  explain_rejection: "거부 사유 설명",
  continue_session: "이어서 진행",
  approve: "승인",
  cancel: "취소",
  risk_review: "리스크 검토",
  research_status: "연구 상태 확인",
  search_status: "탐색 상태 확인",
  backtest_summary: "백테스트 요약",
  compare: "비교",
  explain_strategy: "전략 설명",
  paper_start: "모의매매 시작",
  first_run: "첫 실행 안내",
  demo: "데모 안내",
  blocked_execute: "실행 차단",
  blocked_safe: "SAFE 보호",
  blocked_live: "실거래 차단",
  lifecycle_fallback: "다음 단계 안내",
  plan_search: "탐색 계획",
  pause_search: "탐색 일시 정지",
  execute_approved_plan: "승인된 계획 실행",
};

const INTENT_KO: Record<string, string> = {
  prepare_search_plan: "탐색 계획 준비",
  prepare_backtest_plan: "백테스트 계획 준비",
  prepare_paper_plan: "모의매매 계획 준비",
  approve_pending: "대기 중인 계획 승인",
  cancel_pending: "대기 계획 취소",
  search_status: "탐색 진행 상황",
  approved_execution: "진행 상황을 확인하세요",
  research_analysis: "연구 분석",
  memory_recall: "이전 결정 회고",
  inform_user: "",
};

const FORBIDDEN_PRIMARY_PATTERNS: RegExp[] = [
  /\bpatternConfigLevel\b/i,
  /\bpatternSelectionMode\b/i,
  /\bselectedSpaceIds\b/i,
  /\bcombinationOperator\b/i,
  /\bfailurePolicy\b/i,
  /\bleverageMode\b/i,
  /\brequestHash\b/i,
  /\bidempotencyKey\b/i,
  /\bexchangeCalled\b/i,
  /\bpatterns\s*=/i,
  /\bsymbol\s*=/i,
  /\btimeframe\s*=/i,
  /\bsearch\.[a-z_]+\b/i,
  /\bbacktest\.[a-z_]+\b/i,
  /\bpaper\.[a-z_]+\b/i,
  /\bstrategy\.[a-z_]+\b/i,
  /\bprepare_search_plan\b/i,
  /\bprepare_backtest_plan\b/i,
  /\bprepare_paper_plan\b/i,
  /\bprepare_backtest\b/i,
  /\bprepare_search\b/i,
  /\bprepare_paper\b/i,
  /\bapprove_pending\b/i,
  /\bapproved_execution\b/i,
  /\binform_user\b/i,
  /\bsearch_status\b/i,
  /\bmonitoring\b/i,
  /\bpending_approval\b/i,
  /\bqueued\b/i,
  /\brunning\b/i,
  /\bcancel_requested\b/i,
  /\b(?:paper_active|paper_ready|search_running|search_needed|search_failed|results_review|backtest_needed|backtest_review|live_review)\b/i,
  /\b(?:Paper\s+)?approval\s+(?:state|status|pending)\b/i,
  /\bcmd_[a-f0-9]+\b/i,
  /\bpa_[a-f0-9]+\b/i,
  /\bsearch_[a-f0-9-]{8,}\b/i,
  /\bbt_[a-z0-9_]+\b/i,
  /\bSTRATEGY_DEPENDENCIES_REQUIRE_DETACH\b/,
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  /(?:^|\n)\s*(?:None|null|undefined)\s*\.?\s*(?=\n|$)/i,
  /\{[^}]*"[^"]+"\s*:/,
  /\[\s*"[^"]+"\s*,/,
];

const SECTION_LABEL_PATTERNS: RegExp[] = [
  /^현재 상황\s*[·•]/gm,
  /^라이프사이클 권장 상태\s*[·•]/gm,
  /^승인된 명령 실행 결과\s*[·•]/gm,
  /^검증된 API\/저장소 결과\.?/gm,
];

export function mapInternalErrorCodeToOperatorKo(code: string): string | null {
  const key = code.trim().toUpperCase();
  if (INTERNAL_ERROR_KO[key]) return INTERNAL_ERROR_KO[key];
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(key)) {
    return "요청을 완료하지 못했습니다. 관련 의존성이나 보호 규칙을 확인한 뒤 다시 시도해 주세요.";
  }
  return null;
}

export function mapGoalToOperatorKo(goal: string | null | undefined): string {
  if (!goal?.trim()) return "작업";
  return GOAL_KO[goal.trim()] ?? INTENT_KO[goal.trim()] ?? "작업";
}

/** Map raw tool/execution errors into operator Korean while keeping codes for audits. */
export function mapInternalErrorToOperatorKo(
  message: string | null | undefined,
): { operatorKo: string; code: string | null } {
  if (!message?.trim()) {
    return { operatorKo: "일부 단계 실행에 실패했습니다.", code: null };
  }
  const codeMatch = message.match(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/);
  const code = codeMatch?.[1] ?? null;
  if (code) {
    const mapped = mapInternalErrorCodeToOperatorKo(code);
    if (mapped) {
      const remainder = message
        .replace(code, "")
        .replace(/^[:\s]+/, "")
        .replace(/\b(?:paper|session)_[a-z0-9_-]+\b/gi, "")
        .replace(/\bSAFE_v\d+_[a-z0-9_-]+\b/gi, "")
        .trim();
      if (code === "STRATEGY_DEPENDENCIES_REQUIRE_DETACH") {
        return { operatorKo: mapped, code };
      }
      if (remainder && !/^[A-Z0-9_:,-]+$/.test(remainder)) {
        return {
          operatorKo: sanitizePrimaryUserText(`${mapped} ${remainder}`),
          code,
        };
      }
      return { operatorKo: mapped, code };
    }
  }
  return { operatorKo: sanitizePrimaryUserText(message), code };
}

export function containsForbiddenPrimaryText(text: string): string[] {
  const hits: string[] = [];
  for (const re of FORBIDDEN_PRIMARY_PATTERNS) {
    if (re.test(text)) hits.push(re.source);
    re.lastIndex = 0;
  }
  return hits;
}

export function sanitizePrimaryUserText(text: string | null | undefined): string {
  if (!text?.trim()) return "";

  let out = text
    .replace(/strategy-search job already (?:running|진행 중)\s*:\s*\S+/gi, "해당 탐색은 이미 진행 중입니다.")
    .replace(/cannot (?:pause|start|resume) strategy-search job in status\s*:\s*\S+/gi, "현재 탐색 상태에서는 요청한 변경을 적용할 수 없습니다.")
    .replace(/strategy-search/gi, "탐색")
    .replace(/\bSTRATEGY_DEPENDENCIES_REQUIRE_DETACH(?:[:\s][^\n]*)?/g, INTERNAL_ERROR_KO.STRATEGY_DEPENDENCIES_REQUIRE_DETACH)
    .replace(/\bSTRATEGY_DELETE_BLOCKED(?:[:\s][^\n]*)?/g, INTERNAL_ERROR_KO.STRATEGY_DELETE_BLOCKED)
    .replace(/\bITERATION_REQUIRED\b/g, INTERNAL_ERROR_KO.ITERATION_REQUIRED)
    .replace(/\bSTRATEGY_NOT_FOUND(?:[:\s][^\n]*)?/gi, INTERNAL_ERROR_KO.STRATEGY_NOT_FOUND)
    .replace(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:[:\s][^\n]*)?/g, (_m, code: string) => {
      return mapInternalErrorCodeToOperatorKo(code) ?? "요청을 완료하지 못했습니다.";
    })
    .replace(/\b(search|backtest|paper|strategy|results)\.[a-z_]+\b/gi, "")
    .replace(/\bpatternConfigLevel\b(?:\s*[:=]\s*\S+|\s*\([^)]*\))?/gi, "패턴 설정 수준")
    .replace(/\bpatternSelectionMode\b(?:\s*[:=]\s*\S+|\s*\([^)]*\))?/gi, "패턴 선택 방식")
    .replace(/\bselectedSpaceIds\b(?:\s*[:=]\s*\[[^\]]*\]|\s*[:=]\s*\S+)?/gi, "선택된 패턴")
    .replace(/\bcombinationOperator\b(?:\s*[:=]\s*\S+|\s*\([^)]*\))?/gi, "조합 방식")
    .replace(/\bfailurePolicy\b(?:\s*[:=]\s*\S+|\s*\([^)]*\))?/gi, "실패 처리")
    .replace(/\bleverageMode\b(?:\s*[:=]\s*\S+|\s*\([^)]*\))?/gi, "레버리지 방식")
    .replace(/\bparamsHash\s*[=:]\s*\S+/gi, "")
    .replace(/\bstrategyHash\s*[=:]\s*\S+/gi, "")
    .replace(/\brequestHash\b(?:\s*[:=]\s*\S+)?/gi, "")
    .replace(/\bidempotencyKey\b(?:\s*[:=]\s*\S+)?/gi, "")
    .replace(/\bexchangeCalled\b(?:\s*[:=]\s*(?:true|false))?/gi, "")
    .replace(/\bpatterns\s*=\s*[^·\n]+/gi, "")
    .replace(/\bsymbol\s*=\s*\S+/gi, "")
    .replace(/\btimeframe\s*=\s*\S+/gi, "")
    .replace(/\b(jobId|strategyId|runId|sessionId|reasoningId)\s*[:=]\s*\S+/gi, "")
    .replace(/\bsearch_[a-f0-9-]{8,}\b/gi, "해당 탐색")
    .replace(/\bbt_[a-z0-9_-]{6,}\b/gi, "해당 백테스트")
    .replace(/\bstrat_[a-z0-9_-]{6,}\b/gi, "해당 전략")
    .replace(/\bSAFE_v\d+_[a-z0-9_-]+\b/gi, "보호된 SAFE 전략")
    .replace(/\bpaper_active\b/gi, "모의매매 진행 중")
    .replace(/\bpaper_ready\b/gi, "모의매매 준비")
    .replace(/\bsearch_running\b/gi, "탐색 진행 중")
    .replace(/\bsearch_needed\b/gi, "탐색 필요")
    .replace(/\bsearch_failed\b/gi, "탐색 실패 검토")
    .replace(/\bresults_review\b/gi, "결과 검토")
    .replace(/\bbacktest_needed\b/gi, "백테스트 필요")
    .replace(/\bbacktest_review\b/gi, "백테스트 검토")
    .replace(/\blive_review\b/gi, "실전 승인 검토")
    .replace(/\b(?:Paper\s+)?approval\s+(?:state|status)\b/gi, "모의매매 승인 상태")
    .replace(/\b(?:Paper\s+)?approval\s+pending\b/gi, "모의매매 승인 대기")
    .replace(/\b(?:paper|session)_[a-z0-9_-]{6,}\b/gi, "해당 모의매매")
    .replace(/\brun_[a-z0-9_-]{6,}\b/gi, "해당 실행")
    .replace(/\bcmd_[a-f0-9]+\b/gi, "")
    .replace(/\bpa_[a-f0-9]+\b/gi, "")
    .replace(/검증된 API\/저장소 결과[^.\n]*\.?/gi, "")
    .replace(/\bpending_approval\b/gi, "최종 승인 대기")
    .replace(/\bcancel_requested\b/gi, "취소 처리 중")
    .replace(/\bqueued\b/gi, "대기열에 등록됨")
    .replace(/\brunning\b/gi, "진행 중")
    .replace(/\bcompleted\b/gi, "완료됨")
    .replace(/\bcancelled\b/gi, "취소됨")
    .replace(/\bfailed\b/gi, "실패함")
    .replace(/\bmonitoring\b/gi, "진행 상황을 확인하는 중")
    .replace(/\bBTCUSDT\b/gi, "비트코인")
    .replace(/\bETHUSDT\b/gi, "이더리움")
    .replace(/\bOrder\s*Block\b/gi, "오더블럭")
    .replace(/\bFair\s*Value\s*Gap\b/gi, "가격 불균형")
    .replace(/\bFVG\b/g, "가격 불균형")
    .replace(/\b15m\b/gi, "15분봉")
    .replace(/\b1h\b/gi, "1시간봉")
    .replace(/\b4h\b/gi, "4시간봉")
    .replace(/\b1d\b/gi, "일봉")
    .replace(/\bprepare_search_plan\b/gi, INTENT_KO.prepare_search_plan)
    .replace(/\bprepare_backtest_plan\b/gi, INTENT_KO.prepare_backtest_plan)
    .replace(/\bprepare_paper_plan\b/gi, INTENT_KO.prepare_paper_plan)
    .replace(/\bprepare_backtest\b/gi, GOAL_KO.prepare_backtest)
    .replace(/\bprepare_search\b/gi, GOAL_KO.prepare_search)
    .replace(/\bprepare_paper\b/gi, GOAL_KO.prepare_paper)
    .replace(/\bapprove_pending\b/gi, INTENT_KO.approve_pending)
    .replace(/\bapproved_execution\b/gi, INTENT_KO.approved_execution)
    .replace(/\bsearch_status\b/gi, INTENT_KO.search_status)
    .replace(/\binform_user\.?/gi, "")
    .replace(/(?:^|\n)\s*(?:None|null|undefined)\s*\.?\s*(?=\n|$)/gi, "\n")
    .replace(/\bNone\b/g, "")
    .replace(/\bPaper\b/gi, "모의매매")
    .replace(/전략\s*ID/gi, "전략 식별 정보")
    .replace(/[·•]\s*[·•]+/g, "·")
    .replace(/\n{3,}/g, "\n\n");

  for (const re of SECTION_LABEL_PATTERNS) {
    out = out.replace(re, "");
  }

  // Drop orphan punctuation / empty template remnants.
  out = out
    .replace(/(?:^|\n)\s*[.。]\s*(?=\n|$)/g, "\n")
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .trim();

  return out;
}

export function sanitizePrimaryUserParagraphs(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .map((p) => sanitizePrimaryUserText(p))
    .filter(Boolean)
    .join("\n\n");
}
