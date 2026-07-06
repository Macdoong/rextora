import { PageHeader } from "@/components/rextora/StatusCards";

import { Badge, Card, Metric } from "@/components/ui/primitives";

import { displayLabel } from "@/src/lib/rextora/displayLabels";

import { formatPercent } from "@/src/lib/rextora/displayFormat";

import { getCoinWinRates, getLearningLogs, getSignalWinRates } from "@/src/lib/rextora/learningLogger";



const DEFAULT_LIMIT = 50;



export default function LearningLogPage() {

  const logs = getLearningLogs(DEFAULT_LIMIT);

  const coinRates = getCoinWinRates();

  const signalRates = getSignalWinRates();



  return (

    <>

      <PageHeader

        title="학습 기록"

        description="학습 기록은 Rextora가 어떤 이유로 후보를 골랐고, 어떤 결과가 나왔는지 저장하는 화면입니다."

      />

      <Card title="거래 학습 로그" action={<Badge tone="muted">최근 {DEFAULT_LIMIT}건</Badge>}>

        <div className="overflow-x-auto">

          <table className="rextora-table w-full min-w-[720px] text-left">

            <thead>

              <tr className="border-b border-slate-800 text-slate-400">

                <th className="px-2 py-2">시간</th>

                <th className="px-2 py-2">코인</th>

                <th className="px-2 py-2">진입 이유</th>

                <th className="px-2 py-2">청산 이유</th>

                <th className="px-2 py-2">결과</th>

                <th className="px-2 py-2">손익</th>

                <th className="px-2 py-2">신호</th>

              </tr>

            </thead>

            <tbody>

              {logs.map((log) => (

                <tr key={log.id} className="border-b border-slate-800/60">

                  <td className="px-2 py-2">{log.time}</td>

                  <td className="px-2 py-2">{log.symbol}</td>

                  <td className="px-2 py-2">{log.entryReason}</td>

                  <td className="px-2 py-2">{displayLabel(log.exitReason)}</td>

                  <td className="px-2 py-2"><Badge tone={log.result === "성공" ? "success" : "danger"}>{displayLabel(log.result)}</Badge></td>

                  <td className={`px-2 py-2 ${log.pnlPct >= 0 ? "text-green-300" : "text-red-300"}`}>{formatPercent(log.pnlPct)}</td>

                  <td className="px-2 py-2">{displayLabel(log.signalType)}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </Card>

      <div className="data-grid mt-3">

        <div className="col-span-12 xl:col-span-6">

          <Card title="코인별 승률">

            {coinRates.map((r) => (

              <div key={r.symbol} className="rextora-body mb-2 flex justify-between"><span>{r.symbol}</span><span>{r.winRate}% ({r.trades}건)</span></div>

            ))}

          </Card>

        </div>

        <div className="col-span-12 xl:col-span-6">

          <Card title="신호별 승률">

            {signalRates.map((r) => (

              <div key={r.signalType} className="rextora-body mb-2 flex justify-between"><span>{displayLabel(r.signalType)}</span><span>{r.winRate}% ({r.trades}건)</span></div>

            ))}

          </Card>

        </div>

        <div className="col-span-12">

          <Card title="패턴 요약">

            <div className="grid grid-cols-2 gap-3">

              <Metric label="성공 패턴" value={logs.find((l) => l.successPattern)?.successPattern ?? "거래량 동반 돌파"} />

              <Metric label="실패 패턴" value={logs.find((l) => l.failurePattern)?.failurePattern ?? "급반등으로 손절"} />

            </div>

          </Card>

        </div>

      </div>

    </>

  );

}

