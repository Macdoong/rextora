import { backtestValidationSeed } from "./seedData";
import { isStrategyLiveEligible } from "./strategyRepository";
import type { Strategy } from "./types";

export function classifyStrategy(strategy: Pick<Strategy, "type" | "verifiedForLive">): Strategy["type"] {
  if (strategy.type === "공격형 후보") return "공격형 후보";
  if (strategy.type === "안정형" && strategy.verifiedForLive) return "안정형";
  return "탐색 중";
}

export function generateRandomStrategies(count = 5): Strategy[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `DISC_generated_${String(index + 1).padStart(3, "0")}`,
    name: `DISC_generated_${String(index + 1).padStart(3, "0")}`,
    paramsHash: `generated-${index + 1}`,
    type: "탐색 중",
    status: "탐색 중",
    interpretation: "Random Search 생성 후보입니다. 검증 전 LIVE 거래가 차단됩니다.",
    entryCondition: "생성 후보 진입 조건",
    exitCondition: "생성 후보 청산 조건",
    riskCondition: "검증 전 사용 금지",
    symbol: index % 2 === 0 ? "BTCUSDT" : "ETHUSDT",
    timeframe: index % 3 === 0 ? "15M" : "1H",
    liveEligible: false,
    liveEligibleCandidate: false,
    verifiedForLive: false,
    serviceState: "live-blocked",
    validation: {
      ...backtestValidationSeed,
      full10m: {
        ...backtestValidationSeed.full10m,
        trades: 40 + index,
        score: 50 + index,
        sharpe: 0.5 + index / 10
      },
      jitter: { passRate: 50 + index, samples: 10, status: "warning" }
      ,
      jitterPassRate: 50 + index
    },
    params: {
      ema_fast: 10 + index,
      ema_mid: 40 + index,
      ema_slow: 180,
      rsi_period: 14
    }
  }));
}

export function deduplicateStrategies(strategies: Strategy[]): Strategy[] {
  const seen = new Set<string>();
  return strategies.filter((strategy) => {
    const key = `${strategy.name}:${strategy.paramsHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rankStrategies(strategies: Strategy[]): Strategy[] {
  return [...strategies].sort((a, b) => b.validation.full10m.score - a.validation.full10m.score);
}

export function blockUnverifiedStrategies(strategies: Strategy[]): Strategy[] {
  return strategies.map((strategy) => ({
    ...strategy,
    liveEligible: isStrategyLiveEligible(strategy),
    serviceState: isStrategyLiveEligible(strategy) ? strategy.serviceState : "live-blocked"
  }));
}
