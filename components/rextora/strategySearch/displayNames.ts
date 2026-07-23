/**
 * Client-safe display helpers for Strategy Search operator UI.
 * Never surface hashes / internal ids by default.
 */

/** Strip legacy "(a95d)" / ATR technical tails from stored readable names. */
export function cleanStrategyDisplayName(name: string | null | undefined): string {
  if (!name || !name.trim()) return "합격 전략";
  return name
    .replace(/\s*\([a-fA-F0-9]{3,8}\)\s*$/g, "")
    .replace(/\s*·\s*ATR\s*(손절|트레일)\s*$/g, "")
    .trim();
}

/** Split "EMA 추세 · 균형형" into title + style lines. */
export function splitStrategyTitle(name: string): {
  title: string;
  style: string | null;
} {
  const clean = cleanStrategyDisplayName(name);
  const parts = clean.split(/\s*·\s*/);
  if (parts.length >= 2) {
    return { title: parts[0]!.trim(), style: parts.slice(1).join(" · ").trim() };
  }
  return { title: clean, style: null };
}

/** ★ recommendation from performance signals (no raw score shown). */
export function recommendationStars(input: {
  score?: number | null;
  winRate?: number | null;
  totalReturn?: number | null;
  mdd?: number | null;
  trades?: number | null;
  stressPass?: boolean | null;
  jitterPass?: boolean | null;
}): { stars: number; label: string } {
  let points = 0;
  if (input.totalReturn != null && input.totalReturn > 0) points += 1;
  if (input.winRate != null && input.winRate >= 0.45) points += 1;
  if (input.mdd != null && Math.abs(input.mdd) <= 0.15) points += 1;
  if (input.trades != null && input.trades >= 10) points += 1;
  if (input.stressPass === true) points += 1;
  if (input.jitterPass === true) points += 1;
  if (input.score != null && input.score >= 1) points += 1;
  const stars = Math.max(3, Math.min(5, 2 + Math.round(points / 2)));
  return {
    stars,
    label: "★".repeat(stars) + "☆".repeat(5 - stars),
  };
}

/** Plain-language reasons AI selected this strategy. */
export function whyAiSelected(input: {
  winRate?: number | null;
  totalReturn?: number | null;
  mdd?: number | null;
  trades?: number | null;
  stressPass?: boolean | null;
  jitterPass?: boolean | null;
  jitterEnabled?: boolean | null;
}): string[] {
  const reasons: string[] = [];
  if (input.winRate != null && input.winRate >= 0.5) {
    reasons.push("높은 승률");
  } else if (input.winRate != null && input.winRate >= 0.4) {
    reasons.push("안정적인 승률");
  }
  if (input.mdd != null && Math.abs(input.mdd) <= 0.1) {
    reasons.push("낮은 최대 손실");
  } else if (input.mdd != null && Math.abs(input.mdd) <= 0.2) {
    reasons.push("관리 가능한 최대 손실");
  }
  if (input.trades != null && input.trades >= 20) {
    reasons.push("충분한 거래 수");
  } else if (input.trades != null && input.trades >= 8) {
    reasons.push("검증에 필요한 거래 확보");
  }
  if (input.totalReturn != null && input.totalReturn > 0) {
    reasons.push("양의 수익률");
  }
  if (input.stressPass === true) {
    reasons.push("비용 검증 통과");
  }
  if (input.jitterEnabled && input.jitterPass === true) {
    reasons.push("안정성 검증 통과");
  }
  if (reasons.length === 0) {
    reasons.push("목표 조건을 충족한 합격 전략");
  }
  reasons.push("균형 잡힌 위험 수준");
  return reasons.slice(0, 6);
}
