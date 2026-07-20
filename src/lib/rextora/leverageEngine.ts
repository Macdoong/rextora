import { getRextoraSettings } from "./settings/settingsService";
import type { LeverageDecision, LeverageDecisionInput, LeverageRiskLevel } from "./leverageTypes";

function clampLeverage(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundLeverage(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreLeverageBoost(finalScore: number, minLev: number, maxLev: number): number {
  if (finalScore >= 85) return maxLev;
  if (finalScore >= 75) return Math.min(maxLev, minLev + (maxLev - minLev) * 0.75);
  if (finalScore >= 65) return Math.min(maxLev, minLev + (maxLev - minLev) * 0.5);
  return minLev;
}

function mapRiskLevel(leverage: number, maxLev: number): LeverageRiskLevel {
  const ratio = maxLev > 0 ? leverage / maxLev : 0;
  if (ratio <= 0.45) return "낮음";
  if (ratio <= 0.75) return "보통";
  return "높음";
}

export function decideLeverage(input: LeverageDecisionInput): LeverageDecision {
  const settings = getRextoraSettings();
  const minLev = Math.max(1, settings.execution.minLeverage ?? 1);
  const maxLev = Math.max(minLev, settings.execution.maxLeverage ?? settings.trading.maxLeverage ?? 3);
  const defaultLev = clampLeverage(settings.execution.defaultLeverage ?? settings.trading.defaultLeverage ?? 2, minLev, maxLev);
  const cappedBy: string[] = [];

  if (!input.costPass) {
    return {
      leverage: defaultLev,
      leverageLabel: `${defaultLev}배`,
      riskLevel: "보통",
      reason: "비용 미통과 후보 — 레버리지 결정 생략",
      cappedBy: ["cost_blocked"]
    };
  }

  if (!settings.execution.autoLeverageEnabled) {
    return {
      leverage: defaultLev,
      leverageLabel: `${defaultLev}배`,
      riskLevel: mapRiskLevel(defaultLev, maxLev),
      reason: "자동 레버리지 비활성 — 기본 레버리지 사용",
      cappedBy: ["auto_disabled"]
    };
  }

  let leverage = scoreLeverageBoost(input.finalScore, minLev, maxLev);
  const reasons: string[] = [];

  const volatility = input.volatility ?? 0;
  const spread = input.spread ?? 0;
  const funding = Math.abs(input.fundingFee ?? 0);

  if (volatility >= 4) {
    leverage -= 1;
    cappedBy.push("high_volatility");
    reasons.push("변동성 높음");
  } else if (volatility >= 2.5) {
    leverage -= 0.5;
    cappedBy.push("elevated_volatility");
    reasons.push("변동성 다소 높음");
  }

  if (spread >= 0.12) {
    leverage = Math.min(leverage, defaultLev);
    cappedBy.push("high_spread");
    reasons.push("스프레드 넓음");
  } else if (spread >= 0.08) {
    leverage -= 0.5;
    cappedBy.push("elevated_spread");
    reasons.push("스프레드 주의");
  }

  if (funding >= 0.08) {
    leverage -= 0.5;
    cappedBy.push("high_funding");
    reasons.push("펀딩비 높음");
  }

  const consecutiveLosses = input.consecutiveLosses ?? 0;
  if (consecutiveLosses >= 3) {
    leverage = minLev;
    cappedBy.push("losing_streak");
    reasons.push(`연속 손실 ${consecutiveLosses}회`);
  } else if (consecutiveLosses >= 2) {
    leverage -= 1;
    cappedBy.push("recent_losses");
    reasons.push("최근 손실 연속");
  }

  const winRate = input.recentWinRate;
  if (typeof winRate === "number") {
    if (winRate < 35) {
      leverage -= 1;
      cappedBy.push("poor_win_rate");
      reasons.push("최근 승률 낮음");
    } else if (winRate > 65 && input.finalScore >= 70) {
      leverage += 0.5;
      reasons.push("최근 승률 양호");
    }
  }

  const learningMult = input.learningLeverageMultiplier ?? 1;
  if (learningMult < 1) {
    leverage *= learningMult;
    cappedBy.push("learning_adjustment");
    reasons.push("학습 보정으로 레버리지 축소");
  }

  leverage = clampLeverage(roundLeverage(leverage), minLev, maxLev);
  if (leverage >= maxLev) cappedBy.push("max_leverage");
  if (leverage <= minLev) cappedBy.push("min_leverage");

  const reason =
    reasons.length > 0
      ? `자동 레버리지: ${reasons.join(", ")}`
      : input.finalScore >= 75
        ? "높은 최종 점수로 상한 내 레버리지 적용"
        : "보수적 자동 레버리지 적용";

  return {
    leverage,
    leverageLabel: `${leverage}배`,
    riskLevel: mapRiskLevel(leverage, maxLev),
    reason,
    cappedBy
  };
}
