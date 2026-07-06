import { memo } from "react";

import { Badge, Card, Metric } from "@/components/ui/primitives";

import { displayLabel } from "@/src/lib/rextora/displayLabels";

import { formatFundingFee, formatPercent, formatPrice, formatScore, formatSpread, formatVolatility, formatVolumeChange } from "@/src/lib/rextora/displayFormat";

import type { MarketWatcherSummary } from "@/lib/types";



export function MarketWatcherSummaryCard({ summary, className = "" }: { summary: MarketWatcherSummary; className?: string }) {

  return (

    <Card title="멀티코인 감시 요약" action={<Badge tone="purple">{summary.watchedCoinCount}코인</Badge>} className={className}>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">

        <Metric label="감시 중 코인" value={summary.watchedCoinCount} />

        <Metric label="급등 감지" value={summary.pumpDetected} tone="success" />

        <Metric label="급락 감지" value={summary.dumpDetected} tone="danger" />

        <Metric label="거래량 급증" value={summary.volumeSpikeDetected} tone="warning" />

        <Metric label="돌파 감지" value={summary.breakoutDetected} tone="success" />

        <Metric label="변동성 확대" value={summary.volatilityExpanded} tone="warning" />

      </div>

    </Card>

  );

}



export const MarketWatchTable = memo(function MarketWatchTable({ coins }: { coins: import("@/lib/types").MarketCoin[] }) {

  const stateTone = (state: string) => {

    if (state === "급등" || state === "돌파") return "success";

    if (state === "급락") return "danger";

    if (state === "과열") return "warning";

    return "muted";

  };



  return (

    <div className="overflow-x-auto">

      <table className="rextora-table w-full min-w-[800px] text-left">

        <thead>

          <tr className="border-b border-slate-800 text-slate-400">

            <th className="px-2 py-2">코인</th>

            <th className="px-2 py-2">현재가</th>

            <th className="px-2 py-2">24시간 변동률</th>

            <th className="px-2 py-2">거래량 변화</th>

            <th className="px-2 py-2">변동성</th>

            <th className="px-2 py-2">스프레드</th>

            <th className="px-2 py-2">펀딩비</th>

            <th className="px-2 py-2">AI</th>

            <th className="px-2 py-2">상태</th>

          </tr>

        </thead>

        <tbody>

          {coins.map((c) => (

            <tr key={c.symbol} className="border-b border-slate-800/60 hover:bg-violet-500/5">

              <td className="px-2 py-2 font-medium">{c.symbol}</td>

              <td className="px-2 py-2">{formatPrice(c.price)}</td>

              <td className={`px-2 py-2 ${c.change24hPct >= 0 ? "text-green-300" : "text-red-300"}`}>{formatPercent(c.change24hPct)}</td>

              <td className="px-2 py-2">{formatVolumeChange(c.volumeChangePct)}</td>

              <td className="px-2 py-2">{formatVolatility(c.volatility)}</td>

              <td className="px-2 py-2">{formatSpread(c.spread)}</td>

              <td className="px-2 py-2">{formatFundingFee(c.fundingFee)}</td>

              <td className="px-2 py-2">{formatScore(c.aiScore)}</td>

              <td className="px-2 py-2"><Badge tone={stateTone(c.state)}>{c.state}</Badge></td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

});
