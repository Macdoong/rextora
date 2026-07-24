/**
 * Results-page Live candidate registration eligibility.
 * Does not bypass server live safety gates — only pre-checks card actions.
 */

import { evaluateHighlightEligibility } from "./eligibility";

export interface LiveCandidateGateInput {
  strategyId: string;
  isSafe: boolean;
  paperActive: boolean;
  liveActive: boolean;
  liveEligible?: boolean;
  liveTradingAllowed?: boolean;
  hasBacktest: boolean;
  totalReturn: number | null | undefined;
  mdd: number | null | undefined;
  tradeCount: number | null | undefined;
  passed: boolean | null | undefined;
}

export interface LiveCandidateGateResult {
  allowed: boolean;
  reasonKo: string | null;
}

export function evaluateLiveCandidateRegistration(
  input: LiveCandidateGateInput,
): LiveCandidateGateResult {
  if (input.isSafe) {
    return {
      allowed: false,
      reasonKo: "SAFE 원본은 실전 후보로 등록할 수 없습니다.",
    };
  }
  if (input.liveActive) {
    return { allowed: true, reasonKo: null };
  }
  if (input.liveEligible === false) {
    return {
      allowed: false,
      reasonKo: "전략 liveEligible=false — 서버 실전 자격이 없습니다.",
    };
  }
  if (!input.paperActive) {
    return {
      allowed: false,
      reasonKo: "모의매매 등록·검증이 필요합니다.",
    };
  }
  if (input.liveTradingAllowed === false) {
    return {
      allowed: false,
      reasonKo: "설정에서 실전 거래 허용이 꺼져 있습니다.",
    };
  }
  const highlight = evaluateHighlightEligibility({
    hasBacktest: input.hasBacktest,
    totalReturn: input.totalReturn,
    mdd: input.mdd,
    tradeCount: input.tradeCount,
    passed: input.passed ?? true,
  });
  if (!highlight.eligible) {
    return {
      allowed: false,
      reasonKo: highlight.messageKo ?? "백테스트 자격 미충족",
    };
  }
  return { allowed: true, reasonKo: null };
}
