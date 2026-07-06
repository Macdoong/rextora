import { Badge, Card, Metric } from "@/components/ui/primitives";
import { evaluateLiveSafetyGate } from "@/src/lib/rextora/liveSafetyGate";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { validateSafeStrategyHash } from "@/src/lib/rextora/strategyRepository";
import type { Strategy } from "@/lib/types";

export function StrategyRankingTable({ strategies }: { strategies: Strategy[] }) {
  return (
    <Card title="전략 랭킹 (Top 10)">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2">전략명</th>
              <th>유형</th>
              <th>Sharpe</th>
              <th>CAGR</th>
              <th>MDD</th>
              <th>Win Rate</th>
              <th>Trades</th>
              <th>Score</th>
              <th>LIVE</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => (
              <tr key={strategy.id} className="border-t border-slate-800">
                <td className="py-2 font-semibold text-slate-100">{strategy.name}</td>
                <td><Badge tone={strategy.type === "안정형" ? "success" : strategy.type === "공격형 후보" ? "warning" : "muted"}>{strategy.type}</Badge></td>
                <td>{strategy.validation.full10m.sharpe.toFixed(2)}</td>
                <td className="text-green-300">{strategy.validation.full10m.cagr}%</td>
                <td className="text-red-300">{strategy.validation.full10m.maxDrawdown}%</td>
                <td>{strategy.validation.full10m.winRate}%</td>
                <td>{strategy.validation.full10m.trades}</td>
                <td>{strategy.validation.full10m.score}</td>
                <td><Badge tone={strategy.liveEligible ? "success" : "danger"}>{strategy.liveEligible ? "검증 완료" : "LIVE 차단"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StrategyDetailPanel({ strategy }: { strategy: Strategy }) {
  const api = getApiStatus();
  const gate = evaluateLiveSafetyGate({ readinessOnly: true, api });
  const hash = validateSafeStrategyHash();
  const reasons = gate.blockedReasons;

  return (
    <Card title="전략 상세" action={<Badge tone={strategy.liveEligible ? "success" : "danger"}>{strategy.status}</Badge>}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <Metric label="전략명" value={strategy.name} />
          <Metric label="params_hash" value={strategy.paramsHash} />
          <Metric label="해시 검증" value={hash.ok ? "일치" : hash.message} tone={hash.ok ? "success" : "danger"} />
          <Metric label="서비스 상태" value={strategy.serviceState} />
          <Metric label="해석" value={strategy.interpretation} />
          <Metric label="진입 조건" value={strategy.entryCondition} />
          <Metric label="청산 조건" value={strategy.exitCondition} />
          <Metric label="리스크 조건" value={strategy.riskCondition} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="full_10m 수익" value={`${strategy.validation.full10m.totalReturn}%`} tone="success" />
          <Metric label="full_10m MDD" value={`${strategy.validation.full10m.maxDrawdown}%`} tone="danger" />
          <Metric label="recent_3m 수익" value={`${strategy.validation.recent3m.totalReturn}%`} tone="success" />
          <Metric label="prev_3m 수익" value={`${strategy.validation.prev3m.totalReturn}%`} />
          <Metric label="거래 수" value={strategy.validation.full10m.trades} />
          <Metric label="과최적화 위험" value={strategy.validation.overfittingRisk} />
          <Metric label="비용 스트레스" value={`x1 ${strategy.validation.costStress.cost1x}, x1.5 ${strategy.validation.costStress.cost15x}, x2 ${strategy.validation.costStress.cost2x}`} />
          <Metric label="Jitter 통과율" value={`${strategy.validation.jitterPassRate}%`} />
          <Metric label="LIVE 적격" value={strategy.liveEligible ? "가능" : "차단"} tone={strategy.liveEligible ? "success" : "danger"} />
          <Metric label="공격형 경고" value={strategy.type === "공격형 후보" ? "공격형 후보 LIVE 차단" : "해당 없음"} tone={strategy.type === "공격형 후보" ? "danger" : "default"} />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
        LIVE 차단 사유: {reasons.slice(0, 5).join(" / ")}
      </div>
    </Card>
  );
}

export function StrategyDiscoveryPanel() {
  return (
    <Card title="Random Search 전략 생성">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Metric label="전략 개수" value="20" />
        <Metric label="심볼" value="BTCUSDT / ETHUSDT" />
        <Metric label="시간봉" value="15M, 1H, 4H" />
        <Metric label="진행 상태" value="대기" />
      </div>
      <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-100">
        탐색 시작 버튼은 mock API에만 연결됩니다. 생성 후보는 검증 전 거래에 사용할 수 없습니다.
      </div>
    </Card>
  );
}
